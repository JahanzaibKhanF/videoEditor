"use client";

/**
 * KeyframeEditor — the "Motion / Keyframes" inspector block. Works for any
 * layer (text / image / clip / blur) in the editor, and — via `mode="template"`
 * — for a template text layer in the builder (X/Y shown as % of canvas).
 *
 * One row per animatable property: a stopwatch toggle, the live interpolated
 * value, and (when the track is on) a value field + "add key at playhead"
 * button. Expanding a row lists its keys (time, value, ease label, delete) —
 * curve shaping itself happens in the "Open graph editor" modal, not inline
 * here (an inline mini-curve per key made this list too tall for what it's
 * for: seeing and retiming keys, not shaping bezier handles).
 */
import { useState } from "react";
import { KeyframeTrack, KfProp } from "../../types/types";
import {
  KF_PROPS, propMeta, evalTrack, makeTrack, upsertKey, removeKey, setKeyValue,
  upsertTrack, removeTrack, easePresetOf,
} from "../../utils/keyframes";
import { Clock, Diamond, Trash2, ChevronRight, Spline, Sparkles, X } from "@/utils/icons";
import NumberInput from "../ui/NumberInput";
import GraphEditorModal from "../timeline/GraphEditorModal";

interface Props {
  tracks: KeyframeTrack[] | undefined;
  onChange: (tracks: KeyframeTrack[] | undefined) => void;
  time: number;            // playhead, in the same units as keyframe.t (seconds)
  duration: number;
  /** where this layer starts on the timeline — the first keyframe anchors here */
  layerStart?: number;
  onSeek?: (t: number) => void;
  mode?: "editor" | "template";
  /** The layer's preset entrance/exit animation ("none"/undefined = off) —
   * shown as its own row here so it reads as "this layer has motion" right
   * alongside the real keyframe tracks, and can be cleared from one place.
   * Retiming it (when it happens where a timeline exists) is a drag on the
   * KeyframeLane diamond, not here — this list has no time axis of its own. */
  animation?: string;
  animationLabel?: string;
  onAnimationClear?: () => void;
}

// value <-> field display. In template mode X/Y are fractions of the canvas,
// shown to the author as a percentage.
function toField(prop: KfProp, v: number, mode: "editor" | "template") {
  if (mode === "template" && (prop === "x" || prop === "y")) return Math.round(v * 1000) / 10;
  return Math.round(v * 1000) / 1000;
}
function fromField(prop: KfProp, v: number, mode: "editor" | "template") {
  if (mode === "template" && (prop === "x" || prop === "y")) return v / 100;
  return v;
}

