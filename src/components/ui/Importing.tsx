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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", backdropFilter: "blur(8px)", zIndex: 1500, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div style={{ background: "#111120", border: "1px solid #211F33", borderRadius: 16, padding: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, boxShadow: "0 24px 48px rgba(0,0,0,.5)", minWidth: 220 }}>
        <div style={{ display: "flex", gap: 6 }}>
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
        <p style={{ fontSize: 13, fontWeight: 600, color: "#B8B4D1", fontFamily: "'JetBrains Mono',monospace", textAlign: "center" }}>
          {steps[stepIndex]}
        </p>
      </div>
    </div>
  );
}
