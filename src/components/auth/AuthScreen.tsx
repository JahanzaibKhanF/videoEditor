"use client";

import { useState, FormEvent, useEffect } from "react";
import { useAuth } from "@/context/useAuthContext";

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

  useEffect(() => {
    if (authModalOpen) {
      setEmail("");
      setPassword("");
      setDisplayName("");
      setMode("login");
    }
  }, [authModalOpen]);

  if (!authModalOpen) return null;

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

  return (
    <div
      className="fixed inset-0 z-[2000] bg-black/65 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) closeAuthModal(); }}
    >
      <div className="relative w-full max-w-[400px] animate-fade-in">
        <button
          onClick={closeAuthModal}
          className="absolute -top-10 right-0 text-ink-faint hover:text-ink-primary text-[13px] font-semibold transition-colors"
        >
          Continue as guest
        </button>

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
