import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isValidAdminSession } from "@/lib/adminAuth";

// GET — list all motion presets (both kinds, or filtered via ?kind=), including inactive.
export async function GET(req: NextRequest) {
  if (!isValidAdminSession(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    const kind = req.nextUrl.searchParams.get("kind");
    const presets = kind
      ? await sql`
          SELECT id, kind, name, preset_json, is_active, sort_order, created_at, updated_at
          FROM motion_presets WHERE kind = ${kind}
          ORDER BY sort_order ASC, created_at DESC
        `
      : await sql`
          SELECT id, kind, name, preset_json, is_active, sort_order, created_at, updated_at
          FROM motion_presets
          ORDER BY kind ASC, sort_order ASC, created_at DESC
        `;
    return NextResponse.json({ presets });
  } catch (err) {
    console.error("[api/admin/motion-presets GET]", err);
    return NextResponse.json({ error: "Could not load motion presets." }, { status: 500 });
  }
}

// POST — create a new motion preset.
export async function POST(req: NextRequest) {
  if (!isValidAdminSession(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    const body = await req.json();
    const kind = String(body.kind ?? "");
    if (kind !== "animation" && kind !== "transition") {
      return NextResponse.json({ error: "kind must be 'animation' or 'transition'." }, { status: 400 });
    }
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Preset name is required." }, { status: 400 });

    const presetJson = body.presetJson ?? {};
    const isActive = body.isActive !== false;
    const sortOrder = Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0;

    const [preset] = await sql`
      INSERT INTO motion_presets (kind, name, preset_json, is_active, sort_order)
      VALUES (${kind}, ${name}, ${JSON.stringify(presetJson)}::jsonb, ${isActive}, ${sortOrder})
      RETURNING id, kind, name, preset_json, is_active, sort_order, created_at, updated_at
    `;
    return NextResponse.json({ preset }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/motion-presets POST]", err);
    return NextResponse.json({ error: "Could not create motion preset." }, { status: 500 });
  }
}
