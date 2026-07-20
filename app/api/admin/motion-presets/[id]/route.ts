import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isValidAdminSession } from "@/lib/adminAuth";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isValidAdminSession(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    const body = await req.json();
    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    const presetJson = body.presetJson !== undefined ? JSON.stringify(body.presetJson) : undefined;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;
    const sortOrder = body.sortOrder !== undefined ? Number(body.sortOrder) : undefined;

    const [preset] = await sql`
      UPDATE motion_presets SET
        name        = COALESCE(${name}, name),
        preset_json = COALESCE(${presetJson}::jsonb, preset_json),
        is_active   = COALESCE(${isActive}, is_active),
        sort_order  = COALESCE(${sortOrder}, sort_order),
        updated_at  = now()
      WHERE id = ${params.id}
      RETURNING id, kind, name, preset_json, is_active, sort_order, created_at, updated_at
    `;
    if (!preset) return NextResponse.json({ error: "Motion preset not found." }, { status: 404 });
    return NextResponse.json({ preset });
  } catch (err) {
    console.error("[api/admin/motion-presets/[id] PUT]", err);
    return NextResponse.json({ error: "Could not update motion preset." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isValidAdminSession(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    const result = await sql`DELETE FROM motion_presets WHERE id = ${params.id} RETURNING id`;
    if (result.length === 0) return NextResponse.json({ error: "Motion preset not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/motion-presets/[id] DELETE]", err);
    return NextResponse.json({ error: "Could not delete motion preset." }, { status: 500 });
  }
}
