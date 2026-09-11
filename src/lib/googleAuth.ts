import { NextRequest } from "next/server";

/**
 * Google OAuth config — same "fail closed, no hardcoded fallback" rule as
 * adminAuth.ts: if the credentials aren't set, Google sign-in is simply
 * unavailable (the initiate route redirects back with an error the UI
 * shows inline) rather than silently doing something insecure.
 *
 * Requires, in .env / your host's env vars:
 *   GOOGLE_CLIENT_ID       — from a Google Cloud Console OAuth 2.0 Client ID
 *   GOOGLE_CLIENT_SECRET   — same client
 *
 * The redirect URI is deliberately NOT built from NEXT_PUBLIC_APP_URL (a
 * single fixed value) — that would only ever be correct for one environment
 * at a time, forcing you to hand-edit .env every time you switch between
 * `npm run dev` and the deployed site. Instead each request derives it from
 * ITS OWN origin (getGoogleRedirectUri, below), so localhost and Netlify
 * both work automatically with no env changes: whichever host actually
 * served the "Continue with Google" click is where Google redirects back
 * to, since the initiate step and the callback step are two ends of the
 * same redirect chain and always share a host.
 *
 * Register BOTH redirect URIs on the OAuth client in Google Cloud Console
 * (one per environment you use), e.g.:
 *   http://localhost:3000/api/auth/google/callback
 *   https://<your-site>.netlify.app/api/auth/google/callback
 */
export interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export function getGoogleOAuthCredentials(): GoogleOAuthCredentials | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** The callback URL for THIS request's own host — see the note above. */
export function getGoogleRedirectUri(req: NextRequest): string {
  return `${req.nextUrl.origin}/api/auth/google/callback`;
}

export const GOOGLE_OAUTH_STATE_COOKIE = "clipflow_oauth_state";
