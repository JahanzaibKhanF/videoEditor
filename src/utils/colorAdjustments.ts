/**
 * colorAdjustments — turns brightness/contrast/saturation/temperature into
 * a canvas `ctx.filter` string. Used identically for clips and images, in
 * both the live preview and the WebCodecs export path (both go through
 * compositeFrame.ts). The FFmpeg fallback path (clientRender.ts) applies
 * the equivalent via its own `eq`/`colortemperature` filters — see
 * `ffmpegColorFilterString` below — so exported video looks the same
 * regardless of which engine actually rendered it.
 *
 * Canvas's `filter` property has no native "temperature" control, so it's
 * approximated the same way most simple editors do it: a subtle hue-rotate
 * in the warm (negative rotation) or cool (positive rotation) direction.
 * It's an approximation, not true white-balance correction — good enough
 * for a stylistic warm/cool push, not color-accurate grading.
 */
import { ColorAdjustments, DEFAULT_COLOR_ADJUSTMENTS } from "../types/types";

export function isIdentityAdjustment(adj?: ColorAdjustments): boolean {
  if (!adj) return true;
  return adj.brightness === 1 && adj.contrast === 1 && adj.saturation === 1 && adj.temperature === 0;
}

export function buildCanvasFilterString(adj?: ColorAdjustments): string {
  const a = adj ?? DEFAULT_COLOR_ADJUSTMENTS;
  if (isIdentityAdjustment(a)) return "none";

  const parts: string[] = [];
  if (a.brightness !== 1) parts.push(`brightness(${a.brightness})`);
  if (a.contrast !== 1) parts.push(`contrast(${a.contrast})`);
  if (a.saturation !== 1) parts.push(`saturate(${a.saturation})`);
  if (a.temperature !== 0) {
    // Warm (positive) → slight rotate one way; cool (negative) → the other.
    // Scaled down (temperature/100 * 18deg) since hue-rotate shifts ALL
    // hues, not just shifts white balance — a little goes a long way
    // before it starts looking like a color-tint effect instead of warmth.
    parts.push(`hue-rotate(${(-a.temperature / 100) * 18}deg)`);
    // A touch of sepia in the warm direction sells "warm" much better than
    // hue-rotate alone (hue-rotate on its own tends to just look magenta/green).
    if (a.temperature > 0) parts.push(`sepia(${Math.min(0.35, a.temperature / 250)})`);
  }
  return parts.length > 0 ? parts.join(" ") : "none";
}

// ── FFmpeg filter-graph equivalent (see clientRender.ts) ──────────────────
// FFmpeg's `eq` filter takes brightness in [-1,1] (canvas/CSS uses a 0..2
// multiplier where 1 = unchanged) and contrast/saturation as direct
// multipliers matching canvas's semantics closely enough. Temperature uses
// FFmpeg's `colortemperature` filter (degrees Kelvin) — mapped from the
// same -100..100 UI range to a reasonable Kelvin swing around neutral daylight.
export function ffmpegColorFilterString(adj?: ColorAdjustments): string | null {
  const a = adj ?? DEFAULT_COLOR_ADJUSTMENTS;
  if (isIdentityAdjustment(a)) return null;

  const filters: string[] = [];
  const eqParts: string[] = [];
  if (a.brightness !== 1) eqParts.push(`brightness=${(a.brightness - 1).toFixed(3)}`);
  if (a.contrast !== 1) eqParts.push(`contrast=${a.contrast.toFixed(3)}`);
  if (a.saturation !== 1) eqParts.push(`saturation=${a.saturation.toFixed(3)}`);
  if (eqParts.length > 0) filters.push(`eq=${eqParts.join(":")}`);
  if (a.temperature !== 0) {
    // BUG FIX: this was `6500 + (temperature/100)*3500`, which sends warm
    // (positive) values toward HIGHER Kelvin and cool (negative) values
    // toward LOWER Kelvin. FFmpeg's `colortemperature` filter simulates
    // being lit by a source AT that Kelvin value — physically, a LOWER
    // color temperature (e.g. ~3000K tungsten) looks warmer/orange, and a
    // HIGHER one (e.g. ~10000K overcast sky) looks cooler/blue. The old
    // formula was exactly backwards from that (and from the canvas-side
    // `buildCanvasFilterString` above, which correctly pushes warm →
    // orange/sepia), so every FFmpeg-fallback export inverted the
    // temperature slider versus what was shown live in the preview.
    const kelvin = Math.round(6500 - (a.temperature / 100) * 3500); // ~3000K (warm)..10000K (cool)
    filters.push(`colortemperature=temperature=${kelvin}`);
  }
  return filters.length > 0 ? filters.join(",") : null;
}