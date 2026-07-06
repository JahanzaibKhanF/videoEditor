"use client";

import { PiWarningOctagonFill } from "react-icons/pi";

export default function Error({ error, closerFunction }: { error: string; closerFunction?: () => void }) {
  return (
    <div onClick={closerFunction} style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "center", paddingTop: "12.3%", background: "rgba(0,0,0,.3)" }}>
      <div style={{ position: "fixed", display: "flex", alignItems: "center", gap: 8, background: "#FEF2F2", border: "1px solid #EF4444", borderRadius: 10, padding: "10px 16px", color: "#B91C1C", fontSize: 13, fontWeight: 500 }}>
        <PiWarningOctagonFill size={18} style={{ color: "#EF4444", flexShrink: 0 }} />
        {error}!
      </div>
    </div>
  );
}
