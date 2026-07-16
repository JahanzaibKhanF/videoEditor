"use client";

/**
 * VideoClipsRangeSlider — each clip = its own row.
 * When a clip is moved, its matching audio track moves with it (same delta).
 * When a clip is resized, audio track end is trimmed to match.
 */
import React, { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";
import { ROW_H, ROW_GAP } from "./Layers";

const MIN_W_PCT = 1;

export default function VideoClipsRangeSlider() {
  const {
    totalTime, setTotalTime,
    clipsDetails, setClipsDetails,
    audioDetails, setAudioDetails,
    setSelectedClipId: setCtxSel,
  } = useAppDetailsContext();

  const ref = useRef<HTMLDivElement>(null);
  const [selId, setSelId] = useState<string | null>(null);

  // Deselect on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".vc-chip")) setSelId(null);
    };
    window.addEventListener("mousedown", fn);
    return () => window.removeEventListener("mousedown", fn);
  }, []);

  // Delete on key
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || !selId || clipsDetails.length <= 1) return;
      setClipsDetails(prev => prev.filter(c => c.id !== selId));
      setAudioDetails(prev => prev.filter(a => a.clipId !== selId));
      setSelId(null); setCtxSel(null);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [selId, clipsDetails, setClipsDetails, setAudioDetails, setCtxSel]);

  const drag = (e: React.MouseEvent, id: string, type: "move" | "resize-left" | "resize-right") => {
    e.preventDefault(); e.stopPropagation();
    setSelId(id); setCtxSel(id);
    const el = ref.current;
    if (!el || !totalTime) return;
    const tw = el.offsetWidth;
    const startX = e.clientX;
    const origClip = clipsDetails.find(c => c.id === id)!;
    const origAudio = audioDetails.find(a => a.clipId === id);
    const minW = (MIN_W_PCT / 100) * totalTime;

    const mv = (me: MouseEvent) => {
      const dt = ((me.clientX - startX) / tw) * totalTime;
      let sp = origClip.startPosition ?? 0;
      let ep = origClip.endPosition ?? 0;
      let st = origClip.startTime ?? 0;
      let et = origClip.endTime ?? 0;

      if (type === "move") {
        const dur = ep - sp;
        sp = Math.max(0, Math.min(totalTime - dur, sp + dt));
        ep = sp + dur;
        // Move audio track by the same delta
        if (origAudio) {
          const aDur = origAudio.endTime - origAudio.startTime;
          const newAStart = Math.max(0, origAudio.startTime + dt);
          setAudioDetails(prev => prev.map(a =>
            a.clipId === id ? { ...a, startTime: newAStart, endTime: newAStart + aDur } : a
          ));
        }
      } else if (type === "resize-left") {
        let nsp = Math.max(0, Math.min(ep - minW, sp + dt));
        let nst = et - (ep - nsp);
        if (nst < 0) { nst = 0; nsp = ep - et; }
        if (et - nst > origClip.duration) { nst = et - origClip.duration; nsp = ep - origClip.duration; }
        sp = nsp; st = Math.max(0, nst);
        // Trim audio start to match
        if (origAudio) {
          setAudioDetails(prev => prev.map(a =>
            a.clipId === id ? { ...a, startTime: Math.max(origAudio.startTime, sp) } : a
          ));
        }
      } else {
        let nep = Math.max(sp + minW, Math.min(totalTime, ep + dt));
        let net = st + (nep - sp);
        if (net > origClip.duration) { net = origClip.duration; nep = sp + (net - st); }
        ep = nep; et = net;
        // Trim audio end to match
        if (origAudio) {
          setAudioDetails(prev => prev.map(a =>
            a.clipId === id ? { ...a, endTime: Math.min(origAudio.endTime, ep) } : a
          ));
        }
      }

      setClipsDetails(prev => prev.map(c =>
        c.id === id ? { ...c, startPosition: sp, endPosition: ep, startTime: st, endTime: et } : c
      ));
    };

    const up = () => {
      setTotalTime(prev => {
        const maxEnd = clipsDetails.reduce((m, c) => Math.max(m, c.endPosition ?? 0), 0);
        return Math.max(prev, maxEnd);
      });
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
  };

  const sorted = [...clipsDetails].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", gap: ROW_GAP }}>
      {sorted.map(clip => {
        if (!totalTime || clip.startPosition === null || clip.endPosition === null) return null;
        const left = `${((clip.startPosition ?? 0) / totalTime) * 100}%`;
        const width = `${(((clip.endPosition ?? 0) - (clip.startPosition ?? 0)) / totalTime) * 100}%`;
        const dur = (clip.endPosition ?? 0) - (clip.startPosition ?? 0);
        const isSel = selId === clip.id;

        return (
          <div key={clip.id} style={{ position: "relative", height: ROW_H, width: "100%", flexShrink: 0 }}>
            <div className="vc-chip"
              onMouseDown={e => drag(e, clip.id, "move")}
              onClick={e => { e.stopPropagation(); setSelId(clip.id); setCtxSel(clip.id); }}
              style={{
                position: "absolute", top: 0, left, width, height: "100%",
                background: isSel ? "#2563EB" : "#4F7EF7",
                outline: isSel ? "2px solid #1D4ED8" : "none",
                borderRadius: 6, cursor: "move",
                display: "flex", alignItems: "center",
                overflow: "hidden", userSelect: "none",
              }}>
              {/* Left trim */}
              <div onMouseDown={e => { e.stopPropagation(); drag(e, clip.id, "resize-left"); }}
                style={{ position: "absolute", left: 0, top: 0, width: 7, height: "100%", cursor: "ew-resize", background: "rgba(255,255,255,.3)", borderRadius: "6px 0 0 6px", zIndex: 10 }} />
              {/* Content */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 10px", overflow: "hidden", width: "100%" }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, opacity: .9 }}>
                  <rect x=".5" y="1.5" width="9" height="7" rx="1" stroke="white" strokeWidth="1" />
                  <path d="M3.5 3.5l3 2-3 2V3.5z" fill="white" />
                </svg>
                <span style={{ color: "white", fontSize: 10, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                  {clip.name}
                </span>
                <span style={{ color: "rgba(255,255,255,.85)", fontSize: 9.5, fontFamily: "monospace", flexShrink: 0 }}>
                  {dur < 60 ? dur.toFixed(1) + "s" : formatVideoDuration(dur)}
                </span>
              </div>
              {/* Right trim */}
              <div onMouseDown={e => { e.stopPropagation(); drag(e, clip.id, "resize-right"); }}
                style={{ position: "absolute", right: 0, top: 0, width: 7, height: "100%", cursor: "ew-resize", background: "rgba(255,255,255,.3)", borderRadius: "0 6px 6px 0", zIndex: 10 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
