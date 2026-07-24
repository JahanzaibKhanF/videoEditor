import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { verifySession, hashToken, SESSION_COOKIE } from "@/lib/auth";

export interface CurrentUser {
  id: string;
  email: string;
}

/**
 * Resolves the authenticated user for an API route from the session
 * cookie. Returns null if there's no valid, non-revoked, non-expired
 * session — callers should respond 401 in that case.
 */
export async function getCurrentUser(req: NextRequest): Promise<CurrentUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifySession(token);
  if (!payload) return null;

  const rows = await sql`
    SELECT u.id, u.email
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
  `;
  const user = rows[0];
  return user ? { id: user.id, email: user.email } : null;
}
