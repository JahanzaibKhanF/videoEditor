import { NextRequest } from "next/server";
import crypto from "crypto";

export const ADMIN_COOKIE = "clipflow_admin";

// No hardcoded fallback here on purpose: if ADMIN_PASSWORD isn't set, the
// admin panel must fail CLOSED (reject every login attempt), not fall back
// to a default baked into the source code. A fallback default is a real
// security hole the moment it ships anywhere public — anyone who's ever
// seen this file (or a chat transcript, or a git history) knows it, and it
// silently activates on any deployment where the env var is missing or
// misnamed, with no visible error to tell you that's what happened.
function getAdminPassword(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw && pw.length > 0 ? pw : null;
}

function getAdminSecret(): string | null {
  const pw = getAdminPassword();
  if (!pw) return null;
  // Derived from the admin password itself so no extra env var is
  // required — good enough for a hidden internal tool gated by a
  // shared password, not meant to protect against a sophisticated
  // attacker with cookie access.
  return crypto.createHash("sha256").update("clipflow-admin::" + pw).digest("hex");
}

export function checkAdminPassword(input: string): boolean {
  const expected = getAdminPassword();
  if (expected === null) {
    console.error("[adminAuth] ADMIN_PASSWORD is not set — admin login is disabled until it's configured.");
    return false;
  }
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(input);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export function adminCookieValue(): string {
  const secret = getAdminSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD is not set.");
  return secret;
}

export function isValidAdminSession(req: NextRequest): boolean {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!cookie) return false;
  const secret = getAdminSecret();
  if (!secret) return false;
  return cookie === secret;
}
