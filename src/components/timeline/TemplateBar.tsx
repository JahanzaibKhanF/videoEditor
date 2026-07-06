"use client";

/**
 * TemplateBar — shown above timeline when a template is active.
 * Shows slot thumbnails (click to swap), aspect ratio chip, Exit Template button.
 * Only text editing is allowed in template mode.
 */
import { useRef } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { TEMPLATES } from "../../utils/templates";

export default function TemplateBar() {
  const {
    activeTemplate, setActiveTemplate, setTextsDetails, setBlursDetails,
    setClipsDetails, setAudioDetails, setVideos, setTotalTime,
    setLayerOrder,
  } = useAppDetailsContext();
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  if (!activeTemplate) return null;

  const tpl = TEMPLATES.find(t => t.id === activeTemplate.templateId);
  if (!tpl) return null;

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

  const color = tpl.accentColor;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
      background: `linear-gradient(135deg, ${color}18, ${color}08)`,
      borderBottom: `1px solid ${color}30`,
      flexShrink: 0,
    }}>
      {/* Template badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 14 }}>{tpl.emoji}</span>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color, lineHeight: 1.1 }}>{tpl.name}</div>
          <div style={{ fontSize: 9, color: "#9DA3B4" }}>template mode · text only</div>
        </div>
      </div>

      <div style={{ width: 1, height: 28, background: `${color}30`, flexShrink: 0 }} />

      {/* Slot thumbnails */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1 }}>
        {activeTemplate.slots.map((slot, i) => (
          <div key={i}
            onClick={() => fileInputRefs.current[i]?.click()}
            title={`Swap ${slot.label}`}
            style={{
              width: 48, height: 32, borderRadius: 6, flexShrink: 0, cursor: "pointer",
              background: "#1a1d27", border: `1.5px solid ${color}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", position: "relative",
              transition: "border-color .15s",
            }}>
            {slot.objectUrl
              ? <video src={slot.objectUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
              : <span style={{ fontSize: 16 }}>+</span>
            }
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "rgba(0,0,0,.6)", fontSize: 7.5, fontWeight: 700,
              color: "white", textAlign: "center", padding: "1px 0",
            }}>
              {slot.label.slice(0,8)}
            </div>
            <input
              ref={el => { fileInputRefs.current[i] = el; }}
              type="file" accept="video/*" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) swapSlot(i, f); }}
            />
          </div>
        ))}
      </div>

      {/* Info + exit */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 9.5, color: "#9DA3B4", background: "#F2F4F7", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace" }}
          className="dark:bg-[rgba(255,255,255,.08)]">
          {tpl.aspectRatio}
        </span>
        <button
          onClick={exitTemplate}
          style={{
            padding: "4px 10px", borderRadius: 8, border: "1.5px solid rgba(239,68,68,.3)",
            background: "rgba(239,68,68,.08)", cursor: "pointer", fontSize: 10.5,
            fontWeight: 700, color: "#EF4444", flexShrink: 0,
          }}>
          Exit
        </button>
      </div>
    </div>
  );
}
