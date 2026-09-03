"use client";

import { MdOutlineAnimation, ChevronUp, ChevronDown } from "@/utils/icons";
import React, { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";
import { computeAdjacentZ } from "../../utils/zStack";

const MIN_WIDTH_PERCENT = 1;

export default function TextRangeSlider({ onlyIds }: { onlyIds?: string[] } = {}) {
  const {
    totalTime, textsDetails, setTextsDetails, imagesDetails, clipsDetails, blursDetails,
    setSelectedTextId: setCtxTextSel, setSelectedImageID: setCtxImageSel,
    setSelectedBlurId: setCtxBlurSel, setSelectedClipId: setCtxClipSel,
  } = useAppDetailsContext();
  const timelineRef = useRef<HTMLDivElement>(null); // on the outer container for correct width
  const [localTexts, setLocalTexts] = useState(textsDetails);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Selecting a text on the timeline also makes it the active object in the
  // preview (InteractionOverlay), so it can be moved / scaled there — and
  // clears any other kind of selection so only one thing is ever active.
  const selectInScreen = (id: string) => {
    setSelectedTextId(id);
    setCtxTextSel(id); setCtxImageSel(null); setCtxBlurSel(null); setCtxClipSel(null);
  };

  useEffect(() => {
    const handleGlobalClick = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".video-text")) setSelectedTextId(null);
    };
    window.addEventListener("pointerdown", handleGlobalClick);
    return () => window.removeEventListener("pointerdown", handleGlobalClick);
  }, []);

  useEffect(() => { setLocalTexts(textsDetails); }, [textsDetails]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedTextId !== null) {
        const updated = localTexts.filter(t => t.id !== selectedTextId);
        setLocalTexts(updated); setTextsDetails(updated);
        setSelectedTextId(null); setCtxTextSel(null);
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

  // Shares the same zIndex space as video clips and images now (see
  // compositeFrame.ts) so text can be sent behind a transparent/bg-removed
  // video or image too, not just always drawn on top of everything.
  // "up" = lower zIndex = frontmost, matching moveClipToTrack in
  // VideoClipsRangeSlider.tsx and moveImageStack in ImagesRangeSlider.tsx.
  const moveTextStack = (id: string, dir: "up" | "down") => {
    const curZ = localTexts.find(t => t.id === id)?.zIndex ?? 0;
    const others = [
      ...localTexts.filter(t => t.id !== id).map(t => t.zIndex ?? 0),
      ...imagesDetails.map(i => i.zIndex ?? 0),
      ...clipsDetails.map(c => c.zIndex ?? 0),
      ...blursDetails.map(b => b.zIndex ?? 0),
    ];
    const newZ = computeAdjacentZ(dir, curZ, others);
    const updated = localTexts.map(t => t.id === id ? { ...t, zIndex: newZ } : t);
    setLocalTexts(updated); setTextsDetails(updated);
  };

  const handleDrag = (e: React.PointerEvent, textId: string, dragType: "move" | "resize-left" | "resize-right") => {
    e.preventDefault();
    const startX = e.clientX;
    let startY = e.clientY;
    selectInScreen(textId);
    const textIndex = localTexts.findIndex(t => t.id === textId);
    if (textIndex === -1 || !timelineRef.current || totalTime === 0) return;
    const timelineWidth = timelineRef.current.offsetWidth;
    const orig = { ...localTexts[textIndex] };

    // Static snapshot, fixed for this drag — see the matching comment in
    // ImagesRangeSlider.tsx's handleDrag.
    const otherZs = [
      ...localTexts.filter(t => t.id !== textId).map(t => t.zIndex ?? 0),
      ...imagesDetails.map(i => i.zIndex ?? 0),
      ...clipsDetails.map(c => c.zIndex ?? 0),
      ...blursDetails.map(b => b.zIndex ?? 0),
    ];
    let curZ = orig.zIndex ?? 0;

    const onMouseMove = (me: PointerEvent) => {
      const dt = ((me.clientX - startX) / timelineWidth) * totalTime;
      let s = orig.startTime ?? 0, end = orig.endTime ?? 0;
      if (dragType === "move") {
        const dur = end - s; s += dt; end = s + dur;
        // Hold + drag vertically to reorder — same gesture video clips use.
        const dy = me.clientY - startY;
        if (Math.abs(dy) > 14) {
          curZ = computeAdjacentZ(dy > 0 ? "down" : "up", curZ, otherZs);
          const updated = localTexts.map(t => t.id === textId ? { ...t, zIndex: curZ } : t);
          setLocalTexts(updated); setTextsDetails(updated);
          startY = me.clientY;
        }
      }
      else if (dragType === "resize-left") { s += dt; if (end - s < (MIN_WIDTH_PERCENT / 100) * totalTime) return; }
      else if (dragType === "resize-right") { end += dt; if (end - s < (MIN_WIDTH_PERCENT / 100) * totalTime) return; }
      if (s < 0 || end > totalTime || end <= s) return;
      updateTextTime(textId, s, end);
    };
    const onMouseUp = () => { document.removeEventListener("pointermove", onMouseMove); document.removeEventListener("pointerup", onMouseUp); };
    document.addEventListener("pointermove", onMouseMove);
    document.addEventListener("pointerup", onMouseUp);
  };

  // Outer div holds ref for width measurement; each row is relative inside it
  return (
    <div ref={timelineRef} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Sorted by zIndex so row position matches front/back order on the
          canvas — see the same note in ImagesRangeSlider.tsx. */}
      {[...localTexts]
        .filter(text => !onlyIds || onlyIds.includes(text.id))
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(text => {
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
              onPointerDown={e => handleDrag(e, text.id, "move")}
              onClick={() => { selectInScreen(text.id); }}
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
              <div className="absolute top-0 left-0 h-full w-1.5 cursor-ew-resize z-20" onPointerDown={e => { e.stopPropagation(); handleDrag(e, text.id, "resize-left"); }} />
              <div className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize z-20" onPointerDown={e => { e.stopPropagation(); handleDrag(e, text.id, "resize-right"); }} />
            </div>
            {isSelected && (
              <div style={{ position: "absolute", right: -18, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 1, zIndex: 15 }}>
                <button title="Bring forward (draw on top)"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); moveTextStack(text.id, "up"); }}
                  style={{ background: "rgba(20,20,30,.85)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 3, padding: 1, cursor: "pointer", lineHeight: 0 }}>
                  <ChevronUp size={9} color="white" />
                </button>
                <button title="Send backward"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); moveTextStack(text.id, "down"); }}
                  style={{ background: "rgba(20,20,30,.85)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 3, padding: 1, cursor: "pointer", lineHeight: 0 }}>
                  <ChevronDown size={9} color="white" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}