import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET;

export const SESSION_COOKIE = "clipflow_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  userId: string;
  email: string;
}

function getSecret(): string {
  if (!JWT_SECRET) {
    // Same lazy-throw rationale as db.ts — don't break `next build`.
    throw new Error(
      "JWT_SECRET is not set. Add it to .env.local (dev) or your Netlify environment variables (prod)."
    );
  }
  return JWT_SECRET;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

// We never store the raw JWT in the `sessions` table — only a hash of it —
// so a leaked database row can't be replayed as a live session token.
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
