"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { X } from "@/utils/icons";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** Sheet height as a fraction of the viewport (0–1). Default 0.62. */
  height?: number;
  /** Hide the dimmed backdrop (e.g. so the preview stays interactive). */
  noBackdrop?: boolean;
  children: React.ReactNode;
}

/**
 * Sheet — bottom sheet for the mobile editor. Slides up from the bottom
 * edge, dims the page behind it, dismisses on backdrop tap, Esc, or a
 * downward drag on the grab handle / header. Height is `dvh`-based so the
 * mobile browser chrome doesn't clip it.
 */
export default function Sheet({ open, onClose, title, height = 0.62, noBackdrop, children }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Mount → next frame → slide in; on close, slide out then unmount.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(r);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => { if (!open) setDragY(0); }, [open]);

  if (!mounted) return null;

  const startDrag = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setDragY(Math.max(0, ev.clientY - startY));
    const up = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener("pointermove", move as EventListener);
      target.removeEventListener("pointerup", up as EventListener);
      if (ev.clientY - startY > 90) onClose();
      else setDragY(0);
    };
    target.addEventListener("pointermove", move as EventListener);
    target.addEventListener("pointerup", up as EventListener);
  };

  // z-[400]: above the editor chrome (header z-50) but deliberately below
  // every full-screen modal (RenderingLoader z-999, Importing z-1500,
  // CompositionSettingsModal z-9000) so those still cover an open sheet.
  return (
    <div className="fixed inset-0 z-[400] flex flex-col justify-end" aria-modal="true" role="dialog">
      {!noBackdrop && (
        <div
          onClick={onClose}
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity duration-200",
            visible ? "opacity-100" : "opacity-0"
          )}
        />
      )}
      <div
        ref={sheetRef}
        className={cn(
          "relative flex flex-col bg-studio-surface border-t border-studio-border",
          "rounded-t-2xl shadow-[0_-16px_48px_-12px_rgba(0,0,0,.6)]",
          "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
        )}
        style={{
          height: `${Math.round(height * 100)}dvh`,
          transform: visible ? `translateY(${dragY}px)` : "translateY(100%)",
        }}
      >
        {/* Grab handle + header — the drag-to-dismiss zone */}
        <div onPointerDown={startDrag} className="flex-shrink-0 pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none">
          <div className="mx-auto w-9 h-1 rounded-full bg-studio-borderLight" />
          {title && (
            <div className="flex items-center justify-between px-4 pt-2">
              <span className="text-[13px] font-bold text-ink-primary">{title}</span>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-7 h-7 -mr-1 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink-primary hover:bg-studio-hover transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
