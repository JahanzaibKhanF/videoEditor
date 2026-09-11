"use client";

/**
 * BufferedScrubBar — a thin YouTube-style progress bar under the preview:
 * played (signal-colored) fill, a lighter "already downloaded/decoded"
 * buffered fill (from CanvasEngine.getBufferedRanges via EngineControls
 * context), and a small pulsing red marker right at the playhead while
 * actively stalled — the same red-line convention YouTube uses for "still
 * buffering right here", distinct from "buffered ahead" in light gray.
 * Click/drag anywhere on it to seek.
 */
import { useRef } from "react";
import { useAppDetailsContext, useEngineControls } from "../../context/useAppContext";

export default function BufferedScrubBar() {
  const { currentTime, totalTime } = useAppDetailsContext();
  const { seekTo, bufferedRanges, isBuffering } = useEngineControls();
  const trackRef = useRef<HTMLDivElement>(null);

  if (!totalTime) return null;

  const pct = (t: number) => Math.max(0, Math.min(100, (t / totalTime) * 100));
  const playedPct = pct(currentTime);

  const seekFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    seekTo(frac * totalTime);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    seekFromClientX(e.clientX);
    const mv = (ev: PointerEvent) => seekFromClientX(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      className="relative w-full flex-shrink-0 cursor-pointer group px-0.5 flex items-center"
      style={{ height: 12 }}
      title="Seek"
    >
      <div className="relative w-full rounded-full bg-white/10 overflow-visible" style={{ height: 4 }}>
        {bufferedRanges.map((r, i) => (
          <div key={i} className="absolute top-0 bottom-0 rounded-full bg-white/25"
            style={{ left: `${pct(r.start)}%`, width: `${Math.max(0, pct(r.end) - pct(r.start))}%` }} />
        ))}
        <div className="absolute top-0 bottom-0 rounded-full bg-signal" style={{ width: `${playedPct}%` }} />
        {isBuffering && (
          <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-danger animate-pulse"
            style={{ left: `calc(${playedPct}% - 4px)` }} title="Buffering" />
        )}
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-signal shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `calc(${playedPct}% - 5px)`, width: 10, height: 10 }}
        />
      </div>
    </div>
  );
}
