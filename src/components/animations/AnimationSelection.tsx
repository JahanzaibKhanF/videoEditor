"use client";

/**
 * AnimationSelection — curated animation picker.
 *
 * Shows a short, curated set of animations by default (built-in 6, merged
 * with anything published from /settings → Motion Presets — same "DB wins
 * on id collision" merge pattern as TemplatesPanel). The underlying motion
 * math for every preset still lives in AnimationEngine.ts; what's
 * JSON-editable from the admin panel is which curated presets show up
 * here, their names, and their order — not the interpolation math itself.
 *
 * The full legacy grid of every animation the engine supports is still
 * available behind "Browse all animations" for anyone who wants more than
 * the curated set.
 */
import { useEffect, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { animationOptions } from "../../utils/animationOptionsConstants";
import { DEFAULT_ANIMATION_PRESETS, buildMotionPresetFromRecord, MotionPreset, MotionPresetRecord } from "../../utils/motionPresets";
import * as Icons from "@/utils/icons";
import { ChevronDown, ChevronUp } from "@/utils/icons";

export default function AnimationSelection() {
  const { selectedImageID, selectedTextId, imagesDetails, textsDetails, setImagesDetails, setTextsDetails } = useAppDetailsContext();
  const showAnimationOptionsFor = selectedImageID ? "image" : "text";
  const selectedAnimation = showAnimationOptionsFor === "image"
    ? imagesDetails.find(img => img.id === selectedImageID)?.animation
    : textsDetails.find(txt => txt.id === selectedTextId)?.animation;
  const isObjectSelected = selectedImageID !== null || selectedTextId !== null;

  const [dbPresets, setDbPresets] = useState<MotionPreset[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/motion-presets?kind=animation")
      .then(res => res.ok ? res.json() : { presets: [] })
      .then((data) => {
        if (cancelled) return;
        const records: MotionPresetRecord[] = Array.isArray(data.presets) ? data.presets : [];
        setDbPresets(records.map(buildMotionPresetFromRecord));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const curated: MotionPreset[] = (() => {
    const byId = new Map<string, MotionPreset>();
    for (const p of DEFAULT_ANIMATION_PRESETS) byId.set(p.id, p);
    for (const p of dbPresets) byId.set(p.id, p);
    return Array.from(byId.values());
  })();

  const handleAnimationChange = (key: string) => {
    if (textsDetails.length === 0 && imagesDetails.length === 0) return;
    if (!isObjectSelected) return;
    if (showAnimationOptionsFor === "image") setImagesDetails(prev => prev.map(img => img.id === selectedImageID ? { ...img, animation: key } : img));
    else setTextsDetails(prev => prev.map(txt => txt.id === selectedTextId ? { ...txt, animation: key } : txt));
  };

  const filtered = animationOptions.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-[.7px] text-ink-muted mb-2.5 capitalize">
        {showAnimationOptionsFor} Animations
      </div>

      {/* Curated grid — the default, primary experience */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <button
          onClick={() => handleAnimationChange("none")}
          className={`border-[1.5px] rounded-lg py-2.5 px-1.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all gap-1
            ${(!selectedAnimation || selectedAnimation === "none")
              ? "border-signal bg-signal/10 text-signal"
              : "border-studio-border bg-studio-raised text-ink-secondary hover:bg-studio-hover hover:border-signal/40"}`}>
          <Icons.Ban size={15} />
          <div className="text-[10px] font-semibold">None</div>
        </button>
        {curated.map(preset => {
          const active = selectedAnimation === preset.engineKey;
          const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[preset.icon] ?? Icons.Sparkles;
          return (
            <button key={preset.id}
              title={preset.description}
              onClick={() => handleAnimationChange(preset.engineKey)}
              className={`border-[1.5px] rounded-lg py-2.5 px-1.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all gap-1
                ${active
                  ? "border-signal bg-signal/10 text-signal"
                  : "border-studio-border bg-studio-raised text-ink-secondary hover:bg-studio-hover hover:border-signal/40"}`}>
              <Icon size={15} />
              <div className="text-[10px] font-semibold">{preset.name}</div>
            </button>
          );
        })}
      </div>

      {/* Expandable full legacy grid, for anyone who wants more than the curated set */}
      <button
        onClick={() => setShowAll(v => !v)}
        className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-ink-muted hover:text-signal py-1.5 transition-colors"
      >
        {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {showAll ? "Hide full animation library" : "Browse all animations"}
      </button>

      {showAll && (
        <div className="mt-2.5 pt-3 border-t border-studio-border">
          <input value={search} onChange={e => setSearch(e.target.value)} type="text" placeholder="Search animations…"
            className="w-full px-3 py-2 rounded-lg border border-studio-border bg-studio-raised text-ink-primary text-[12px] outline-none font-[inherit] focus:border-signal mb-3 placeholder:text-ink-muted" />
          <div className="grid grid-cols-3 gap-2">
            {filtered.map(anim => {
              const active = selectedAnimation === anim.key;
              const Icon = anim.Icon;
              return (
                <div key={anim.key}
                  onClick={() => handleAnimationChange(anim.key)}
                  className={`border-[1.5px] rounded-lg py-2 px-1.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all gap-1
                    ${active
                      ? "border-signal bg-signal/10 text-signal"
                      : "border-studio-border bg-studio-raised text-ink-secondary hover:bg-studio-hover hover:border-signal/40"}`}>
                  {Icon && <Icon size={14} />}
                  <div className="text-[10px] font-medium">{anim.name}</div>
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && <div className="mt-4 text-center text-ink-muted text-[12px] italic">No animations found.</div>}
        </div>
      )}
    </div>
  );
}
