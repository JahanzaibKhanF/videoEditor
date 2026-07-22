import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isValidAdminSession } from "@/lib/adminAuth";

// GET — list ALL templates (including inactive) for the admin dashboard.
export async function GET(req: NextRequest) {
  if (!isValidAdminSession(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    const templates = await sql`
      SELECT id, name, cover_image, template_json, is_active, sort_order, created_at, updated_at
      FROM templates
      ORDER BY sort_order ASC, created_at DESC
    `;
    return NextResponse.json({ templates });
  } catch (err) {
    console.error("[api/admin/templates GET]", err);
    return NextResponse.json({ error: "Could not load templates." }, { status: 500 });
  }
}

// POST — create a new template.
export async function POST(req: NextRequest) {
  if (!isValidAdminSession(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Template name is required." }, { status: 400 });

    const coverImage = body.coverImage ? String(body.coverImage) : null;
    const templateJson = body.templateJson ?? {};
    const isActive = body.isActive !== false;
    const sortOrder = Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0;

    const [template] = await sql`
      INSERT INTO templates (name, cover_image, template_json, is_active, sort_order)
      VALUES (${name}, ${coverImage}, ${JSON.stringify(templateJson)}::jsonb, ${isActive}, ${sortOrder})
      RETURNING id, name, cover_image, template_json, is_active, sort_order, created_at, updated_at
    `;
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/templates POST]", err);
    return NextResponse.json({ error: "Could not create template." }, { status: 500 });
  }
}
