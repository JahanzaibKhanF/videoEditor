"use client";

import React from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { useEngineControls } from "../../context/useAppContext";

export default function Seekbar({
  rangeRef, parentRef,
}: {
  rangeRef: React.MutableRefObject<HTMLDivElement | null>;
  parentRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const { videos, seekTime, totalTime, textsDetails, imagesDetails, clipsDetails, setSeekTime, setCurrentTime } = useAppDetailsContext();
  const { seekTo } = useEngineControls();

  const handleMouseDown = () => {
    const rangeEl = rangeRef.current;
    const parentEl = parentRef.current;
    if (!rangeEl || !parentEl || !totalTime) return;

    const parentRect = parentEl.getBoundingClientRect();
    const style = getComputedStyle(parentEl);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;

    const update = (e: MouseEvent) => {
      const fullWidth = rangeEl.scrollWidth || 1;
      const clickX = e.clientX - parentRect.left + parentEl.scrollLeft - paddingLeft - borderLeft;
      const t = Math.min(Math.max(clickX / fullWidth, 0), 1) * totalTime;
      setSeekTime(t);
      setCurrentTime(t);
      seekTo(t);
    };

    const onMove = (e: MouseEvent) => update(e);
    const onUp = (e: MouseEvent) => {
      update(e);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const layerCount = textsDetails.length + imagesDetails.length + clipsDetails.length;

  return (
    <div>
      {videos.length > 0 && (
        <div
          className="w-3 absolute left-0 cursor-ew-resize z-50 transition-[left] duration-75"
          onMouseDown={handleMouseDown}
          style={{
            left: totalTime ? `${(seekTime / totalTime) * 100}%` : "0%",
            height: layerCount > 8 ? `${layerCount * 60}px` : "100%",
          }}
        >
          {/* Head */}
          <div className="absolute w-full top-0 h-3 right-[50%] rounded-br rounded-bl mx-auto z-10"
            style={{ background: "linear-gradient(180deg,#8B5CFF,#A47CFF)" }} />
          {/* Line */}
          <div className="absolute h-full mx-auto top-0 bg-[#8B5CFF]"
            style={{ width: 1.5, transform: "translateX(-50%)" }} />
        </div>
      )}
    </div>
  );
}
