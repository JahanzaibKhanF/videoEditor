"use client";

/**
 * TemplatePreviewStage — live, draggable preview of a template document for
 * the admin builder. DOM-based (not the real canvas compositor) — it doesn't
 * need pixel parity with export, it needs to answer "where does this text
 * land and roughly what does it look like" while you author.
 *
 *  - Background is a gradient from the template's accent color, with the
 *    currently-active video slot labelled.
 *  - Each text layer visible at the current scrub time is an absolutely
 *    positioned box; drag it to move, drag its corner to resize. Both write
 *    fractional coords straight back via onChangeText.
 *  - A light approximation of the reveal animations (fade / rise / zoom) so
 *    the timing controls feel real.
 */
import { useRef, PointerEvent as ReactPointerEvent } from "react";
import { TemplateJson, TemplateJsonText, TemplateJsonKeyframeTrack } from "../../utils/templateInterpreter";
import { aspectRatioDimensions } from "../../utils/aspectRatios";
import { templateJsonDuration } from "../../utils/templateSchema";
import { cubicBezier, EASING_PRESETS, KfOverride } from "../../utils/keyframes";

// Evaluate a template's fractional keyframe tracks at a time-fraction.
function evalTemplateKf(tracks: TemplateJsonKeyframeTrack[] | undefined, tFrac: number): KfOverride {
  const o: KfOverride = {};
  for (const tr of tracks ?? []) {
    const keys = [...(tr.keys ?? [])].sort((a, b) => a.tFrac - b.tFrac);
    if (keys.length === 0) continue;
    let v: number;
    if (tFrac <= keys[0].tFrac || keys.length === 1) v = keys[0].value;
    else if (tFrac >= keys[keys.length - 1].tFrac) v = keys[keys.length - 1].value;
    else {
      let k0 = keys[0], k1 = keys[1];
      for (let i = 0; i < keys.length - 1; i++) if (tFrac >= keys[i].tFrac && tFrac <= keys[i + 1].tFrac) { k0 = keys[i]; k1 = keys[i + 1]; break; }
      const span = k1.tFrac - k0.tFrac;
      const u = span <= 0 ? 0 : (tFrac - k0.tFrac) / span;
      const ease = k0.ease === "hold" ? "hold" : (k0.ease ?? EASING_PRESETS.smooth);
      const e = ease === "hold" ? 0 : Array.isArray(ease) ? cubicBezier(ease[0], ease[1], ease[2], ease[3])(u) : u;
      v = k0.value + (k1.value - k0.value) * e;
    }
    o[tr.prop] = v;
  }
  return o;
}

