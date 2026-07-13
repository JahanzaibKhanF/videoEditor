"use client";
import { PiWarningOctagonFill } from "@/utils/icons";


export default function Error({ error, closerFunction }: { error: string; closerFunction?: () => void }) {
  return (
    <div onClick={closerFunction} style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "center", paddingTop: "12.3%", background: "rgba(0,0,0,.3)" }}>
      <div style={{ position: "fixed", display: "flex", alignItems: "center", gap: 8, background: "rgba(255,79,112,.12)", border: "1px solid rgba(255,79,112,.35)", borderRadius: 10, padding: "10px 16px", color: "#FF8FA3", fontSize: 13, fontWeight: 500, backdropFilter: "blur(8px)" }}>
        <PiWarningOctagonFill size={18} style={{ color: "#FF4F70", flexShrink: 0 }} />
        {error}!
      </div>
    </div>
  );
}
