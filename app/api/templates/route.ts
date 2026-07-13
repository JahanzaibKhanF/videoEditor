import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const templates = await sql`
      SELECT id, name, cover_image, template_json
      FROM templates
      WHERE is_active = true
      ORDER BY sort_order ASC, created_at DESC
    `;
    return NextResponse.json({ templates });
  } catch (err) {
    console.error("[api/templates GET]", err);
    // Fail soft — the editor already has a built-in set of code-defined
    // templates, DB-backed ones are additive, so an empty list here
    // shouldn't break the Templates tab.
    return NextResponse.json({ templates: [] });
  }
}
