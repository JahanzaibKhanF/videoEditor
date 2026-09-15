"use client";

/**
 * GraphEditorModal — After Effects–style value-graph editor for one layer's
 * keyframe tracks. X = time, Y = value (each track auto-normalised to its own
 * min/max so multiple properties overlay legibly). Keyframes are draggable
 * points; the selected key exposes two bezier influence handles that rewrite
 * the outgoing segment's ease. Preset chips apply to the selected key.
 *
 * Scope: single-key selection, value graph only (no speed graph / box-select).
 * Same overlay pattern as TemplateClipRangeModal.
 */
import { useMemo, useRef, useState, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { KeyframeTrack, KfProp, Keyframe } from "../../types/types";
import {
  propMeta, sampleSegment, trackValueBounds, upsertTrack, retimeKey, setKeyValue,
  setKeyEase, removeKey, upsertKey, EASING_PRESETS, EASE_PRESET_LABELS, easePresetOf, EasePreset,
} from "../../utils/keyframes";
import { X, Trash2 } from "@/utils/icons";

interface Props {
  tracks: KeyframeTrack[];
  onChange: (tracks: KeyframeTrack[] | undefined) => void;
  duration: number;
  time: number;
  onSeek?: (t: number) => void;
  mode?: "editor" | "template";
  onClose: () => void;
}

const TRACK_COLORS: Record<KfProp, string> = {
  x: "#4C8CFF", y: "#33D8A0", scale: "#FFB648", scaleX: "#FFB648", scaleY: "#FF9D4C",
  rotation: "#FF4F70", opacity: "#8B5CFF", blur: "#A78BFA", curve: "#33D8A0",
};

const W = 720, H = 380, PAD_L = 46, PAD_R = 16, PAD_T = 18, PAD_B = 28;
const GW = W - PAD_L - PAD_R;
const GH = H - PAD_T - PAD_B;

export default function GraphEditorModal({ tracks, onChange, duration, time, onSeek, mode = "editor", onClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hidden, setHidden] = useState<Set<KfProp>>(new Set());
  const [sel, setSel] = useState<{ prop: KfProp; id: string } | null>(null);

  const visible = tracks.filter((t) => !hidden.has(t.prop) && t.keys.length > 0);

  // time domain: keyframe span padded a little, but never past [0, duration]
  const tMax = Math.max(duration, ...tracks.flatMap((t) => t.keys.map((k) => k.t)), 1);
  const x = (t: number) => PAD_L + (t / tMax) * GW;
  const invX = (px: number) => ((px - PAD_L) / GW) * tMax;

  const bounds = useMemo(() => {
    const m = new Map<KfProp, [number, number]>();
    for (const tr of tracks) {
      const [lo, hi] = trackValueBounds(tr);
      const pad = (hi - lo) * 0.15 || 0.5;
      m.set(tr.prop, [lo - pad, hi + pad]);
    }
    return m;
  }, [tracks]);

  const yFor = (prop: KfProp) => {
    const [lo, hi] = bounds.get(prop) ?? [0, 1];
    return {
      y: (v: number) => PAD_T + GH - ((v - lo) / (hi - lo || 1)) * GH,
      invY: (py: number) => lo + ((PAD_T + GH - py) / GH) * (hi - lo || 1),
    };
  };

  const patchTrack = (prop: KfProp, fn: (tr: KeyframeTrack) => KeyframeTrack) => {
    const tr = tracks.find((t) => t.prop === prop);
    if (!tr) return;
    onChange(upsertTrack(tracks, fn(tr)));
  };

  const dragKey = (prop: KfProp, k: Keyframe) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    setSel({ prop, id: k.id });
    const { invY } = yFor(prop);
    const move = (ev: PointerEvent) => {
      const r = svgRef.current!.getBoundingClientRect();
      const scaleX = W / r.width, scaleY = H / r.height;
      const t = Math.max(0, Math.min(tMax, invX((ev.clientX - r.left) * scaleX)));
      const v = invY((ev.clientY - r.top) * scaleY);
      patchTrack(prop, (tr) => setKeyValue(retimeKey(tr, k.id, t), k.id, v));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Drag a bezier handle. `end` 0 = outgoing handle of k0 ([x1,y1]); 1 = incoming handle at k1 ([x2,y2]).
  const dragHandle = (prop: KfProp, k0: Keyframe, k1: Keyframe, end: 0 | 1) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    const { y, invY } = yFor(prop);
    const move = (ev: PointerEvent) => {
      const r = svgRef.current!.getBoundingClientRect();
      const scaleX = W / r.width, scaleY = H / r.height;
      const px = (ev.clientX - r.left) * scaleX;
      const py = (ev.clientY - r.top) * scaleY;
      const segT = Math.max(0.001, k1.t - k0.t);
      const segV = k1.value - k0.value;
      let nx = (invX(px) - k0.t) / segT;
      nx = Math.max(0, Math.min(1, nx));
      const ny = segV === 0 ? (py < y(k0.value) ? 1 : 0) : (invY(py) - k0.value) / segV;
      const cur = Array.isArray(k0.ease) ? [...k0.ease] as [number, number, number, number] : [0.33, 0, 0.67, 1];
      const next: [number, number, number, number] = end === 0 ? [nx, ny, cur[2], cur[3]] : [cur[0], cur[1], nx, ny];
      patchTrack(prop, (tr) => setKeyEase(tr, k0.id, next));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const addKeyOnLine = (prop: KfProp) => (e: ReactMouseEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const scaleX = W / r.width;
    const t = Math.max(0, Math.min(tMax, invX((e.clientX - r.left) * scaleX)));
    const tr = tracks.find((x) => x.prop === prop)!;
    const { invY } = yFor(prop);
    const scaleY = H / r.height;
    const v = invY((e.clientY - r.top) * scaleY);
    onChange(upsertTrack(tracks, upsertKey(tr, t, v)));
  };

  const selKey = sel && tracks.find((t) => t.prop === sel.prop)?.keys.find((k) => k.id === sel.id);

  return (
    <div className="fixed inset-0 z-[1003] bg-black/70 backdrop-blur-md flex items-center justify-center px-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[820px] rounded-2xl overflow-hidden bg-studio-surface border border-studio-border shadow-pop animate-rise-in">
        <div className="flex items-center justify-between px-5 py-3 border-b border-studio-border">
          <div className="text-[14px] font-bold text-ink-primary font-display">Graph editor</div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-studio-hover flex items-center justify-center text-ink-secondary hover:text-ink-primary">
            <X size={14} />
          </button>
        </div>

        {/* track toggles */}
        <div className="flex flex-wrap gap-1.5 px-5 py-2.5 border-b border-studio-border">
          {tracks.map((tr) => (
            <button key={tr.prop}
              onClick={() => setHidden((h) => { const n = new Set(h); n.has(tr.prop) ? n.delete(tr.prop) : n.add(tr.prop); return n; })}
              className={`flex items-center gap-1.5 text-[10.5px] font-bold px-2 py-1 rounded-lg border transition-opacity ${hidden.has(tr.prop) ? "opacity-40" : ""}`}
              style={{ borderColor: TRACK_COLORS[tr.prop] + "80", color: TRACK_COLORS[tr.prop] }}>
              <span className="w-2 h-2 rounded-full" style={{ background: TRACK_COLORS[tr.prop] }} />
              {propMeta(tr.prop).label} · {tr.keys.length}
            </button>
          ))}
        </div>

        <div className="p-4">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full bg-studio-void rounded-xl border border-studio-border touch-none">
            {/* grid */}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <line key={f} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + f * GH} y2={PAD_T + f * GH} stroke="currentColor" className="text-studio-border" strokeDasharray="2 4" />
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line x1={PAD_L + f * GW} x2={PAD_L + f * GW} y1={PAD_T} y2={PAD_T + GH} stroke="currentColor" className="text-studio-border" strokeDasharray="2 4" />
                <text x={PAD_L + f * GW} y={H - 10} textAnchor="middle" className="fill-ink-faint" style={{ fontSize: 9 }}>{(f * tMax).toFixed(1)}s</text>
              </g>
            ))}
            {/* playhead */}
            {time >= 0 && time <= tMax && (
              <line x1={x(time)} x2={x(time)} y1={PAD_T} y2={PAD_T + GH} stroke="#FF4F70" strokeWidth={1.5} />
            )}

            {visible.map((tr) => {
              const color = TRACK_COLORS[tr.prop];
              const { y } = yFor(tr.prop);
              const keys = [...tr.keys].sort((a, b) => a.t - b.t);
              const pts: string[] = [];
              for (let i = 0; i < keys.length - 1; i++) {
                for (const s of sampleSegment(keys[i], keys[i + 1], 30)) pts.push(`${x(s.t)},${y(s.value)}`);
              }
              return (
                <g key={tr.prop}>
                  {keys.length > 1 && (
                    <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.75}
                      className="cursor-copy" onDoubleClick={addKeyOnLine(tr.prop)} />
                  )}
                  {/* selected key handles */}
                  {keys.map((k, i) => {
                    if (!sel || sel.prop !== tr.prop || sel.id !== k.id || i >= keys.length - 1) return null;
                    const k1 = keys[i + 1];
                    const ease = Array.isArray(k.ease) ? k.ease : [0.33, 0, 0.67, 1];
                    const hx0 = x(k.t + (k1.t - k.t) * ease[0]);
                    const hy0 = y(k.value + (k1.value - k.value) * ease[1]);
                    const hx1 = x(k.t + (k1.t - k.t) * ease[2]);
                    const hy1 = y(k.value + (k1.value - k.value) * ease[3]);
                    return (
                      <g key={"h" + k.id}>
                        <line x1={x(k.t)} y1={y(k.value)} x2={hx0} y2={hy0} stroke={color} strokeOpacity={0.5} />
                        <line x1={x(k1.t)} y1={y(k1.value)} x2={hx1} y2={hy1} stroke={color} strokeOpacity={0.5} />
                        <circle cx={hx0} cy={hy0} r={4} fill="#fff" stroke={color} strokeWidth={1.5} className="cursor-grab" onPointerDown={dragHandle(tr.prop, k, k1, 0)} />
                        <circle cx={hx1} cy={hy1} r={4} fill="#fff" stroke={color} strokeWidth={1.5} className="cursor-grab" onPointerDown={dragHandle(tr.prop, k, k1, 1)} />
                      </g>
                    );
                  })}
                  {keys.map((k) => {
                    const on = sel?.prop === tr.prop && sel?.id === k.id;
                    return (
                      <rect key={k.id} x={x(k.t) - 4} y={y(k.value) - 4} width={8} height={8}
                        transform={`rotate(45 ${x(k.t)} ${y(k.value)})`}
                        fill={on ? "#fff" : color} stroke={color} strokeWidth={1.5}
                        className="cursor-grab" onPointerDown={dragKey(tr.prop, k)}
                        onDoubleClick={() => onSeek?.(k.t)} />
                    );
                  })}
                  <text x={PAD_L - 6} y={y(keys[0].value) + 3} textAnchor="end" fill={color} style={{ fontSize: 9, fontWeight: 700 }}>
                    {propMeta(tr.prop).label.split(" ").pop()}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* selected key controls */}
          {selKey && sel && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold" style={{ color: TRACK_COLORS[sel.prop] }}>
                {propMeta(sel.prop).label} @ {selKey.t.toFixed(2)}s
              </span>
              <span className="text-[10px] text-ink-faint">ease: {easePresetOf(selKey.ease)}</span>
              <div className="flex gap-1 ml-1">
                {EASE_PRESET_LABELS.map(({ key, label }) => (
                  <button key={key} onClick={() => patchTrack(sel.prop, (tr) => setKeyEase(tr, sel.id, EASING_PRESETS[key as EasePreset]))}
                    className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                      easePresetOf(selKey.ease) === key ? "border-signal bg-signal/15 text-signal" : "border-studio-border text-ink-secondary"
                    }`}>{label}</button>
                ))}
              </div>
              <button
                onClick={() => { patchTrack(sel.prop, (tr) => removeKey(tr, sel.id)); setSel(null); }}
                className="ml-auto flex items-center gap-1 text-[10px] font-bold text-danger border border-danger/30 rounded px-2 py-1 hover:bg-danger/10">
                <Trash2 size={11} /> Delete key
              </button>
            </div>
          )}
          <p className="text-[10px] text-ink-faint mt-2">
            Drag a diamond to retime / revalue · drag a handle to shape the curve · double-click a diamond to jump the playhead · double-click a line to add a key.
            {mode === "template" && " (X/Y values are fractions of the canvas.)"}
          </p>
        </div>
      </div>
    </div>
  );
}
