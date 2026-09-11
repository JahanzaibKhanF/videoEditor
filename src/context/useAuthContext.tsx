"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  /** ISO timestamp — present from /api/auth/me, login and signup. */
  createdAt?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  signup: (email: string, password: string, displayName?: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  authModalOpen: boolean;
  authModalReason: string | null;
  authModalMode: "login" | "signup";
  /** `mode` picks which tab the modal opens on — e.g. a dedicated "Sign up" entry point. */
  promptLogin: (reason?: string, mode?: "login" | "signup") => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalReason, setAuthModalReason] = useState<string | null>(null);
  const [authModalMode, setAuthModalMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    let cancelled = false;
    // The startup screen is blocked on `loading` until this resolves — a
    // slow/cold DB connection behind /api/auth/me (Neon serverless cold
    // starts can take several seconds, longer under load) used to leave the
    // whole app stuck on "Starting ClipFlow…" indefinitely. Cap it: if it
    // doesn't answer in time, fall back to signed-out (the app already
    // works fully as a guest) instead of blocking forever. The user can
    // still sign in manually once the app is up.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { signal: controller.signal });
        const data = await parseJsonSafe(res);
        if (!cancelled) setUser(data.user ?? null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const signup = useCallback(async (email: string, password: string, displayName?: string) => {
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok) {
      setError(data.error ?? "Could not create account.");
      return false;
    }
    setUser(data.user);
    setAuthModalOpen(false);
    return true;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok) {
      setError(data.error ?? "Could not sign in.");
      return false;
    }
    setUser(data.user);
    setAuthModalOpen(false);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const promptLogin = useCallback((reason?: string, mode?: "login" | "signup") => {
    setError(null);
    setAuthModalReason(reason ?? null);
    setAuthModalMode(mode ?? "login");
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
    setAuthModalReason(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user, loading, error, signup, login, logout, clearError,
        authModalOpen, authModalReason, authModalMode, promptLogin, closeAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
