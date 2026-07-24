"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";

const MIN_WIDTH_PERCENT = 1;

export default function BlurRangeSlider() {
  const { totalTime, blursDetails, setBlursDetails } = useAppDetailsContext();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [localBlurs, setLocalBlurs] = useState(blursDetails);
  const [selectedBlurId, setSelectedBlurId] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".video-blur")) setSelectedBlurId(null);
    };
    window.addEventListener("mousedown", handleGlobalClick);
    return () => window.removeEventListener("mousedown", handleGlobalClick);
  }, []);

  useEffect(() => { setLocalBlurs(blursDetails); }, [blursDetails]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedBlurId !== null) {
        const updated = localBlurs.filter(b => b.id !== selectedBlurId);
        setLocalBlurs(updated); setBlursDetails(updated); setSelectedBlurId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBlurId, localBlurs, setBlursDetails]);

  const updateBlurTime = (id: string, newStart: number, newEnd: number) => {
    const updated = localBlurs.map(b => b.id === id
      ? { ...b, startTime: Math.max(0, Math.min(newStart, totalTime)), endTime: Math.max(0, Math.min(newEnd, totalTime)) }
      : b);
    setLocalBlurs(updated); setBlursDetails(updated);
  };

  const handleDrag = (e: React.MouseEvent, blurId: string, dragType: "move" | "resize-left" | "resize-right") => {
    e.preventDefault();
    const startX = e.clientX;
    setSelectedBlurId(blurId);
    const idx = localBlurs.findIndex(b => b.id === blurId);
    if (idx === -1 || !timelineRef.current || totalTime === 0) return;
    const timelineWidth = timelineRef.current.offsetWidth;
    const orig = { ...localBlurs[idx] };

    const onMouseMove = (me: MouseEvent) => {
      const dt = ((me.clientX - startX) / timelineWidth) * totalTime;
      let s = orig.startTime ?? 0, end = orig.endTime ?? 0;
      if (dragType === "move") { const dur = end - s; s += dt; end = s + dur; }
      else if (dragType === "resize-left") { s += dt; if (end - s < (MIN_WIDTH_PERCENT / 100) * totalTime) return; }
      else if (dragType === "resize-right") { end += dt; if (end - s < (MIN_WIDTH_PERCENT / 100) * totalTime) return; }
      if (s < 0 || end > totalTime || end <= s) return;
      updateBlurTime(blurId, s, end);
    };
    const onMouseUp = () => { document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div ref={timelineRef} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      {localBlurs.map(blur => {
        if (blur.startTime === null || blur.endTime === null) return null;
        const left = `${(blur.startTime / totalTime) * 100}%`;
        const width = `${((blur.endTime - blur.startTime) / totalTime) * 100}%`;
        const isSelected = selectedBlurId === blur.id;

        return (
          <div key={blur.id} style={{ position: "relative", width: "100%", height: 28 }}>
            <div
              className="video-blur"
              style={{
                position: "absolute", top: 0, height: "100%", left, width,
                background: isSelected ? "#059669" : "#10B981",
                outline: isSelected ? "2px solid #047857" : "none",
                borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "move", gap: 4, overflow: "hidden",
              }}
              onMouseDown={e => handleDrag(e, blur.id, "move")}
              onClick={() => setSelectedBlurId(blur.id)}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="5" cy="5" r="3" stroke="white" strokeWidth="1" strokeDasharray="1.5 1"/>
                <circle cx="5" cy="5" r="1.2" fill="white"/>
              </svg>
              {(blursDetails.length > 1 || blur.endTime - blur.startTime < totalTime) && (
                <p style={{ color: "rgba(255,255,255,.9)", fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>
                  {blur.endTime - blur.startTime < 60
                    ? (blur.endTime - blur.startTime).toFixed(1) + "s"
                    : formatVideoDuration(blur.endTime - blur.startTime)}
                </p>
              )}
              <div className="absolute top-0 left-0 h-full w-1.5 cursor-ew-resize z-20" onMouseDown={e => { e.stopPropagation(); handleDrag(e, blur.id, "resize-left"); }} />
              <div className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize z-20" onMouseDown={e => { e.stopPropagation(); handleDrag(e, blur.id, "resize-right"); }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
