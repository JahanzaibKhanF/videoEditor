"use client";

import { MdOutlineAnimation } from "@/utils/icons";
import React, { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";

const MIN_WIDTH_PERCENT = 1;

export default function TextRangeSlider() {
  const { totalTime, textsDetails, setTextsDetails } = useAppDetailsContext();
  const timelineRef = useRef<HTMLDivElement>(null); // on the outer container for correct width
  const [localTexts, setLocalTexts] = useState(textsDetails);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".video-text")) setSelectedTextId(null);
    };
    window.addEventListener("mousedown", handleGlobalClick);
    return () => window.removeEventListener("mousedown", handleGlobalClick);
  }, []);

  useEffect(() => { setLocalTexts(textsDetails); }, [textsDetails]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedTextId !== null) {
        const updated = localTexts.filter(t => t.id !== selectedTextId);
        setLocalTexts(updated); setTextsDetails(updated); setSelectedTextId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTextId, localTexts, setTextsDetails]);

  const updateTextTime = (id: string, newStart: number, newEnd: number) => {
    const updated = localTexts.map(t => t.id === id
      ? { ...t, startTime: Math.max(0, Math.min(newStart, totalTime)), endTime: Math.max(0, Math.min(newEnd, totalTime)) }
      : t);
    setLocalTexts(updated); setTextsDetails(updated);
  };

  const handleDrag = (e: React.MouseEvent, textId: string, dragType: "move" | "resize-left" | "resize-right") => {
    e.preventDefault();
    const startX = e.clientX;
    setSelectedTextId(textId);
    const textIndex = localTexts.findIndex(t => t.id === textId);
    if (textIndex === -1 || !timelineRef.current || totalTime === 0) return;
    const timelineWidth = timelineRef.current.offsetWidth;
    const orig = { ...localTexts[textIndex] };

    const onMouseMove = (me: MouseEvent) => {
      const dt = ((me.clientX - startX) / timelineWidth) * totalTime;
      let s = orig.startTime ?? 0, end = orig.endTime ?? 0;
      if (dragType === "move") { const dur = end - s; s += dt; end = s + dur; }
      else if (dragType === "resize-left") { s += dt; if (end - s < (MIN_WIDTH_PERCENT / 100) * totalTime) return; }
      else if (dragType === "resize-right") { end += dt; if (end - s < (MIN_WIDTH_PERCENT / 100) * totalTime) return; }
      if (s < 0 || end > totalTime || end <= s) return;
      updateTextTime(textId, s, end);
    };
    const onMouseUp = () => { document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  // Outer div holds ref for width measurement; each row is relative inside it
  return (
    <div ref={timelineRef} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      {localTexts.map(text => {
        if (text.startTime === null || text.endTime === null) return null;
        const left = `${(text.startTime / totalTime) * 100}%`;
        const width = `${((text.endTime - text.startTime) / totalTime) * 100}%`;
        const isSelected = selectedTextId === text.id;

        return (
          <div key={text.id} style={{ position: "relative", width: "100%", height: 28 }}>
            <div
              className="video-text"
              style={{
                position: "absolute", top: 0, height: "100%", left, width,
                background: isSelected ? "#A47CFF" : "#8B5CFF",
                outline: isSelected ? "2px solid #FFB648" : "none",
                borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "move", gap: 4, overflow: "hidden",
                border: text.animation !== "none" ? "1.5px solid rgba(255,255,255,.4)" : "none",
              }}
              onMouseDown={e => handleDrag(e, text.id, "move")}
              onClick={() => { setSelectedTextId(text.id); }}
            >
              <span style={{ fontSize: 9, fontWeight: 900, color: "white", flexShrink: 0, fontFamily: "serif" }}>T</span>
              {text.animation !== "none" && <MdOutlineAnimation size={10} style={{ color: "white", flexShrink: 0 }} />}
              {(textsDetails.length > 1 || text.endTime - text.startTime < totalTime) && (
                <p style={{ color: "rgba(255,255,255,.9)", fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>
                  {text.endTime - text.startTime < 60
                    ? (text.endTime - text.startTime).toFixed(1) + "s"
                    : formatVideoDuration(text.endTime - text.startTime)}
                </p>
              )}
              <div className="absolute top-0 left-0 h-full w-1.5 cursor-ew-resize z-20" onMouseDown={e => { e.stopPropagation(); handleDrag(e, text.id, "resize-left"); }} />
              <div className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize z-20" onMouseDown={e => { e.stopPropagation(); handleDrag(e, text.id, "resize-right"); }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
