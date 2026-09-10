import { v4 as uuidv4 } from "uuid";
import { TextDetails, BlurDetails, AspectRatio, KeyframeTrack, KfProp } from "../types/types";
import { Template, TemplateVideoSlot } from "./templates";

/**
 * ── Template JSON schema (what admins author in /settings) ────────────────
 * Every position/size value is a FRACTION of the canvas (0–1), so one JSON
 * document renders correctly at 16:9, 9:16, 1:1, or any other aspect ratio.
 * This is the single source of truth for both the admin JSON editor and this
 * interpreter — keep them in sync if the shape ever changes.
 */
/**
 * A template keyframe track. Resolution-independent: `tFrac` is a fraction
 * of the template's total duration, and for the `x`/`y` props `value` is a
 * fraction of the canvas (width/height) — everything else (`scale`,
 * `rotation`, `opacity`, `blur`) is a literal value. `buildTemplateFromRecord`
 * converts these into real `KeyframeTrack`s (seconds + px) at apply time.
 */
export interface TemplateJsonKeyframeTrack {
  prop: KfProp;
  keys: { tFrac: number; value: number; ease?: [number, number, number, number] | "hold" }[];
}

export interface TemplateJsonText {
  text: string;
  xFrac: number;
  yFrac: number;
  wFrac: number;
  hFrac: number;
  keyframes?: TemplateJsonKeyframeTrack[];
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  textColor?: string;
  backgroundColor?: string;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  opacity?: number;
  /** seconds relative to the template's total duration; omit for "whole duration" */
  startTime?: number;
  endTime?: number;
  animation?: string;
}

export interface TemplateJsonBlur {
  xFrac: number;
  yFrac: number;
  wFrac: number;
  hFrac: number;
  blurAmount?: number;
  startTime?: number;
  endTime?: number;
}

export interface TemplateJson {
  description?: string;
  category?: Template["category"];
  aspectRatio?: AspectRatio;
  accentColor?: string;
  videoSlots?: TemplateVideoSlot[];
  texts?: TemplateJsonText[];
  blurs?: TemplateJsonBlur[];
}

export interface TemplateRecord {
  id: string;
  name: string;
  cover_image: string | null;
  template_json: TemplateJson;
  is_active?: boolean;
  sort_order?: number;
}

const VALID_CATEGORIES: Template["category"][] = ["text", "lower-third", "title", "social", "minimal"];
const VALID_ASPECTS: AspectRatio[] = [
  "original", "16:9", "9:16", "1:1", "4:5", "3:4", "xfeeds", "ytshorts", "instareels", "tiktok",
];

/**
 * Turns a plain-data DB template record into the same `Template` shape the
 * app's built-in templates use (buildTexts/buildBlurs closures), so the rest
 * of TemplatesPanel.tsx (slot picker, apply logic, category filter) works
 * against admin-authored templates without any special-casing.
 */
export function buildTemplateFromRecord(record: TemplateRecord): Template {
  const json = record.template_json ?? {};
  const category = VALID_CATEGORIES.includes(json.category as Template["category"])
    ? (json.category as Template["category"])
    : "minimal";
  const aspectRatio = VALID_ASPECTS.includes(json.aspectRatio as AspectRatio)
    ? (json.aspectRatio as AspectRatio)
    : "16:9";
  const videoSlots: TemplateVideoSlot[] = Array.isArray(json.videoSlots) ? json.videoSlots : [];
  const jsonTexts = Array.isArray(json.texts) ? json.texts : [];
  const jsonBlurs = Array.isArray(json.blurs) ? json.blurs : [];

  // Fractional template keyframes → real KeyframeTrack (seconds + px).
  const buildKeyframes = (
    tracks: TemplateJsonKeyframeTrack[] | undefined, w: number, h: number, duration: number,
  ): KeyframeTrack[] | undefined => {
    if (!Array.isArray(tracks) || tracks.length === 0) return undefined;
    const out = tracks
      .filter((tr) => tr && Array.isArray(tr.keys) && tr.keys.length > 0)
      .map((tr) => ({
        prop: tr.prop,
        keys: tr.keys.map((k) => ({
          id: uuidv4(),
          t: Math.max(0, (k.tFrac ?? 0) * duration),
          value: tr.prop === "x" ? (k.value ?? 0) * w : tr.prop === "y" ? (k.value ?? 0) * h : (k.value ?? 0),
          ease: k.ease,
        })).sort((a, b) => a.t - b.t),
      }));
    return out.length ? out : undefined;
  };

  return {
    id: record.id,
    name: record.name,
    description: json.description ?? "",
    category,
    needsVideo: videoSlots.length > 0,
    videoSlots,
    aspectRatio,
    coverImage: record.cover_image ?? null,
    accentColor: json.accentColor ?? "#8B5CFF",
    buildTexts: (w: number, h: number, duration: number): TextDetails[] =>
      jsonTexts.map((t) => ({
        id: uuidv4(),
        text: t.text ?? "",
        textX: t.xFrac * w,
        textY: t.yFrac * h,
        width: t.wFrac * w,
        height: t.hFrac * h,
        fontSize: t.fontSize ?? 48,
        lineHeight: t.lineHeight ?? 1,
        fontFamily: t.fontFamily ?? "Arial",
        textColor: t.textColor ?? "white",
        backgroundColor: t.backgroundColor ?? "transparent",
        shadowColor: t.shadowColor ?? "transparent",
        shadowBlur: t.shadowBlur ?? 0,
        shadowOffsetX: t.shadowOffsetX ?? 0,
        shadowOffsetY: t.shadowOffsetY ?? 0,
        isBold: t.isBold ?? false,
        isItalic: t.isItalic ?? false,
        isUnderline: t.isUnderline ?? false,
        opacity: t.opacity ?? 1,
        startTime: t.startTime ?? 0,
        endTime: t.endTime ?? duration,
        animation: t.animation ?? "none",
        keyframes: buildKeyframes(t.keyframes, w, h, duration),
      })),
    buildBlurs: (w: number, h: number, duration: number): BlurDetails[] =>
      jsonBlurs.map((b) => ({
        id: uuidv4(),
        x: b.xFrac * w,
        y: b.yFrac * h,
        width: b.wFrac * w,
        height: b.hFrac * h,
        blurAmount: b.blurAmount ?? 12,
        startTime: b.startTime ?? 0,
        endTime: b.endTime ?? duration,
      })),
  };
}

export function buildTemplatesFromRecords(records: TemplateRecord[]): Template[] {
  return records.map(buildTemplateFromRecord);
}
