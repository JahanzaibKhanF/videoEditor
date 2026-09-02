"use client";

/**
 * ColorAdjustPanel — filter presets (one-tap looks) + manual brightness/
 * contrast/saturation/temperature sliders. Shared between the selected-clip
 * and selected-image property cards in PropertiesPanel.tsx so both get
 * identical grading controls, same as any normal video editor.
 */
import { useEffect, useState } from "react";
import { ColorAdjustments, DEFAULT_COLOR_ADJUSTMENTS } from "../../types/types";
import { DEFAULT_FILTER_PRESETS, FilterPreset, buildFilterPresetFromRecord, FilterPresetRecord } from "../../utils/filterPresets";
import Slider from "../ui/Slider";
import { Palette, RotateCcw } from "@/utils/icons";

interface Props {
  adjustments: ColorAdjustments | undefined;
  onChange: (adj: ColorAdjustments) => void;
}

export default function ColorAdjustPanel({ adjustments, onChange }: Props) {
  const [dbPresets, setDbPresets] = useState<FilterPreset[]>([]);
  const a = adjustments ?? DEFAULT_COLOR_ADJUSTMENTS;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/motion-presets?kind=filter")
      .then(res => res.ok ? res.json() : { presets: [] })
      .then((data) => {
        if (cancelled) return;
        const records: FilterPresetRecord[] = Array.isArray(data.presets) ? data.presets : [];
        setDbPresets(records.map(buildFilterPresetFromRecord));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const curated: FilterPreset[] = (() => {
    const byId = new Map<string, FilterPreset>();
    for (const p of DEFAULT_FILTER_PRESETS) byId.set(p.id, p);
    for (const p of dbPresets) byId.set(p.id, p);
    return Array.from(byId.values());
  })();

  const isDefault = a.brightness === 1 && a.contrast === 1 && a.saturation === 1 && a.temperature === 0;
  const set = (patch: Partial<ColorAdjustments>) => onChange({ ...a, ...patch });

  const row = "flex items-center gap-2.5";
  const rowLabel = "text-[11px] text-ink-muted font-semibold min-w-[74px]";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          <Palette size={11} /> Color
        </div>
        {!isDefault && (
          <button onClick={() => onChange(DEFAULT_COLOR_ADJUSTMENTS)}
            className="flex items-center gap-1 text-[10.5px] font-semibold text-ink-faint hover:text-signal transition-colors">
            <RotateCcw size={10} /> Reset
          </button>
        )}
      </div>

      {/* Filter preset swatches */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
        {curated.map(preset => {
          const active = a.brightness === preset.adjustments.brightness && a.contrast === preset.adjustments.contrast
            && a.saturation === preset.adjustments.saturation && a.temperature === preset.adjustments.temperature;
          return (
            <button key={preset.id}
              title={preset.description}
              onClick={() => onChange({ ...preset.adjustments })}
              className={`flex-shrink-0 flex flex-col items-center gap-1 w-14 py-1.5 rounded-lg border transition-all ${
                active ? "border-signal bg-signal/10" : "border-studio-border hover:border-signal/40"
              }`}>
              <div className="w-8 h-8 rounded-full"
                style={{
                  background: "linear-gradient(135deg, #FFB648, #8B5CFF)",
                  filter: `brightness(${preset.adjustments.brightness}) contrast(${preset.adjustments.contrast}) saturate(${preset.adjustments.saturation})`,
                }} />
              <span className="text-[9px] font-semibold text-ink-secondary truncate w-full text-center">{preset.name}</span>
            </button>
          );
        })}
      </div>

      {/* Manual sliders */}
      <div className="flex flex-col gap-2.5">
        <div className={row}>
          <span className={rowLabel}>Brightness</span>
          <Slider value={a.brightness} min={0} max={2} onChange={v => set({ brightness: v })} />
          <span className="text-[10.5px] text-ink-faint font-mono min-w-[30px] text-right">{Math.round(a.brightness * 100)}</span>
        </div>
        <div className={row}>
          <span className={rowLabel}>Contrast</span>
          <Slider value={a.contrast} min={0} max={2} onChange={v => set({ contrast: v })} />
          <span className="text-[10.5px] text-ink-faint font-mono min-w-[30px] text-right">{Math.round(a.contrast * 100)}</span>
        </div>
        <div className={row}>
          <span className={rowLabel}>Saturation</span>
          <Slider value={a.saturation} min={0} max={2} onChange={v => set({ saturation: v })} />
          <span className="text-[10.5px] text-ink-faint font-mono min-w-[30px] text-right">{Math.round(a.saturation * 100)}</span>
        </div>
        <div className={row}>
          <span className={rowLabel}>Temperature</span>
          <Slider value={a.temperature} min={-100} max={100} onChange={v => set({ temperature: v })} />
          <span className="text-[10.5px] text-ink-faint font-mono min-w-[30px] text-right">{a.temperature > 0 ? "+" : ""}{Math.round(a.temperature)}</span>
        </div>
      </div>
    </div>
  );
}
