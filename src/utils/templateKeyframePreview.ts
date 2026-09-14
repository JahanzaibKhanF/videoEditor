/**
 * templateKeyframePreview — shared fractional-keyframe evaluator for
 * DOM-based (non-canvas) admin preview stages: TemplatePreviewStage.tsx
 * (template builder) and MotionPresetPreviewStage.tsx (motion preset
 * editor). Hoisted out of TemplatePreviewStage.tsx so both consume the
 * exact same interpolation instead of two copies drifting apart.
 *
 * Works on `TemplateJsonKeyframeTrack[]` (tFrac 0..1 through whatever
 * duration the caller is previewing, fractional x/y) — the same shape
 * `templateInterpreter.ts` converts into real `KeyframeTrack`s at apply
 * time. This is a lighter-weight parallel evaluator for previews that have
 * no canvas/real timeline to run `evalKeyframes` against.
 */
import { TemplateJsonKeyframeTrack } from "./templateInterpreter";
import { cubicBezier, EASING_PRESETS, KfOverride } from "./keyframes";

export function evalTemplateKf(tracks: TemplateJsonKeyframeTrack[] | undefined, tFrac: number): KfOverride {
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
