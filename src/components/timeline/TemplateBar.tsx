"use client";

/**
 * TemplateBar — shown above timeline when a template is active.
 * Shows slot thumbnails (click to swap), aspect ratio chip, Exit Template button.
 * Only text editing is allowed in template mode.
 *
 * Reads display metadata (name/accentColor/coverImage) straight off
 * `activeTemplate` instead of re-looking the template up by id in the
 * static TEMPLATES array — this is what makes admin-authored / DB-only
 * templates (which never appear in TEMPLATES) work correctly here too.
 */
import { useRef } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { LayoutTemplate, Plus, X } from "@/utils/icons";

export default function TemplateBar() {
  const {
    activeTemplate, setActiveTemplate, setTextsDetails, setBlursDetails,
    setClipsDetails, setAudioDetails, setVideos, setTotalTime,
    setLayerOrder,
  } = useAppDetailsContext();
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  if (!activeTemplate) return null;

  const color = activeTemplate.accentColor || "#8B5CFF";

  const exitTemplate = () => {
    setActiveTemplate(null);
    setTextsDetails([]);
    setBlursDetails([]);
    setClipsDetails([]);
    setAudioDetails([]);
    setVideos([]);
    setTotalTime(0);
    setLayerOrder([]);
  };

  const swapSlot = (slotIdx: number, file: File) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata"; v.src = url;
    v.onloadedmetadata = () => {
      const dur = v.duration || 5;
      setClipsDetails(prev => prev.map((c, i) =>
        i === slotIdx ? { ...c, src: url, duration: dur, endTime: dur, endPosition: c.startPosition + dur } : c
      ));
      setTotalTime(activeTemplate.slots.reduce((s, sl, i) =>
        s + (i === slotIdx ? dur : (sl.durationSecs ?? 5)), 0));
      setActiveTemplate(prev => prev ? {
        ...prev,
        slots: prev.slots.map((sl, i) => i === slotIdx
          ? { ...sl, file, objectUrl: url, durationSecs: dur } : sl),
      } : prev);
    };
  };

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 border-b flex-shrink-0"
      style={{
        background: `linear-gradient(135deg, ${color}1c, ${color}08)`,
        borderColor: `${color}30`,
      }}
    >
      {/* Template badge */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {activeTemplate.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeTemplate.coverImage}
            alt=""
            className="w-7 h-7 rounded-md object-cover border"
            style={{ borderColor: `${color}45` }}
          />
        ) : (
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center border"
            style={{ background: `${color}18`, borderColor: `${color}45` }}
          >
            <LayoutTemplate size={13} color={color} />
          </div>
        )}
        <div>
          <div className="text-[10.5px] font-bold leading-tight" style={{ color }}>
            {activeTemplate.templateName}
          </div>
          <div className="text-[9px] text-ink-faint">template mode · text only</div>
        </div>
      </div>

      <div className="w-px h-7 flex-shrink-0" style={{ background: `${color}30` }} />

      {/* Slot thumbnails */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin flex-1">
        {activeTemplate.slots.map((slot, i) => (
          <div
            key={i}
            onClick={() => fileInputRefs.current[i]?.click()}
            title={`Swap ${slot.label}`}
            className="w-12 h-8 rounded-md flex-shrink-0 cursor-pointer bg-studio-base border flex items-center justify-center overflow-hidden relative transition-colors"
            style={{ borderColor: `${color}40` }}
          >
            {slot.objectUrl ? (
              <video src={slot.objectUrl} className="w-full h-full object-cover" muted />
            ) : (
              <Plus size={14} className="text-ink-faint" />
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[7.5px] font-bold text-white text-center py-px">
              {slot.label.slice(0, 8)}
            </div>
            <input
              ref={(el) => { fileInputRefs.current[i] = el; }}
              type="file" accept="video/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) swapSlot(i, f); }}
            />
          </div>
        ))}
      </div>

      {/* Info + exit */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[9.5px] text-ink-muted bg-studio-hover px-1.5 py-0.5 rounded font-mono">
          {activeTemplate.aspectRatio}
        </span>
        <button
          onClick={exitTemplate}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-danger/30 bg-danger/10 text-[10.5px] font-bold text-danger flex-shrink-0 hover:bg-danger/15 transition-colors"
        >
          <X size={11} /> Exit
        </button>
      </div>
    </div>
  );
}
