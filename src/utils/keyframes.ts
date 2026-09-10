import { v4 as uuidv4 } from "uuid";
import { Keyframe, KeyframeTrack, KfProp } from "../types/types";

/**
 * Keyframe engine — pure math, no React.
 *
 * A track is a sorted list of {t, value, ease} for one property. Between two
 * keys the value is a linear interpolation of `value` whose parameter is
 * remapped through the LEFT key's cubic-bezier `ease` (CSS convention:
 * ease control points are [x1,y1,x2,y2] in 0..1). Outside the first/last key
 * the value is held flat. `ease: "hold"` = step (jump at the next key).
 *
 * Everything a track produces is RELATIVE (see types.ts): x/y px offsets,
 * scale multipliers, rotation degrees, opacity multiplier, blur px.
 */

export interface KfOverride {
  x?: number; y?: number;
  scale?: number; scaleX?: number; scaleY?: number;
  rotation?: number; opacity?: number; blur?: number;
}

export interface KfPropMeta {
  prop: KfProp;
  label: string;
  /** the resting value — a track sitting at this value changes nothing */
  neutral: number;
  unit: string;
  step: number;
  min?: number;
  max?: number;
}

export const KF_PROPS: KfPropMeta[] = [
  { prop: "x",        label: "Position X", neutral: 0, unit: "px",  step: 1 },
  { prop: "y",        label: "Position Y", neutral: 0, unit: "px",  step: 1 },
  { prop: "scale",    label: "Scale",      neutral: 1, unit: "×",   step: 0.01, min: 0 },
  { prop: "rotation", label: "Rotation",   neutral: 0, unit: "°",   step: 1 },
  { prop: "opacity",  label: "Opacity",    neutral: 1, unit: "",    step: 0.01, min: 0, max: 1 },
  { prop: "blur",     label: "Blur",       neutral: 0, unit: "px",  step: 0.5, min: 0 },
];

export function propMeta(prop: KfProp): KfPropMeta {
  return KF_PROPS.find((p) => p.prop === prop)
    ?? { prop, label: prop, neutral: prop === "scale" || prop === "scaleX" || prop === "scaleY" || prop === "opacity" ? 1 : 0, unit: "", step: 0.01 };
}

export type EasePreset = "linear" | "smooth" | "easeIn" | "easeOut" | "easeInOut" | "hold";

export const EASING_PRESETS: Record<EasePreset, [number, number, number, number] | "hold"> = {
  linear:    [0, 0, 1, 1],
  smooth:    [0.33, 0, 0.67, 1],
  easeIn:    [0.42, 0, 1, 1],
  easeOut:   [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  hold:      "hold",
};

export const EASE_PRESET_LABELS: { key: EasePreset; label: string }[] = [
  { key: "linear", label: "Linear" },
  { key: "smooth", label: "Smooth" },
  { key: "easeIn", label: "Ease In" },
  { key: "easeOut", label: "Ease Out" },
  { key: "easeInOut", label: "In-Out" },
  { key: "hold", label: "Hold" },
];

/** Which preset (if any) does this ease value match? */
export function easePresetOf(ease: Keyframe["ease"]): EasePreset | "custom" {
  if (!ease) return "linear";
  if (ease === "hold") return "hold";
  for (const [k, v] of Object.entries(EASING_PRESETS)) {
    if (Array.isArray(v) && v.every((n, i) => Math.abs(n - ease[i]) < 0.001)) return k as EasePreset;
  }
  return "custom";
}

// ── Cubic-bezier solver (same Newton-Raphson approach browsers use) ───────
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  if (x1 === y1 && x2 === y2) return (t) => t; // linear fast-path
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const solveX = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const xEst = sampleX(t) - x;
      if (Math.abs(xEst) < 1e-5) return t;
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t -= xEst / d;
    }
    // bisection fallback
    let lo = 0, hi = 1;
    t = x;
    while (lo < hi) {
      const xEst = sampleX(t);
      if (Math.abs(xEst - x) < 1e-5) break;
      if (x > xEst) lo = t; else hi = t;
      t = (hi - lo) * 0.5 + lo;
    }
    return t;
  };
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveX(t));
  };
}

// ── Evaluation ───────────────────────────────────────────────────────────
function sortedKeys(track: KeyframeTrack): Keyframe[] {
  return [...track.keys].sort((a, b) => a.t - b.t);
}

/** Interpolated value of one track at absolute time `t` (undefined if no keys). */
export function evalTrack(track: KeyframeTrack, t: number): number | undefined {
  const keys = sortedKeys(track);
  if (keys.length === 0) return undefined;
  if (keys.length === 1 || t <= keys[0].t) return keys[0].value;
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].value;

  let k0 = keys[0], k1 = keys[1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].t && t <= keys[i + 1].t) { k0 = keys[i]; k1 = keys[i + 1]; break; }
  }
  const span = k1.t - k0.t;
  const u = span <= 0 ? 0 : (t - k0.t) / span;
  if (k0.ease === "hold") return k0.value;
  const ease = k0.ease ?? EASING_PRESETS.smooth;
  const eased = Array.isArray(ease) ? cubicBezier(ease[0], ease[1], ease[2], ease[3])(u) : u;
  return k0.value + (k1.value - k0.value) * eased;
}

