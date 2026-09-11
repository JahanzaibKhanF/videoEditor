import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isValidAdminSession } from "@/lib/adminAuth";

// GET — list registered users for the admin dashboard. Never returns
// password_hash — only what's useful to see who has an account.
export async function GET(req: NextRequest) {
  if (!isValidAdminSession(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    const users = await sql`
      SELECT
        u.id, u.email, u.display_name, u.created_at,
        (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id)::int AS project_count
      FROM users u
      ORDER BY u.created_at DESC
    `;
    return NextResponse.json({ users });
  } catch (err) {
    console.error("[api/admin/users GET]", err);
    return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  }
}
