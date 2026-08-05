"use client";

/**
 * TemplateClipRangeModal — CapCut-style "pick exactly which part of this
 * clip fills the slot" view. Lives entirely separate from the main global
 * timeline (per the spec: this option should NOT be a main-timeline drag
 * interaction) because a template slot's duration is fixed by the template,
 * not adjustable by dragging clip edges the way the free-form timeline
 * works. Instead: the source asset may be longer than the slot needs, so
 * the user scrubs a fixed-width window across it to choose the in-point,
 * or replaces the source file entirely (still constrained to the same
 * fixed slot duration).
 *
 * Opened from TemplateBar.tsx when a slot thumbnail is clicked.
 */
import { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { Film, RefreshCw, X, Check } from "@/utils/icons";
import { totalSourceConsumed } from "../../utils/speedRamp";

interface Props {
  slotIndex: number;
  onClose: () => void;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata"; v.src = url;
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration || 5); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(5); };
  });
}

export default function TemplateClipRangeModal({ slotIndex, onClose }: Props) {
  const {
    activeTemplate, setActiveTemplate, clipsDetails, setClipsDetails, setTotalTime,
  } = useAppDetailsContext();

  const clip = clipsDetails[slotIndex];
  const slot = activeTemplate?.slots[slotIndex];
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The fixed window width this slot requires — never adjustable here,
  // only WHERE that window sits inside the (possibly longer) source.
  const slotDuration = slot?.durationSecs ?? clip?.duration ?? 5;

  const [previewSrc, setPreviewSrc] = useState<string>(clip?.src ?? "");
  const [sourceDuration, setSourceDuration] = useState<number>(clip?.sourceDuration ?? clip?.duration ?? slotDuration);
  const [trimStart, setTrimStart] = useState<number>(clip?.startTime ?? 0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);

  const maxStart = Math.max(0, sourceDuration - slotDuration);

  useEffect(() => {
    // Keep the preview video parked at the start of the currently-selected
    // window so what's shown always matches what will actually be used.
    const v = videoRef.current;
    if (v) v.currentTime = trimStart;
  }, [trimStart, previewSrc]);

  if (!clip || !slot) return null;

  const handleReplaceFile = async (file: File) => {
    setReplacing(true);
    try {
      const dur = await getVideoDuration(file);
      const url = URL.createObjectURL(file);
      setPendingFile(file);
      setPreviewSrc(url);
      setSourceDuration(dur);
      setTrimStart(0); // reset in-point for a newly-picked asset
    } finally {
      setReplacing(false);
    }
  };

  const apply = () => {
    const clampedStart = Math.min(Math.max(0, trimStart), Math.max(0, sourceDuration - slotDuration));
    // If this slot carries a speed ramp, it needs more (or less) raw source
    // seconds than the on-timeline slot duration — same math as the initial
    // template apply step.
    const neededSourceSpan = clip.speed !== undefined
      ? totalSourceConsumed({ ...clip, startTime: clampedStart, startPosition: 0, endPosition: slotDuration })
      : slotDuration;
    const usedSourceSpan = Math.min(neededSourceSpan, Math.max(0.04, sourceDuration - clampedStart));
    const usedDuration = Math.min(slotDuration, sourceDuration); // on-timeline duration never changes here

    setClipsDetails(prev => prev.map((c, i) => {
      if (i !== slotIndex) return c;
      return {
        ...c,
        src: pendingFile ? previewSrc : c.src,
        duration: usedDuration,
        startTime: clampedStart,
        endTime: clampedStart + usedSourceSpan,
        endPosition: c.startPosition + usedDuration,
        sourceDuration,
      };
    }));

    // Slot durations are fixed by the template, so total timeline length
    // doesn't change here — only refresh it defensively in case this was
    // the last slot and floating point drift crept in.
    setTotalTime(prevTotal => {
      const clips = clipsDetails;
      const others = clips.reduce((sum, c, i) => i === slotIndex ? sum : sum + ((c.endPosition ?? 0) - (c.startPosition ?? 0)), 0);
      return Math.max(prevTotal, others + usedDuration);
    });

    setActiveTemplate(prev => prev ? {
      ...prev,
      slots: prev.slots.map((sl, i) => i === slotIndex
        ? { ...sl, file: pendingFile ?? sl.file, objectUrl: pendingFile ? previewSrc : sl.objectUrl }
        : sl),
    } : prev);

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1002] bg-black/70 backdrop-blur-md flex items-center justify-center px-4 animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[440px] rounded-2xl overflow-hidden bg-studio-surface border border-studio-border shadow-pop animate-rise-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <div className="text-[15px] font-bold text-ink-primary font-display">{slot.label}</div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              Pick which {slotDuration.toFixed(1)}s of this clip plays in this slot
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-studio-hover flex items-center justify-center text-ink-secondary hover:text-ink-primary transition-colors flex-shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* Preview */}
        <div className="mx-5 rounded-xl overflow-hidden bg-black aspect-video relative">
          {previewSrc ? (
            <video ref={videoRef} src={previewSrc} className="w-full h-full object-contain" muted playsInline />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ink-faint">
              <Film size={22} />
            </div>
          )}
        </div>

        {/* Range scrubber — fixed-width window slid across the full source */}
        <div className="px-5 pt-4">
          <div className="flex items-center justify-between text-[10px] text-ink-faint mb-1.5 font-mono">
            <span>0:00</span>
            <span>Source: {sourceDuration.toFixed(1)}s</span>
          </div>
          <div className="relative h-9 rounded-lg bg-studio-base border border-studio-border overflow-hidden">
            {/* Track of the full source */}
            <div className="absolute inset-0" />
            {/* Selected fixed-width window */}
            <div
              className="absolute top-0 bottom-0 rounded-md border-2 pointer-events-none"
              style={{
                left: `${sourceDuration > 0 ? (trimStart / sourceDuration) * 100 : 0}%`,
                width: `${sourceDuration > 0 ? (Math.min(slotDuration, sourceDuration) / sourceDuration) * 100 : 100}%`,
                borderColor: activeTemplate?.accentColor ?? "#8B5CFF",
                background: `${activeTemplate?.accentColor ?? "#8B5CFF"}30`,
              }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, maxStart)}
            step={0.01}
            value={trimStart}
            disabled={maxStart <= 0}
            onChange={e => setTrimStart(parseFloat(e.target.value))}
            className="w-full mt-2 accent-signal disabled:opacity-40"
          />
          <div className="text-[10px] text-ink-faint mt-1">
            {maxStart <= 0
              ? "This clip is exactly (or barely over) the required length — no room to slide."
              : `In-point: ${trimStart.toFixed(2)}s → ${(trimStart + slotDuration).toFixed(2)}s`}
          </div>
        </div>

        {/* Replace clip */}
        <div className="px-5 pt-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={replacing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-studio-border text-ink-secondary text-[12.5px] font-bold hover:bg-studio-hover transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={replacing ? "animate-spin" : ""} />
            {replacing ? "Loading…" : pendingFile ? `Replaced: ${pendingFile.name.slice(0, 24)}` : "Replace clip"}
          </button>
          <input
            ref={fileInputRef}
            type="file" accept="video/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleReplaceFile(f); }}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 pt-4 pb-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-studio-border text-ink-secondary text-[13px] font-bold hover:bg-studio-hover transition-colors">
            Cancel
          </button>
          <button onClick={apply}
            className="flex-[2] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
            style={{ background: `linear-gradient(135deg, ${activeTemplate?.accentColor ?? "#8B5CFF"}, #A47CFF)` }}>
            <Check size={13} /> Use this range
          </button>
        </div>
      </div>
    </div>
  );
}
