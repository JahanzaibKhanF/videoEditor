"use client";

/**
 * LoadingScreen — the branded full-screen loader shown before the app is
 * usable: while the session cookie is being checked on first load, and
 * while a saved project is being fetched + rehydrated.
 *
 * Modern-app touch: instead of a bare spinner it steps through short status
 * lines ("Opening your project" → "Loading your media" → …) on a timer so
 * there's always a sense of what's happening. The steps are advisory copy,
 * not a real per-task progress bar — the underlying work (auth check,
 * project fetch, hydrate) mostly isn't instrumented for percentages — but
 * it reads far better than an unlabelled wheel.
 */
import { useEffect, useState } from "react";

const DEFAULT_STAGES = ["Starting ClipFlow", "Loading the editor", "Almost ready"];

export default function LoadingScreen({
  stages = DEFAULT_STAGES,
  error,
  onRetry,
}: {
  stages?: string[];
  error?: string | null;
  onRetry?: () => void;
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (error) return;
    setI(0);
    const t = setInterval(
      () => setI(v => (v >= stages.length - 1 ? v : v + 1)),
      1100
    );
    return () => clearInterval(t);
  }, [error, stages.length]);

  const pct = error ? 100 : ((i + 1) / stages.length) * 100;

  return (
    <div className="startup-overlay">
      <div className="aurora-field" aria-hidden="true">
        <div className="aurora-blob b1" />
        <div className="aurora-blob b2" />
        <div className="aurora-blob b3" />
        <div className="aurora-blob b4" />
        <div className="aurora-dust" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-5 text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-signal flex items-center justify-center shadow-glow">
          <svg width="26" height="26" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="#07070C" strokeWidth="1.4" />
            <path d="M5.5 5l4 2-4 2V5z" fill="#07070C" />
          </svg>
        </div>

        {error ? (
          <>
            <div className="text-[15px] font-bold text-ink-primary font-display">
              Couldn&rsquo;t open the project
            </div>
            <p className="text-meta text-ink-muted max-w-[280px] leading-relaxed">{error}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-1 h-9 px-4 rounded-xl bg-studio-raised border border-studio-border text-label font-bold text-ink-secondary hover:bg-studio-hover hover:text-ink-primary transition-colors"
              >
                Try again
              </button>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <span className="w-4 h-4 rounded-full border-2 border-studio-borderLight border-t-signal animate-spin" />
              <span className="text-label font-semibold text-ink-secondary">{stages[i]}&hellip;</span>
            </div>
            <div className="w-[180px] h-1 rounded-full bg-studio-raised overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-signal to-signal-hover transition-[width] duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
