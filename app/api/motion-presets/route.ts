import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const kind = req.nextUrl.searchParams.get("kind");
    const presets = kind
      ? await sql`
          SELECT id, kind, name, preset_json
          FROM motion_presets
          WHERE is_active = true AND kind = ${kind}
          ORDER BY sort_order ASC, created_at DESC
        `
      : await sql`
          SELECT id, kind, name, preset_json
          FROM motion_presets
          WHERE is_active = true
          ORDER BY kind ASC, sort_order ASC, created_at DESC
        `;
    return NextResponse.json({ presets });
  } catch (err) {
    console.error("[api/motion-presets GET]", err);
    // Fail soft — the editor already has a curated built-in set
    // (src/utils/motionPresets.ts), DB-backed ones are additive.
    return NextResponse.json({ presets: [] });
  }
}
