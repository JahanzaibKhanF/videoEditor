"use client";

import { useEffect, useState } from "react";

const steps = ["Initializing Editor...", "Authenticating User...", "Fetching Video...", "Preparing Video for Editing..."];

export default function Importing() {
  const [stepIndex, setStepIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setStepIndex(prev => (prev + 1) % steps.length), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-[1500] flex justify-center items-center">
      <div className="bg-studio-surface border border-studio-border rounded-2xl p-7 flex flex-col items-center gap-4 shadow-pop min-w-[220px]">
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: "50%",
              background: `hsl(${[255, 270, 290][i]}, 90%, 72%)`,
              boxShadow: `0 0 8px hsl(${[255, 270, 290][i]}, 90%, 72%)`,
              animation: "bounce 1.2s infinite",
              animationDelay: `${i * 0.15}s`,
            }} />
          ))}
        </div>
        <p className="text-[13px] font-semibold text-ink-secondary font-mono text-center">
          {steps[stepIndex]}
        </p>
      </div>
    </div>
  );
}
