import { NextRequest, NextResponse } from "next/server";
import { checkAdminPassword, adminCookieValue, ADMIN_COOKIE } from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const password = String(body.password ?? "");

    if (!checkAdminPassword(password)) {
      // Small delay so this endpoint isn't a fast password-guessing oracle.
      await new Promise((r) => setTimeout(r, 400));
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE, adminCookieValue(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12 hours
    });
    return res;
  } catch (err) {
    console.error("[api/admin/login]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
