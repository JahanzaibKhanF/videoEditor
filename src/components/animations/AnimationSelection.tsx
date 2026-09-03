"use client";

/**
 * AnimationSelection — animation picker.
 *
 * Every animation the engine supports is shown at once in one searchable
 * grid: the curated presets (built-in, merged with anything published from
 * /settings → Motion Presets — "DB wins on id collision") come first, then
 * the rest of the engine's animation set. The motion math for every entry
 * lives in AnimationEngine.ts; the JSON only controls the order/labels of
 * the curated ones that lead the list.
 */
import { useEffect, useMemo, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { animationOptions } from "../../utils/animationOptionsConstants";
import { DEFAULT_ANIMATION_PRESETS, buildMotionPresetFromRecord, MotionPreset, MotionPresetRecord } from "../../utils/motionPresets";
import { Search } from "@/utils/icons";
import AnimationPreviewTile from "./AnimationPreviewTile";
import SectionLabel from "../ui/SectionLabel";

export default function AnimationSelection() {
  const { selectedImageID, selectedTextId, imagesDetails, textsDetails, setImagesDetails, setTextsDetails } = useAppDetailsContext();
  const showAnimationOptionsFor = selectedImageID ? "image" : "text";
  const selectedAnimation = showAnimationOptionsFor === "image"
    ? imagesDetails.find(img => img.id === selectedImageID)?.animation
    : textsDetails.find(txt => txt.id === selectedTextId)?.animation;
  const isObjectSelected = selectedImageID !== null || selectedTextId !== null;

  const [dbPresets, setDbPresets] = useState<MotionPreset[]>([]);
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

  const curated: MotionPreset[] = useMemo(() => {
    const byId = new Map<string, MotionPreset>();
    for (const p of DEFAULT_ANIMATION_PRESETS) byId.set(p.id, p);
    for (const p of dbPresets) byId.set(p.id, p);
    return Array.from(byId.values());
  }, [dbPresets]);

  // Full menu — curated engineKeys first, then every remaining engine
  // animation, deduped so a curated preset isn't listed twice.
  const allItems = useMemo(() => {
    const seen = new Set<string>(["none"]);
    const items: { key: string; label: string }[] = [];
    for (const p of curated) {
      if (seen.has(p.engineKey)) continue;
      seen.add(p.engineKey);
      items.push({ key: p.engineKey, label: p.name });
    }
    for (const a of animationOptions) {
      if (seen.has(a.key)) continue;
      seen.add(a.key);
      items.push({ key: a.key, label: a.name });
    }
    return items;
  }, [curated]);

  const q = search.trim().toLowerCase();
  const filtered = q ? allItems.filter(i => i.label.toLowerCase().includes(q)) : allItems;

  const handleAnimationChange = (key: string) => {
    if (textsDetails.length === 0 && imagesDetails.length === 0) return;
    if (!isObjectSelected) return;
    if (showAnimationOptionsFor === "image") setImagesDetails(prev => prev.map(img => img.id === selectedImageID ? { ...img, animation: key } : img));
    else setTextsDetails(prev => prev.map(txt => txt.id === selectedTextId ? { ...txt, animation: key } : txt));
  };

  return (
    <div>
      <SectionLabel
        inset={false}
        className="mb-1.5"
        right={<span className="text-micro text-ink-faint font-medium">hover to preview · click to apply</span>}
      >
        {showAnimationOptionsFor} Animations
      </SectionLabel>

      {!isObjectSelected && (
        <div className="mb-2.5 rounded-lg border border-dashed border-studio-border px-2.5 py-1.5 text-mini text-ink-faint text-center leading-snug">
          Select a text or image layer first, then tap an animation.
        </div>
      )}

      <div className="relative mb-2.5">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          type="text"
          placeholder={`Search ${allItems.length} animations…`}
          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-studio-border bg-studio-raised text-ink-primary text-mini outline-none font-[inherit] focus:border-signal placeholder:text-ink-muted"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {!q && (
          <AnimationPreviewTile
            animationKey="none" label="None" mode={showAnimationOptionsFor}
            active={!selectedAnimation || selectedAnimation === "none"}
            onClick={() => handleAnimationChange("none")}
          />
        )}
        {filtered.map(item => (
          <AnimationPreviewTile
            key={item.key}
            animationKey={item.key} label={item.label} mode={showAnimationOptionsFor}
            active={selectedAnimation === item.key}
            onClick={() => handleAnimationChange(item.key)}
          />
        ))}
      </div>

      {q && filtered.length === 0 && (
        <div className="mt-4 text-center text-ink-muted text-mini">No animations match “{search}”.</div>
      )}
    </div>
  );
}