interface Props {
  json: TemplateJson;
  time: number;
  selectedIndex: number | null;
  onSelect: (i: number | null) => void;
  onChangeText: (i: number, patch: Partial<TemplateJsonText>) => void;
  maxHeight?: number;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

// Rough visual stand-in for the real AnimationEngine reveals — enough to
// make the start-time slider feel connected to something.
function animStyle(t: TemplateJsonText, time: number, totalDur: number): React.CSSProperties {
  const start = t.startTime ?? 0;
  const end = t.endTime ?? totalDur;
  const anim = t.animation ?? "none";
  const DUR = 0.5;
  const p = clamp01((time - start) / DUR); // 0..1 through the intro
  const eased = 1 - Math.pow(1 - p, 3);
  const o = t.opacity ?? 1;

  if (time < start || time > end) return { opacity: 0 };

  switch (anim) {
    case "none":
      return { opacity: o };
    case "fadeIn":
    case "blurIn":
    case "glowIn":
    case "typewriter":
      return { opacity: o * eased };
    case "slideUp":
    case "popInUp":
      return { opacity: o * eased, transform: `translateY(${(1 - eased) * 22}px)` };
    case "slideDown":
    case "popInDown":
      return { opacity: o * eased, transform: `translateY(${(1 - eased) * -22}px)` };
    case "slideIn":
      return { opacity: o * eased, transform: `translateX(${(1 - eased) * -28}px)` };
    case "slideInRight":
      return { opacity: o * eased, transform: `translateX(${(1 - eased) * 28}px)` };
    case "zoomIn":
    case "grow":
    case "bounceIn":
      return { opacity: o * eased, transform: `scale(${0.6 + eased * 0.4})` };
    case "wiggle":
      return { opacity: o, transform: `rotate(${Math.sin(time * 8) * 4}deg)` };
    case "shake":
      return { opacity: o, transform: `translate(${Math.sin(time * 40) * 2}px, ${Math.cos(time * 37) * 2}px)` };
    case "pulse":
    case "sparkle":
      return { opacity: o, transform: `scale(${1 + Math.sin(time * 6) * 0.04})` };
    default:
      return { opacity: o * eased };
  }
}

export default function TemplatePreviewStage({
  json, time, selectedIndex, onSelect, onChangeText, maxHeight = 380,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: "move" | "resize";
    index: number;
    startX: number;
    startY: number;
    orig: { xFrac: number; yFrac: number; wFrac: number; hFrac: number };
  } | null>(null);

  const [canvasW, canvasH] = aspectRatioDimensions((json.aspectRatio as string) ?? "16:9");
  const ratio = canvasW / canvasH;
  // Fit into a box that is at most maxHeight tall and ~520 wide.
  let dispH = maxHeight;
  let dispW = dispH * ratio;
  if (dispW > 520) { dispW = 520; dispH = dispW / ratio; }

  const totalDur = templateJsonDuration(json);
  const slots = Array.isArray(json.videoSlots) ? json.videoSlots : [];
  const texts = Array.isArray(json.texts) ? json.texts : [];
  const accent = json.accentColor || "#8B5CFF";

  // Which slot is playing at `time`?
  let acc = 0;
  let activeSlot = -1;
  for (let i = 0; i < slots.length; i++) {
    acc += Number(slots[i].durationSecs) || 0;
    if (time < acc) { activeSlot = i; break; }
  }
  if (activeSlot === -1 && slots.length) activeSlot = slots.length - 1;

  const beginDrag = (
    e: ReactPointerEvent, index: number, mode: "move" | "resize",
  ) => {
    e.stopPropagation();
    const t = texts[index];
    dragRef.current = {
      mode, index,
      startX: e.clientX, startY: e.clientY,
      orig: {
        xFrac: t.xFrac ?? 0, yFrac: t.yFrac ?? 0,
        wFrac: t.wFrac ?? 0.5, hFrac: t.hFrac ?? 0.1,
      },
    };
    onSelect(index);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      const stage = stageRef.current;
      if (!d || !stage) return;
      const rect = stage.getBoundingClientRect();
      const dxFrac = (ev.clientX - d.startX) / rect.width;
      const dyFrac = (ev.clientY - d.startY) / rect.height;
      if (d.mode === "move") {
        onChangeText(d.index, {
          xFrac: clamp01(d.orig.xFrac + dxFrac),
          yFrac: clamp01(d.orig.yFrac + dyFrac),
        });
      } else {
        onChangeText(d.index, {
          wFrac: Math.max(0.05, Math.min(1, d.orig.wFrac + dxFrac)),
          hFrac: Math.max(0.04, Math.min(1, d.orig.hFrac + dyFrac)),
        });
      }
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={stageRef}
        onPointerDown={() => onSelect(null)}
        className="relative overflow-hidden rounded-xl border border-studio-border select-none"
        style={{
          width: dispW, height: dispH,
          background: `linear-gradient(135deg, ${accent}dd, ${accent}55 55%, #0b0b12)`,
        }}
      >
        {/* slot strip */}
        <div className="absolute inset-x-0 bottom-0 flex h-6 text-[8px] font-bold">
          {slots.map((sl, i) => (
            <div key={i}
              className="flex items-center justify-center border-r border-white/15 last:border-r-0 overflow-hidden whitespace-nowrap px-1"
              style={{
                flexGrow: Number(sl.durationSecs) || 1,
                flexBasis: 0,
                background: i === activeSlot ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.35)",
                color: i === activeSlot ? "#fff" : "rgba(255,255,255,0.6)",
              }}>
              {sl.label || `Slot ${i + 1}`}
            </div>
          ))}
          {slots.length === 0 && (
            <div className="flex-1 flex items-center justify-center bg-black/40 text-white/60">
              Text-only template
            </div>
          )}
        </div>

        {/* text layers */}
        {texts.map((t, i) => {
          const style = animStyle(t, time, totalDur);
          // Real keyframe overrides layered on top of the entrance approximation.
          const kf = evalTemplateKf(t.keyframes, totalDur > 0 ? time / totalDur : 0);
          if (kf.opacity !== undefined) style.opacity = ((style.opacity as number) ?? 1) * kf.opacity;
          const kfXfm = [
            (kf.x || kf.y) ? `translate(${(kf.x ?? 0) * dispW}px, ${(kf.y ?? 0) * dispH}px)` : "",
            kf.scale !== undefined ? `scale(${kf.scale})` : "",
            kf.rotation ? `rotate(${kf.rotation}deg)` : "",
          ].filter(Boolean).join(" ");
          if (kfXfm) style.transform = `${style.transform ?? ""} ${kfXfm}`.trim();
          const selected = i === selectedIndex;
          const previewFont = (t.fontSize ?? 48) * (dispH / canvasH);
          return (
            <div
              key={i}
              onPointerDown={(e) => beginDrag(e, i, "move")}
              className="absolute cursor-move"
              style={{
                left: `${(t.xFrac ?? 0) * 100}%`,
                top: `${(t.yFrac ?? 0) * 100}%`,
                width: `${(t.wFrac ?? 0.5) * 100}%`,
                height: `${(t.hFrac ?? 0.1) * 100}%`,
                outline: selected ? `1.5px solid ${accent}` : "1px dashed rgba(255,255,255,0.35)",
                outlineOffset: 1,
                ...style,
              }}
            >
              <div
                className="w-full h-full flex items-center justify-center text-center overflow-hidden px-1 leading-tight"
                style={{
                  background: t.backgroundColor && t.backgroundColor !== "transparent" ? t.backgroundColor : "transparent",
                  color: t.textColor || "#fff",
                  fontFamily: t.fontFamily || "Arial",
                  fontWeight: t.isBold ? 700 : 400,
                  fontStyle: t.isItalic ? "italic" : "normal",
                  textDecoration: t.isUnderline ? "underline" : "none",
                  fontSize: Math.max(6, previewFont),
                  textShadow: t.shadowColor && t.shadowColor !== "transparent"
                    ? `${t.shadowOffsetX ?? 0}px ${t.shadowOffsetY ?? 0}px ${t.shadowBlur ?? 0}px ${t.shadowColor}`
                    : "none",
                }}
              >
                {t.text || "…"}
              </div>
              {selected && (
                <div
                  onPointerDown={(e) => beginDrag(e, i, "resize")}
                  className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm cursor-se-resize"
                  style={{ background: accent, border: "1px solid #fff" }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-ink-faint font-mono">
        {dispW | 0}×{dispH | 0} preview · {canvasW}×{canvasH} canvas · {totalDur.toFixed(1)}s
      </div>
    </div>
  );
}
