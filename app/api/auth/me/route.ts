import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { verifySession, hashToken, SESSION_COOKIE } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const payload = verifySession(token);
  if (!payload) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  try {
    const rows = await sql`
      SELECT u.id, u.email, u.display_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${hashToken(token)}
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
    `;
    const user = rows[0];
    if (!user) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    return NextResponse.json({
      user: { id: user.id, email: user.email, displayName: user.display_name },
    });
  } catch (err) {
    console.error("[auth/me]", err);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
