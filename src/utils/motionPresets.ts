/**
 * Motion presets — animation + transition catalog for the admin
 * (Settings → Studio) UI and the app's pickers.
 *
 * `DEFAULT_ANIMATION_RECORDS`/`DEFAULT_TRANSITION_RECORDS` now cover the
 * FULL engine set (every key `animationOptionsConstants.ts`/
 * `transitionOptionsConstants.ts` list — ~50 animations, 16 transitions),
 * not a short curated subset — every one of them is importable in Settings
 * and gets real keyframes baked in (see the UPDATE note below). `engineKey`
 * is kept only as a fixed reference id (which original engine entry a
 * preset's keyframes were seeded from) — it is NOT a live, re-pickable
 * control in the editor UI (MotionPresetEditorModal has no engine-key
 * dropdown); once a preset exists, its `keyframes` ARE its definition, and
 * `engineKey` is just a label showing where it started from.
 *
 * UPDATE: BOTH animation and transition presets now carry real, editable
 * keyframe data (`keyframes` below) — an animation preset's is baked exactly
 * from `computeAnimState` by sampling it (see templateAnimationRecipes.ts —
 * genuinely faithful, not hand-approximated); a transition preset's is a
 * best-effort single-object approximation (see transitionRecipes.ts — a
 * transition is fundamentally a two-clip compositing operation, so its
 * REAL two-clip math still lives in code, this is a representative x/y/
 * scale/opacity/blur approximation for viewing/editing purposes). Both are
 * Settings-side authoring/preview data, NOT consumed by the main editor's
 * pickers (AnimationSelection.tsx / ClipTransitionSelector.tsx), which
 * still just apply `engineKey` directly.
 */
import { TemplateJsonKeyframeTrack } from "./templateInterpreter";
import { animationOptions } from "./animationOptionsConstants";
import { transitionOptions } from "./transitionOptionsConstants";

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
  // Real, editable keyframe data (same shape templates use, see
  // templateInterpreter.ts) auto-seeded from `engineKey` — faithfully for
  // animations (templateAnimationRecipes.ts samples computeAnimState
  // directly), approximately for transitions (transitionRecipes.ts — see
  // its file comment for why an exact reproduction isn't possible).
  // Settings-side authoring/preview data only — the main editor's pickers
  // still apply `engineKey` directly (AnimationSelection.tsx /
  // ClipTransitionSelector.tsx), neither reads this.
  keyframes?: TemplateJsonKeyframeTrack[];
}

export interface MotionPresetRecord {
  id: string;
  kind: "animation" | "transition";
  name: string;
  preset_json: { engineKey: string; description?: string; icon?: string; keyframes?: TemplateJsonKeyframeTrack[] };
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
    keyframes: record.preset_json?.keyframes,
  };
}

// Every animation/transition the engine has, not a short curated subset —
// the user wants the FULL catalog visible/importable in Settings, each one
// convertible to real keyframes (see templateAnimationRecipes.ts /
// transitionRecipes.ts). Derived straight from the same option lists the
// (legacy, full) editor pickers use, so this can never drift out of sync
// with "every key computeAnimState/applyTransition actually supports" —
// `name` is EXACTLY the engine key's label, `engineKey` is a fixed
// reference id only (see the "no engine-key dropdown" note on
// MotionPresetEditorModal — it's not a live, re-pickable control anymore).
export const DEFAULT_ANIMATION_RECORDS: MotionPresetRecord[] = animationOptions
  .filter((a) => a.key !== "none")
  .map((a, i) => ({
    id: `anim-${a.key}`,
    kind: "animation" as const,
    name: a.name,
    preset_json: { engineKey: a.key, description: `Built-in "${a.name}" animation.`, icon: "Sparkles" },
    is_active: true,
    sort_order: i,
  }));

export const DEFAULT_TRANSITION_RECORDS: MotionPresetRecord[] = transitionOptions
  .filter((t) => t.key !== "none")
  .map((t, i) => ({
    id: `trans-${t.key}`,
    kind: "transition" as const,
    name: t.name,
    preset_json: { engineKey: t.key, description: `Built-in "${t.name}" transition.`, icon: "Blend" },
    is_active: true,
    sort_order: i,
  }));

export const DEFAULT_ANIMATION_PRESETS: MotionPreset[] = DEFAULT_ANIMATION_RECORDS.map(buildMotionPresetFromRecord);
export const DEFAULT_TRANSITION_PRESETS: MotionPreset[] = DEFAULT_TRANSITION_RECORDS.map(buildMotionPresetFromRecord);

// Filter presets don't fit the animation/transition MotionPreset shape
// (no engineKey — they're color-grade values applied directly via
// ColorAdjustPanel/buildCanvasFilterString), so they're just records; the
// admin UI reads preset_json.{brightness,contrast,saturation,temperature}
// directly rather than going through buildMotionPresetFromRecord.
export interface FilterPresetRecord {
  id: string;
  kind: "filter";
  name: string;
  preset_json: { brightness: number; contrast: number; saturation: number; temperature: number };
  is_active?: boolean;
  sort_order?: number;
}

export const DEFAULT_FILTER_RECORDS: FilterPresetRecord[] = [
  { id: "filter-warm", kind: "filter", name: "Warm",
    preset_json: { brightness: 1.05, contrast: 1.05, saturation: 1.1, temperature: 15 },
    is_active: true, sort_order: 0 },
  { id: "filter-cool", kind: "filter", name: "Cool",
    preset_json: { brightness: 1, contrast: 1.05, saturation: 0.95, temperature: -15 },
    is_active: true, sort_order: 1 },
  { id: "filter-vivid", kind: "filter", name: "Vivid",
    preset_json: { brightness: 1.05, contrast: 1.15, saturation: 1.35, temperature: 0 },
    is_active: true, sort_order: 2 },
  { id: "filter-high-contrast", kind: "filter", name: "High Contrast",
    preset_json: { brightness: 1, contrast: 1.35, saturation: 1.05, temperature: 0 },
    is_active: true, sort_order: 3 },
  { id: "filter-vintage", kind: "filter", name: "Vintage",
    preset_json: { brightness: 1.05, contrast: 0.9, saturation: 0.75, temperature: 10 },
    is_active: true, sort_order: 4 },
  { id: "filter-mono", kind: "filter", name: "Black & White",
    preset_json: { brightness: 1.02, contrast: 1.1, saturation: 0, temperature: 0 },
    is_active: true, sort_order: 5 },
];
