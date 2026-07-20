import { TextDetails, BlurDetails, AspectRatio } from "../types/types";
import { buildTemplateFromRecord, TemplateRecord, TemplateJson } from "./templateInterpreter";

export interface TemplateVideoSlot {
  label: string;          // "Intro clip", "B-roll", etc.
  durationSecs: number;   // how long this slot should be
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: "text" | "lower-third" | "title" | "social" | "minimal";
  needsVideo: boolean;              // false = text-only template
  videoSlots: TemplateVideoSlot[];  // [] if no video needed
  aspectRatio: AspectRatio;
  coverImage: string | null;        // real photographic cover, not an emoji/icon
  accentColor: string;
  // buildTexts receives canvas W/H and total duration (sum of all slots)
  buildTexts: (w: number, h: number, duration: number) => TextDetails[];
  buildBlurs: (w: number, h: number, duration: number) => BlurDetails[];
}

// Helper: derive total duration from slots
export function templateDuration(tpl: Template): number {
  return tpl.videoSlots.reduce((s, sl) => s + sl.durationSecs, 0) || 10;
}

/**
 * ── Default templates ──────────────────────────────────────────────────
 * Exactly 3, curated. Each is defined as plain TemplateJson data — the same
 * format admin-created templates use — and run through the identical
 * interpreter (`buildTemplateFromRecord`) that DB templates go through.
 * That means these defaults are visible and editable in the /settings JSON
 * editor too: TemplatesPanel seeds them into Neon on first admin visit,
 * after which they behave exactly like any other DB-managed template.
 *
 * Cover images are real photography (Unsplash), not emoji or icon glyphs.
 */
const cinematicTitleJson: TemplateJson = {
  description: "Bold centered title with subtitle — great for cinematic intros",
  category: "title",
  aspectRatio: "16:9",
  accentColor: "#8B5CFF",
  videoSlots: [{ label: "Main clip", durationSecs: 10 }],
  texts: [
    {
      text: "YOUR TITLE HERE", xFrac: 0.1, yFrac: 0.34, wFrac: 0.8, hFrac: 0.16,
      fontSize: 96, isBold: true, textColor: "#FFFFFF",
      shadowColor: "rgba(0,0,0,0.6)", shadowBlur: 24, shadowOffsetY: 4,
      animation: "fadeIn", startTime: 0,
    },
    {
      text: "Your subtitle goes here", xFrac: 0.15, yFrac: 0.55, wFrac: 0.7, hFrac: 0.08,
      fontSize: 42, textColor: "rgba(255,255,255,0.78)",
      animation: "slideIn", startTime: 0.5,
    },
  ],
  blurs: [],
};

const lowerThirdJson: TemplateJson = {
  description: "Name + role bar at the bottom — news / interview style",
  category: "lower-third",
  aspectRatio: "16:9",
  accentColor: "#4C8CFF",
  videoSlots: [{ label: "Main clip", durationSecs: 10 }],
  texts: [
    {
      text: "JANE DOE", xFrac: 0.05, yFrac: 0.72, wFrac: 0.5, hFrac: 0.09,
      fontSize: 58, isBold: true, textColor: "#FFFFFF", backgroundColor: "rgba(76,140,255,0.92)",
      animation: "slideIn", startTime: 0, endTime: 5,
    },
    {
      text: "Creative Director", xFrac: 0.05, yFrac: 0.805, wFrac: 0.45, hFrac: 0.06,
      fontSize: 34, textColor: "#FFFFFF", backgroundColor: "rgba(0,0,0,0.72)",
      animation: "slideIn", startTime: 0.3, endTime: 5,
    },
  ],
  blurs: [],
};

const verticalStoryJson: TemplateJson = {
  description: "Bold vertical caption + CTA — Reels / TikTok / Shorts style",
  category: "social",
  aspectRatio: "9:16",
  accentColor: "#FFB648",
  videoSlots: [{ label: "Vertical clip", durationSecs: 8 }],
  texts: [
    {
      text: "WAIT FOR IT…", xFrac: 0.08, yFrac: 0.08, wFrac: 0.84, hFrac: 0.1,
      fontSize: 56, isBold: true, textColor: "#FFFFFF",
      shadowColor: "rgba(0,0,0,0.5)", shadowBlur: 16, shadowOffsetY: 3,
      animation: "popInUp", startTime: 0,
    },
    {
      text: "Follow for more", xFrac: 0.12, yFrac: 0.86, wFrac: 0.76, hFrac: 0.06,
      fontSize: 34, isBold: true, textColor: "#0A0A13", backgroundColor: "#FFB648",
      animation: "slideUp", startTime: 0.4,
    },
  ],
  blurs: [],
};

