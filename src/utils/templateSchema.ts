import { TemplateJson, TemplateJsonText, TemplateJsonShape, TemplateJsonBrush } from "./templateInterpreter";
import { TemplateVideoSlot } from "./templates";
import { AspectRatio, ShapeKind } from "../types/types";
import { SPEED_PRESETS } from "./speedRamp";

/**
 * Shared validation + normalization for template JSON.
 *
 * Used by BOTH the admin builder (to show inline errors/warnings before a
 * save) and anywhere else that wants to sanity-check a template document.
 * The runtime interpreter (`buildTemplateFromRecord`) stays permissive and
 * never throws — this is the layer that tells a human "text 2 sits off the
 * canvas" instead of silently rendering it wrong.
 *
 * No external schema library (zod isn't a dependency) — plain checks.
 */

export const TEMPLATE_CATEGORIES = ["title", "lower-third", "social", "minimal", "text"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_ANIMATIONS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fadeIn", label: "Fade in" },
  { value: "slideUp", label: "Slide up" },
  { value: "slideIn", label: "Slide in (left)" },
  { value: "slideInRight", label: "Slide in (right)" },
  { value: "slideDown", label: "Slide down" },
  { value: "zoomIn", label: "Zoom in" },
  { value: "popInUp", label: "Pop in (up)" },
  { value: "popInDown", label: "Pop in (down)" },
  { value: "bounceIn", label: "Bounce in" },
  { value: "grow", label: "Grow" },
  { value: "blurIn", label: "Blur in" },
  { value: "glowIn", label: "Glow in" },
  { value: "typewriter", label: "Typewriter" },
  { value: "pulse", label: "Pulse (continuous)" },
  { value: "wiggle", label: "Wiggle (continuous)" },
  { value: "shake", label: "Shake (continuous)" },
  { value: "sparkle", label: "Sparkle (continuous)" },
];

export const TEMPLATE_TRANSITIONS: { value: string; label: string }[] = [
  { value: "none", label: "Hard cut" },
  { value: "crossDissolve", label: "Cross dissolve" },
  { value: "dipToBlack", label: "Dip to black" },
  { value: "dipToWhite", label: "Dip to white" },
  { value: "wipeLeftToRight", label: "Wipe" },
  { value: "slideIn", label: "Slide" },
  { value: "push", label: "Push" },
  { value: "zoom", label: "Zoom" },
];

// Named speed presets the builder offers as a dropdown (maps to the same
// SPEED_PRESETS the code-defined templates use).
export const SPEED_PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: "normal", label: SPEED_PRESETS.normal.label },
  { value: "slowmo", label: SPEED_PRESETS.slowmo.label },
  { value: "fast", label: SPEED_PRESETS.fast.label },
  { value: "slowToFast", label: SPEED_PRESETS.slowToFast.label },
  { value: "buildUp", label: SPEED_PRESETS.buildUp.label },
];

/** Reverse-lookup: given a slot's `speed` value, which preset key is it? */
export function speedPresetKey(speed: TemplateVideoSlot["speed"]): string {
  if (speed === undefined || speed === 1) return "normal";
  for (const [key, preset] of Object.entries(SPEED_PRESETS)) {
    if (JSON.stringify(preset.speed) === JSON.stringify(speed)) return key;
  }
  return "custom";
}

export const DEFAULT_TEXT_LAYER: TemplateJsonText = {
  text: "New text",
  xFrac: 0.1,
  yFrac: 0.42,
  wFrac: 0.8,
  hFrac: 0.16,
  fontSize: 64,
  fontFamily: "Arial",
  isBold: true,
  isItalic: false,
  isUnderline: false,
  textColor: "#FFFFFF",
  backgroundColor: "transparent",
  shadowColor: "rgba(0,0,0,0.5)",
  shadowBlur: 16,
  shadowOffsetX: 0,
  shadowOffsetY: 3,
  opacity: 1,
  startTime: 0,
  animation: "fadeIn",
};