export default function KeyframeEditor({
  tracks, onChange, time, duration, layerStart = 0, onSeek, mode = "editor",
  animation, animationLabel, onAnimationClear,
}: Props) {
  const [expanded, setExpanded] = useState<KfProp | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);

  const anchorT = Math.max(0, layerStart);
  const trackFor = (p: KfProp) => tracks?.find((t) => t.prop === p);
  const active = new Set((tracks ?? []).map((t) => t.prop));

  const toggle = (p: KfProp) => {
    const existing = trackFor(p);
    if (existing) {
      if (existing.keys.length > 1 && !confirm(`Remove all ${existing.keys.length} ${propMeta(p).label} keyframes?`)) return;
      onChange(removeTrack(tracks, p));
      if (expanded === p) setExpanded(null);
    } else {
      // Seed the FIRST key at the layer's start with the resting value, so a
      // later change further down the timeline animates FROM the start rather
      // than making the value constant everywhere.
      let tr = makeTrack(p, anchorT, propMeta(p).neutral);
      if (time > anchorT + 0.05) tr = upsertKey(tr, time, propMeta(p).neutral);
      onChange(upsertTrack(tracks, tr));
      setExpanded(p);
    }
  };

  const addKeyAt = (p: KfProp, value: number) => {
    let tr = trackFor(p);
    if (!tr) {
      tr = makeTrack(p, anchorT, propMeta(p).neutral);
      if (time > anchorT + 0.05) tr = upsertKey(tr, time, value);
    } else {
      tr = upsertKey(tr, time, value);
    }
    onChange(upsertTrack(tracks, tr));
  };

  const unitLabel = (p: KfProp) =>
    mode === "template" && (p === "x" || p === "y") ? "%" : propMeta(p).unit;

  const hasAnimation = !!animation && animation !== "none";

  return (
    <div className="flex flex-col gap-1.5">
      {hasAnimation && (
        <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg border border-warning/30 bg-warning/10">
          <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-warning/20 text-warning">
            <Sparkles size={12} />
          </span>
          <span className="flex-1 min-w-0 text-[11px] font-semibold text-ink-primary truncate">
            Animation: {animationLabel ?? animation}
          </span>
          {onAnimationClear && (
            <button onClick={onAnimationClear} title="Remove this animation"
              className="w-6 h-6 rounded-md flex items-center justify-center text-danger/70 hover:bg-danger/12 hover:text-danger flex-shrink-0">
              <X size={12} />
            </button>
          )}
        </div>
      )}
      {KF_PROPS.map((meta) => {
        const tr = trackFor(meta.prop);
        const on = active.has(meta.prop);
        const live = tr ? (evalTrack(tr, time) ?? meta.neutral) : meta.neutral;
        const isExp = expanded === meta.prop;
        return (
          <div key={meta.prop} className={`rounded-lg border ${on ? "border-studio-border bg-studio-void/40" : "border-transparent"}`}>
            <div className="flex items-center gap-1.5 px-1.5 py-1">
              <button onClick={() => toggle(meta.prop)} title={on ? "Remove keyframes" : "Keyframe this property"}
                className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                  on ? "bg-signal/20 text-signal" : "text-ink-faint hover:text-ink-secondary border border-studio-border"
                }`}>
                <Clock size={12} />
              </button>
              <button disabled={!on} onClick={() => setExpanded(isExp ? null : meta.prop)}
                className="flex items-center gap-1 text-[11px] font-semibold text-ink-primary flex-1 min-w-0 disabled:text-ink-faint">
                {on && <ChevronRight size={11} className={`transition-transform ${isExp ? "rotate-90" : ""}`} />}
                <span className="truncate">{meta.label}</span>
              </button>
              {on ? (
                <>
                  <NumberInput
                    value={toField(meta.prop, live, mode)}
                    step={meta.prop === "x" || meta.prop === "y" ? (mode === "template" ? 0.5 : 1) : meta.step}
                    min={meta.min} max={meta.max} suffix={unitLabel(meta.prop)} width={64}
                    onChange={(v) => addKeyAt(meta.prop, fromField(meta.prop, v, mode))}
                  />
                  <button onClick={() => addKeyAt(meta.prop, live)} title="Add / update key at playhead"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-signal hover:bg-signal/12 flex-shrink-0">
                    <Diamond size={12} />
                  </button>
                </>
              ) : (
                <span className="text-[10px] text-ink-faint font-mono">{toField(meta.prop, meta.neutral, mode)}{unitLabel(meta.prop)}</span>
              )}
            </div>

            {on && isExp && tr && (
              <div className="px-2 pb-2 pt-1 flex flex-col gap-1.5 border-t border-studio-border">
                {[...tr.keys].sort((a, b) => a.t - b.t).map((k) => (
                  <div key={k.id} className="flex items-center gap-2">
                    <button onClick={() => onSeek?.(k.t)} title="Go to keyframe"
                      className="text-[9.5px] font-mono text-ink-faint hover:text-signal flex-shrink-0 w-10 text-right">
                      {k.t.toFixed(2)}s
                    </button>
                    <NumberInput value={toField(meta.prop, k.value, mode)}
                      step={meta.step} min={meta.min} max={meta.max} suffix={unitLabel(meta.prop)} width={64}
                      onChange={(v) => onChange(upsertTrack(tracks, setKeyValue(tr, k.id, fromField(meta.prop, v, mode))))} />
                    <span className="text-[9px] text-ink-faint flex-1">{easePresetOf(k.ease)}</span>
                    <button onClick={() => onChange(upsertTrack(tracks, removeKey(tr, k.id)))}
                      disabled={tr.keys.length <= 1}
                      className="text-danger/60 hover:text-danger disabled:opacity-30 flex-shrink-0">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
                <p className="text-[9px] text-ink-faint">Full curve editing — presets, bezier handles — lives in "Open graph editor" below.</p>
              </div>
            )}
          </div>
        );
      })}

      {(tracks?.length ?? 0) > 0 && (
        <button onClick={() => setGraphOpen(true)}
          className="mt-0.5 flex items-center justify-center gap-1.5 text-[10.5px] font-bold text-signal border border-signal/35 rounded-lg py-1.5 hover:bg-signal/10 transition-colors">
          <Spline size={12} /> Open graph editor
        </button>
      )}

      {graphOpen && (
        <GraphEditorModal
          tracks={tracks ?? []}
          onChange={onChange}
          duration={duration}
          time={time}
          onSeek={onSeek}
          mode={mode}
          onClose={() => setGraphOpen(false)}
        />
      )}
    </div>
  );
}