const wiggleCaptionJson: TemplateJson = {
  description: "Bouncy, continuously-wiggling caption — TikTok/Reels energy",
  category: "social",
  aspectRatio: "9:16",
  accentColor: "#FF4F70",
  videoSlots: [{ label: "Vertical clip", durationSecs: 8 }],
  texts: [
    {
      text: "NO WAY 😱", xFrac: 0.1, yFrac: 0.12, wFrac: 0.8, hFrac: 0.12,
      fontSize: 62, isBold: true, textColor: "#FFFFFF", fontFamily: "Trebuchet MS",
      shadowColor: "rgba(0,0,0,0.55)", shadowBlur: 14, shadowOffsetY: 3,
      animation: "wiggle", startTime: 0,
    },
    {
      text: "wait for it...", xFrac: 0.15, yFrac: 0.78, wFrac: 0.7, hFrac: 0.08,
      fontSize: 36, isItalic: true, textColor: "#FFFFFF", fontFamily: "Brush Script MT",
      animation: "shake", startTime: 0.6,
    },
  ],
  blurs: [],
};

const slowMotionMontageJson: TemplateJson = {
  description: "4-clip montage — real industry pacing for a slow-motion story arc",
  category: "title",
  aspectRatio: "16:9",
  accentColor: "#4C8CFF",
  videoSlots: [
    { label: "Opening shot", durationSecs: 4 },
    { label: "Build-up", durationSecs: 5 },
    { label: "Slow-motion peak", durationSecs: 6 },
    { label: "Closing shot", durationSecs: 4 },
  ],
  texts: [
    {
      text: "THE MOMENT", xFrac: 0.08, yFrac: 0.38, wFrac: 0.84, hFrac: 0.14,
      fontSize: 84, isBold: true, textColor: "#FFFFFF", fontFamily: "Georgia",
      shadowColor: "rgba(0,0,0,0.6)", shadowBlur: 20, shadowOffsetY: 4,
      animation: "fadeIn", startTime: 0, endTime: 4,
    },
    {
      text: "everything changed", xFrac: 0.1, yFrac: 0.8, wFrac: 0.8, hFrac: 0.08,
      fontSize: 32, textColor: "rgba(255,255,255,0.85)", fontFamily: "Garamond",
      animation: "slideUp", startTime: 9, endTime: 15,
    },
  ],
  blurs: [],
};

export const DEFAULT_TEMPLATE_RECORDS: TemplateRecord[] = [
  {
    id: "cinematic-title",
    name: "Cinematic Title",
    cover_image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&h=450&fit=crop&q=80",
    template_json: cinematicTitleJson,
    is_active: true,
    sort_order: 0,
  },
  {
    id: "lower-third-broadcast",
    name: "Lower Third Broadcast",
    cover_image: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=800&h=450&fit=crop&q=80",
    template_json: lowerThirdJson,
    is_active: true,
    sort_order: 1,
  },
  {
    id: "vertical-story-caption",
    name: "Vertical Story Caption",
    cover_image: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&h=1000&fit=crop&q=80",
    template_json: verticalStoryJson,
    is_active: true,
    sort_order: 2,
  },
  {
    id: "wiggle-caption",
    name: "Wiggle Caption",
    cover_image: "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=800&h=1000&fit=crop&q=80",
    template_json: wiggleCaptionJson,
    is_active: true,
    sort_order: 3,
  },
  {
    id: "slow-motion-montage",
    name: "Slow-Motion Montage",
    cover_image: "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=800&h=450&fit=crop&q=80",
    template_json: slowMotionMontageJson,
    is_active: true,
    sort_order: 4,
  },
];

export const TEMPLATES: Template[] = DEFAULT_TEMPLATE_RECORDS.map(buildTemplateFromRecord);
