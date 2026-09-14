import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { signSession, hashToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";
import { getGoogleOAuthCredentials, getGoogleRedirectUri, GOOGLE_OAUTH_STATE_COOKIE } from "@/lib/googleAuth";

// GET — Google redirects here with ?code=&state= after the user consents.
// Exchanges the code for an access token, reads the profile, finds-or-
// creates the matching user (by google_id, falling back to email so an
// existing password account can also sign in with Google), then issues the
// exact same session cookie the password login flow does.
export async function GET(req: NextRequest) {
  const cfg = getGoogleOAuthCredentials();
  if (!cfg) return NextResponse.redirect(new URL("/editor?authError=google_not_configured", req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  const cookieState = req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/editor?authError=${reason}`, req.url));
    res.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return res;
  };

  if (providerError) return fail(`google_${providerError}`);
  if (!code || !state || !cookieState || state !== cookieState) return fail("google_state_mismatch");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: getGoogleRedirectUri(req),
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("[auth/google/callback] token exchange failed", tokenData);
      return fail("google_failed");
    }

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json().catch(() => ({}));
    if (!profileRes.ok || !profile.sub || !profile.email) {
      console.error("[auth/google/callback] userinfo failed", profile);
      return fail("google_failed");
    }

    const googleId = String(profile.sub);
    const email = String(profile.email).toLowerCase();
    const displayName = profile.name ? String(profile.name) : null;

    // Match by google_id first, then by email — so someone who signed up
    // with a password originally can still use "Continue with Google" for
    // the same address and it links onto their existing account.
    const existing = await sql`
      SELECT id FROM users WHERE google_id = ${googleId} OR email = ${email} LIMIT 1
    `;

    let userId: string;
    if (existing[0]) {
      userId = existing[0].id;
      await sql`UPDATE users SET google_id = ${googleId}, updated_at = now() WHERE id = ${userId}`;
    } else {
      const [created] = await sql`
        INSERT INTO users (email, password_hash, google_id, display_name)
        VALUES (${email}, NULL, ${googleId}, ${displayName})
        RETURNING id
      `;
      userId = created.id;
    }

    const token = signSession({ userId, email });
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    await sql`
      INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
      VALUES (${userId}, ${hashToken(token)}, ${req.headers.get("user-agent") ?? ""}, ${expiresAt.toISOString()})
    `;

    const res = NextResponse.redirect(new URL("/editor", req.url));
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    res.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return res;
  } catch (err) {
    console.error("[auth/google/callback]", err);
    return fail("google_failed");
  }
}
