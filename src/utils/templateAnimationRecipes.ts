/**
 * templateAnimationRecipes — turns ANY engine animation key (the full set in
 * AnimationEngine.ts's `computeAnimState`, not just a curated few) into
 * real, editable keyframe tracks (TemplateJsonKeyframeTrack[]).
 *
 * How: sample `computeAnimState` itself at a fixed rate across the
 * animation's duration and record each property's value at each sample —
 * i.e. literally bake the existing hardcoded math into keyframe data,
 * rather than hand-reinventing an approximation of each of the ~50
 * animations. This is what makes ANY engine key convertible automatically:
 * whatever `computeAnimState` computes, these are just its recorded output.
 * Samples are close enough together (15/sec) that linear interpolation
 * between them reproduces the original curve (springs, oscillation, all of
 * it) closely — the "real recipe" the user asked for, not an approximation.
 *
 * Used by the Template Builder (fractional x/y, tFrac through the
 * template's total duration) and the Motion Presets editor in
 * /settings (same shape, previewed over a fixed short duration — see
 * MotionPresetPreviewStage.tsx). NOT used by the main editor's Animation
 * picker, which still applies a preset by engine-key reference — see the
 * boundary note in motionPresets.ts.
 */
import { KfProp } from "../types/types";
import { computeAnimState } from "./AnimationEngine";
import { TemplateJsonKeyframeTrack } from "./templateInterpreter";

interface RecipeOpts {
  /** seconds — this layer's own start on the timeline being previewed */
  startTime: number;
  /** seconds — this layer's own end on the timeline being previewed */
  endTime: number;
  /** seconds — the whole timeline's duration, for converting to tFrac */
  totalDur: number;
}

type RecipeKey = { at: number; value: number };
type RecipeTrack = { prop: KfProp; keys: RecipeKey[] };

const SAMPLE_HZ = 15;
// Reference canvas used only to make computeAnimState's off-screen-distance
// math (slides come from off-canvas) produce a sensible ratio — x/y are
// stored as FRACTIONS of these, same as every other template x/y value, so
// the actual canvas size at apply-time doesn't need to match.
const REF_W = 1280, REF_H = 720, REF_FONT = 100, REF_FPS = 30;
const EPS = 1e-4;

const ALL_PROPS: KfProp[] = ["x", "y", "scale", "scaleX", "scaleY", "rotation", "opacity", "blur"];

// `dur` = the layer's own active duration (seconds) — the bake spans exactly
// that, so a 1s caption and a 6s title both sample proportionally.
function bake(animation: string, dur: number): RecipeTrack[] {
  const steps = Math.max(4, Math.round(dur * SAMPLE_HZ));
  const series: Record<KfProp, RecipeKey[]> = { x: [], y: [], scale: [], scaleX: [], scaleY: [], rotation: [], opacity: [], blur: [] };
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * dur;
    const s = computeAnimState(animation, t, 0, dur, REF_FPS, 0, 0, REF_W, REF_H, REF_FONT);
    series.x.push({ at: t, value: s.tx / REF_W });
    series.y.push({ at: t, value: s.ty / REF_H });
    series.scale.push({ at: t, value: s.scale });
    series.scaleX.push({ at: t, value: s.scaleX });
    series.scaleY.push({ at: t, value: s.scaleY });
    series.rotation.push({ at: t, value: s.rotation });
    series.opacity.push({ at: t, value: s.opacity });
    series.blur.push({ at: t, value: s.blur });
  }
  // Drop tracks that never actually change — most animations only touch 1-3
  // properties, no reason to ship flat tracks for the rest.
  const tracks: RecipeTrack[] = [];
  for (const prop of ALL_PROPS) {
    const pts = series[prop];
    const first = pts[0].value;
    if (!pts.some((p) => Math.abs(p.value - first) > EPS)) continue;
    tracks.push({ prop, keys: pts });
  }
  return tracks;
}

/** `undefined` for "none"/unknown animations — caller should clear the layer's `keyframes` field in that case. */
export function generateTemplateAnimationKeyframes(
  animation: string | undefined,
  opts: RecipeOpts,
): TemplateJsonKeyframeTrack[] | undefined {
  if (!animation || animation === "none") return undefined;
  const dur = Math.max(0.1, opts.endTime - opts.startTime);
  const tracks = bake(animation, dur);
  if (!tracks.length) return undefined;
  return tracks.map((tr) => ({
    prop: tr.prop,
    keys: tr.keys.map((k) => ({
      tFrac: opts.totalDur > 0 ? Math.max(0, Math.min(1, (opts.startTime + k.at) / opts.totalDur)) : 0,
      value: k.value,
    })),
  }));
}
