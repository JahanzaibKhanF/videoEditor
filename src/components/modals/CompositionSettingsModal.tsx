"use client";

/**
 * CompositionSettingsModal — composition info, editable when no template is
 * active.
 *
 * Aspect ratio and duration used to be pure info here (a decision made once
 * on the startup screen). That's still true WHILE a template is active — a
 * template's slots/text layout are authored for one specific aspect ratio
 * and duration, so changing either out from under it would silently break
 * the layout (same reason Layers.tsx/TimeLine.tsx lock the timeline in
 * template mode). Outside a template, though, there's no such constraint,
 * so both become editable here — same as After Effects' Composition
 * Settings dialog.
 */
import { useState } from "react";
import { X, Info } from "@/utils/icons";
import { useAppDetailsContext } from "../../context/useAppContext";
import { ASPECT_RATIO_OPTIONS } from "../../utils/aspectRatios";
import { AspectRatio } from "../../types/types";

const RATIO_LABELS: Record<string, string> = {
  "original": "Original (matches source video)",
  "16:9": "16:9 — YouTube / Landscape",
  "9:16": "9:16 — TikTok / Reels",
  "1:1": "1:1 — Square",
  "4:5": "4:5 — Instagram Portrait",
  "3:4": "3:4 — Camera Native",
  "ytshorts": "YouTube Shorts",
  "instareels": "Instagram Reels",
  "tiktok": "TikTok",
  "xfeeds": "X (Twitter) Feed",
};

export default function CompositionSettingsModal() {
  const {
    setIsCompositionSettingsOpen, selectedAspectRatio, setSelectedAspectRatio,
    containerDimenions, fps, activeTemplate, totalTime, setTotalTime,
    clipsDetails, textsDetails, imagesDetails, blursDetails, shapesDetails, brushesDetails,
  } = useAppDetailsContext();

  const locked = !!activeTemplate;

  // Purely informational now — shrinking duration below existing content's
  // end is ALLOWED (the user explicitly wants to go to 1s or less
  // regardless); content past the new duration just sits outside the
  // visible/playable/exported range rather than being deleted, and comes
  // back into range if duration is raised again later.
  const maxContentEnd = Math.max(
    0,
    ...clipsDetails.map(c => c.endPosition ?? 0),
    ...textsDetails.map(t => t.endTime ?? 0),
    ...imagesDetails.map(i => i.endTime ?? 0),
    ...blursDetails.map(b => b.endTime ?? 0),
    ...shapesDetails.map(s => s.endTime ?? 0),
    ...brushesDetails.map(b => b.endTime ?? 0),
  );

  const [durationInput, setDurationInput] = useState(() => totalTime.toFixed(1));
  const MIN_DURATION = 0.1;

  const commitDuration = () => {
    const v = parseFloat(durationInput);
    if (!Number.isFinite(v) || v <= 0) { setDurationInput(totalTime.toFixed(1)); return; }
    const next = Math.max(v, MIN_DURATION);
    setTotalTime(next);
    setDurationInput(next.toFixed(1));
  };

  return (
    <div className="fixed inset-0 z-[9000] bg-black/40 backdrop-blur-sm flex items-center justify-center"
      onClick={() => setIsCompositionSettingsOpen(false)}>
      <div className="bg-studio-surface border border-studio-border rounded-2xl shadow-2xl p-7 w-[420px] max-w-[95vw]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[16px] font-bold text-ink-primary">Composition</div>
            <div className="text-[12px] text-ink-secondary mt-0.5">Project settings for this composition</div>
          </div>
          <button onClick={() => setIsCompositionSettingsOpen(false)}
            className="w-8 h-8 rounded-lg border border-studio-border bg-studio-raised flex items-center justify-center cursor-pointer text-ink-secondary hover:bg-studio-hover transition-all">
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          {locked ? (
            <InfoRow label="Aspect ratio" value={RATIO_LABELS[selectedAspectRatio] ?? selectedAspectRatio} />
          ) : (
            <SettingRow label="Aspect ratio">
              <select
                value={selectedAspectRatio}
                onChange={e => setSelectedAspectRatio(e.target.value as AspectRatio)}
                className="bg-studio-void border border-studio-border rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink-primary outline-none focus:border-signal transition-colors"
              >
                <option value="original">{RATIO_LABELS.original}</option>
                {ASPECT_RATIO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </SettingRow>
          )}

          <InfoRow label="Resolution" value={`${containerDimenions.width || 0} × ${containerDimenions.height || 0}px`} />

          {locked ? (
            <InfoRow label="Duration" value={`${totalTime.toFixed(1)}s`} />
          ) : (
            <SettingRow label="Duration">
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={MIN_DURATION} step={0.5} value={durationInput}
                  onChange={e => setDurationInput(e.target.value)}
                  onBlur={commitDuration}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-20 bg-studio-void border border-studio-border rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink-primary outline-none focus:border-signal transition-colors font-mono"
                />
                <span className="text-[11.5px] text-ink-faint">sec</span>
              </div>
            </SettingRow>
          )}

          {fps != null && <InfoRow label="Frame rate" value={`${fps.toFixed(2)} fps`} />}
        </div>

        <div className="flex items-start gap-2 mt-5 px-3 py-2.5 rounded-lg bg-signal/8 border border-signal/20">
          <Info size={13} className="text-signal flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-ink-secondary leading-snug">
            {locked
              ? "This project uses a template, so aspect ratio and duration are locked to its layout — start a non-template project to change them."
              : selectedAspectRatio === "original"
                ? "\"Original\" adapts automatically to whatever video you set as primary — pick a fixed ratio above to set one manually instead."
                : "Duration can't go shorter than your current content's end — trim clips/layers on the timeline first if you need to shrink further."}
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-studio-base">
      <span className="text-[12px] text-ink-muted">{label}</span>
      <span className="text-[12.5px] font-semibold text-ink-primary font-mono">{value}</span>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-studio-base">
      <span className="text-[12px] text-ink-muted">{label}</span>
      {children}
    </div>
  );
}
