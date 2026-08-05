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
import { ChevronDown, ChevronUp } from "@/utils/icons";
import AnimationPreviewTile from "./AnimationPreviewTile";

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
      <div className="text-[10.5px] font-bold uppercase tracking-[.7px] text-ink-muted mb-1 capitalize">
        {showAnimationOptionsFor} Animations
      </div>
      <div className="text-[10.5px] text-ink-faint mb-2.5">
        Hover any tile to preview it playing — click to apply.
      </div>

      {/* Curated grid — the default, primary experience */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <AnimationPreviewTile
          animationKey="none" label="None" mode={showAnimationOptionsFor}
          active={!selectedAnimation || selectedAnimation === "none"}
          onClick={() => handleAnimationChange("none")}
        />
        {curated.map(preset => (
          <AnimationPreviewTile
            key={preset.id}
            animationKey={preset.engineKey} label={preset.name} mode={showAnimationOptionsFor}
            active={selectedAnimation === preset.engineKey}
            onClick={() => handleAnimationChange(preset.engineKey)}
          />
        ))}
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
            {filtered.map(anim => (
              <AnimationPreviewTile
                key={anim.key}
                animationKey={anim.key} label={anim.name} mode={showAnimationOptionsFor}
                active={selectedAnimation === anim.key}
                onClick={() => handleAnimationChange(anim.key)}
              />
            ))}
          </div>
          {filtered.length === 0 && <div className="mt-4 text-center text-ink-muted text-[12px] italic">No animations found.</div>}
        </div>
      )}
    </div>
  );
}
