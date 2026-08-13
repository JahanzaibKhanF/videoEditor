"use client";

import { MdOutlineAnimation, ChevronUp, ChevronDown } from "@/utils/icons";
import React, { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";

const MIN_WIDTH_PERCENT = 1;

export default function ImagesRangeSlider() {
  const { totalTime, imagesDetails, setImagesDetails, clipsDetails } = useAppDetailsContext();
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

  // Reorders where this image sits in the shared VIDEO+IMAGE z-stack (see
  // compositeFrame.ts) — not just relative to other images anymore. Images
  // and video-track clips now share one zIndex numeric space, so an image
  // can land directly BETWEEN two video tracks, not only fully above or
  // fully below every video clip as a whole block.
  //
  // "up" = LOWER zIndex = frontmost — same convention moveClipToTrack uses
  // in VideoClipsRangeSlider.tsx (dragging a clip up allocates it a lower,
  // often negative, zIndex; compositeFrame draws lowest-zIndex last, i.e.
  // on top). This used to be the opposite ("up" = higher zIndex) purely
  // because images and video clips were drawn as two separate blocks and
  // never had to agree on a shared convention — now that they're merged
  // into one draw pass, both need the same rule or "up" would mean
  // opposite things depending which type of layer you clicked.
  //
  // Rather than swapping zIndex values with whatever neighbour is found
  // (which, if that neighbour is a video clip, would silently move that
  // clip to a different track as a side effect — a clip's zIndex doubles
  // as its track id, and a track can hold several clips that would get
  // left behind), this always allocates a fresh slot strictly between two
  // neighbouring zIndex values, the same fractional-gap approach
  // resolveTargetTrack uses for auto-creating video tracks. That way
  // moving an image never touches any other layer's zIndex.
  const moveImageStack = (id: string, dir: "up" | "down") => {
    const curZ = localImages.find(img => img.id === id)?.zIndex ?? 0;
    const others = Array.from(new Set([
      ...localImages.filter(img => img.id !== id).map(img => img.zIndex ?? 0),
      ...clipsDetails.map(c => c.zIndex ?? 0),
    ]));
    const zs = Array.from(new Set([...others, curZ])).sort((a, b) => a - b);
    const idx = zs.indexOf(curZ);

    let newZ: number;
    if (dir === "up") {
      if (idx === 0) {
        newZ = zs[idx] - 1;
      } else {
        const cand = zs[idx - 1];
        const beyond = idx - 2 >= 0 ? zs[idx - 2] : cand - 1;
        newZ = (cand + beyond) / 2;
      }
    } else {
      if (idx === zs.length - 1) {
        newZ = zs[idx] + 1;
      } else {
        const cand = zs[idx + 1];
        const beyond = idx + 2 < zs.length ? zs[idx + 2] : cand + 1;
        newZ = (cand + beyond) / 2;
      }
    }

    const updated = localImages.map(img => img.id === id ? { ...img, zIndex: newZ } : img);
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
      {/* Sorted by zIndex (not insertion order) so a row's position in this
          list actually matches its front/back position on the canvas —
          same "lower zIndex = higher in the list = frontmost" convention as
          VideoClipsRangeSlider.tsx. Previously this just mapped over
          `localImages` in whatever order they were added, so an image you
          moved behind the video with the down-chevron would still show up
          ABOVE it in this list — the canvas was already right, only the
          list was lying about it. */}
      {[...localImages].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(img => {
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
            {/* Overlay stacking order — which image/overlay draws on top of
                which (e.g. a transparent or background-removed PNG meant to
                sit above the base image/video). Only shown once selected. */}
            {isSelected && (
              <div style={{ position: "absolute", right: -18, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 1, zIndex: 15 }}>
                <button title="Bring forward (draw on top)"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); moveImageStack(img.id, "up"); }}
                  style={{ background: "rgba(20,20,30,.85)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 3, padding: 1, cursor: "pointer", lineHeight: 0 }}>
                  <ChevronUp size={9} color="white" />
                </button>
                <button title="Send backward"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); moveImageStack(img.id, "down"); }}
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