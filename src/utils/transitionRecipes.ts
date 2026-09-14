/**
 * transitionRecipes — approximates a transition's motion as real keyframe
 * data (x/y/scale/opacity/blur on the INCOMING clip), same shape as
 * templateAnimationRecipes.ts, for display/editing in the Motion Presets
 * admin UI (see motionPresets.ts's `keyframes` field on transition
 * presets).
 *
 * Unlike animations (a genuine single-object property track, baked exactly
 * from computeAnimState), a transition is fundamentally a two-clip
 * compositing operation — a wipe clips a rectangle, a dip fades through a
 * flat color overlay across BOTH clips. Neither of those is expressible as
 * one object's x/y/scale/opacity/blur. So this is a best-effort
 * approximation for the JSON/keyframe view specifically:
 *  - crossDissolve/filmDissolve/morphCut/dipToBlack/dipToWhite → opacity ramp
 *  - slideIn/slideRight/slideUp/push → x or y ramp
 *  - zoom/scaleIn → scale ramp (+opacity for zoom)
 *  - blurIn → blur + opacity ramp
 *  - flipIn → scaleX ramp
 *  - wipeLeftToRight/wipeTopToBottom → x or y ramp standing in for the wipe
 *    edge (there's no clip-mask keyframe prop) — the closest single-prop
 *    approximation, not a faithful reproduction
 *
 * IMPORTANT: MotionPresetPreviewStage's live A/B preview does NOT render
 * from this data — it calls the real `computeTransition` + a CSS mapping
 * (clip-path for wipes, a color overlay for dips) so what you SEE stays
 * exact for every type. This keyframe data is the editable/inspectable
 * side, not the preview's source of truth — same "engine key still drives
 * the actual transition, keyframes are the visibility/editing layer"
 * boundary documented in motionPresets.ts.
 */
import { KfProp } from "../types/types";
import { computeTransition } from "./AnimationEngine";
import { TemplateJsonKeyframeTrack } from "./templateInterpreter";

interface RecipeOpts {
  /** seconds — where the transition sits on the timeline being previewed */
  startTime: number;
  endTime: number;
  totalDur: number;
}

const SAMPLE_HZ = 20;
// computeTransition's own duration is fixed at 0.6s inside AnimationEngine.ts.
const TRANS_DURATION = 0.6;

function progressToProps(type: string, progress: number): Partial<Record<KfProp, number>> {
  switch (type) {
    case "wipeLeftToRight":
    case "slideIn":
    case "push":
      return { x: -(1 - progress) };
    case "slideRight":
      return { x: (1 - progress) };
    case "slideUp":
    case "wipeTopToBottom":
      return { y: (1 - progress) };
    case "zoom":
      // scale is a MULTIPLIER (neutral = 1), not an offset — 1.3 at full progress, not 0.3.
      return { scale: 1 + progress * 0.3, opacity: 0.5 + progress * 0.5 };
    case "scaleIn":
      return { scale: Math.max(0.001, progress) };
    case "blurIn":
      return { blur: (1 - progress) * 10, opacity: progress };
    case "flipIn":
      // scaleX is also a multiplier — 0..1, not -1..0.
      return { scaleX: Math.abs(Math.cos(progress * Math.PI)), opacity: progress > 0.5 ? 1 : 0 };
    case "dipToBlack":
    case "dipToWhite":
      return { opacity: progress >= 0.5 ? 1 : 0 };
    case "crossDissolve":
    case "filmDissolve":
    case "morphCut":
    default:
      return { opacity: progress };
  }
}

/** `undefined` for "none" — caller should clear the preset's `keyframes` field in that case. */
export function generateTransitionKeyframes(
  engineKey: string | undefined,
  opts: RecipeOpts,
): TemplateJsonKeyframeTrack[] | undefined {
  if (!engineKey || engineKey === "none") return undefined;
  const dur = Math.max(0.1, opts.endTime - opts.startTime);
  // Sample across the window where computeTransition is actually active
  // (its own [end-0.6, end] window), placed at the END of our own duration
  // so "before" the window reads as steady-state A (progress effectively 0).
  const windowEnd = dur;
  const steps = Math.max(4, Math.round(Math.min(dur, TRANS_DURATION) * SAMPLE_HZ));
  const series: Partial<Record<KfProp, { at: number; value: number }[]>> = {};
  for (let i = 0; i <= steps; i++) {
    const t = windowEnd - TRANS_DURATION + (i / steps) * TRANS_DURATION;
    const trans = computeTransition(engineKey, Math.max(0, t), windowEnd, 30);
    const progress = trans ? trans.progress : (t < windowEnd - TRANS_DURATION ? 0 : 1);
    const props = progressToProps(engineKey, progress);
    for (const [prop, value] of Object.entries(props) as [KfProp, number][]) {
      (series[prop] ??= []).push({ at: Math.max(0, t), value });
    }
  }
  const tracks: TemplateJsonKeyframeTrack[] = Object.entries(series).map(([prop, keys]) => ({
    prop: prop as KfProp,
    keys: (keys ?? []).map((k) => ({
      tFrac: opts.totalDur > 0 ? Math.max(0, Math.min(1, (opts.startTime + k.at) / opts.totalDur)) : 0,
      value: k.value,
    })),
  }));
  return tracks.length ? tracks : undefined;
}
