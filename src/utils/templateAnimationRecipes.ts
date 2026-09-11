/**
 * templateAnimationRecipes — turns a template text layer's preset
 * `animation` (fadeIn, slideUp, bounceIn, ...) into real, editable keyframe
 * tracks (TemplateJsonKeyframeTrack[]) instead of leaving it as an opaque
 * label.
 *
 * This is template-builder-only (see KeyframeEditor.tsx / KeyframeLane.tsx —
 * the main editor deliberately keeps `animation` and manual keyframes as two
 * independent systems that both apply at once, with no UI bridging them).
 * In the builder, picking an animation is meant to give the admin a working
 * starting point they can then hand-tune in "Motion keyframes" — so instead
 * of a marker, we generate an actual approximation of that animation's
 * motion as keyframes right away. Picking a DIFFERENT animation regenerates
 * and replaces them; the caller (TemplateBuilder.tsx) is responsible for
 * that replace-on-change behavior, this module just does the generation.
 *
 * Values follow the same relative semantics as every other keyframe track
 * (see keyframes.ts): x/y are canvas-fraction OFFSETS added to the layer's
 * resting xFrac/yFrac, scale is a multiplier, rotation is degrees added,
 * opacity is a multiplier, blur is px added. `tFrac` is a fraction of the
 * TEMPLATE's total duration (matches TemplateJsonKeyframeTrack).
 */
import { KfProp } from "../types/types";
import { TemplateJsonKeyframeTrack } from "./templateInterpreter";

interface RecipeOpts {
  /** seconds — this text layer's own start on the template timeline */
  startTime: number;
  /** seconds — this text layer's own end on the template timeline */
  endTime: number;
  /** seconds — the whole template's duration, for converting to tFrac */
  totalDur: number;
}

type RecipeKey = { at: number; value: number; ease?: [number, number, number, number] | "hold" };
type RecipeTrack = { prop: KfProp; keys: RecipeKey[] };

const EASE_OUT: [number, number, number, number] = [0, 0, 0.58, 1];
const EASE_IN_OUT: [number, number, number, number] = [0.42, 0, 0.58, 1];

