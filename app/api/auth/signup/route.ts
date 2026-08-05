import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { signSession, hashToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";
import { serverErrorResponse } from "@/lib/apiError";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const displayName = body.displayName ? String(body.displayName).trim() : null;

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await sql`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (${email}, ${passwordHash}, ${displayName})
      RETURNING id, email, display_name, created_at
    `;

    const token = signSession({ userId: user.id, email: user.email });
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

    await sql`
      INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
      VALUES (${user.id}, ${hashToken(token)}, ${req.headers.get("user-agent") ?? ""}, ${expiresAt.toISOString()})
    `;

    const res = NextResponse.json({
      user: { id: user.id, email: user.email, displayName: user.display_name },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return res;
  } catch (err) {
    console.error("[auth/signup]", err);
    return serverErrorResponse("Something went wrong creating your account.", err);
  }
}
