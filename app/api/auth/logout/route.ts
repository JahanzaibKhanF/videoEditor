import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashToken, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      await sql`
        UPDATE sessions SET revoked_at = now()
        WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
      `;
    } catch (err) {
      console.error("[auth/logout]", err);
      // Don't block the client-side logout on a DB hiccup.
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
