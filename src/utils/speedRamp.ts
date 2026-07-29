import { ClipDetails, SpeedRampPoint } from "../types/types";

/**
 * Speed-ramp model used throughout the app:
 *
 * A clip's position/duration on the MASTER timeline (startPosition,
 * endPosition) is always fixed — exactly what you see and drag on the
 * timeline, unaffected by speed. What a ramp changes is how much of the
 * SOURCE footage gets consumed as that fixed on-timeline window plays.
 * `atFraction` in a ramp point is a fraction (0..1) of the clip's OWN
 * on-timeline duration — not the source's duration — so "start slow, snap
 * to fast at the halfway point" just means a ramp point at atFraction 0.5.
 *
 * This keeps every other part of the app (positions, overlaps, drag/trim,
 * export frame scheduling) completely unaware of speed — they only ever
 * need "where does this clip sit and how long is it," which never changes.
 * Only the actual pixel source lookup (which source frame to draw / which
 * source audio sample to play) needs to know about the ramp, via the two
 * functions below.
 */

/** Piecewise-linear speed multiplier at a given output-time fraction (0..1). */
export function speedAtFraction(speed: number | SpeedRampPoint[] | undefined, fraction: number): number {
  if (speed === undefined) return 1;
  if (typeof speed === "number") return speed > 0 ? speed : 1;
  if (speed.length === 0) return 1;

  const f = Math.max(0, Math.min(1, fraction));
  const sorted = [...speed].sort((a, b) => a.atFraction - b.atFraction);

  if (f <= sorted[0].atFraction) return sorted[0].speedMultiplier;
  const last = sorted[sorted.length - 1];
  if (f >= last.atFraction) return last.speedMultiplier;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (f >= a.atFraction && f <= b.atFraction) {
      const span = b.atFraction - a.atFraction;
      const t = span <= 0 ? 0 : (f - a.atFraction) / span;
      return a.speedMultiplier + (b.speedMultiplier - a.speedMultiplier) * t;
    }
  }
  return 1;
}

export function hasSpeedRamp(clip: Pick<ClipDetails, "speed">): boolean {
  return Array.isArray(clip.speed) ? clip.speed.length > 0 : (typeof clip.speed === "number" && clip.speed !== 1);
}

/**
 * Given how much OUTPUT (on-timeline) time has elapsed since the clip
 * started, returns the SOURCE-local time to display/play. Integrates the
 * speed curve numerically — cheap, since ramps are a handful of points and
 * this is only called once per rendered/composited frame, not per sample.
 */
export function mapOutputElapsedToSourceTime(clip: ClipDetails, outputElapsed: number): number {
  const trimStart = clip.startTime ?? 0;
  if (!hasSpeedRamp(clip)) {
    return trimStart + Math.max(0, outputElapsed);
  }

  const outputDuration = Math.max(0.0001, (clip.endPosition ?? 0) - (clip.startPosition ?? 0));
  const clampedElapsed = Math.max(0, Math.min(outputDuration, outputElapsed));

  const steps = 24;
  const stepSize = clampedElapsed / steps;
  let consumed = 0;
  let prevSpeed = speedAtFraction(clip.speed, 0);
  for (let i = 1; i <= steps; i++) {
    const frac = (i * stepSize) / outputDuration;
    const s = speedAtFraction(clip.speed, frac);
    consumed += ((prevSpeed + s) / 2) * stepSize;
    prevSpeed = s;
  }
  return trimStart + consumed;
}

/** Instantaneous speed multiplier for a clip at a given point in its own on-timeline playback (0..1 = start..end). Useful for driving <video>.playbackRate live. */
export function instantaneousSpeed(clip: ClipDetails, outputElapsed: number): number {
  const outputDuration = Math.max(0.0001, (clip.endPosition ?? 0) - (clip.startPosition ?? 0));
  const frac = Math.max(0, Math.min(1, outputElapsed / outputDuration));
  return speedAtFraction(clip.speed, frac);
}

/** Total source seconds a ramped clip will actually consume across its fixed on-timeline duration — used to warn if a ramp would run past the end of a trimmed/replaced source clip. */
export function totalSourceConsumed(clip: ClipDetails): number {
  const outputDuration = Math.max(0, (clip.endPosition ?? 0) - (clip.startPosition ?? 0));
  return mapOutputElapsedToSourceTime(clip, outputDuration) - (clip.startTime ?? 0);
}

// ── Curated ramp presets ────────────────────────────────────────────────
export const SPEED_PRESETS: Record<string, { label: string; speed: number | SpeedRampPoint[] }> = {
  normal:   { label: "Normal",        speed: 1 },
  slowmo:   { label: "Slow motion",   speed: 0.4 },
  fast:     { label: "Fast motion",   speed: 2.5 },
  slowToFast: {
    label: "Slow → Fast (ramp)",
    // Holds a dreamy slow-mo through the first 55% of the clip's on-screen
    // duration, then snaps into fast motion for a punchy finish — the
    // "start slow then suddenly go fast" reel effect.
    speed: [
      { atFraction: 0,    speedMultiplier: 0.35 },
      { atFraction: 0.55, speedMultiplier: 0.35 },
      { atFraction: 0.62, speedMultiplier: 3.2 },
      { atFraction: 1,    speedMultiplier: 3.2 },
    ] as SpeedRampPoint[],
  },
  buildUp: {
    label: "Gradual build-up",
    speed: [
      { atFraction: 0,   speedMultiplier: 0.6 },
      { atFraction: 0.7, speedMultiplier: 1.2 },
      { atFraction: 1,   speedMultiplier: 2.4 },
    ] as SpeedRampPoint[],
  },
};
