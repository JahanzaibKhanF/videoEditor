"use client";

/**
 * ClipTransitionSelector — curated transition picker.
 *
 * Same pattern as AnimationSelection.tsx: a short curated set (built-in 5,
 * merged with anything published from /settings → Motion Presets) as the
 * default experience, full legacy grid available behind "Browse all
 * transitions" for anyone who wants more. The actual xfade math and the
 * FFMPEG_XFADE_MAP translation stay in code — the JSON only controls which
 * curated presets appear here.
 */
import { useEffect, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { transitionOptions } from "../../utils/transitionOtionsConstants";
import { DEFAULT_TRANSITION_PRESETS, buildMotionPresetFromRecord, MotionPreset, MotionPresetRecord } from "../../utils/motionPresets";
import { toast } from "react-toastify";
import { ChevronDown, ChevronUp } from "@/utils/icons";
import TransitionPreviewTile from "./TransitionPreviewTile";

export default function ClipTransitionSelector() {
  const { selectedClipId, clipsDetails, setClipsDetails } = useAppDetailsContext();
  const selectedTransition = clipsDetails.find(c => c.id === selectedClipId)?.transition || "none";

  const [dbPresets, setDbPresets] = useState<MotionPreset[]>([]);
  const [showAll, setShowAll] = useState(false);
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

  const curated: MotionPreset[] = (() => {
    const byId = new Map<string, MotionPreset>();
    for (const p of DEFAULT_TRANSITION_PRESETS) byId.set(p.id, p);
    for (const p of dbPresets) byId.set(p.id, p);
    return Array.from(byId.values());
  })();

  const handleTransitionChange = (key: string) => {
    if (key !== "none" && clipsDetails.length === 0) { toast.error("Please add a clip to Timeline first."); return; }
    if (key !== "none" && clipsDetails.length > 1 && !selectedClipId) { toast.error("Please select a clip to apply transition."); return; }
    if (key !== "none" && clipsDetails.length === 1) { toast.error("At least 2 clips required."); return; }
    if (key !== "none" && clipsDetails && selectedClipId === clipsDetails[clipsDetails.length - 1].id) { toast.error("Last clip cannot have transition."); return; }
    setClipsDetails(prev => prev.map(c => c.id === selectedClipId ? { ...c, transition: key } : c));
  };

  const filtered = transitionOptions.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-3">
      <div className="text-[10.5px] font-bold uppercase tracking-[.7px] text-ink-muted mb-1">Clip Transition</div>
      <div className="text-[10.5px] text-ink-faint mb-2.5">
        Hover any tile to preview the transition — click to apply.
      </div>

      {/* Curated grid — the default, primary experience */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <TransitionPreviewTile
          transitionKey="none" label="None"
          active={selectedTransition === "none"}
          onClick={() => handleTransitionChange("none")}
        />
        {curated.map(preset => (
          <TransitionPreviewTile
            key={preset.id}
            transitionKey={preset.engineKey} label={preset.name}
            active={selectedTransition === preset.engineKey}
            onClick={() => handleTransitionChange(preset.engineKey)}
          />
        ))}
      </div>

      <button
        onClick={() => setShowAll(v => !v)}
        className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-ink-muted hover:text-signal py-1.5 transition-colors"
      >
        {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {showAll ? "Hide full transition library" : "Browse all transitions"}
      </button>

      {showAll && (
        <div className="mt-2.5 pt-3 border-t border-studio-border">
          <input value={search} onChange={e => setSearch(e.target.value)} type="text" placeholder="Search transitions…"
            className="w-full px-3 py-2 rounded-lg border border-studio-border bg-studio-raised text-ink-primary text-[12px] outline-none font-[inherit] focus:border-signal mb-3 placeholder:text-ink-muted" />
          <div className="grid grid-cols-3 gap-2">
            {filtered.map(({ key, name }) => (
              <TransitionPreviewTile
                key={key}
                transitionKey={key} label={name}
                active={selectedTransition === key}
                onClick={() => handleTransitionChange(key)}
              />
            ))}
          </div>
          {filtered.length === 0 && <div className="mt-4 text-center text-ink-muted text-[12px] italic">No transitions found.</div>}
        </div>
      )}
    </div>
  );
}
