"use client";

/**
 * BrushRangeSlider — the timeline row for freehand brush stroke layers.
 * Copied from ImagesRangeSlider.tsx (see that file for the reasoning behind
 * each piece) — only field names, accent color, and chip icon differ.
 */
import { ChevronUp, ChevronDown } from "@/utils/icons";
import React, { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";
import { computeAdjacentZ } from "../../utils/zStack";

const MIN_WIDTH_PERCENT = 1;

export default function BrushRangeSlider({ onlyIds }: { onlyIds?: string[] } = {}) {
  const {
    totalTime, brushesDetails, setBrushesDetails, clipsDetails, imagesDetails, textsDetails, blursDetails, shapesDetails,
    setSelectedBrushId: setCtxBrushSel, setSelectedTextId: setCtxTextSel,
    setSelectedImageID: setCtxImageSel, setSelectedBlurId: setCtxBlurSel,
    setSelectedClipId: setCtxClipSel, setSelectedShapeId: setCtxShapeSel,
  } = useAppDetailsContext();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [localBrushes, setLocalBrushes] = useState(brushesDetails);
  const [selectedBrushId, setSelectedBrushId] = useState<string | null>(null);

  const selectInScreen = (id: string) => {
    setSelectedBrushId(id);
    setCtxBrushSel(id); setCtxTextSel(null); setCtxImageSel(null); setCtxBlurSel(null); setCtxClipSel(null); setCtxShapeSel(null);
  };

  useEffect(() => {
    const handleGlobalClick = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".video-brush")) setSelectedBrushId(null);
    };
    window.addEventListener("pointerdown", handleGlobalClick);
    return () => window.removeEventListener("pointerdown", handleGlobalClick);
  }, []);

  useEffect(() => { setLocalBrushes(brushesDetails); }, [brushesDetails]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedBrushId !== null) {
        const updated = localBrushes.filter(b => b.id !== selectedBrushId);
        setLocalBrushes(updated); setBrushesDetails(updated);
        setSelectedBrushId(null); setCtxBrushSel(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBrushId, localBrushes, setBrushesDetails]);

  const updateBrushTime = (id: string, newStart: number, newEnd: number) => {
    const updated = localBrushes.map(b => b.id === id
      ? { ...b, startTime: Math.max(0, Math.min(newStart, totalTime)), endTime: Math.max(0, Math.min(newEnd, totalTime)) }
      : b);
    setLocalBrushes(updated); setBrushesDetails(updated);
  };

  const moveBrushStack = (id: string, dir: "up" | "down") => {
    const curZ = localBrushes.find(b => b.id === id)?.zIndex ?? 0;
    const others = [
      ...localBrushes.filter(b => b.id !== id).map(b => b.zIndex ?? 0),
      ...clipsDetails.map(c => c.zIndex ?? 0),
      ...imagesDetails.map(i => i.zIndex ?? 0),
      ...textsDetails.map(t => t.zIndex ?? 0),
      ...blursDetails.map(bl => bl.zIndex ?? 0),
      ...shapesDetails.map(s => s.zIndex ?? 0),
    ];
    const newZ = computeAdjacentZ(dir, curZ, others);
    const updated = localBrushes.map(b => b.id === id ? { ...b, zIndex: newZ } : b);
    setLocalBrushes(updated); setBrushesDetails(updated);
  };

  const handleDrag = (e: React.PointerEvent, brushId: string, dragType: "move" | "resize-left" | "resize-right") => {
    e.preventDefault();
    const startX = e.clientX;
    let startY = e.clientY;
    selectInScreen(brushId);
    const idx = localBrushes.findIndex(b => b.id === brushId);
    if (idx === -1 || !timelineRef.current || totalTime === 0) return;
    const timelineWidth = timelineRef.current.offsetWidth;
    const orig = { ...localBrushes[idx] };

    const otherZs = [
      ...localBrushes.filter(b => b.id !== brushId).map(b => b.zIndex ?? 0),
      ...clipsDetails.map(c => c.zIndex ?? 0),
      ...imagesDetails.map(i => i.zIndex ?? 0),
      ...textsDetails.map(t => t.zIndex ?? 0),
      ...blursDetails.map(bl => bl.zIndex ?? 0),
      ...shapesDetails.map(s => s.zIndex ?? 0),
    ];
    let curZ = orig.zIndex ?? 0;

    const onMouseMove = (me: PointerEvent) => {
      const dt = ((me.clientX - startX) / timelineWidth) * totalTime;
      let s = orig.startTime ?? 0, end = orig.endTime ?? 0;
      if (dragType === "move") {
        const dur = end - s; s += dt; end = s + dur;
        const dy = me.clientY - startY;
        if (Math.abs(dy) > 14) {
          curZ = computeAdjacentZ(dy > 0 ? "down" : "up", curZ, otherZs);
          const updated = localBrushes.map(br => br.id === brushId ? { ...br, zIndex: curZ } : br);
          setLocalBrushes(updated); setBrushesDetails(updated);
          startY = me.clientY;
        }
      }
      else if (dragType === "resize-left") { s += dt; if (end - s < (MIN_WIDTH_PERCENT / 100) * totalTime) return; }
      else if (dragType === "resize-right") { end += dt; if (end - s < (MIN_WIDTH_PERCENT / 100) * totalTime) return; }
      if (s < 0 || end > totalTime || end <= s) return;
      updateBrushTime(brushId, s, end);
    };
    const onMouseUp = () => { document.removeEventListener("pointermove", onMouseMove); document.removeEventListener("pointerup", onMouseUp); };
    document.addEventListener("pointermove", onMouseMove);
    document.addEventListener("pointerup", onMouseUp);
  };

  return (
    <div ref={timelineRef} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      {[...localBrushes]
        .filter(b => !onlyIds || onlyIds.includes(b.id))
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(brush => {
        if (brush.startTime === null || brush.endTime === null) return null;
        const left = `${(brush.startTime / totalTime) * 100}%`;
        const width = `${((brush.endTime - brush.startTime) / totalTime) * 100}%`;
        const isSelected = selectedBrushId === brush.id;

        return (
          <div key={brush.id} style={{ position: "relative", width: "100%", height: 28 }}>
            <div
              className="video-brush"
              style={{
                position: "absolute", top: 0, height: "100%", left, width,
                background: isSelected ? "#C2410C" : "#F97316",
                outline: isSelected ? "2px solid #9A3412" : "none",
                borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "move", gap: 4, overflow: "hidden",
                border: brush.animation && brush.animation !== "none" ? "1.5px solid rgba(255,255,255,.4)" : "none",
              }}
              onPointerDown={e => handleDrag(e, brush.id, "move")}
              onClick={() => selectInScreen(brush.id)}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                <path d="M1.5 8.5c1-3 2-6 4.5-7 1-.3 1.7.4 1.4 1.4-1 2.5-4 3.5-7 4.5-.4.1-.4-.4.1-.9z" fill="white" />
              </svg>
              {(brushesDetails.length > 1 || brush.endTime - brush.startTime < totalTime) && (
                <p style={{ color: "rgba(255,255,255,.9)", fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>
                  {brush.endTime - brush.startTime < 60
                    ? (brush.endTime - brush.startTime).toFixed(1) + "s"
                    : formatVideoDuration(brush.endTime - brush.startTime)}
                </p>
              )}
              <div className="absolute top-0 left-0 h-full w-1.5 cursor-ew-resize z-20" onPointerDown={e => { e.stopPropagation(); handleDrag(e, brush.id, "resize-left"); }} />
              <div className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize z-20" onPointerDown={e => { e.stopPropagation(); handleDrag(e, brush.id, "resize-right"); }} />
            </div>
            {isSelected && (
              <div style={{ position: "absolute", right: -18, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 1, zIndex: 15 }}>
                <button title="Bring forward (draw on top)"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); moveBrushStack(brush.id, "up"); }}
                  style={{ background: "rgba(20,20,30,.85)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 3, padding: 1, cursor: "pointer", lineHeight: 0 }}>
                  <ChevronUp size={9} color="white" />
                </button>
                <button title="Send backward"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); moveBrushStack(brush.id, "down"); }}
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
