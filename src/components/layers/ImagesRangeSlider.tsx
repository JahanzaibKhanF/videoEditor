"use client";

import { MdOutlineAnimation } from "@/utils/icons";
import React, { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";

const MIN_WIDTH_PERCENT = 1;

export default function ImagesRangeSlider() {
  const { totalTime, imagesDetails, setImagesDetails } = useAppDetailsContext();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [localImages, setLocalImages] = useState(imagesDetails);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".video-image")) setSelectedImageId(null);
    };
    window.addEventListener("mousedown", handleGlobalClick);
    return () => window.removeEventListener("mousedown", handleGlobalClick);
  }, []);

  useEffect(() => { setLocalImages(imagesDetails); }, [imagesDetails]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedImageId !== null) {
        const updated = localImages.filter(i => i.id !== selectedImageId);
        setLocalImages(updated); setImagesDetails(updated); setSelectedImageId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedImageId, localImages, setImagesDetails]);

  const updateImageTime = (id: string, newStart: number, newEnd: number) => {
    const updated = localImages.map(img => img.id === id
      ? { ...img, startTime: Math.max(0, Math.min(newStart, totalTime)), endTime: Math.max(0, Math.min(newEnd, totalTime)) }
      : img);
    setLocalImages(updated); setImagesDetails(updated);
  };

  const handleDrag = (e: React.MouseEvent, imageId: string, dragType: "move" | "resize-left" | "resize-right") => {
    e.preventDefault();
    const startX = e.clientX;
    setSelectedImageId(imageId);
    const idx = localImages.findIndex(i => i.id === imageId);
    if (idx === -1 || !timelineRef.current || totalTime === 0) return;
    const timelineWidth = timelineRef.current.offsetWidth;
    const orig = { ...localImages[idx] };

    const onMouseMove = (me: MouseEvent) => {
      const dt = ((me.clientX - startX) / timelineWidth) * totalTime;
      let s = orig.startTime ?? 0, end = orig.endTime ?? 0;
      if (dragType === "move") { const dur = end - s; s += dt; end = s + dur; }
      else if (dragType === "resize-left") { s += dt; if (end - s < (MIN_WIDTH_PERCENT / 100) * totalTime) return; }
      else if (dragType === "resize-right") { end += dt; if (end - s < (MIN_WIDTH_PERCENT / 100) * totalTime) return; }
      if (s < 0 || end > totalTime || end <= s) return;
      updateImageTime(imageId, s, end);
    };
    const onMouseUp = () => { document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div ref={timelineRef} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      {localImages.map(img => {
        if (img.startTime === null || img.endTime === null) return null;
        const left = `${(img.startTime / totalTime) * 100}%`;
        const width = `${((img.endTime - img.startTime) / totalTime) * 100}%`;
        const isSelected = selectedImageId === img.id;

        return (
          <div key={img.id} style={{ position: "relative", width: "100%", height: 28 }}>
            <div
              className="video-image"
              style={{
                position: "absolute", top: 0, height: "100%", left, width,
                background: isSelected ? "#F472B6" : "#EC4899",
                outline: isSelected ? "2px solid #B45309" : "none",
                borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "move", gap: 4, overflow: "hidden",
                border: img.animation !== "none" ? "1.5px solid rgba(255,255,255,.4)" : "none",
              }}
              onMouseDown={e => handleDrag(e, img.id, "move")}
              onClick={() => { setSelectedImageId(img.id); }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                <rect x="0.5" y="1.5" width="9" height="7" rx="1" stroke="white" strokeWidth="1"/>
                <circle cx="3" cy="4" r="1" fill="white"/>
                <path d="M1 8l2.5-2.5 2 2 1.5-2L9 8" stroke="white" strokeWidth="0.8" strokeLinejoin="round"/>
              </svg>
              {img.animation !== "none" && <MdOutlineAnimation size={10} style={{ color: "white", flexShrink: 0 }} />}
              {(imagesDetails.length > 1 || img.endTime - img.startTime < totalTime) && (
                <p style={{ color: "rgba(255,255,255,.9)", fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>
                  {img.endTime - img.startTime < 60
                    ? (img.endTime - img.startTime).toFixed(1) + "s"
                    : formatVideoDuration(img.endTime - img.startTime)}
                </p>
              )}
              <div className="absolute top-0 left-0 h-full w-1.5 cursor-ew-resize z-20" onMouseDown={e => { e.stopPropagation(); handleDrag(e, img.id, "resize-left"); }} />
              <div className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize z-20" onMouseDown={e => { e.stopPropagation(); handleDrag(e, img.id, "resize-right"); }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
