/**
 * frameEnhance — Basic-mode (classical, no AI model) per-frame video
 * enhancement building blocks: resolution scaling, a soften-based denoise,
 * and auto color correction. Used by enhanceClipVideo.ts as the fast
 * default mode; Advanced mode swaps these for a real AI model where one
 * credibly exists (see enhanceWorker.ts — Resolution and Denoise both get a
 * genuine trained model there). Advanced Color still reuses THIS module's
 * auto-color detector, just sampling more frames and applying a stronger
 * correction — there's no established, ready-to-use "AI auto color grade"
 * model to swap in instead, so Advanced Color is a better classical result,
 * not a different technology. Said plainly rather than quietly relabeling
 * an algorithm as AI.
 */
import { ColorAdjustments } from "../types/types";

export type EnhanceLevel = 0 | 1 | 2; // Off / Low / High

// The dial's first click (Off → level 1) lands on FHD, not HD — most people
// turning Quality on at all want the best result by default; HD (a lighter,
// faster option) is still one more click away at level 2.
export const RESOLUTION_TARGET_HEIGHT: Record<1 | 2, number> = {
  1: 1080, // FHD
  2: 720,  // HD
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Auto-detects brightness/contrast/saturation/temperature from one or more
 * sample frames (global stats, not per-pixel) — reuses the app's existing
 * ColorAdjustments shape so the result applies through the exact same
 * `buildCanvasFilterString` every manual color-grade slider already uses.
 * `refined` (Advanced mode) samples more generously and pushes corrections
 * a bit further; `basic` stays conservative/safe-looking.
 */
export function detectAutoColor(
  samples: CanvasImageSource[],
  refined: boolean,
): ColorAdjustments {
  const w = 48, h = 27; // tiny sample grid — global stats don't need more
  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const ctx = off.getContext("2d")!;

  let rSum = 0, bSum = 0, lumSum = 0, lumSqSum = 0, n = 0;

  for (const src of samples) {
    ctx.drawImage(src, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      rSum += r; bSum += b;
      lumSum += lum; lumSqSum += lum * lum;
      n++;
    }
  }
  if (n === 0) return { brightness: 1, contrast: 1, saturation: 1, temperature: 0 };

  const avgLum = lumSum / n;
  const stdDev = Math.sqrt(Math.max(0, lumSqSum / n - avgLum * avgLum));
  const avgR = rSum / n, avgB = bSum / n;

  // Brightness: nudge average luminance toward a pleasant midtone.
  let brightness = 1 + ((128 - avgLum) / 255) * 0.6;
  brightness = clamp(brightness, 0.8, 1.3);

  // Contrast: flat/hazy footage (low stdDev) gets a boost; already-punchy
  // footage is left alone.
  const targetStd = 55;
  let contrast = 1 + Math.max(0, (targetStd - stdDev) / targetStd) * (refined ? 0.35 : 0.25);
  contrast = clamp(contrast, 1, refined ? 1.35 : 1.25);

  // A small, tasteful saturation lift — most consumer footage reads a
  // little flat straight off a phone sensor.
  const saturation = refined ? 1.15 : 1.08;

  // Temperature: correct a color cast by comparing red vs blue channel
  // averages — footage skewing blue gets pushed warm and vice versa, capped
  // to a mild correction so it reads as "corrected", not "tinted".
  const castAmount = (avgR - avgB) / 255; // negative = cool cast
  let temperature = clamp(-castAmount * 60, -18, 18);
  if (!refined) temperature *= 0.6;

  return { brightness, contrast, saturation, temperature };
}

/**
 * Reduces sensor grain/noise WITHOUT softening real detail — a plain
 * blur-and-blend also smooths edges, faces, and texture, which reads as
 * "blurry", not "cleaned up". This blends toward a blurred copy only where
 * a pixel is already close to its blurred neighborhood (flat, likely-noisy
 * areas); where a pixel differs a lot from its blurred neighborhood (an
 * edge — the boundary of a face, an object, fine texture), the blend
 * strength fades toward zero, so that detail is left alone. A cheap
 * approximation of a bilateral/edge-preserving filter, not a true one, but
 * enough to keep faces and object edges sharp while grain in flat regions
 * (skin, sky, walls) gets cleaned up. Must be called AFTER the frame is
 * already drawn to `ctx`.
 */
export function applyNoiseOnlyDenoise(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number, h: number,
  level: EnhanceLevel,
) {
  if (level === 0) return;
  const strength = level === 1 ? 0.35 : 0.6;
  const blurPx = level === 1 ? 1.2 : 2.2;
  const edgeThreshold = 18; // per-channel 0..255 difference that counts as "an edge, not noise"

  const orig = ctx.getImageData(0, 0, w, h);

  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = w; blurCanvas.height = h;
  const bctx = blurCanvas.getContext("2d")!;
  bctx.filter = `blur(${blurPx}px)`;
  bctx.drawImage(ctx.canvas as CanvasImageSource, 0, 0);
  const blurred = bctx.getImageData(0, 0, w, h);

  const od = orig.data, bd = blurred.data;
  const out = new Uint8ClampedArray(od.length);
  for (let i = 0; i < od.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const o = od[i + c], b = bd[i + c];
      const localWeight = strength * Math.max(0, 1 - Math.abs(o - b) / edgeThreshold);
      out[i + c] = o + (b - o) * localWeight;
    }
    out[i + 3] = od[i + 3];
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
}

/**
 * A real (pixel-level) unsharp mask — original plus a fraction of
 * (original minus a blurred copy) — so Basic-mode Quality reads as
 * "repaired/crisper", not just "resized bigger and softer", even without a
 * real AI model behind it. Cheap, one pass, no cross-frame state.
 */
export function applySharpen(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number, h: number,
  amount = 0.35,
) {
  const orig = ctx.getImageData(0, 0, w, h);

  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = w; blurCanvas.height = h;
  const bctx = blurCanvas.getContext("2d")!;
  bctx.filter = "blur(1.4px)";
  bctx.drawImage(ctx.canvas as CanvasImageSource, 0, 0);
  const blurred = bctx.getImageData(0, 0, w, h);

  const od = orig.data, bd = blurred.data;
  const out = new Uint8ClampedArray(od.length);
  for (let i = 0; i < od.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      out[i + c] = od[i + c] + (od[i + c] - bd[i + c]) * amount;
    }
    out[i + 3] = od[i + 3];
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
}
