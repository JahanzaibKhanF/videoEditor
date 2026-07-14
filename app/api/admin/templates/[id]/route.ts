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
    const coverImage = body.coverImage !== undefined ? String(body.coverImage) : undefined;
    const templateJson = body.templateJson !== undefined ? JSON.stringify(body.templateJson) : undefined;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;
    const sortOrder = body.sortOrder !== undefined ? Number(body.sortOrder) : undefined;

    const [template] = await sql`
      UPDATE templates SET
        name         = COALESCE(${name}, name),
        cover_image  = COALESCE(${coverImage}, cover_image),
        template_json= COALESCE(${templateJson}::jsonb, template_json),
        is_active    = COALESCE(${isActive}, is_active),
        sort_order   = COALESCE(${sortOrder}, sort_order),
        updated_at   = now()
      WHERE id = ${params.id}
      RETURNING id, name, cover_image, template_json, is_active, sort_order, created_at, updated_at
    `;
    if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    return NextResponse.json({ template });
  } catch (err) {
    console.error("[api/admin/templates/[id] PUT]", err);
    return NextResponse.json({ error: "Could not update template." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isValidAdminSession(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    const result = await sql`DELETE FROM templates WHERE id = ${params.id} RETURNING id`;
    if (result.length === 0) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/templates/[id] DELETE]", err);
    return NextResponse.json({ error: "Could not delete template." }, { status: 500 });
  }
}
