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
import { TemplateJson, TemplateJsonText, TemplateJsonShape, TemplateJsonBrush } from "../../utils/templateInterpreter";
import { aspectRatioDimensions } from "../../utils/aspectRatios";
import { templateJsonDuration } from "../../utils/templateSchema";
import { evalTemplateKf } from "../../utils/templateKeyframePreview";

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

// CSS clip-path polygon() approximating the same regular-N-gon math
// drawShapeLayer uses on the real canvas (points inscribed in the box,
// starting straight up) — good enough for the DOM preview.
function polygonClipPath(sides: number): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    const x = 50 + 50 * Math.cos(angle), y = 50 + 50 * Math.sin(angle);
    pts.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
  }
  return `polygon(${pts.join(", ")})`;
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
  const shapes = Array.isArray(json.shapes) ? json.shapes : [];
  const brushes = Array.isArray(json.brushes) ? json.brushes : [];
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

        {/* shape layers — read-only preview (positioned/edited via the form fields, not dragged here) */}
        {shapes.map((s, i) => {
          const start = s.startTime ?? 0, end = s.endTime ?? totalDur;
          if (time < start || time > end) return null;
          const kf = evalTemplateKf(s.keyframes, totalDur > 0 ? time / totalDur : 0);
          const opacity = (s.opacity ?? 1) * (kf.opacity ?? 1);
          const w = (s.wFrac ?? 0.3) * dispW, h = (s.hFrac ?? 0.2) * dispH;
          const cx = ((s.xFrac ?? 0) + (kf.x ?? 0)) * dispW + w / 2;
          const cy = ((s.yFrac ?? 0) + (kf.y ?? 0)) * dispH + h / 2;
          const scale = kf.scale ?? 1;
          const rotation = kf.rotation ?? 0;
          const hasFill = s.fill && s.fill !== "transparent";
          const hasStroke = s.stroke && s.stroke !== "transparent" && (s.strokeWidth ?? 0) > 0;
          const shapeStyle: React.CSSProperties = {
            position: "absolute", left: cx - w / 2, top: cy - h / 2, width: w, height: h,
            opacity, transform: `scale(${scale}) rotate(${rotation}deg)`,
            background: hasFill ? s.fill : "transparent",
            border: hasStroke ? `${s.strokeWidth}px solid ${s.stroke}` : "none",
            borderRadius: s.kind === "ellipse" ? "50%" : 0,
            clipPath: s.kind === "polygon" ? polygonClipPath(Math.max(3, Math.min(12, Math.round(s.sides ?? 3)))) : undefined,
          };
          return <div key={`shape-${i}`} style={shapeStyle} />;
        })}

        {/* brush strokes — read-only preview */}
        {brushes.length > 0 && (
          <svg className="absolute inset-0" width={dispW} height={dispH} style={{ pointerEvents: "none" }}>
            {brushes.map((b, i) => {
              const start = b.startTime ?? 0, end = b.endTime ?? totalDur;
              if (time < start || time > end) return null;
              const kf = evalTemplateKf(b.keyframes, totalDur > 0 ? time / totalDur : 0);
              const opacity = (b.opacity ?? 1) * (kf.opacity ?? 1);
              const bw = (b.wFrac ?? 0.5) * dispW, bh = (b.hFrac ?? 0.2) * dispH;
              const bx = ((b.xFrac ?? 0) + (kf.x ?? 0)) * dispW;
              const by = ((b.yFrac ?? 0) + (kf.y ?? 0)) * dispH;
              const points = (b.points ?? []).map((p) => `${bx + p.x * bw},${by + p.y * bh}`).join(" ");
              return (
                <polyline key={`brush-${i}`} points={points} fill="none" stroke={b.color}
                  strokeWidth={b.strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
              );
            })}
          </svg>
        )}

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
