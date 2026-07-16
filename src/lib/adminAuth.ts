import { NextRequest } from "next/server";
import crypto from "crypto";

export const ADMIN_COOKIE = "clipflow_admin";

function getAdminPassword(): string {
  return process.env.ADMIN_PANEL_PASSWORD ?? "open5333";
}

function getAdminSecret(): string {
  // Derived from the admin password itself so no extra env var is
  // required — good enough for a hidden internal tool gated by a
  // shared password, not meant to protect against a sophisticated
  // attacker with cookie access.
  return crypto.createHash("sha256").update("clipflow-admin::" + getAdminPassword()).digest("hex");
}

export function checkAdminPassword(input: string): boolean {
  const expected = Buffer.from(getAdminPassword());
  const actual = Buffer.from(input);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function adminCookieValue(): string {
  return getAdminSecret();
}

export function isValidAdminSession(req: NextRequest): boolean {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!cookie) return false;
  return cookie === getAdminSecret();
}
