"use client";

/**
 * ClipTransitionSelector — transition picker.
 *
 * Same shape as AnimationSelection: every transition the engine supports in
 * one searchable grid, curated presets (built-in, merged with anything
 * published from /settings → Motion Presets) first, then the rest. The
 * xfade math / FFMPEG_XFADE_MAP stay in code — JSON only controls which
 * curated presets lead the list, and their labels/order.
 */
import { useEffect, useMemo, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { transitionOptions } from "../../utils/transitionOptionsConstants";
import { DEFAULT_TRANSITION_PRESETS, buildMotionPresetFromRecord, MotionPreset, MotionPresetRecord } from "../../utils/motionPresets";
import { toast } from "react-toastify";
import { Search } from "@/utils/icons";
import TransitionPreviewTile from "./TransitionPreviewTile";
import SectionLabel from "../ui/SectionLabel";

export default function ClipTransitionSelector() {
  const { selectedClipId, clipsDetails, setClipsDetails } = useAppDetailsContext();
  const selectedTransition = clipsDetails.find(c => c.id === selectedClipId)?.transition || "none";

  const [dbPresets, setDbPresets] = useState<MotionPreset[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/motion-presets?kind=transition")
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
    for (const p of DEFAULT_TRANSITION_PRESETS) byId.set(p.id, p);
    for (const p of dbPresets) byId.set(p.id, p);
    return Array.from(byId.values());
  }, [dbPresets]);

  const allItems = useMemo(() => {
    const seen = new Set<string>(["none"]);
    const items: { key: string; label: string }[] = [];
    for (const p of curated) {
      if (seen.has(p.engineKey)) continue;
      seen.add(p.engineKey);
      items.push({ key: p.engineKey, label: p.name });
    }
    for (const t of transitionOptions) {
      if (seen.has(t.key)) continue;
      seen.add(t.key);
      items.push({ key: t.key, label: t.name });
    }
    return items;
  }, [curated]);

  const q = search.trim().toLowerCase();
  const filtered = q ? allItems.filter(i => i.label.toLowerCase().includes(q)) : allItems;

  const handleTransitionChange = (key: string) => {
    if (key !== "none" && clipsDetails.length === 0) { toast.error("Please add a clip to Timeline first."); return; }
    if (key !== "none" && clipsDetails.length > 1 && !selectedClipId) { toast.error("Please select a clip to apply transition."); return; }
    if (key !== "none" && clipsDetails.length === 1) { toast.error("At least 2 clips required."); return; }
    if (key !== "none" && clipsDetails && selectedClipId === clipsDetails[clipsDetails.length - 1].id) { toast.error("Last clip cannot have transition."); return; }
    setClipsDetails(prev => prev.map(c => c.id === selectedClipId ? { ...c, transition: key } : c));
  };

  return (
    <div>
      <SectionLabel
        inset={false}
        className="mb-1.5"
        right={<span className="text-micro text-ink-faint font-medium">hover to preview · click to apply</span>}
      >
        Clip Transition
      </SectionLabel>

      <div className="relative mb-2.5">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          type="text"
          placeholder={`Search ${allItems.length} transitions…`}
          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-studio-border bg-studio-raised text-ink-primary text-mini outline-none font-[inherit] focus:border-signal placeholder:text-ink-muted"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {!q && (
          <TransitionPreviewTile
            transitionKey="none" label="None"
            active={selectedTransition === "none"}
            onClick={() => handleTransitionChange("none")}
          />
        )}
        {filtered.map(item => (
          <TransitionPreviewTile
            key={item.key}
            transitionKey={item.key} label={item.label}
            active={selectedTransition === item.key}
            onClick={() => handleTransitionChange(item.key)}
          />
        ))}
      </div>

      {q && filtered.length === 0 && (
        <div className="mt-4 text-center text-ink-muted text-mini">No transitions match “{search}”.</div>
      )}
    </div>
  );
}
