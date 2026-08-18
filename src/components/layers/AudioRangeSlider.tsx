"use client";

/**
 * AudioRangeSlider — one row per audio track.
 * - Drag the body to move audio independently from its clip
 * - Drag handles to trim start/end
 * - Click mute icon to toggle
 * - Delete key removes the track entirely
 * Audio plays ONLY when currentTime is inside startTime..endTime
 * (enforced per-frame in CompositorCanvas)
 *
 * Rendering has moved: each audio row is now rendered by
 * VideoClipsRangeSlider directly beneath its paired clip (via the
 * `AudioTrackRow` export below), so a clip's audio always sits right under
 * its own video row and moves with it when the clip is reordered — instead
 * of every clip's video row being grouped separately from every clip's
 * audio row. `AudioTrackRow` is the single-track row extracted out of what
 * used to be this file's own `.map()` over ALL audio tracks at once.
 */
import React, { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";
import { VolumeX, Volume2 } from "@/utils/icons";
import { AudioDetails } from "../../types/types";

const MIN_W_PCT = 0.5;

export function AudioTrackRow({ track, containerRef }: { track: AudioDetails; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { totalTime, audioDetails, setAudioDetails } = useAppDetailsContext();
  const [selId, setSelId] = useState<string | null>(null);

  const audioRef = useRef(audioDetails);
  useEffect(() => { audioRef.current = audioDetails; }, [audioDetails]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || selId !== track.id) return;
      setAudioDetails(prev => prev.filter(a => a.id !== track.id));
      setSelId(null);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [selId, track.id, setAudioDetails]);

  // Deselect on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(`[data-audio-id="${track.id}"]`)) setSelId(null);
    };
    window.addEventListener("mousedown", fn);
    return () => window.removeEventListener("mousedown", fn);
  }, [track.id]);

  const handleDrag = (
    e: React.MouseEvent,
    type: "move" | "resize-left" | "resize-right"
  ) => {
    e.preventDefault(); e.stopPropagation();
    setSelId(track.id);
    const el = containerRef.current;
    if (!el || !totalTime) return;
    const tw = el.offsetWidth;
    const startX = e.clientX;
    const orig = audioRef.current.find(a => a.id === track.id)!;
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
      setAudioDetails(prev => prev.map(a => a.id === track.id ? { ...a, startTime: s, endTime: end } : a));
    };

    const up = () => {
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAudioDetails(prev => prev.map(a => a.id === track.id ? { ...a, muted: !a.muted } : a));
  };

  if (!totalTime) return null;
  const left = `${(track.startTime / totalTime) * 100}%`;
  const width = `${((track.endTime - track.startTime) / totalTime) * 100}%`;
  const dur = track.endTime - track.startTime;
  const isSel = selId === track.id;

  return (
    <div
      className="audio-chip"
      data-audio-id={track.id}
      onClick={() => setSelId(track.id)}
      onMouseDown={e => handleDrag(e, "move")}
      style={{
        position: "absolute", top: 0, left, width, height: "100%",
        background: track.muted
          ? "rgba(107,114,128,.35)"
          : isSel ? "#6EA8FF" : "#3D6FE0",
        outline: isSel ? "2px solid #4C8CFF" : "none",
        borderRadius: 6, cursor: "move",
        display: "flex", alignItems: "center",
        overflow: "hidden", userSelect: "none",
        opacity: track.muted ? 0.5 : 1,
      }}
    >
      {/* Left resize */}
      <div onMouseDown={e => { e.stopPropagation(); handleDrag(e, "resize-left"); }}
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
          onClick={toggleMute}
          onMouseDown={e => e.stopPropagation()}
          title={track.muted ? "Unmute" : "Mute"}
          style={{
            background: "rgba(255,255,255,.15)", border: "none",
            borderRadius: 4, padding: "1px 5px",
            cursor: "pointer", color: "white",
            fontSize: 9, fontWeight: 700, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          {track.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
        </button>
      </div>

      {/* Right resize */}
      <div onMouseDown={e => { e.stopPropagation(); handleDrag(e, "resize-right"); }}
        style={{ position: "absolute", right: 0, top: 0, width: 7, height: "100%", cursor: "ew-resize", background: "rgba(255,255,255,.25)", borderRadius: "0 6px 6px 0", zIndex: 10 }} />
    </div>
  );
}