export const DEFAULT_VIDEO_SLOT: TemplateVideoSlot = {
  label: "Clip",
  durationSecs: 5,
  transition: "none",
};

export const SHAPE_KIND_OPTIONS: { value: ShapeKind; label: string }[] = [
  { value: "rectangle", label: "Rectangle" },
  { value: "ellipse", label: "Ellipse" },
  { value: "polygon", label: "Polygon / Triangle" },
];

export const DEFAULT_SHAPE_LAYER: TemplateJsonShape = {
  kind: "rectangle",
  xFrac: 0.3, yFrac: 0.35, wFrac: 0.4, hFrac: 0.3,
  fill: "#8B5CFF", stroke: "transparent", strokeWidth: 0,
  opacity: 1, startTime: 0, animation: "none",
};

export const DEFAULT_BRUSH_LAYER: TemplateJsonBrush = {
  points: [{ x: 0, y: 0.5 }, { x: 0.5, y: 0 }, { x: 1, y: 0.5 }],
  xFrac: 0.25, yFrac: 0.4, wFrac: 0.5, hFrac: 0.2,
  color: "#FF4D6D", strokeWidth: 10,
  opacity: 1, startTime: 0, animation: "none",
};

export function emptyTemplateJson(): TemplateJson {
  return {
    description: "",
    category: "title",
    aspectRatio: "16:9",
    accentColor: "#8B5CFF",
    videoSlots: [{ ...DEFAULT_VIDEO_SLOT, label: "Main clip", durationSecs: 8 }],
    texts: [{ ...DEFAULT_TEXT_LAYER, text: "YOUR TITLE" }],
    blurs: [],
    shapes: [],
    brushes: [],
  };
}

/** Sum of all slot durations, or a sensible fallback. */
export function templateJsonDuration(json: TemplateJson): number {
  const slots = Array.isArray(json.videoSlots) ? json.videoSlots : [];
  const sum = slots.reduce((s, sl) => s + (Number(sl.durationSecs) || 0), 0);
  return sum > 0 ? sum : 10;
}

export interface TemplateValidation {
  errors: string[];
  warnings: string[];
}

