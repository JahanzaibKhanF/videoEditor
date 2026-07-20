"use client";

import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";

export default function TimelineDuration() {
  const { timelineZoom, totalTime } = useAppDetailsContext();
  const divisions = Math.round(14 * timelineZoom);
  const steps = Array.from({ length: divisions + 1 }, (_, i) => (i * totalTime) / divisions);
  const microRes = 5;
  const microSteps = Array.from({ length: divisions * microRes }, (_, i) => (i * totalTime) / (divisions * microRes));

  return (
    <div className="w-full h-7 relative select-none">
      {microSteps.map((time, i) => {
        const isNearMain = steps.some(m => Math.abs(m - time) < totalTime / 300);
        return (
          <div
            key={i}
            className="absolute bg-[#9DA3B4] dark:bg-[rgba(255,255,255,.2)]"
            style={{
              width: isNearMain ? 2 : 1,
              height: isNearMain ? 10 : 6,
              opacity: isNearMain ? 0.7 : 0.35,
              top: 0,
              left: `${(time / totalTime) * 100}%`,
            }}
          />
        );
      })}
      {steps.map((time, i) => {
        const label = formatVideoDuration(time);
        if (i > 0 && label === formatVideoDuration(steps[i - 1])) return null;
        return (
          <div
            key={i}
            className="absolute top-2 text-[10px] text-[#6B7280] dark:text-[rgba(255,255,255,.3)]"
            style={{ left: `${(time / totalTime) * 100}%`, transform: "translateX(-50%)" }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}
