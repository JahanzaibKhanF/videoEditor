import { v4 as uuidv4 } from "uuid";
import { TextDetails, BlurDetails, AspectRatio } from "../types/types";

export interface TemplateVideoSlot {
  label: string;          // "Intro clip", "B-roll", etc.
  durationSecs: number;   // how long this slot should be
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: "text" | "lower-third" | "title" | "social" | "minimal";
  needsVideo: boolean;           // false = text-only template
  videoSlots: TemplateVideoSlot[]; // [] if no video needed
  aspectRatio: AspectRatio;
  emoji: string;
  accentColor: string;
  // buildTexts receives canvas W/H and total duration (sum of all slots)
  buildTexts: (w: number, h: number, duration: number) => TextDetails[];
  buildBlurs: (w: number, h: number, duration: number) => BlurDetails[];
}

// Helper: derive needsVideo and total duration from slots
export function templateDuration(tpl: Template): number {
  return tpl.videoSlots.reduce((s, sl) => s + sl.durationSecs, 0) || 10;
}

const makeText = (overrides: Partial<TextDetails> & { text: string }): TextDetails => ({
  id: uuidv4(),
  textX: 100,
  textY: 100,
  width: 600,
  height: 120,
  fontSize: 80,
  lineHeight: 1,
  fontFamily: "Arial",
  textColor: "white",
  backgroundColor: "transparent",
  shadowColor: "transparent",
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  isBold: false,
  isItalic: false,
  isUnderline: false,
  opacity: 1,
  startTime: 0,
  endTime: 10,
  animation: "none",
  ...overrides,
});

