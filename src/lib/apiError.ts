import { NextResponse } from "next/server";

/**
 * Builds a 500 response. In development, includes the real underlying error
 * message so a misconfigured DATABASE_URL (missing, wrong, or schema.sql not
 * run yet against the Neon project) actually tells you that, instead of a
 * generic "Something went wrong" that looks identical for every possible
 * cause. In production, stays generic — never leak internals to real users.
 */
export function serverErrorResponse(genericMessage: string, err: unknown) {
  const detail = err instanceof Error ? err.message : String(err);
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json({ error: `${genericMessage} (dev detail: ${detail})` }, { status: 500 });
  }
  return NextResponse.json({ error: genericMessage }, { status: 500 });
}
