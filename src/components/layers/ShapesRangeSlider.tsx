"use client";

/**
 * ShapesRangeSlider — the timeline row for shape (rectangle/ellipse/polygon)
 * layers. Copied from ImagesRangeSlider.tsx (same bounding-box + start/end
 * time model, same shared z-stack, same drag/resize/reorder gestures) —
 * see that file for the reasoning behind each piece; only the field names,
 * accent color, and chip icon differ here.
 */
import { ChevronUp, ChevronDown } from "@/utils/icons";
import React, { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";
import { computeAdjacentZ } from "../../utils/zStack";

const MIN_WIDTH_PERCENT = 1;

export default function ShapesRangeSlider({ onlyIds }: { onlyIds?: string[] } = {}) {
  const {
    totalTime, shapesDetails, setShapesDetails, clipsDetails, imagesDetails, textsDetails, blursDetails, brushesDetails,
    setSelectedShapeId: setCtxShapeSel, setSelectedTextId: setCtxTextSel,
    setSelectedImageID: setCtxImageSel, setSelectedBlurId: setCtxBlurSel,
    setSelectedClipId: setCtxClipSel, setSelectedBrushId: setCtxBrushSel,
  } = useAppDetailsContext();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [localShapes, setLocalShapes] = useState(shapesDetails);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  const selectInScreen = (id: string) => {
    setSelectedShapeId(id);
    setCtxShapeSel(id); setCtxTextSel(null); setCtxImageSel(null); setCtxBlurSel(null); setCtxClipSel(null); setCtxBrushSel(null);
  };

  useEffect(() => {
    const handleGlobalClick = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".video-shape")) setSelectedShapeId(null);
    };
    window.addEventListener("pointerdown", handleGlobalClick);
    return () => window.removeEventListener("pointerdown", handleGlobalClick);
  }, []);

  useEffect(() => { setLocalShapes(shapesDetails); }, [shapesDetails]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedShapeId !== null) {
        const updated = localShapes.filter(s => s.id !== selectedShapeId);
        setLocalShapes(updated); setShapesDetails(updated);
        setSelectedShapeId(null); setCtxShapeSel(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedShapeId, localShapes, setShapesDetails]);

  const updateShapeTime = (id: string, newStart: number, newEnd: number) => {
    const updated = localShapes.map(s => s.id === id
      ? { ...s, startTime: Math.max(0, Math.min(newStart, totalTime)), endTime: Math.max(0, Math.min(newEnd, totalTime)) }
      : s);
    setLocalShapes(updated); setShapesDetails(updated);
  };

  const moveShapeStack = (id: string, dir: "up" | "down") => {
    const curZ = localShapes.find(s => s.id === id)?.zIndex ?? 0;
    const others = [
      ...localShapes.filter(s => s.id !== id).map(s => s.zIndex ?? 0),
      ...clipsDetails.map(c => c.zIndex ?? 0),
      ...imagesDetails.map(i => i.zIndex ?? 0),
      ...textsDetails.map(t => t.zIndex ?? 0),
      ...blursDetails.map(b => b.zIndex ?? 0),
      ...brushesDetails.map(b => b.zIndex ?? 0),
    ];
    const newZ = computeAdjacentZ(dir, curZ, others);
    const updated = localShapes.map(s => s.id === id ? { ...s, zIndex: newZ } : s);
    setLocalShapes(updated); setShapesDetails(updated);
  };

  const handleDrag = (e: React.PointerEvent, shapeId: string, dragType: "move" | "resize-left" | "resize-right") => {
    e.preventDefault();
    const startX = e.clientX;
    let startY = e.clientY;
    selectInScreen(shapeId);
    const idx = localShapes.findIndex(s => s.id === shapeId);
    if (idx === -1 || !timelineRef.current || totalTime === 0) return;
    const timelineWidth = timelineRef.current.offsetWidth;
    const orig = { ...localShapes[idx] };

    const otherZs = [
      ...localShapes.filter(s => s.id !== shapeId).map(s => s.zIndex ?? 0),
      ...clipsDetails.map(c => c.zIndex ?? 0),
      ...imagesDetails.map(i => i.zIndex ?? 0),
      ...textsDetails.map(t => t.zIndex ?? 0),
      ...blursDetails.map(b => b.zIndex ?? 0),
      ...brushesDetails.map(b => b.zIndex ?? 0),
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
          const updated = localShapes.map(sh => sh.id === shapeId ? { ...sh, zIndex: curZ } : sh);
          setLocalShapes(updated); setShapesDetails(updated);
          startY = me.clientY;
        }
      }
      else if (dragType === "resize-left") { s += dt; if (end - s < (MIN_WIDTH_PERCENT / 100) * totalTime) return; }
      else if (dragType === "resize-right") { end += dt; if (end - s < (MIN_WIDTH_PERCENT / 100) * totalTime) return; }
      if (s < 0 || end > totalTime || end <= s) return;
      updateShapeTime(shapeId, s, end);
    };
    const onMouseUp = () => { document.removeEventListener("pointermove", onMouseMove); document.removeEventListener("pointerup", onMouseUp); };
    document.addEventListener("pointermove", onMouseMove);
    document.addEventListener("pointerup", onMouseUp);
  };

  return (
    <div ref={timelineRef} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      {[...localShapes]
        .filter(s => !onlyIds || onlyIds.includes(s.id))
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(shape => {
        if (shape.startTime === null || shape.endTime === null) return null;
        const left = `${(shape.startTime / totalTime) * 100}%`;
        const width = `${((shape.endTime - shape.startTime) / totalTime) * 100}%`;
        const isSelected = selectedShapeId === shape.id;

        return (
          <div key={shape.id} style={{ position: "relative", width: "100%", height: 28 }}>
            <div
              className="video-shape"
              style={{
                position: "absolute", top: 0, height: "100%", left, width,
                background: isSelected ? "#0D9488" : "#14B8A6",
                outline: isSelected ? "2px solid #0F766E" : "none",
                borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "move", gap: 4, overflow: "hidden",
                border: shape.animation && shape.animation !== "none" ? "1.5px solid rgba(255,255,255,.4)" : "none",
              }}
              onPointerDown={e => handleDrag(e, shape.id, "move")}
              onClick={() => selectInScreen(shape.id)}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                {shape.kind === "ellipse"
                  ? <circle cx="5" cy="5" r="4" stroke="white" strokeWidth="1" />
                  : shape.kind === "polygon"
                    ? <path d="M5 1l4 7H1z" stroke="white" strokeWidth="1" strokeLinejoin="round" />
                    : <rect x="1" y="1.5" width="8" height="7" rx="1" stroke="white" strokeWidth="1" />}
              </svg>
              {(shapesDetails.length > 1 || shape.endTime - shape.startTime < totalTime) && (
                <p style={{ color: "rgba(255,255,255,.9)", fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>
                  {shape.endTime - shape.startTime < 60
                    ? (shape.endTime - shape.startTime).toFixed(1) + "s"
                    : formatVideoDuration(shape.endTime - shape.startTime)}
                </p>
              )}
              <div className="absolute top-0 left-0 h-full w-1.5 cursor-ew-resize z-20" onPointerDown={e => { e.stopPropagation(); handleDrag(e, shape.id, "resize-left"); }} />
              <div className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize z-20" onPointerDown={e => { e.stopPropagation(); handleDrag(e, shape.id, "resize-right"); }} />
            </div>
            {isSelected && (
              <div style={{ position: "absolute", right: -18, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 1, zIndex: 15 }}>
                <button title="Bring forward (draw on top)"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); moveShapeStack(shape.id, "up"); }}
                  style={{ background: "rgba(20,20,30,.85)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 3, padding: 1, cursor: "pointer", lineHeight: 0 }}>
                  <ChevronUp size={9} color="white" />
                </button>
                <button title="Send backward"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); moveShapeStack(shape.id, "down"); }}
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