export const TEMPLATES: Template[] = [
  // 1. Cinematic Title
  {
    id: "cinematic-title",
    name: "Cinematic Title",
    description: "Bold centered title with subtitle — great for intros",
    category: "title",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "16:9",
    emoji: "🎬",
    accentColor: "#6366F1",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "YOUR TITLE HERE", textX: w * 0.1, textY: h * 0.35, width: w * 0.8, height: 120, fontSize: 100, isBold: true, textColor: "white", shadowColor: "black", shadowBlur: 20, shadowOffsetX: 0, shadowOffsetY: 4, animation: "fadeIn", startTime: 0, endTime: dur }),
      makeText({ id: uuidv4(), text: "Your subtitle goes here", textX: w * 0.15, textY: h * 0.58, width: w * 0.7, height: 60, fontSize: 48, textColor: "rgba(255,255,255,0.75)", animation: "slideInLeft", startTime: 0.5, endTime: dur }),
    ],
    buildBlurs: () => [],
  },

  // 2. Lower Third
  {
    id: "lower-third",
    name: "Lower Third",
    description: "Name + title bar at the bottom — news/interview style",
    category: "lower-third",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "16:9",
    emoji: "📺",
    accentColor: "#3B82F6",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "JOHN DOE", textX: w * 0.05, textY: h * 0.72, width: w * 0.5, height: 70, fontSize: 64, isBold: true, textColor: "white", backgroundColor: "rgba(59,130,246,0.9)", animation: "slideInLeft", startTime: 0, endTime: Math.min(dur, 5) }),
      makeText({ id: uuidv4(), text: "CEO & Founder", textX: w * 0.05, textY: h * 0.80, width: w * 0.45, height: 50, fontSize: 38, textColor: "white", backgroundColor: "rgba(0,0,0,0.7)", animation: "slideInLeft", startTime: 0.3, endTime: Math.min(dur, 5) }),
    ],
    buildBlurs: () => [],
  },

  // 3. TikTok / Reels Captions
  {
    id: "tiktok-caption",
    name: "Reels Captions",
    description: "Centered bold text for short-form vertical content",
    category: "social",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "9:16",
    emoji: "📱",
    accentColor: "#EC4899",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "Wait for it... 👀", textX: w * 0.05, textY: h * 0.42, width: w * 0.9, height: 120, fontSize: 72, isBold: true, textColor: "white", shadowColor: "black", shadowBlur: 15, shadowOffsetX: 2, shadowOffsetY: 2, animation: "zoomIn", startTime: 0, endTime: Math.min(dur, 3) }),
      makeText({ id: uuidv4(), text: "🔥 Follow for more!", textX: w * 0.05, textY: h * 0.82, width: w * 0.9, height: 80, fontSize: 54, isBold: true, textColor: "white", backgroundColor: "rgba(236,72,153,0.85)", animation: "bounceIn", startTime: Math.max(0, dur - 4), endTime: dur }),
    ],
    buildBlurs: () => [],
  },

  // 4. YouTube Thumbnail Style
  {
    id: "youtube-thumbnail",
    name: "YT Thumbnail",
    description: "Bold punchy text overlay for YouTube thumbnails",
    category: "title",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "16:9",
    emoji: "▶️",
    accentColor: "#EF4444",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "INSANE", textX: w * 0.03, textY: h * 0.08, width: w * 0.55, height: 130, fontSize: 120, isBold: true, textColor: "#FBBF24", backgroundColor: "rgba(239,68,68,0.9)", animation: "zoomIn", startTime: 0, endTime: dur }),
      makeText({ id: uuidv4(), text: "RESULTS!", textX: w * 0.03, textY: h * 0.4, width: w * 0.55, height: 130, fontSize: 120, isBold: true, textColor: "white", shadowColor: "#EF4444", shadowBlur: 20, shadowOffsetX: 3, shadowOffsetY: 3, animation: "zoomIn", startTime: 0.2, endTime: dur }),
    ],
    buildBlurs: () => [],
  },

  // 5. Minimal Intro (no video needed)
  {
    id: "minimal-intro",
    name: "Minimal Intro",
    description: "Clean text animation — no video required",
    category: "minimal",
    needsVideo: false,
    videoSlots: [],
    aspectRatio: "16:9",
    emoji: "✨",
    accentColor: "#8B5CF6",
    buildTexts: (w, h,) => [
      makeText({ id: uuidv4(), text: "Hello, World.", textX: w * 0.1, textY: h * 0.32, width: w * 0.8, height: 110, fontSize: 96, isBold: true, textColor: "white", animation: "fadeIn", startTime: 0, endTime: 3 }),
      makeText({ id: uuidv4(), text: "A new story begins.", textX: w * 0.1, textY: h * 0.55, width: w * 0.8, height: 70, fontSize: 52, textColor: "rgba(255,255,255,0.6)", animation: "slideInLeft", startTime: 1, endTime: 4 }),
    ],
    buildBlurs: () => [],
  },

  // 6. Blur Reveal
  {
    id: "blur-reveal",
    name: "Blur Reveal",
    description: "Blurred background region with text overlay",
    category: "title",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "16:9",
    emoji: "🌫️",
    accentColor: "#06B6D4",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "BREAKING", textX: w * 0.08, textY: h * 0.28, width: w * 0.84, height: 90, fontSize: 80, isBold: true, textColor: "white", shadowColor: "black", shadowBlur: 25, shadowOffsetX: 0, shadowOffsetY: 0, animation: "fadeIn", startTime: 0, endTime: dur }),
      makeText({ id: uuidv4(), text: "Something amazing just happened.", textX: w * 0.08, textY: h * 0.5, width: w * 0.84, height: 70, fontSize: 48, textColor: "white", shadowColor: "black", shadowBlur: 15, animation: "slideInLeft", startTime: 0.5, endTime: dur }),
    ],
    buildBlurs: (w, h, dur) => [{
      id: uuidv4(), x: w * 0.05, y: h * 0.22, width: w * 0.9, height: h * 0.45, blurAmount: 18, startTime: 0, endTime: dur,
    }],
  },

  // 7. Instagram Quote
  {
    id: "instagram-quote",
    name: "IG Quote",
    description: "Stylish quote card for Instagram square posts",
    category: "social",
    needsVideo: false,
    videoSlots: [],
    aspectRatio: "1:1",
    emoji: "💬",
    accentColor: "#EC4899",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: '"The best time to start was yesterday."', textX: w * 0.08, textY: h * 0.2, width: w * 0.84, height: 280, fontSize: 60, textColor: "white", isItalic: true, shadowColor: "black", shadowBlur: 8, animation: "fadeIn", startTime: 0, endTime: dur }),
      makeText({ id: uuidv4(), text: "— Unknown", textX: w * 0.08, textY: h * 0.72, width: w * 0.84, height: 60, fontSize: 40, textColor: "rgba(255,255,255,0.65)", animation: "fadeIn", startTime: 0.8, endTime: dur }),
    ],
    buildBlurs: () => [],
  },

  // 8. Vertical Name Card (Reels)
  {
    id: "name-card-vertical",
    name: "Name Card",
    description: "Intro name card for vertical short-form video",
    category: "lower-third",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "9:16",
    emoji: "🪪",
    accentColor: "#10B981",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "Your Name", textX: w * 0.05, textY: h * 0.70, width: w * 0.9, height: 90, fontSize: 76, isBold: true, textColor: "white", shadowColor: "black", shadowBlur: 20, animation: "slideInLeft", startTime: 0, endTime: Math.min(dur, 4) }),
      makeText({ id: uuidv4(), text: "@yourhandle · Creator", textX: w * 0.05, textY: h * 0.79, width: w * 0.9, height: 55, fontSize: 40, textColor: "rgba(255,255,255,0.75)", backgroundColor: "rgba(16,185,129,0.75)", animation: "slideInLeft", startTime: 0.4, endTime: Math.min(dur, 4) }),
    ],
    buildBlurs: () => [],
  },

  // 9. Animated Text Only (no video)
  {
    id: "text-animator",
    name: "Text Animator",
    description: "Pure animated text sequence — no video needed",
    category: "minimal",
    needsVideo: false,
    videoSlots: [],
    aspectRatio: "16:9",
    emoji: "🎭",
    accentColor: "#F59E0B",
    buildTexts: (w, h) => [
      makeText({ id: uuidv4(), text: "TITLE TEXT", textX: w * 0.1, textY: h * 0.25, width: w * 0.8, height: 110, fontSize: 100, isBold: true, textColor: "white", animation: "zoomIn", startTime: 0, endTime: 3 }),
      makeText({ id: uuidv4(), text: "Supporting message line one", textX: w * 0.1, textY: h * 0.50, width: w * 0.8, height: 70, fontSize: 54, textColor: "#FBBF24", animation: "slideInLeft", startTime: 1, endTime: 4.5 }),
      makeText({ id: uuidv4(), text: "And a third point here", textX: w * 0.1, textY: h * 0.68, width: w * 0.8, height: 60, fontSize: 44, textColor: "rgba(255,255,255,0.75)", animation: "slideInLeft", startTime: 2, endTime: 5 }),
    ],
    buildBlurs: () => [],
  },

  // 10. Social CTA
  {
    id: "social-cta",
    name: "Social CTA",
    description: "End-screen call-to-action for any social platform",
    category: "social",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "16:9",
    emoji: "🔔",
    accentColor: "#EF4444",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "LIKE & SUBSCRIBE", textX: w * 0.05, textY: h * 0.28, width: w * 0.9, height: 100, fontSize: 88, isBold: true, textColor: "white", shadowColor: "#EF4444", shadowBlur: 30, shadowOffsetX: 0, shadowOffsetY: 0, animation: "bounceIn", startTime: Math.max(0, dur - 5), endTime: dur }),
      makeText({ id: uuidv4(), text: "🔔 Turn on notifications!", textX: w * 0.05, textY: h * 0.52, width: w * 0.9, height: 70, fontSize: 54, textColor: "white", backgroundColor: "rgba(239,68,68,0.85)", animation: "bounceIn", startTime: Math.max(0, dur - 4.5), endTime: dur }),
      makeText({ id: uuidv4(), text: "See you in the next one 👋", textX: w * 0.05, textY: h * 0.70, width: w * 0.9, height: 60, fontSize: 44, textColor: "rgba(255,255,255,0.8)", animation: "fadeIn", startTime: Math.max(0, dur - 4), endTime: dur }),
    ],
    buildBlurs: () => [],
  },

  // 11. Neon Glow
  {
    id: "neon-glow",
    name: "Neon Glow",
    description: "Electric neon glow text — perfect for gaming or nightlife content",
    category: "title",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "16:9",
    emoji: "⚡",
    accentColor: "#00F5FF",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "LEVEL UP", textX: w*0.1, textY: h*0.30, width: w*0.8, height: 130, fontSize: 110, isBold: true, textColor: "#00F5FF", shadowColor: "#00F5FF", shadowBlur: 40, shadowOffsetX: 0, shadowOffsetY: 0, animation: "flashIn", startTime: 0, endTime: dur }),
      makeText({ id: uuidv4(), text: "YOUR GAME", textX: w*0.1, textY: h*0.52, width: w*0.8, height: 100, fontSize: 80, isBold: true, textColor: "#FF00FF", shadowColor: "#FF00FF", shadowBlur: 35, animation: "flashIn", startTime: 0.3, endTime: dur }),
      makeText({ id: uuidv4(), text: "✦ Press Start ✦", textX: w*0.2, textY: h*0.73, width: w*0.6, height: 55, fontSize: 42, textColor: "#FFFF00", shadowColor: "#FFFF00", shadowBlur: 20, animation: "pulse", startTime: 0.8, endTime: dur }),
    ],
    buildBlurs: () => [],
  },

  // 12. Bold Stack (TikTok-style)
  {
    id: "bold-stack",
    name: "Bold Stack",
    description: "High-contrast stacked text — TikTok viral style",
    category: "social",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "9:16",
    emoji: "🔥",
    accentColor: "#FF6B35",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "WAIT FOR IT", textX: w*0.05, textY: h*0.38, width: w*0.9, height: 100, fontSize: 82, isBold: true, textColor: "white", backgroundColor: "rgba(0,0,0,0.85)", animation: "zoomIn", startTime: 0, endTime: Math.min(dur, 3) }),
      makeText({ id: uuidv4(), text: "🤯🤯🤯", textX: w*0.1, textY: h*0.52, width: w*0.8, height: 80, fontSize: 70, animation: "bounceIn", startTime: 0.5, endTime: Math.min(dur, 3) }),
      makeText({ id: uuidv4(), text: "POV: You did the thing", textX: w*0.05, textY: h*0.65, width: w*0.9, height: 70, fontSize: 52, textColor: "#FF6B35", isBold: true, shadowColor: "black", shadowBlur: 8, animation: "slideUp", startTime: 1, endTime: dur }),
    ],
    buildBlurs: () => [],
  },

  // 13. Elegant Minimal
  {
    id: "elegant-minimal",
    name: "Elegant Minimal",
    description: "Luxury brand feel — thin elegant typography",
    category: "minimal",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "16:9",
    emoji: "✨",
    accentColor: "#C9A84C",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "— COLLECTION —", textX: w*0.2, textY: h*0.30, width: w*0.6, height: 50, fontSize: 28, textColor: "#C9A84C", isItalic: true, animation: "slowFade", startTime: 0, endTime: dur }),
      makeText({ id: uuidv4(), text: "SIGNATURE", textX: w*0.1, textY: h*0.42, width: w*0.8, height: 110, fontSize: 96, isBold: true, textColor: "white", animation: "fadeIn", startTime: 0.5, endTime: dur }),
      makeText({ id: uuidv4(), text: "SERIES", textX: w*0.1, textY: h*0.63, width: w*0.8, height: 80, fontSize: 70, textColor: "rgba(255,255,255,0.5)", animation: "fadeIn", startTime: 1, endTime: dur }),
      makeText({ id: uuidv4(), text: "est. 2024", textX: w*0.35, textY: h*0.80, width: w*0.3, height: 35, fontSize: 22, isItalic: true, textColor: "#C9A84C", animation: "slowFade", startTime: 1.5, endTime: dur }),
    ],
    buildBlurs: () => [],
  },

  // 14. Sparkle Wiggle (social media shapes simulation)
  {
    id: "sparkle-wiggle",
    name: "Sparkle & Pop ✦",
    description: "Animated emoji shapes with bounce — great for Instagram Reels",
    category: "social",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "9:16",
    emoji: "💫",
    accentColor: "#F472B6",
    buildTexts: (w, h, dur) => [
      // Sparkle decorations (emoji as text = shape-like overlays)
      makeText({ id: uuidv4(), text: "✦", textX: w*0.08, textY: h*0.12, width: 80, height: 80, fontSize: 64, textColor: "#FBBF24", animation: "pulse", startTime: 0, endTime: dur }),
      makeText({ id: uuidv4(), text: "✦", textX: w*0.78, textY: h*0.15, width: 60, height: 60, fontSize: 48, textColor: "#F472B6", animation: "pulse", startTime: 0.3, endTime: dur }),
      makeText({ id: uuidv4(), text: "★", textX: w*0.85, textY: h*0.55, width: 60, height: 60, fontSize: 52, textColor: "#60A5FA", animation: "pulse", startTime: 0.6, endTime: dur }),
      makeText({ id: uuidv4(), text: "◆", textX: w*0.03, textY: h*0.65, width: 50, height: 50, fontSize: 44, textColor: "#34D399", animation: "pulse", startTime: 0.9, endTime: dur }),
      // Main text
      makeText({ id: uuidv4(), text: "This is SO", textX: w*0.05, textY: h*0.35, width: w*0.9, height: 90, fontSize: 74, isBold: true, textColor: "white", shadowColor: "black", shadowBlur: 12, animation: "bounceIn", startTime: 0.2, endTime: dur }),
      makeText({ id: uuidv4(), text: "CUTE ✨", textX: w*0.05, textY: h*0.49, width: w*0.9, height: 90, fontSize: 74, isBold: true, textColor: "#F472B6", shadowColor: "black", shadowBlur: 12, animation: "bounceIn", startTime: 0.5, endTime: dur }),
    ],
    buildBlurs: () => [],
  },

  // 15. Wiggle Title
  {
    id: "wiggle-title",
    name: "Wiggle Title 〜",
    description: "Fun wavy text with emoji shapes — YouTube Shorts style",
    category: "social",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "9:16",
    emoji: "〜",
    accentColor: "#A78BFA",
    buildTexts: (w, h, dur) => [
      // Wavy decorators
      makeText({ id: uuidv4(), text: "〰〰〰〰〰〰", textX: w*0.02, textY: h*0.26, width: w*0.96, height: 40, fontSize: 32, textColor: "#A78BFA", animation: "staggerIn", startTime: 0, endTime: dur }),
      makeText({ id: uuidv4(), text: "〰〰〰〰〰〰", textX: w*0.02, textY: h*0.64, width: w*0.96, height: 40, fontSize: 32, textColor: "#A78BFA", animation: "staggerIn", startTime: 0.2, endTime: dur }),
      // Main content
      makeText({ id: uuidv4(), text: "NEW VIDEO", textX: w*0.05, textY: h*0.30, width: w*0.9, height: 90, fontSize: 72, isBold: true, textColor: "white", animation: "slideUp", startTime: 0.3, endTime: dur }),
      makeText({ id: uuidv4(), text: "OUT NOW 🎬", textX: w*0.05, textY: h*0.45, width: w*0.9, height: 80, fontSize: 66, isBold: true, textColor: "#FBBF24", animation: "slideUp", startTime: 0.6, endTime: dur }),
      makeText({ id: uuidv4(), text: "Drop a 🔥 if you vibed", textX: w*0.05, textY: h*0.68, width: w*0.9, height: 65, fontSize: 50, textColor: "rgba(255,255,255,0.9)", animation: "fadeIn", startTime: 1.2, endTime: dur }),
    ],
    buildBlurs: () => [],
  },

  // 16. Breaking News Lower Third
  {
    id: "breaking-news",
    name: "Breaking News",
    description: "News ticker lower third with urgency styling",
    category: "lower-third",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "16:9",
    emoji: "📰",
    accentColor: "#EF4444",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "BREAKING", textX: w*0.02, textY: h*0.76, width: w*0.14, height: 45, fontSize: 28, isBold: true, textColor: "white", backgroundColor: "rgba(239,68,68,1.0)", animation: "zoomIn", startTime: 0, endTime: dur }),
      makeText({ id: uuidv4(), text: "Your headline or breaking news story goes right here", textX: w*0.18, textY: h*0.76, width: w*0.80, height: 45, fontSize: 28, isBold: true, textColor: "white", backgroundColor: "rgba(15,17,23,0.9)", animation: "slideIn", startTime: 0.3, endTime: dur }),
      makeText({ id: uuidv4(), text: "LIVE", textX: w*0.02, textY: h*0.69, width: w*0.06, height: 32, fontSize: 20, isBold: true, textColor: "white", backgroundColor: "rgba(239,68,68,1.0)", animation: "flashIn", startTime: 0, endTime: dur }),
      makeText({ id: uuidv4(), text: "Source: Your Network · Just now", textX: w*0.10, textY: h*0.695, width: w*0.60, height: 28, fontSize: 18, textColor: "rgba(255,255,255,0.7)", animation: "fadeIn", startTime: 0.5, endTime: dur }),
    ],
    buildBlurs: () => [],
  },

  // 17. Gradient Word Art
  {
    id: "gradient-word",
    name: "Word Art Pop",
    description: "Bold stacked words with color contrast — editorial style",
    category: "title",
    needsVideo: false,
    videoSlots: [],
    aspectRatio: "1:1",
    emoji: "🎨",
    accentColor: "#EC4899",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "MAKE", textX: w*0.05, textY: h*0.10, width: w*0.9, height: 130, fontSize: 120, isBold: true, textColor: "#EC4899", animation: "zoomIn", startTime: 0, endTime: dur }),
      makeText({ id: uuidv4(), text: "IT", textX: w*0.05, textY: h*0.32, width: w*0.9, height: 120, fontSize: 110, isBold: true, textColor: "white", animation: "zoomIn", startTime: 0.15, endTime: dur }),
      makeText({ id: uuidv4(), text: "COUNT", textX: w*0.05, textY: h*0.52, width: w*0.9, height: 120, fontSize: 110, isBold: true, textColor: "#FBBF24", animation: "zoomIn", startTime: 0.3, endTime: dur }),
      makeText({ id: uuidv4(), text: "✦ every. single. day. ✦", textX: w*0.05, textY: h*0.76, width: w*0.9, height: 55, fontSize: 38, isItalic: true, textColor: "rgba(255,255,255,0.6)", animation: "slowFade", startTime: 0.8, endTime: dur }),
    ],
    buildBlurs: () => [],
  },

  // 18. Countdown Hype
  {
    id: "countdown-hype",
    name: "Countdown Hype",
    description: "Staggered reveal with countdown feel — event or launch",
    category: "title",
    needsVideo: true,
    videoSlots: [{ label: "Main clip", durationSecs: 10 }],
    aspectRatio: "16:9",
    emoji: "⏱️",
    accentColor: "#F59E0B",
    buildTexts: (w, h, dur) => [
      makeText({ id: uuidv4(), text: "GET READY", textX: w*0.1, textY: h*0.20, width: w*0.8, height: 90, fontSize: 78, isBold: true, textColor: "#F59E0B", animation: "zoomIn", startTime: 0, endTime: dur }),
      makeText({ id: uuidv4(), text: "FOR THE BIGGEST", textX: w*0.05, textY: h*0.38, width: w*0.9, height: 80, fontSize: 68, isBold: true, textColor: "white", animation: "slideIn", startTime: 0.4, endTime: dur }),
      makeText({ id: uuidv4(), text: "DROP OF 2025", textX: w*0.05, textY: h*0.55, width: w*0.9, height: 80, fontSize: 68, isBold: true, textColor: "#F59E0B", animation: "slideIn", startTime: 0.8, endTime: dur }),
      makeText({ id: uuidv4(), text: "🚀 Coming Soon 🚀", textX: w*0.15, textY: h*0.76, width: w*0.7, height: 55, fontSize: 42, textColor: "rgba(255,255,255,0.8)", animation: "fadeIn", startTime: 1.4, endTime: dur }),
    ],
    buildBlurs: () => [],
  },
];
