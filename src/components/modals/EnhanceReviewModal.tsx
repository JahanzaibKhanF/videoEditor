"use client";

/**
 * EnhanceReviewModal — a big before/after review for an Enhance result:
 * the original and enhanced clips play back synced, with a drag handle
 * that reveals more of one side or the other (classic before/after slider,
 * just video instead of a still image). Apply/Discard live here too, so
 * reviewing and committing are the same step instead of a blind apply.
 */
import { useEffect, useRef, useState } from "react";
import { X, Check, RotateCcw } from "@/utils/icons";

export default function EnhanceReviewModal({
  originalSrc, enhancedSrc, onApply, onClose,
}: {
  originalSrc: string;
  enhancedSrc: string;
  onApply: () => void;
  onClose: () => void;
}) {
  const [dividerPct, setDividerPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef = useRef<HTMLVideoElement>(null);
  const draggingRef = useRef(false);

  // Keep the two videos roughly in sync — they're independent <video>
  // elements (need separate elements to show two different sources at
  // once), so left to themselves they'd slowly drift apart.
  useEffect(() => {
    const id = setInterval(() => {
      const b = beforeRef.current, a = afterRef.current;
      if (!b || !a) return;
      if (Math.abs(b.currentTime - a.currentTime) > 0.15) a.currentTime = b.currentTime;
    }, 800);
    return () => clearInterval(id);
  }, []);

  const setFromClientX = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setDividerPct(Math.max(0, Math.min(100, pct)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setFromClientX(e.clientX);
  };
  const onPointerUp = () => { draggingRef.current = false; };

  return (
    <div className="fixed inset-0 z-[9500] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-studio-surface border border-studio-border rounded-2xl shadow-2xl w-full max-w-[920px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-studio-border">
          <div>
            <div className="text-[14px] font-bold text-ink-primary">Review Enhance</div>
            <div className="text-[11px] text-ink-secondary mt-0.5">Drag the line to compare — left is your original, right is enhanced</div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg border border-studio-border bg-studio-raised flex items-center justify-center cursor-pointer text-ink-secondary hover:bg-studio-hover transition-all">
            <X size={14} />
          </button>
        </div>

        <div
          ref={containerRef}
          className="relative w-full aspect-video bg-black select-none touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ cursor: "ew-resize" }}
        >
          <video ref={beforeRef} src={originalSrc} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-contain" />
          <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${dividerPct}%)` }}>
            <video ref={afterRef} src={enhancedSrc} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-contain" />
          </div>

          <span className="absolute top-2.5 left-2.5 text-[10px] font-bold px-2 py-1 rounded-full bg-black/60 text-white/90 backdrop-blur-sm pointer-events-none">Before</span>
          <span className="absolute top-2.5 right-2.5 text-[10px] font-bold px-2 py-1 rounded-full bg-signal/70 text-white backdrop-blur-sm pointer-events-none">After</span>

          <div className="absolute top-0 bottom-0 w-0.5 bg-white/90 pointer-events-none" style={{ left: `${dividerPct}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center pointer-events-none"
            style={{ left: `${dividerPct}%` }}
          >
            <div className="flex gap-0.5">
              <div className="w-0.5 h-3 bg-studio-void/60 rounded-full" />
              <div className="w-0.5 h-3 bg-studio-void/60 rounded-full" />
            </div>
          </div>
        </div>

        <div className="flex gap-2 p-4">
          <button onClick={onClose}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-studio-border text-ink-secondary text-[13px] font-bold hover:bg-studio-hover transition-colors">
            <RotateCcw size={12} /> Back
          </button>
          <button onClick={onApply}
            className="flex-[2] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
            style={{ background: "linear-gradient(135deg,#8B5CFF,#A47CFF)" }}>
            <Check size={13} /> Apply to clip
          </button>
        </div>
      </div>
    </div>
  );
}
