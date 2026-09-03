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
  const { totalTime, audioDetails, setAudioDetails, clipsDetails } = useAppDetailsContext();
  const [selId, setSelId] = useState<string | null>(null);

  // Show the SAME label as the paired video row — the real source filename
  // off the clip this audio belongs to (via clipId). Falls back to the
  // stored `track.name` for older projects whose clip is gone. Fixes the
  // "audio lane shows a different name than its video" mismatch, where
  // `track.name` was a synthetic internal id and the clip row shows
  // `sourceFileName`.
  const pairedClip = clipsDetails.find(c => c.id === track.clipId);
  const displayName = pairedClip?.sourceFileName ?? pairedClip?.name ?? track.name;

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
    const fn = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(`[data-audio-id="${track.id}"]`)) setSelId(null);
    };
    window.addEventListener("pointerdown", fn);
    return () => window.removeEventListener("pointerdown", fn);
  }, [track.id]);

  const handleDrag = (
    e: React.PointerEvent,
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

    const mv = (me: PointerEvent) => {
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
      document.removeEventListener("pointermove", mv);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", mv);
    document.addEventListener("pointerup", up);
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
      onPointerDown={e => handleDrag(e, "move")}
      style={{
        position: "absolute", top: 0, left, width, height: "100%",
        background: track.muted
          ? "linear-gradient(180deg, #6B7280 0%, #565E6B 100%)"
          : "linear-gradient(180deg, #5E8BF0 0%, #3457C7 100%)",
        boxShadow: isSel
          ? "0 0 0 2px #8B5CFF, 0 4px 14px -4px rgba(139,92,255,.55)"
          : "inset 0 1px 0 rgba(255,255,255,.25), 0 1px 3px rgba(0,0,0,.28)",
        borderRadius: 7, cursor: "move",
        display: "flex", alignItems: "center",
        overflow: "hidden", userSelect: "none",
        opacity: track.muted ? 0.55 : 1,
        transition: "box-shadow .12s",
      }}
    >
      {/* Left resize */}
      <div onPointerDown={e => { e.stopPropagation(); handleDrag(e, "resize-left"); }}
        style={{ position: "absolute", left: 0, top: 0, width: 8, height: "100%", cursor: "ew-resize", background: isSel ? "rgba(0,0,0,.18)" : "rgba(0,0,0,.1)", borderRadius: "7px 0 0 7px", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 2, height: 12, borderRadius: 2, background: "rgba(255,255,255,.7)" }} />
      </div>

      {/* Content */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 10px", overflow: "hidden", width: "100%" }}>
        {/* Waveform decoration */}
        <div style={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0, opacity: .85 }}>
          {[3, 7, 4, 9, 5, 8, 3, 7, 4, 6, 3].map((h, i) => (
            <div key={i} style={{ width: 2, height: h, background: "rgba(255,255,255,.7)", borderRadius: 1 }} />
          ))}
        </div>
        <span style={{ color: "white", fontSize: 10, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
          {displayName}
        </span>
        <span style={{ color: "rgba(255,255,255,.65)", fontSize: 9.5, fontFamily: "monospace", flexShrink: 0 }}>
          {dur < 60 ? dur.toFixed(1) + "s" : formatVideoDuration(dur)}
        </span>
        {/* Mute button */}
        <button
          onClick={toggleMute}
          onPointerDown={e => e.stopPropagation()}
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
      <div onPointerDown={e => { e.stopPropagation(); handleDrag(e, "resize-right"); }}
        style={{ position: "absolute", right: 0, top: 0, width: 8, height: "100%", cursor: "ew-resize", background: isSel ? "rgba(0,0,0,.18)" : "rgba(0,0,0,.1)", borderRadius: "0 7px 7px 0", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 2, height: 12, borderRadius: 2, background: "rgba(255,255,255,.7)" }} />
      </div>
    </div>
  );
}