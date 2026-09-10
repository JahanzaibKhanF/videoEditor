"use client";

/**
 * CurveField — a small draggable cubic-bezier easing editor for ONE keyframe
 * segment. Shows the unit-square curve from (0,0) to (1,1) with two handles;
 * dragging a handle rewrites the [x1,y1,x2,y2] ease. Preset chips below
 * (Linear / Smooth / Ease In / Ease Out / In-Out / Hold).
 *
 * Used inline in the inspector for the selected keyframe, and inside the
 * graph editor. Purely presentational — parent owns the value.
 */
import { useRef, PointerEvent as ReactPointerEvent } from "react";
import { Keyframe } from "../../types/types";
import { EASING_PRESETS, EASE_PRESET_LABELS, easePresetOf, EasePreset } from "../../utils/keyframes";

interface Props {
  ease: Keyframe["ease"];
  onChange: (ease: Keyframe["ease"]) => void;
  size?: number;
  showPresets?: boolean;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
// x is clamped harder than y — control points outside 0..1 on x break the solver
const clampX = (n: number) => Math.max(0, Math.min(1, n));

export default function CurveField({ ease, onChange, size = 116, showPresets = true }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pad = 10;
  const inner = size - pad * 2;
  const isHold = ease === "hold";
  const pts = Array.isArray(ease) ? ease : EASING_PRESETS.smooth as [number, number, number, number];
  const [x1, y1, x2, y2] = isHold ? [0, 0, 0, 0] : pts;

  // model space (0..1, y up) → svg space (y down)
  const sx = (x: number) => pad + x * inner;
  const sy = (y: number) => pad + (1 - y) * inner;

  const drag = (which: 1 | 2) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = svgRef.current!.getBoundingClientRect();
      const mx = clampX((ev.clientX - r.left - pad) / inner);
      const my = clamp01(1 - (ev.clientY - r.top - pad) / inner);
      const next: [number, number, number, number] = which === 1 ? [mx, my, x2, y2] : [x1, y1, mx, my];
      onChange(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const preset = easePresetOf(ease);

  return (
    <div className="flex flex-col gap-1.5">
      <svg ref={svgRef} width={size} height={size} className="rounded-lg bg-studio-void border border-studio-border touch-none">
        {/* grid */}
        <rect x={pad} y={pad} width={inner} height={inner} fill="none" stroke="currentColor" className="text-studio-border" />
        <line x1={pad} y1={sy(0.5)} x2={pad + inner} y2={sy(0.5)} stroke="currentColor" className="text-studio-border" strokeDasharray="2 3" />
        {isHold ? (
          <polyline points={`${sx(0)},${sy(0)} ${sx(1)},${sy(0)} ${sx(1)},${sy(1)}`} fill="none" stroke="#8B5CFF" strokeWidth={2} />
        ) : (
          <>
            <path d={`M ${sx(0)} ${sy(0)} C ${sx(x1)} ${sy(y1)}, ${sx(x2)} ${sy(y2)}, ${sx(1)} ${sy(1)}`}
              fill="none" stroke="#8B5CFF" strokeWidth={2} />
            <line x1={sx(0)} y1={sy(0)} x2={sx(x1)} y2={sy(y1)} stroke="#8B5CFF" strokeOpacity={0.4} />
            <line x1={sx(1)} y1={sy(1)} x2={sx(x2)} y2={sy(y2)} stroke="#8B5CFF" strokeOpacity={0.4} />
            <circle cx={sx(x1)} cy={sy(y1)} r={5} fill="#8B5CFF" className="cursor-grab" onPointerDown={drag(1)} />
            <circle cx={sx(x2)} cy={sy(y2)} r={5} fill="#8B5CFF" className="cursor-grab" onPointerDown={drag(2)} />
          </>
        )}
        <circle cx={sx(0)} cy={sy(0)} r={2.5} fill="currentColor" className="text-ink-faint" />
        <circle cx={sx(1)} cy={sy(1)} r={2.5} fill="currentColor" className="text-ink-faint" />
      </svg>

      {showPresets && (
        <div className="flex flex-wrap gap-1">
          {EASE_PRESET_LABELS.map(({ key, label }) => (
            <button key={key} onClick={() => onChange(EASING_PRESETS[key as EasePreset])}
              className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                preset === key ? "border-signal bg-signal/15 text-signal" : "border-studio-border text-ink-secondary hover:text-ink-primary"
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
