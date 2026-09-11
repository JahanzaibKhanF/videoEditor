/**
 * chromaKey — manual green/blue-screen removal for video clips. Distance-
 * based color keying with the same controls After Effects' Color Key gives
 * you: a picked key color, a Tolerance (how close a pixel must be to count
 * as background), and Edge Feather / Edge Thin to clean up the cutout edge.
 * This is deliberately the "old-school manual" chroma key, not the AI
 * background-removal path (backgroundRemoval.ts) — that one segments ANY
 * background via a neural net and re-encodes the clip into a new
 * transparent file; this one is a live per-frame filter for an actual
 * colored backdrop, with no re-encode and instant sliders.
 */
export interface ChromaKeySettings {
  enabled: boolean;
  /** hex, e.g. "#00ff00" — picked via the eyedropper or the color swatch */
  color: string;
  /** 0..1 — how close a pixel must be to `color` to count as background; higher = more aggressive */
  tolerance: number;
  /** 0..1 — width of the soft edge between "kept" and "keyed out" */
  edgeFeather: number;
  /** -1..1 — shrink (negative) or grow (positive) the kept-foreground edge; 0 = off */
  edgeThin: number;
}

export const DEFAULT_CHROMA_KEY: ChromaKeySettings = {
  enabled: false,
  color: "#00ff00",
  tolerance: 0.4,
  edgeFeather: 0.12,
  edgeThin: 0,
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = (hex || "#00ff00").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
}

// Max possible Euclidean distance between two RGB colors (0,0,0)..(255,255,255).
const MAX_DIST = Math.sqrt(255 * 255 * 3);

/** Mutates `imageData` in place, zeroing/feathering alpha for pixels close to `color`. */
export function applyChromaKey(imageData: ImageData, color: string, tolerance: number, edgeFeather: number) {
  const { r: kr, g: kg, b: kb } = hexToRgb(color);
  const data = imageData.data;
  const threshold = Math.max(0, Math.min(1, tolerance));
  const band = Math.max(0.01, Math.min(1, edgeFeather));
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = Math.sqrt((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2) / MAX_DIST;
    let alpha: number;
    if (dist <= threshold) alpha = 0;
    else if (dist >= threshold + band) alpha = 1;
    else alpha = (dist - threshold) / band;
    if (alpha < 1) {
      data[i + 3] = Math.round(data[i + 3] * alpha);
      // Spill suppression: a partially-keyed edge pixel is a mix of subject
      // and backdrop — pull it toward gray on the backdrop's dominant
      // channel so a thin green/blue fringe doesn't survive around the cutout.
      if (alpha > 0 && kg >= kr && kg >= kb) {
        const avg = (r + b) / 2;
        if (g > avg) data[i + 1] = Math.round(avg);
      } else if (alpha > 0 && kb >= kr && kb >= kg) {
        const avg = (r + g) / 2;
        if (b > avg) data[i + 2] = Math.round(avg);
      }
    }
  }
}

// Separable min/max (erode/dilate) over the alpha channel only — the classic
// morphological way to shrink or grow a matte's edge without touching
// color. Separable (horizontal pass then vertical) so cost is O(w*h*radius)
// instead of O(w*h*radius²), which matters since this runs per frame.
function morphAlpha(imageData: ImageData, radiusPx: number, erode: boolean) {
  const { width, height, data } = imageData;
  const n = width * height;
  const alpha = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3];

  const tmp = new Uint8ClampedArray(n);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let v = erode ? 255 : 0;
      const x0 = Math.max(0, x - radiusPx), x1 = Math.min(width - 1, x + radiusPx);
      for (let xx = x0; xx <= x1; xx++) {
        const a = alpha[row + xx];
        v = erode ? Math.min(v, a) : Math.max(v, a);
      }
      tmp[row + x] = v;
    }
  }
  const out = new Uint8ClampedArray(n);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let v = erode ? 255 : 0;
      const y0 = Math.max(0, y - radiusPx), y1 = Math.min(height - 1, y + radiusPx);
      for (let yy = y0; yy <= y1; yy++) {
        const a = tmp[yy * width + x];
        v = erode ? Math.min(v, a) : Math.max(v, a);
      }
      out[y * width + x] = v;
    }
  }
  for (let i = 0; i < n; i++) data[i * 4 + 3] = out[i];
}

/** `edgeThin`: negative shrinks the kept foreground inward, positive grows it outward. 0 = no-op (skipped entirely, zero cost). */
export function applyEdgeThin(imageData: ImageData, edgeThin: number) {
  if (!edgeThin) return;
  const radius = Math.max(1, Math.round(Math.min(1, Math.abs(edgeThin)) * 6));
  morphAlpha(imageData, radius, edgeThin < 0);
}
