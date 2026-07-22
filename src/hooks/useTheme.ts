"use client";

/**
 * useTheme — light/dark mode toggle. Dark is the default and the app's
 * primary designed identity; light mode flips the neutral studio/ink CSS
 * variables (see globals.css) app-wide for free, since the vast majority
 * of components consume those tokens through Tailwind classes rather than
 * hardcoded hex.
 *
 * Scope, stated plainly: accent colors (violet signal, amber scrub, danger/
 * success/warning) deliberately stay identical in both themes — that's a
 * design choice, not a gap. A handful of surfaces that were always
 * intentionally dark regardless of app theme (the startup screen's aurora
 * background, the export/render modals) stay dark in both modes, the same
 * way many professional creative tools keep certain chrome fixed — this is
 * common, not a mistake.
 */
import { useEffect, useState, useCallback } from "react";

export type Theme = "dark" | "light";
const STORAGE_KEY = "clipflow-theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") {
    root.classList.add("light");
    root.classList.remove("dark");
  } else {
    root.classList.add("dark");
    root.classList.remove("light");
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = (typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null) as Theme | null;
    const initial: Theme = saved === "light" ? "light" : "dark";
    setThemeState(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme, mounted };
}
