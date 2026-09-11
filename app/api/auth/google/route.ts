import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getGoogleOAuthCredentials, getGoogleRedirectUri, GOOGLE_OAUTH_STATE_COOKIE } from "@/lib/googleAuth";

// GET — start the Google sign-in flow: redirect to Google's consent screen
// with a random `state` (stored in a short-lived cookie) so the callback
// can reject a forged request.
export async function GET(req: NextRequest) {
  const cfg = getGoogleOAuthCredentials();
  if (!cfg) {
    return NextResponse.redirect(new URL("/?authError=google_not_configured", req.url));
  }

  const state = crypto.randomBytes(24).toString("hex");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", cfg.clientId);
  authUrl.searchParams.set("redirect_uri", getGoogleRedirectUri(req));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "online");
  authUrl.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes — plenty for the consent-screen round trip
  });
  return res;
}
