"use client";

/**
 * TransitionPreviewTile — replaces the old icon+label button for picking a
 * transition. Two small sample "clips" (labeled A/B, distinct gradient
 * colors so the boundary is always visible) actually transition into each
 * other on hover, using the exact same `applyTransition` function the real
 * compositor calls during playback/export — so, like AnimationPreviewTile,
 * this can never visually drift out of sync with what actually renders.
 */
import { useEffect, useRef, useState } from "react";
import { applyTransition } from "../../utils/compositeFrame";

const TILE_W = 100;
const TILE_H = 68;

interface Props {
  transitionKey: string;
  label: string;
  active: boolean;
  accentColor?: string;
  onClick: () => void;
}

// Two small offscreen "clip" canvases, built once per mount, reused by
// every tile instance's draw calls (each tile still needs its own visible
// canvas, but the source panels are identical everywhere).
function buildClipPanel(labelText: string, colorA: string, colorB: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE_W; c.height = TILE_H;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, TILE_W, TILE_H);
  grad.addColorStop(0, colorA);
  grad.addColorStop(1, colorB);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TILE_W, TILE_H);
  ctx.font = "700 26px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fillText(labelText, TILE_W / 2, TILE_H / 2);
  return c;
}

export default function TransitionPreviewTile({ transitionKey, label, active, accentColor, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovering, setHovering] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const panelsRef = useRef<{ a: HTMLCanvasElement; b: HTMLCanvasElement } | null>(null);

  if (!panelsRef.current && typeof document !== "undefined") {
    panelsRef.current = {
      a: buildClipPanel("A", "#8B5CFF", "#FF4F70"),
      b: buildClipPanel("B", "#4C8CFF", "#33D8A0"),
    };
  }

  const draw = (progress: number) => {
    const canvas = canvasRef.current;
    const panels = panelsRef.current;
    if (!canvas || !panels) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, TILE_W, TILE_H);
    // Clip A is always the base — applyTransition draws Clip B on top
    // using whatever transform/mask/alpha this transition type calls for
    // at this progress, exactly like the real compositor does for the
    // outgoing/incoming clip pair.
    ctx.drawImage(panels.a, 0, 0);
    if (transitionKey !== "none") {
      applyTransition(ctx, transitionKey, progress, TILE_W, TILE_H, panels.b, { x: 0, y: 0, w: TILE_W, h: TILE_H });
    } else if (progress > 0.5) {
      ctx.drawImage(panels.b, 0, 0); // "None" = hard cut, for an honest preview of what it'll actually look like
    }
    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) { canvas.width = TILE_W * dpr; canvas.height = TILE_H * dpr; }
    draw(hovering ? 0 : 1); // rest pose: fully transitioned (settled) state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpr]);

  useEffect(() => {
    if (!hovering) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startedAtRef.current = null;
      draw(1);
      return;
    }
    const LOOP_S = 1.6; // transition (0.6s, matching computeTransition's real duration) + hold, then replay
    const tick = (now: number) => {
      if (startedAtRef.current === null) startedAtRef.current = now;
      const elapsedS = ((now - startedAtRef.current) / 1000) % LOOP_S;
      draw(Math.min(1, elapsedS / 0.6));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovering, transitionKey]);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      title={label}
      className={`relative rounded-xl overflow-hidden flex flex-col cursor-pointer transition-all border-[1.5px] ${active ? "ring-2" : ""}`}
      style={{
        borderColor: active ? (accentColor ?? "#8B5CFF") : "transparent",
        boxShadow: active ? `0 0 0 1px ${accentColor ?? "#8B5CFF"}55` : undefined,
      }}
    >
      <div className="relative w-full bg-studio-void" style={{ height: TILE_H }}>
        <canvas ref={canvasRef} style={{ width: TILE_W, height: TILE_H, display: "block" }} />
      </div>
      <div className={`text-[10px] font-semibold text-center py-1 truncate px-1 ${active ? "text-signal" : "text-ink-secondary"}`}
        style={{ background: "rgba(255,255,255,.03)" }}>
        {label}
      </div>
    </button>
  );
}
