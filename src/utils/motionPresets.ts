/**
 * Motion presets — curated animation + transition menu entries.
 *
 * IMPORTANT — what's actually JSON-configurable here vs. what isn't:
 * The underlying MATH for each animation (AnimationEngine.ts's
 * computeAnimState switch) and the FFmpeg xfade mapping for each transition
 * (clientRender.ts's FFMPEG_XFADE_MAP) both stay in code — real canvas
 * interpolation and FFmpeg filter graphs aren't things you can safely
 * reinvent from arbitrary admin-authored JSON without a much bigger,
 * riskier engine rewrite. What's genuinely JSON-configurable, the same way
 * a template's JSON doesn't reinvent FFmpeg either: WHICH curated presets
 * show up in the app's animation/transition pickers, their labels, their
 * grouping, and their order. Each preset's `engineKey` just has to name one
 * of the animation/transition keys the engine already knows how to compute.
 *
 * This is deliberately a SHORT curated list (5-6 each), not the full
 * 50-animation/16-transition legacy set those pickers used to show — same
 * "a few polished options, not an overwhelming grid" philosophy as the
 * template rebuild.
 */
export type MotionIconName =
  | "Sparkles" | "ArrowUp" | "Zap" | "ZoomIn" | "Activity" | "Type"
  | "Blend" | "Moon" | "ArrowRight" | "ArrowLeftRight";

export interface MotionPreset {
  id: string;
  kind: "animation" | "transition";
  name: string;
  engineKey: string;      // must match a case in AnimationEngine.ts / FFMPEG_XFADE_MAP
  description: string;
  icon: MotionIconName;
}

export interface MotionPresetRecord {
  id: string;
  kind: "animation" | "transition";
  name: string;
  preset_json: { engineKey: string; description?: string; icon?: string };
  is_active?: boolean;
  sort_order?: number;
}

export function buildMotionPresetFromRecord(record: MotionPresetRecord): MotionPreset {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    engineKey: record.preset_json?.engineKey ?? "none",
    description: record.preset_json?.description ?? "",
    icon: (record.preset_json?.icon as MotionIconName) ?? "Sparkles",
  };
}

export const DEFAULT_ANIMATION_RECORDS: MotionPresetRecord[] = [
  { id: "anim-fade-in", kind: "animation", name: "Fade In",
    preset_json: { engineKey: "fadeIn", description: "Simple, clean opacity fade", icon: "Sparkles" },
    is_active: true, sort_order: 0 },
  { id: "anim-slide-up", kind: "animation", name: "Slide Up",
    preset_json: { engineKey: "slideUp", description: "Rises in from below", icon: "ArrowUp" },
    is_active: true, sort_order: 1 },
  { id: "anim-pop-in", kind: "animation", name: "Pop In",
    preset_json: { engineKey: "popInUp", description: "Punchy scale-in with overshoot", icon: "Zap" },
    is_active: true, sort_order: 2 },
  { id: "anim-zoom-in", kind: "animation", name: "Zoom In",
    preset_json: { engineKey: "zoomIn", description: "Grows from center", icon: "ZoomIn" },
    is_active: true, sort_order: 3 },
  { id: "anim-bounce-in", kind: "animation", name: "Bounce In",
    preset_json: { engineKey: "bounceIn", description: "Playful spring bounce", icon: "Activity" },
    is_active: true, sort_order: 4 },
  { id: "anim-typewriter", kind: "animation", name: "Typewriter",
    preset_json: { engineKey: "typewriter", description: "Characters reveal one at a time", icon: "Type" },
    is_active: true, sort_order: 5 },
  { id: "anim-shake", kind: "animation", name: "Shake",
    preset_json: { engineKey: "shake", description: "Energetic continuous jitter", icon: "Zap" },
    is_active: true, sort_order: 6 },
  { id: "anim-wiggle", kind: "animation", name: "Wiggle",
    preset_json: { engineKey: "wiggle", description: "Playful continuous rotation, TikTok-style", icon: "Activity" },
    is_active: true, sort_order: 7 },
  { id: "anim-sparkle", kind: "animation", name: "Sparkle",
    preset_json: { engineKey: "sparkle", description: "Twinkling shimmer pulse", icon: "Sparkles" },
    is_active: true, sort_order: 8 },
];

export const DEFAULT_TRANSITION_RECORDS: MotionPresetRecord[] = [
  { id: "trans-cross-dissolve", kind: "transition", name: "Cross Dissolve",
    preset_json: { engineKey: "crossDissolve", description: "Classic smooth crossfade", icon: "Blend" },
    is_active: true, sort_order: 0 },
  { id: "trans-dip-black", kind: "transition", name: "Dip to Black",
    preset_json: { engineKey: "dipToBlack", description: "Fades through black", icon: "Moon" },
    is_active: true, sort_order: 1 },
  { id: "trans-wipe", kind: "transition", name: "Wipe",
    preset_json: { engineKey: "wipeLeftToRight", description: "Sweeps left to right", icon: "ArrowRight" },
    is_active: true, sort_order: 2 },
  { id: "trans-slide", kind: "transition", name: "Slide",
    preset_json: { engineKey: "slideIn", description: "Next clip slides in over current", icon: "ArrowLeftRight" },
    is_active: true, sort_order: 3 },
  { id: "trans-zoom", kind: "transition", name: "Zoom",
    preset_json: { engineKey: "zoom", description: "Zooms through into the next clip", icon: "ZoomIn" },
    is_active: true, sort_order: 4 },
];

export const DEFAULT_ANIMATION_PRESETS: MotionPreset[] = DEFAULT_ANIMATION_RECORDS.map(buildMotionPresetFromRecord);
export const DEFAULT_TRANSITION_PRESETS: MotionPreset[] = DEFAULT_TRANSITION_RECORDS.map(buildMotionPresetFromRecord);
