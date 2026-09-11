"use client";

import { useState, FormEvent, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/useAuthContext";

// Friendly copy for the ?authError= query param the Google OAuth routes
// redirect back with when something goes wrong (never configured, denied,
// state mismatch, token exchange failure, ...).
const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up on this deployment yet.",
  google_state_mismatch: "That Google sign-in link expired — please try again.",
  google_access_denied: "Google sign-in was cancelled.",
  google_failed: "Something went wrong signing in with Google. Please try again.",
};

/**
 * Auth is opt-in, not a wall: guests can use the whole editor without an
 * account. This renders as a dismissible modal, opened via
 * useAuth().promptLogin(reason) only when a genuinely account-gated
 * action is attempted (e.g. "save to your projects", "view recent
 * projects"). It reads its open/closed state straight from AuthContext
 * so any component can trigger it without prop drilling.
 */
export default function AuthScreen() {
  const { authModalOpen, authModalReason, closeAuthModal, signup, login, error, clearError } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [googleError, setGoogleError] = useState<string | null>(null);

  // A redirect back from /api/auth/google/callback with a problem — surface
  // it and open the modal so the user actually sees it, then scrub the query
  // param (into local state) so refreshing doesn't keep re-showing it.
  useEffect(() => {
    const err = searchParams.get("authError");
    if (err) {
      setGoogleError(err);
      router.replace("/", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (authModalOpen) {
      setEmail("");
      setPassword("");
      setDisplayName("");
      setMode("login");
    }
  }, [authModalOpen]);

  if (!authModalOpen && !googleError) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await (mode === "login" ? login(email, password) : signup(email, password, displayName));
    setSubmitting(false);
  };

  const switchMode = (next: "login" | "signup") => {
    clearError();
    setMode(next);
  };

  const handleClose = () => {
    setGoogleError(null);
    closeAuthModal();
  };

  return (
    <div
      className="fixed inset-0 z-[2000] bg-black/65 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="relative w-full max-w-[400px] animate-fade-in">
        <div className="absolute -top-10 right-0 flex items-center gap-1.5">
          <button
            onClick={handleClose}
            className="text-ink-faint hover:text-ink-primary text-[13px] font-semibold transition-colors"
          >
            Continue as guest
          </button>
          <span className="text-ink-faint/60 text-[11px]">(work won't be saved)</span>
        </div>

        <div className="bg-studio-surface border border-studio-border rounded-2xl shadow-panel p-7">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-[9px] bg-signal flex items-center justify-center shadow-glow flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="#07070C" strokeWidth="1.4" />
                <path d="M5.5 5l4 2-4 2V5z" fill="#07070C" />
              </svg>
            </div>
            <span className="font-display text-base font-bold text-ink-primary tracking-tight">ClipFlow</span>
          </div>

          {googleError && (
            <div className="text-[12px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2 mb-4">
              {GOOGLE_ERROR_MESSAGES[googleError] ?? "Google sign-in didn't go through. Please try again."}
            </div>
          )}

          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-2 w-full bg-white hover:bg-white/90 text-[#1F1F1F] text-[13.5px] font-semibold py-2.5 rounded-lg transition-colors mb-4 border border-studio-border"
          >
            <svg width="16" height="16" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C33.9 5.5 29.2 3.5 24 3.5 12.7 3.5 3.5 12.7 3.5 24S12.7 44.5 24 44.5 44.5 35.3 44.5 24c0-1.2-.1-2.4-.9-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C33.9 6 29.2 4 24 4 16 4 9.1 8.5 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.1 0 9.8-1.9 13.3-5.1l-6.1-5.2c-2 1.4-4.6 2.3-7.2 2.3-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9 39.4 15.9 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.7l6.1 5.2C40.9 36 44.5 30.6 44.5 24c0-1.2-.1-2.4-.9-3.5z" />
            </svg>
            Continue with Google
          </a>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-studio-border" />
            <span className="text-[10.5px] font-semibold text-ink-faint uppercase tracking-wide">or</span>
            <div className="flex-1 h-px bg-studio-border" />
          </div>

          {/* Tab switcher */}
          <div className="flex bg-studio-void rounded-xl p-1 mb-5 border border-studio-border">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 text-[13px] font-semibold py-2 rounded-lg transition-colors ${
                  mode === m ? "bg-signal text-studio-void" : "text-ink-muted hover:text-ink-primary"
                }`}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <h1 className="font-display text-lg font-semibold text-ink-primary mb-1">
            {mode === "login" ? "Welcome back" : "Save your work"}
          </h1>
          <p className="text-[12.5px] text-ink-muted mb-5">
            {authModalReason ?? (mode === "login"
              ? "Sign in to access your saved projects."
              : "Create a free account to save projects and access them anywhere. Your media stays on your device.")}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {mode === "signup" && (
              <div>
                <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">
                  Name <span className="text-ink-faint font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[13.5px] text-ink-primary placeholder:text-ink-faint outline-none focus:border-signal transition-colors"
                />
              </div>
            )}

            <div>
              <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Email</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[13.5px] text-ink-primary placeholder:text-ink-faint outline-none focus:border-signal transition-colors"
              />
            </div>

            <div>
              <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[13.5px] text-ink-primary placeholder:text-ink-faint outline-none focus:border-signal transition-colors"
              />
            </div>

            {error && (
              <div className="text-[12.5px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full bg-signal hover:bg-signal-hover text-studio-void text-[13.5px] font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
