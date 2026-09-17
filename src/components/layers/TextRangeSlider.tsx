"use client";

/**
 * TextRangeSlider — text TRACKS, same model as VideoClipsRangeSlider.
 *
 * `text.zIndex` doubles as the text's TRACK id. Every text sharing the same
 * zIndex lives on the same horizontal row, laid out by time — most
 * commonly a batch of auto-generated captions (CaptionsPanel.tsx gives the
 * whole batch one shared zIndex up front, since consecutive spoken phrases
 * never overlap in time), but also true for any texts a user drags onto
 * the same row by hand. A text can move to a different (existing or
 * brand-new) track two ways: hold + drag it up/down past half a row's
 * height, or the ▲▼ chevrons on a selected chip — both collision-safe,
 * landing on a neighbouring track if there's room, else allocating a new
 * one (see resolveTargetTrackGeneric in zStack.ts).
 */
import { MdOutlineAnimation, ChevronUp, ChevronDown } from "@/utils/icons";
import React, { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";
import { resolveTargetTrackGeneric } from "../../utils/zStack";
import { ITEM_H } from "./Layers";

const MIN_WIDTH_PERCENT = 1;

export default function TextRangeSlider({ onlyTrackZs }: { onlyTrackZs?: number[] } = {}) {
  const {
    totalTime, textsDetails, setTextsDetails, imagesDetails, clipsDetails, blursDetails,
    shapesDetails, brushesDetails,
    setSelectedTextId: setCtxTextSel, setSelectedImageID: setCtxImageSel,
    setSelectedBlurId: setCtxBlurSel, setSelectedClipId: setCtxClipSel,
    setSelectedShapeId: setCtxShapeSel, setSelectedBrushId: setCtxBrushSel,
  } = useAppDetailsContext();
  const timelineRef = useRef<HTMLDivElement>(null); // on the outer container for correct width
  const [localTexts, setLocalTexts] = useState(textsDetails);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Every OTHER layer type's zIndex — used so a text stepping up/down past
  // the last existing text track can land in a slot between/beyond those
  // too (shared unified stack, see zStack.ts).
  const otherLayerZs = [
    ...imagesDetails.map(i => i.zIndex ?? 0),
    ...clipsDetails.map(c => c.zIndex ?? 0),
    ...blursDetails.map(b => b.zIndex ?? 0),
    ...shapesDetails.map(s => s.zIndex ?? 0),
    ...brushesDetails.map(b => b.zIndex ?? 0),
  ];

  // Selecting a text on the timeline also makes it the active object in the
  // preview (InteractionOverlay), so it can be moved / scaled there — and
  // clears any other kind of selection so only one thing is ever active.
  const selectInScreen = (id: string) => {
    setSelectedTextId(id);
    setCtxTextSel(id); setCtxImageSel(null); setCtxBlurSel(null); setCtxClipSel(null);
    setCtxShapeSel(null); setCtxBrushSel(null);
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

  // Move a text to the next track up/down — used by both the drag gesture
  // (crossing a row-height threshold) and the chevron buttons on a selected
  // chip. Collision-safe: lands on the neighbouring track if there's room,
  // otherwise allocates a new one.
  const moveTextToTrack = (id: string, dir: "up" | "down") => {
    setTextsDetails(prev => {
      const t = prev.find(tx => tx.id === id);
      if (!t) return prev;
      const others = prev.filter(tx => tx.id !== id).map(tx => ({ zIndex: tx.zIndex ?? 0, start: tx.startTime ?? 0, end: tx.endTime ?? 0 }));
      const targetZ = resolveTargetTrackGeneric(dir, t.zIndex ?? 0, t.startTime ?? 0, t.endTime ?? 0, others, otherLayerZs);
      return prev.map(tx => tx.id === id ? { ...tx, zIndex: targetZ } : tx);
    });
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
    const minW = (MIN_WIDTH_PERCENT / 100) * totalTime;

    // Static snapshot of every OTHER text — their positions/tracks don't
    // change during this drag, only this one's does.
    const otherTexts = localTexts.filter(t => t.id !== textId);
    let curZ = orig.zIndex ?? 0;

    // Same-track neighbours, fixed for the duration of a resize (resizing
    // never changes track) — same pattern as VideoClipsRangeSlider.
    const sameTrackAtStart = otherTexts.filter(t => (t.zIndex ?? 0) === curZ);
    const prevNeighbor = [...sameTrackAtStart]
      .filter(t => (t.endTime ?? 0) <= (orig.startTime ?? 0) + 0.001)
      .sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0))[0];
    const nextNeighbor = [...sameTrackAtStart]
      .filter(t => (t.startTime ?? 0) >= (orig.endTime ?? 0) - 0.001)
      .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))[0];

    const onMouseMove = (me: PointerEvent) => {
      const dt = ((me.clientX - startX) / timelineWidth) * totalTime;
      let s = orig.startTime ?? 0, end = orig.endTime ?? 0;

      if (dragType === "move") {
        const dur = end - s;
        s = Math.max(0, Math.min(totalTime - dur, s + dt));
        end = s + dur;

        // Hold + drag vertically to reorder — same gesture video clips use.
        const dy = me.clientY - startY;
        if (Math.abs(dy) > ITEM_H / 2) {
          const dir: "up" | "down" = dy > 0 ? "down" : "up";
          const others = otherTexts.map(t => ({ zIndex: t.zIndex ?? 0, start: t.startTime ?? 0, end: t.endTime ?? 0 }));
          curZ = resolveTargetTrackGeneric(dir, curZ, s, end, others, otherLayerZs);
          startY = me.clientY;
        }

        // Never let this text overlap another text already on its
        // (possibly just-changed) target track.
        const sameTrack = otherTexts.filter(t => (t.zIndex ?? 0) === curZ);
        let lo = 0, hi = totalTime;
        for (const t of sameTrack) {
          const ts = t.startTime ?? 0, te = t.endTime ?? 0;
          const mid = (ts + te) / 2;
          if (s + dur / 2 >= mid) lo = Math.max(lo, te);
          else hi = Math.min(hi, ts);
        }
        s = Math.max(lo, Math.min(Math.max(lo, hi - dur), s));
        end = s + dur;

        const updated = localTexts.map(t => t.id === textId ? { ...t, zIndex: curZ } : t);
        setLocalTexts(updated); setTextsDetails(updated);
      } else if (dragType === "resize-left") {
        s += dt;
        if (prevNeighbor) s = Math.max(s, prevNeighbor.endTime ?? 0);
        if (end - s < minW) s = end - minW;
      } else if (dragType === "resize-right") {
        end += dt;
        if (nextNeighbor) end = Math.min(end, nextNeighbor.startTime ?? totalTime);
        if (end - s < minW) end = s + minW;
      }
      if (s < 0 || end > totalTime || end <= s) return;
      updateTextTime(textId, s, end);
    };
    const onMouseUp = () => { document.removeEventListener("pointermove", onMouseMove); document.removeEventListener("pointerup", onMouseUp); };
    document.addEventListener("pointermove", onMouseMove);
    document.addEventListener("pointerup", onMouseUp);
  };

  const tracks = onlyTrackZs ?? Array.from(new Set(localTexts.map(t => t.zIndex ?? 0)));
  const sortedTracks = [...tracks].sort((a, b) => a - b);

  return (
    <div ref={timelineRef} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      {sortedTracks.map(z => (
        <div key={z} style={{ position: "relative", width: "100%", height: ITEM_H }}>
          {localTexts.filter(t => (t.zIndex ?? 0) === z).map(text => {
            if (text.startTime === null || text.endTime === null) return null;
            const left = `${(text.startTime / totalTime) * 100}%`;
            const width = `${((text.endTime - text.startTime) / totalTime) * 100}%`;
            const isSelected = selectedTextId === text.id;

            return (
              <div key={text.id} style={{ position: "absolute", top: 0, height: "100%", left, width }}>
                <div
                  className="video-text"
                  style={{
                    position: "absolute", top: 0, height: "100%", left: 0, width: "100%",
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
                      onClick={e => { e.stopPropagation(); moveTextToTrack(text.id, "up"); }}
                      style={{ background: "rgba(20,20,30,.85)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 3, padding: 1, cursor: "pointer", lineHeight: 0 }}>
                      <ChevronUp size={9} color="white" />
                    </button>
                    <button title="Send backward"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); moveTextToTrack(text.id, "down"); }}
                      style={{ background: "rgba(20,20,30,.85)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 3, padding: 1, cursor: "pointer", lineHeight: 0 }}>
                      <ChevronDown size={9} color="white" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
