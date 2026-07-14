import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { signSession, hashToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, email, password_hash, display_name FROM users WHERE email = ${email}
    `;
    const user = rows[0];

    // Same generic error for "no such user" and "wrong password" — never
    // reveal which one it was, that's an account-enumeration leak.
    if (!user) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }

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
    console.error("[auth/login]", err);
    return NextResponse.json({ error: "Something went wrong signing you in." }, { status: 500 });
  }
}
