/**
 * Curated color filter presets — Instagram/TikTok-style one-tap looks.
 * Reuses the exact same `motion_presets` table, admin CRUD routes, and
 * "built-in defaults merged with anything published from /settings"
 * pattern as animations/transitions (see motionPresets.ts) — just with
 * `kind: "filter"` and `preset_json` holding literal ColorAdjustments
 * values instead of a reference to engine math, since a filter genuinely
 * IS just a set of parameter values, nothing to look up in code.
 */
import { ColorAdjustments } from "../types/types";

export interface FilterPreset {
  id: string;
  name: string;
  description: string;
  adjustments: ColorAdjustments;
}

export interface FilterPresetRecord {
  id: string;
  kind: "filter";
  name: string;
  preset_json: ColorAdjustments & { description?: string };
  is_active?: boolean;
  sort_order?: number;
}

export function buildFilterPresetFromRecord(record: FilterPresetRecord): FilterPreset {
  const p = record.preset_json ?? ({} as ColorAdjustments);
  return {
    id: record.id,
    name: record.name,
    description: p.description ?? "",
    adjustments: {
      brightness: p.brightness ?? 1,
      contrast: p.contrast ?? 1,
      saturation: p.saturation ?? 1,
      temperature: p.temperature ?? 0,
    },
  };
}

export const DEFAULT_FILTER_RECORDS: FilterPresetRecord[] = [
  { id: "filter-none", kind: "filter", name: "None",
    preset_json: { brightness: 1, contrast: 1, saturation: 1, temperature: 0, description: "No adjustment" },
    is_active: true, sort_order: 0 },
  { id: "filter-vivid", kind: "filter", name: "Vivid",
    preset_json: { brightness: 1.05, contrast: 1.15, saturation: 1.35, temperature: 5, description: "Punchy, saturated" },
    is_active: true, sort_order: 1 },
  { id: "filter-warm", kind: "filter", name: "Warm",
    preset_json: { brightness: 1.03, contrast: 1.05, saturation: 1.1, temperature: 45, description: "Golden-hour push" },
    is_active: true, sort_order: 2 },
  { id: "filter-cool", kind: "filter", name: "Cool",
    preset_json: { brightness: 1.0, contrast: 1.08, saturation: 1.0, temperature: -40, description: "Crisp, blue-leaning" },
    is_active: true, sort_order: 3 },
  { id: "filter-cinematic", kind: "filter", name: "Cinematic",
    preset_json: { brightness: 0.95, contrast: 1.25, saturation: 0.85, temperature: 12, description: "Desaturated, high contrast" },
    is_active: true, sort_order: 4 },
  { id: "filter-vintage", kind: "filter", name: "Vintage",
    preset_json: { brightness: 1.05, contrast: 0.9, saturation: 0.75, temperature: 30, description: "Faded, warm nostalgia" },
    is_active: true, sort_order: 5 },
  { id: "filter-noir", kind: "filter", name: "Noir",
    preset_json: { brightness: 0.92, contrast: 1.35, saturation: 0, temperature: 0, description: "High-contrast black & white" },
    is_active: true, sort_order: 6 },
  { id: "filter-fade", kind: "filter", name: "Fade",
    preset_json: { brightness: 1.1, contrast: 0.82, saturation: 0.8, temperature: -8, description: "Soft, washed-out look" },
    is_active: true, sort_order: 7 },
];

export const DEFAULT_FILTER_PRESETS: FilterPreset[] = DEFAULT_FILTER_RECORDS.map(buildFilterPresetFromRecord);
