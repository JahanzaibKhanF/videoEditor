"use client";

/**
 * AnimationPreviewTile — replaces the old icon+label button for picking an
 * animation. Instead of an abstract icon, this shows the ACTUAL animation
 * playing on a sample "Aa" (text mode) or a little placeholder photo (image
 * mode), driven by the exact same `computeAnimState` math the real canvas
 * compositor uses — so the preview can never drift out of sync with what
 * actually renders.
 *
 * Idle: shows the animation's settled/rest pose on a colorful gradient
 * card, plus a small corner "motion glyph" badge (an arrow/rotate/pulse
 * icon hinting at the type of motion) since there's no longer a literal
 * animation-name icon doing that job.
 * Hover: runs a short looping preview (plays the intro, holds, replays).
 */
import { useEffect, useRef, useState } from "react";
import { computeAnimState } from "../../utils/AnimationEngine";
import {
  ArrowLeft, ArrowRight, ArrowUp, ArrowDown, RotateCw, Sparkles, Waves,
  ZoomIn, Eye, EyeOff, Zap, Wind, CircleDot, Ban,
  type LucideIcon,
} from "@/utils/icons";

const PREVIEW_W = 100;
const PREVIEW_H = 68;
const PREVIEW_FPS = 30;

// Rough categorization so every animation still gets a sensible glyph hint
// even though we don't hand-author one per key (there are ~50 of them).
function motionGlyph(key: string): LucideIcon {
  const k = key.toLowerCase();
  if (k === "none") return Ban;
  if (k.includes("left")) return ArrowLeft;
  if (k.includes("right") && !k.includes("bright")) return ArrowRight;
  if (k.includes("up") || k.includes("top") || k.includes("bottom") && k.includes("from")) return ArrowUp;
  if (k.includes("down") || (k.includes("bottom") && !k.includes("from"))) return ArrowDown;
  if (k.includes("rotate") || k.includes("spin") || k.includes("twirl") || k.includes("flip")) return RotateCw;
  if (k.includes("shake") || k.includes("wiggle") || k.includes("wave") || k.includes("flicker")) return Waves;
  if (k.includes("sparkle") || k.includes("bling") || k.includes("glow") || k.includes("flash")) return Sparkles;
  if (k.includes("zoom") || k.includes("grow") || k.includes("expand") || k.includes("target")) return ZoomIn;
  if (k.includes("fadein") || k === "fadein") return Eye;
  if (k.includes("fadeout") || k.includes("shrink") || k.includes("collapse") || k.includes("out")) return EyeOff;
  if (k.includes("bolt") || k.includes("light") || k.includes("fast")) return Zap;
  if (k.includes("blur") || k.includes("disperse") || k.includes("smooth")) return Wind;
  return CircleDot;
}

interface Props {
  animationKey: string;
  label: string;
  active: boolean;
  mode: "text" | "image";
  accentColor?: string;
  onClick: () => void;
}

// A few distinct gradient palettes, cycled by key so the grid doesn't look
// monochrome — this is the "style with gradients so it looks cool" ask.
const PALETTES = [
  ["#8B5CFF", "#FF4F70"], ["#4C8CFF", "#33D8A0"], ["#FF9D4C", "#FF4F70"],
  ["#33D8A0", "#8B5CFF"], ["#FF4F70", "#FFB648"], ["#4C8CFF", "#A47CFF"],
];
function paletteFor(key: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length] as [string, string];
}

export default function AnimationPreviewTile({ animationKey, label, active, mode, accentColor, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovering, setHovering] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const [palette] = useState(() => paletteFor(animationKey));
  const Glyph = motionGlyph(animationKey);

  const draw = (t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, PREVIEW_W * dpr, PREVIEW_H * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    const cx = PREVIEW_W / 2, cy = PREVIEW_H / 2;
    const state = computeAnimState(animationKey, t, 0, 1.3, PREVIEW_FPS, cx, cy, PREVIEW_W, PREVIEW_H, mode === "text" ? 26 : 34);

    if (!state.visible) { ctx.restore(); return; }

    ctx.globalAlpha = Math.max(0, Math.min(1, state.opacity));
    ctx.translate(state.tx, state.ty);
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.scale(state.scale * state.scaleX, state.scale * state.scaleY);
    if (state.blur > 0) ctx.filter = `blur(${state.blur * 0.3}px)`;

    if (mode === "text") {
      ctx.font = "700 22px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0,0,0,.35)";
      ctx.shadowBlur = 6;
      ctx.fillText("Aa", 0, 0);
    } else {
      // Simple placeholder "photo" glyph: rounded frame + mountain + sun,
      // since we don't ship a fixed sample image asset — this reads clearly
      // as "an image" at a glance without needing a real photo.
      const w = 34, h = 26;
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.strokeStyle = "rgba(255,255,255,.5)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, -w / 2, -h / 2, w, h, 4);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, -w / 2, -h / 2, w, h, 4);
      ctx.clip();
      ctx.fillStyle = "#FFD166";
      ctx.beginPath();
      ctx.arc(-w / 2 + 8, -h / 2 + 7, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8B5CFF";
      ctx.beginPath();
      ctx.moveTo(-w / 2, h / 2);
      ctx.lineTo(-w / 2 + 12, -h / 2 + 6);
      ctx.lineTo(-w / 2 + 20, h / 2 - 4);
      ctx.lineTo(w / 2, h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) { canvas.width = PREVIEW_W * dpr; canvas.height = PREVIEW_H * dpr; }
    // Always draw the settled rest pose (t = just after the animation ends)
    // when not hovering, so the tile isn't blank/mid-motion at rest.
    draw(hovering ? 0 : 1.3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpr]);

  useEffect(() => {
    if (!hovering) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startedAtRef.current = null;
      draw(1.3); // rest pose
      return;
    }
    const LOOP_S = 2.2; // play (1.3s) + hold, then replay
    const tick = (now: number) => {
      if (startedAtRef.current === null) startedAtRef.current = now;
      const elapsedS = ((now - startedAtRef.current) / 1000) % LOOP_S;
      draw(elapsedS);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovering, animationKey, mode]);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      title={label}
      className={`relative rounded-xl overflow-hidden flex flex-col cursor-pointer transition-all border-[1.5px] ${
        active ? "ring-2" : ""
      }`}
      style={{
        borderColor: active ? (accentColor ?? "#8B5CFF") : "transparent",
        boxShadow: active ? `0 0 0 1px ${accentColor ?? "#8B5CFF"}55` : undefined,
      }}
    >
      <div
        className="relative w-full"
        style={{ height: PREVIEW_H, background: `linear-gradient(135deg, ${palette[0]}, ${palette[1]})` }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: PREVIEW_W, height: PREVIEW_H, display: "block" }}
        />
        {/* Motion-direction glyph badge */}
        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/35 flex items-center justify-center backdrop-blur-sm">
          <Glyph size={9} color="white" strokeWidth={2.5} />
        </div>
      </div>
      <div className={`text-[10px] font-semibold text-center py-1 truncate px-1 ${active ? "text-signal" : "text-ink-secondary"}`}
        style={{ background: "var(--tw-color-studio-raised, rgba(255,255,255,.03))" }}>
        {label}
      </div>
    </button>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
