"use client";

/**
 * AudioRangeSlider — one row per audio track.
 * - Drag the body to move audio independently from its clip
 * - Drag handles to trim start/end
 * - Click mute icon to toggle
 * - Delete key removes the track entirely
 * Audio plays ONLY when currentTime is inside startTime..endTime
 * (enforced per-frame in CompositorCanvas)
 */
import React, { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";
import { ROW_H, ROW_GAP } from "./Layers";

const MIN_W_PCT = 0.5;

export default function AudioRangeSlider() {
  const { totalTime, audioDetails, setAudioDetails } = useAppDetailsContext();
  const ref = useRef<HTMLDivElement>(null);
  const [selId, setSelId] = useState<string | null>(null);

  // Keep a ref for the latest audioDetails so stale closures always read fresh
  const audioRef = useRef(audioDetails);
  useEffect(() => { audioRef.current = audioDetails; }, [audioDetails]);

  // Delete key
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || !selId) return;
      setAudioDetails(prev => prev.filter(a => a.id !== selId));
      setSelId(null);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [selId, setAudioDetails]);

  const handleDrag = (
    e: React.MouseEvent,
    id: string,
    type: "move" | "resize-left" | "resize-right"
  ) => {
    e.preventDefault(); e.stopPropagation();
    setSelId(id);
    const el = ref.current;
    if (!el || !totalTime) return;
    const tw = el.offsetWidth;
    const startX = e.clientX;
    const orig = audioRef.current.find(a => a.id === id)!;
    const minW = (MIN_W_PCT / 100) * totalTime;

    const mv = (me: MouseEvent) => {
      const dt = ((me.clientX - startX) / tw) * totalTime;
      let s = orig.startTime, end = orig.endTime;
      if (type === "move") {
        const dur = end - s;
        s = Math.max(0, Math.min(totalTime - dur, s + dt));
        end = s + dur;
      } else if (type === "resize-left") {
        s = Math.max(0, Math.min(end - minW, s + dt));
      } else {
        end = Math.max(s + minW, Math.min(totalTime, end + dt));
      }
      setAudioDetails(prev => prev.map(a => a.id === id ? { ...a, startTime: s, endTime: end } : a));
    };

    const up = () => {
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
  };

  const toggleMute = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAudioDetails(prev => prev.map(a => a.id === id ? { ...a, muted: !a.muted } : a));
  };

  if (!audioDetails.length) return null;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", gap: ROW_GAP }}>
      {audioDetails.map(track => {
        if (!totalTime) return null;
        const left = `${(track.startTime / totalTime) * 100}%`;
        const width = `${((track.endTime - track.startTime) / totalTime) * 100}%`;
        const dur = track.endTime - track.startTime;
        const isSel = selId === track.id;

        return (
          <div key={track.id} style={{ position: "relative", height: ROW_H, width: "100%", flexShrink: 0 }}>
            <div
              className="audio-chip"
              onClick={() => setSelId(track.id)}
              onMouseDown={e => handleDrag(e, track.id, "move")}
              style={{
                position: "absolute", top: 0, left, width, height: "100%",
                background: track.muted
                  ? "rgba(107,114,128,.35)"
                  : isSel ? "#FF8259" : "#6D28D9",
                outline: isSel ? "2px solid #5B21B6" : "none",
                borderRadius: 6, cursor: "move",
                display: "flex", alignItems: "center",
                overflow: "hidden", userSelect: "none",
                opacity: track.muted ? 0.5 : 1,
              }}
            >
              {/* Left resize */}
              <div onMouseDown={e => { e.stopPropagation(); handleDrag(e, track.id, "resize-left"); }}
                style={{ position: "absolute", left: 0, top: 0, width: 7, height: "100%", cursor: "ew-resize", background: "rgba(255,255,255,.25)", borderRadius: "6px 0 0 6px", zIndex: 10 }} />

              {/* Content */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 10px", overflow: "hidden", width: "100%" }}>
                {/* Waveform decoration */}
                <div style={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0 }}>
                  {[3, 7, 4, 9, 5, 8, 3, 7, 4].map((h, i) => (
                    <div key={i} style={{ width: 2, height: h, background: "rgba(255,255,255,.6)", borderRadius: 1 }} />
                  ))}
                </div>
                <span style={{ color: "white", fontSize: 10, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                  {track.name}
                </span>
                <span style={{ color: "rgba(255,255,255,.65)", fontSize: 9.5, fontFamily: "monospace", flexShrink: 0 }}>
                  {dur < 60 ? dur.toFixed(1) + "s" : formatVideoDuration(dur)}
                </span>
                {/* Mute button */}
                <button
                  onClick={e => toggleMute(track.id, e)}
                  onMouseDown={e => e.stopPropagation()}
                  title={track.muted ? "Unmute" : "Mute"}
                  style={{
                    background: "rgba(255,255,255,.15)", border: "none",
                    borderRadius: 4, padding: "1px 5px",
                    cursor: "pointer", color: "white",
                    fontSize: 9, fontWeight: 700, flexShrink: 0,
                  }}>
                  {track.muted ? "🔇" : "🔊"}
                </button>
              </div>

              {/* Right resize */}
              <div onMouseDown={e => { e.stopPropagation(); handleDrag(e, track.id, "resize-right"); }}
                style={{ position: "absolute", right: 0, top: 0, width: 7, height: "100%", cursor: "ew-resize", background: "rgba(255,255,255,.25)", borderRadius: "0 6px 6px 0", zIndex: 10 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