/** All tracks folded into one override object. */
export function evalKeyframes(tracks: KeyframeTrack[] | undefined, t: number): KfOverride {
  const o: KfOverride = {};
  if (!tracks) return o;
  for (const track of tracks) {
    const v = evalTrack(track, t);
    if (v !== undefined) o[track.prop] = v;
  }
  return o;
}

export interface AnimStateLike {
  tx: number; ty: number; scale: number; scaleX: number; scaleY: number;
  rotation: number; opacity: number; blur: number; visible: boolean;
}

/** Fold keyframe overrides into a computeAnimState result. */
export function applyKfOverride<T extends AnimStateLike>(anim: T, o: KfOverride): T {
  if (o.x !== undefined) anim.tx += o.x;
  if (o.y !== undefined) anim.ty += o.y;
  if (o.scale !== undefined) anim.scale *= o.scale;
  if (o.scaleX !== undefined) anim.scaleX *= o.scaleX;
  if (o.scaleY !== undefined) anim.scaleY *= o.scaleY;
  if (o.rotation !== undefined) anim.rotation += o.rotation;
  if (o.opacity !== undefined) anim.opacity = Math.max(0, Math.min(1, anim.opacity * o.opacity));
  if (o.blur !== undefined) anim.blur = Math.max(0, anim.blur + o.blur);
  return anim;
}

export function hasKeyframes(tracks: KeyframeTrack[] | undefined): boolean {
  return !!tracks && tracks.some((tr) => tr.keys.length > 0);
}

// ── Mutators (return new track/array — never mutate in place) ─────────────
export function makeKeyframe(t: number, value: number, ease?: Keyframe["ease"]): Keyframe {
  return { id: uuidv4(), t: round(t), value: round(value), ease: ease ?? EASING_PRESETS.smooth };
}

export function makeTrack(prop: KfProp, t: number, value: number): KeyframeTrack {
  return { prop, keys: [makeKeyframe(t, value)] };
}

/** Add a key at `t`, or update the value of the existing key within ~1 frame of `t`. */
export function upsertKey(track: KeyframeTrack, t: number, value: number, epsilon = 0.03): KeyframeTrack {
  const near = track.keys.find((k) => Math.abs(k.t - t) <= epsilon);
  const keys = near
    ? track.keys.map((k) => (k === near ? { ...k, value: round(value) } : k))
    : [...track.keys, makeKeyframe(t, value)];
  return { ...track, keys: keys.sort((a, b) => a.t - b.t) };
}

export function removeKey(track: KeyframeTrack, id: string): KeyframeTrack {
  return { ...track, keys: track.keys.filter((k) => k.id !== id) };
}

export function retimeKey(track: KeyframeTrack, id: string, t: number): KeyframeTrack {
  return { ...track, keys: track.keys.map((k) => (k.id === id ? { ...k, t: round(Math.max(0, t)) } : k)).sort((a, b) => a.t - b.t) };
}

export function setKeyValue(track: KeyframeTrack, id: string, value: number): KeyframeTrack {
  return { ...track, keys: track.keys.map((k) => (k.id === id ? { ...k, value: round(value) } : k)) };
}

export function setKeyEase(track: KeyframeTrack, id: string, ease: Keyframe["ease"]): KeyframeTrack {
  return { ...track, keys: track.keys.map((k) => (k.id === id ? { ...k, ease } : k)) };
}

/** Upsert a whole track into an element's `keyframes` array. */
export function upsertTrack(tracks: KeyframeTrack[] | undefined, track: KeyframeTrack): KeyframeTrack[] {
  const list = tracks ? [...tracks] : [];
  const i = list.findIndex((tr) => tr.prop === track.prop);
  if (i === -1) list.push(track); else list[i] = track;
  return list.filter((tr) => tr.keys.length > 0);
}

export function removeTrack(tracks: KeyframeTrack[] | undefined, prop: KfProp): KeyframeTrack[] | undefined {
  const next = (tracks ?? []).filter((tr) => tr.prop !== prop);
  return next.length ? next : undefined;
}

// ── Graph rendering helpers ──────────────────────────────────────────────
export function sampleSegment(k0: Keyframe, k1: Keyframe, steps = 24): { t: number; value: number }[] {
  const out: { t: number; value: number }[] = [];
  const ease = k0.ease === "hold" ? "hold" : (k0.ease ?? EASING_PRESETS.smooth);
  const fn = Array.isArray(ease) ? cubicBezier(ease[0], ease[1], ease[2], ease[3]) : null;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const e = ease === "hold" ? 0 : fn ? fn(u) : u;
    out.push({ t: k0.t + (k1.t - k0.t) * u, value: k0.value + (k1.value - k0.value) * e });
  }
  return out;
}

export function trackValueBounds(track: KeyframeTrack): [number, number] {
  if (track.keys.length === 0) return [0, 1];
  let lo = Infinity, hi = -Infinity;
  for (const k of track.keys) { lo = Math.min(lo, k.value); hi = Math.max(hi, k.value); }
  if (lo === hi) { lo -= 0.5; hi += 0.5; }
  return [lo, hi];
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
