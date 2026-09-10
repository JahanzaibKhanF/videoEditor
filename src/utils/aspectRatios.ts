import { AspectRatio } from "../types/types";

/**
 * Single source of truth for aspect-ratio → pixel dimensions.
 *
 * Before this existed, `TemplatesPanel.applyTemplate` and `ClipFlowApp` each
 * had their own partial hardcoded maps (`{ "16:9": [1280,720], ... }`) that
 * only covered 5–6 of the 10 valid `AspectRatio` values — so a template
 * authored as `"tiktok"` / `"ytshorts"` / `"instareels"` / `"xfeeds"` built
 * its text layout for the wrong canvas size and every position came out
 * wrong. Keep all ratio math here.
 */

// width / height for each ratio (matches Screen.tsx's container math).
export const ASPECT_RATIO_VALUE: Record<AspectRatio, number> = {
  original: 16 / 9,
  "16:9": 16 / 9,
  xfeeds: 16 / 9,
  "9:16": 9 / 16,
  ytshorts: 9 / 16,
  instareels: 9 / 16,
  tiktok: 9 / 16,
  "1:1": 1,
  "4:5": 4 / 5,
  "3:4": 3 / 4,
};

/**
 * Pixel dimensions for a ratio. Landscape ratios are sized off a 1280px
 * width; portrait/square off a 720px width, so the larger edge stays near
 * 1280 either way (keeps WebCodecs' coded-area budget happy).
 */
export function aspectRatioDimensions(ar: AspectRatio | string): [number, number] {
  const ratio = ASPECT_RATIO_VALUE[ar as AspectRatio] ?? 16 / 9;
  if (ratio >= 1) {
    const w = 1280;
    return [w, Math.round(w / ratio)];
  }
  const w = 720;
  return [w, Math.round(w / ratio)];
}

export const ASPECT_RATIO_OPTIONS: { value: AspectRatio; label: string }[] = [
  { value: "16:9", label: "16:9 — Landscape / YouTube" },
  { value: "9:16", label: "9:16 — Vertical / Reels / Shorts / TikTok" },
  { value: "1:1", label: "1:1 — Square" },
  { value: "4:5", label: "4:5 — Instagram portrait" },
  { value: "3:4", label: "3:4 — Portrait" },
  { value: "xfeeds", label: "X (Twitter) feed — 16:9" },
  { value: "ytshorts", label: "YouTube Shorts — 9:16" },
  { value: "instareels", label: "Instagram Reels — 9:16" },
  { value: "tiktok", label: "TikTok — 9:16" },
];