// `dur` = the layer's own active duration (seconds) — recipes scale their
// intro/cycle timing to it so a 1s caption and a 6s title both look right.
function recipe(animation: string, dur: number): RecipeTrack[] {
  const intro = Math.max(0.15, Math.min(0.5, dur * 0.4));
  switch (animation) {
    case "fadeIn":
      return [{ prop: "opacity", keys: [{ at: 0, value: 0 }, { at: intro, value: 1, ease: EASE_OUT }] }];
    case "slideUp":
      return [
        { prop: "y", keys: [{ at: 0, value: 0.12 }, { at: intro, value: 0, ease: EASE_OUT }] },
        { prop: "opacity", keys: [{ at: 0, value: 0 }, { at: intro, value: 1, ease: EASE_OUT }] },
      ];
    case "slideIn":
      return [
        { prop: "x", keys: [{ at: 0, value: -0.35 }, { at: intro, value: 0, ease: EASE_OUT }] },
        { prop: "opacity", keys: [{ at: 0, value: 0 }, { at: intro, value: 1, ease: EASE_OUT }] },
      ];
    case "slideInRight":
      return [
        { prop: "x", keys: [{ at: 0, value: 0.35 }, { at: intro, value: 0, ease: EASE_OUT }] },
        { prop: "opacity", keys: [{ at: 0, value: 0 }, { at: intro, value: 1, ease: EASE_OUT }] },
      ];
    case "slideDown":
      return [
        { prop: "y", keys: [{ at: 0, value: -0.12 }, { at: intro, value: 0, ease: EASE_OUT }] },
        { prop: "opacity", keys: [{ at: 0, value: 0 }, { at: intro, value: 1, ease: EASE_OUT }] },
      ];
    case "zoomIn":
      return [
        { prop: "scale", keys: [{ at: 0, value: 0.05 }, { at: intro, value: 1, ease: EASE_OUT }] },
        { prop: "opacity", keys: [{ at: 0, value: 0 }, { at: intro * 0.6, value: 1, ease: EASE_OUT }] },
      ];
    case "popInUp":
      return [
        { prop: "y", keys: [{ at: 0, value: 0.05 }, { at: intro, value: 0, ease: EASE_OUT }] },
        { prop: "scale", keys: [{ at: 0, value: 0.85 }, { at: intro, value: 1, ease: EASE_OUT }] },
        { prop: "opacity", keys: [{ at: 0, value: 0 }, { at: intro * 0.6, value: 1 }] },
      ];
    case "popInDown":
      return [
        { prop: "y", keys: [{ at: 0, value: -0.05 }, { at: intro, value: 0, ease: EASE_OUT }] },
        { prop: "scale", keys: [{ at: 0, value: 0.85 }, { at: intro, value: 1, ease: EASE_OUT }] },
        { prop: "opacity", keys: [{ at: 0, value: 0 }, { at: intro * 0.6, value: 1 }] },
      ];
    case "bounceIn":
      return [
        { prop: "scale", keys: [
          { at: 0, value: 0.3 },
          { at: intro * 0.7, value: 1.08, ease: EASE_OUT },
          { at: intro, value: 1, ease: EASE_IN_OUT },
        ] },
        { prop: "opacity", keys: [{ at: 0, value: 0 }, { at: intro * 0.5, value: 1 }] },
      ];
    case "grow":
      return [
        { prop: "scale", keys: [{ at: 0, value: 0.5 }, { at: intro, value: 1, ease: EASE_OUT }] },
        { prop: "opacity", keys: [{ at: 0, value: 0 }, { at: intro * 0.6, value: 1 }] },
      ];
    case "blurIn":
      return [
        { prop: "blur", keys: [{ at: 0, value: 10 }, { at: intro, value: 0, ease: EASE_OUT }] },
        { prop: "opacity", keys: [{ at: 0, value: 0 }, { at: intro * 0.8, value: 1 }] },
      ];
    case "glowIn":
      return [
        { prop: "blur", keys: [{ at: 0, value: 8 }, { at: intro, value: 0, ease: EASE_OUT }] },
        { prop: "opacity", keys: [{ at: 0, value: 0 }, { at: intro, value: 1 }] },
      ];
    case "typewriter":
      return [{ prop: "opacity", keys: [{ at: 0, value: 0 }, { at: Math.min(dur, intro * 2.5), value: 1 }] }];
    case "pulse": {
      const cyc = 0.5;
      const n = Math.max(1, Math.min(5, Math.floor(dur / cyc)));
      const keys: RecipeKey[] = [];
      for (let i = 0; i <= n * 2; i++) keys.push({ at: (i * cyc) / 2, value: i % 2 === 0 ? 1 : 1.05 });
      return [{ prop: "scale", keys }];
    }
    case "wiggle": {
      const cyc = 0.9;
      const n = Math.max(1, Math.min(5, Math.floor(dur / cyc)));
      const keys: RecipeKey[] = [];
      for (let i = 0; i <= n * 2; i++) keys.push({ at: (i * cyc) / 2, value: i % 2 === 0 ? -6 : 6 });
      return [{ prop: "rotation", keys }];
    }
    case "shake": {
      const cyc = 0.25;
      const n = Math.max(2, Math.min(10, Math.floor(dur / cyc)));
      const keys: RecipeKey[] = [];
      for (let i = 0; i <= n; i++) keys.push({ at: i * cyc, value: i % 2 === 0 ? -0.01 : 0.01 });
      return [{ prop: "x", keys }];
    }
    case "sparkle": {
      const cyc = 0.4;
      const n = Math.max(2, Math.min(8, Math.floor(dur / cyc)));
      const keys: RecipeKey[] = [];
      for (let i = 0; i <= n * 2; i++) keys.push({ at: (i * cyc) / 2, value: i % 2 === 0 ? 1 : 1.04 });
      return [{ prop: "scale", keys }];
    }
    default:
      return [];
  }
}

/** `undefined` for "none"/unknown animations — caller should clear the layer's `keyframes` field in that case. */
export function generateTemplateAnimationKeyframes(
  animation: string | undefined,
  opts: RecipeOpts,
): TemplateJsonKeyframeTrack[] | undefined {
  if (!animation || animation === "none") return undefined;
  const dur = Math.max(0.1, opts.endTime - opts.startTime);
  const tracks = recipe(animation, dur);
  if (!tracks.length) return undefined;
  return tracks.map((tr) => ({
    prop: tr.prop,
    keys: tr.keys.map((k) => ({
      tFrac: opts.totalDur > 0 ? Math.max(0, Math.min(1, (opts.startTime + k.at) / opts.totalDur)) : 0,
      value: k.value,
      ease: k.ease,
    })),
  }));
}
