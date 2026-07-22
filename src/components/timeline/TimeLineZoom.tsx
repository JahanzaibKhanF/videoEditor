"use client";

import { useAppDetailsContext } from "../../context/useAppContext";
import Slider from "../ui/Slider";

export default function TimeLineZoom() {
  const { timelineZoom, setTimelineZoom, totalTime } = useAppDetailsContext();
  const max = Math.max(1, Math.min(totalTime || 60, 10 + (totalTime || 60) / 10));
  const pct = ((timelineZoom - 1) / (max - 1)) * 100;

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <span className="text-[9px] text-ink-muted font-semibold tracking-wide select-none">ZOOM</span>
      <div style={{ width: 72 }}>
        <Slider
          min={0}
          max={100}
          step={1}
          value={Math.round(pct)}
          onChange={(v) => {
            const frac = v / 100;
            setTimelineZoom(parseFloat((1 + frac * (max - 1)).toFixed(2)));
          }}
        />
      </div>
      <span className="text-[9.5px] text-ink-muted font-mono select-none" style={{ minWidth: 26 }}>
        {timelineZoom.toFixed(1)}×
      </span>
    </div>
  );
}