export function validateTemplateJson(json: TemplateJson, name?: string): TemplateValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (name !== undefined && !name.trim()) errors.push("Template name is required.");

  if (json.category && !TEMPLATE_CATEGORIES.includes(json.category as TemplateCategory)) {
    warnings.push(`Category "${json.category}" isn't one of ${TEMPLATE_CATEGORIES.join(", ")} — it won't match any filter tab.`);
  }

  const slots = Array.isArray(json.videoSlots) ? json.videoSlots : [];
  slots.forEach((sl, i) => {
    const n = i + 1;
    if (!sl.label || !String(sl.label).trim()) warnings.push(`Slot ${n} has no label.`);
    if (!(Number(sl.durationSecs) > 0)) errors.push(`Slot ${n} needs a duration greater than 0.`);
    else if (Number(sl.durationSecs) > 60) warnings.push(`Slot ${n} is ${sl.durationSecs}s — unusually long for a template slot.`);
  });

  const totalDur = templateJsonDuration(json);
  const texts = Array.isArray(json.texts) ? json.texts : [];
  if (texts.length === 0 && slots.length === 0) {
    errors.push("A template needs at least one video slot or one text layer.");
  }

  texts.forEach((t, i) => {
    const n = i + 1;
    if (!t.text || !String(t.text).trim()) warnings.push(`Text ${n} is empty.`);
    for (const [k, v] of [["xFrac", t.xFrac], ["yFrac", t.yFrac], ["wFrac", t.wFrac], ["hFrac", t.hFrac]] as const) {
      if (typeof v !== "number" || Number.isNaN(v)) { errors.push(`Text ${n}: ${k} must be a number.`); continue; }
      if (v < 0 || v > 1) warnings.push(`Text ${n}: ${k} is ${v} — should be between 0 and 1 (a fraction of the canvas).`);
    }
    if (typeof t.xFrac === "number" && typeof t.wFrac === "number" && t.xFrac + t.wFrac > 1.02) {
      warnings.push(`Text ${n} extends past the right edge (x ${round2(t.xFrac)} + width ${round2(t.wFrac)}).`);
    }
    if (typeof t.yFrac === "number" && typeof t.hFrac === "number" && t.yFrac + t.hFrac > 1.02) {
      warnings.push(`Text ${n} extends past the bottom edge.`);
    }
    if (t.fontSize !== undefined && !(Number(t.fontSize) > 0)) errors.push(`Text ${n}: fontSize must be greater than 0.`);
    const start = t.startTime ?? 0;
    const end = t.endTime ?? totalDur;
    if (end < start) errors.push(`Text ${n}: end time (${end}s) is before start time (${start}s).`);
    if (start > totalDur) warnings.push(`Text ${n} starts at ${start}s but the template is only ${round2(totalDur)}s long — it will never appear.`);
    else if (end > totalDur + 0.05) warnings.push(`Text ${n} ends at ${end}s, past the ${round2(totalDur)}s template length.`);
    if (t.animation && t.animation !== "none" && !TEMPLATE_ANIMATIONS.some((a) => a.value === t.animation)) {
      warnings.push(`Text ${n}: animation "${t.animation}" isn't a known key — it may not play.`);
    }
    for (const tr of Array.isArray(t.keyframes) ? t.keyframes : []) {
      const keys = Array.isArray(tr?.keys) ? tr.keys : [];
      if (keys.length < 1) { warnings.push(`Text ${n}: a "${tr?.prop}" keyframe track has no keys.`); continue; }
      keys.forEach((k, ki) => {
        if (typeof k.tFrac !== "number" || k.tFrac < 0 || k.tFrac > 1)
          warnings.push(`Text ${n} ${tr.prop} key ${ki + 1}: tFrac should be 0..1.`);
        if ((tr.prop === "x" || tr.prop === "y") && (k.value < -1 || k.value > 1))
          warnings.push(`Text ${n} ${tr.prop} key ${ki + 1}: value ${round2(k.value)} is outside ±100% of the canvas.`);
      });
    }
  });

  const shapes = Array.isArray(json.shapes) ? json.shapes : [];
  shapes.forEach((s, i) => {
    const n = i + 1;
    for (const [k, v] of [["xFrac", s.xFrac], ["yFrac", s.yFrac], ["wFrac", s.wFrac], ["hFrac", s.hFrac]] as const) {
      if (typeof v !== "number" || Number.isNaN(v)) errors.push(`Shape ${n}: ${k} must be a number.`);
    }
    if (s.kind === "polygon" && s.sides !== undefined && (s.sides < 3 || s.sides > 12)) {
      warnings.push(`Shape ${n}: sides should be between 3 and 12.`);
    }
    const start = s.startTime ?? 0, end = s.endTime ?? totalDur;
    if (end < start) errors.push(`Shape ${n}: end time (${end}s) is before start time (${start}s).`);
  });

  const brushes = Array.isArray(json.brushes) ? json.brushes : [];
  brushes.forEach((b, i) => {
    const n = i + 1;
    if (!Array.isArray(b.points) || b.points.length < 2) errors.push(`Brush ${n}: needs at least 2 points.`);
    const start = b.startTime ?? 0, end = b.endTime ?? totalDur;
    if (end < start) errors.push(`Brush ${n}: end time (${end}s) is before start time (${start}s).`);
  });

  if (json.aspectRatio && !isValidAspect(json.aspectRatio)) {
    warnings.push(`Aspect ratio "${json.aspectRatio}" isn't recognised — the app will fall back to 16:9.`);
  }

  return { errors, warnings };
}

function isValidAspect(ar: string): ar is AspectRatio {
  return ["original", "16:9", "9:16", "1:1", "4:5", "3:4", "xfeeds", "ytshorts", "instareels", "tiktok"].includes(ar);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
