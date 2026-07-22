"use client";

/**
 * TimeLine — CapCut-style layout with synchronized label/track scrolling.
 *
 * Layout:
 *  ┌──────────┬──────────────────────────────────────────────────┐
 *  │  LABELS  │  ruler                                           │ ← fixed header row
 *  ├──────────┼──────────────────────────────────────────────────┤
 *  │  labels  │  clip tracks                                     │ ← both scroll together vertically
 *  │  (fixed  │  (scrollable H + V)                             │
 *  │   col)   │                                                  │
 *  └──────────┴──────────────────────────────────────────────────┘
 *
 * Labels column is in the SAME scroll container but positioned sticky-left,
 * so vertical scroll moves both together. Horizontal scroll only moves tracks.
 */
import React, { useEffect, useRef } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { useEngineControls } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";
import { LayerType } from "../../types/types";
import TimeLineZoom from "./TimeLineZoom";
import Layers, { ROW_H, ROW_GAP } from "../layers/Layers";
import TemplateBar from "./TemplateBar";

export const LABEL_W = 80;
const RULER_H = 28;

export default function TimeLine({ compact = false }: { compact?: boolean }) {
  void compact; // used by mobile Editor to flag the 80px mini-strip; timeline adapts via its container height
  const {
    clipsDetails, totalTime, timelineZoom, setTimelineZoom,
    setCurrentTime, setSeekTime, seekTime, videos,
  } = useAppDetailsContext();
  const { seekTo } = useEngineControls();

  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef  = useRef<HTMLDivElement>(null);

  // Seek on click on track area
  const onTrackClick = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    const tr = trackRef.current;
    if (!el || !tr || !totalTime) return;
    const x = e.clientX - el.getBoundingClientRect().left + el.scrollLeft - LABEL_W;
    const t = Math.max(0, Math.min(1, x / (tr.scrollWidth - LABEL_W))) * totalTime;
    setSeekTime(t); setCurrentTime(t); seekTo(t);
  };

  // Drag seekbar needle — Pointer Events cover mouse, touch, and stylus
  // with one code path (the old mouse-only version silently did nothing
  // on touch devices, which is part of why the timeline felt broken on mobile).
  const onNeedleDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const el = scrollRef.current;
    const tr = trackRef.current;
    if (!el || !tr || !totalTime) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (me: PointerEvent) => {
      const x = me.clientX - el.getBoundingClientRect().left + el.scrollLeft - LABEL_W;
      const t = Math.max(0, Math.min(1, x / (tr.scrollWidth - LABEL_W))) * totalTime;
      setSeekTime(t); setCurrentTime(t); seekTo(t);
    };
    const up = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener("pointermove", move as EventListener);
      target.removeEventListener("pointerup", up as EventListener);
    };
    target.addEventListener("pointermove", move as EventListener);
    target.addEventListener("pointerup", up as EventListener);
  };

  // Scroll-wheel zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fn = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // only zoom with Ctrl
      e.preventDefault();
      const max = Math.max(1, Math.min(totalTime ?? 60, 10 + (totalTime ?? 60) / 10));
      setTimelineZoom(p => Math.max(1, Math.min(max, parseFloat((p - e.deltaY / 200).toFixed(2)))));
    };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [totalTime, setTimelineZoom]);

  const needlePct = totalTime ? (seekTime / totalTime) * 100 : 0;

  return (
    <div className="w-full h-full flex flex-col bg-studio-surface" style={{ minHeight: 0 }}>

      {/* ── Top header bar ──────────────────────────────────────── */}
      <div className="flex-shrink-0 h-[34px] flex items-center bg-studio-base border-b border-studio-border">
        <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0 }}
          className="h-full flex items-center px-3 border-r border-studio-border">
          <span className="text-[10.5px] font-bold uppercase tracking-[.7px] text-ink-muted">Layers</span>
        </div>
        <div className="flex-1 flex items-center px-3 gap-2">
          {clipsDetails.length > 0 && (
            <span className="inline-flex items-center gap-1 bg-[rgba(139,92,255,.08)] dark:bg-[rgba(139,92,255,.2)] border border-[rgba(139,92,255,.2)] text-signal dark:text-[#A5B4FC] rounded-full px-2 py-px text-[10.5px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              {clipsDetails.length} clip{clipsDetails.length !== 1 ? "s" : ""}
            </span>
          )}
          <div className="flex-1" />
          <TimeLineZoom />
        </div>
      </div>

      {/* ── Template bar (only when template active) ─────────────── */}
      <TemplateBar />

      {/* ── Body: single scroll container ────────────────────────── */}
      <div ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto scrollbar-thin"
        style={{ position: "relative" }}
      >
        {videos.length > 0 ? (
          <div ref={trackRef}
            style={{ minWidth: `calc(100% * ${timelineZoom})`, minHeight: "100%", display: "flex", flexDirection: "column" }}
          >
            {/* ── Ruler row (sticky top) ──────────────────────── */}
            <div style={{
              position: "sticky", top: 0, zIndex: 20,
              display: "flex", flexShrink: 0,
              background: "var(--ruler-bg, #F2F4F7)",
            }}
              className="dark:[--ruler-bg:#07070C]"
            >
              {/* Corner cell */}
              <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, height: RULER_H,
                borderRight: "1px solid", borderBottom: "1px solid", borderColor: "rgba(255,255,255,.07)" }}
                className="bg-studio-base"
              />
              {/* Ruler */}
              <div style={{ flex: 1, position: "relative", cursor: "pointer" }} onClick={onTrackClick}>
                <Ruler totalTime={totalTime} />
                {/* Needle head visible in ruler */}
                <div style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: `${needlePct}%`,
                  width: 2, zIndex: 10, pointerEvents: "none",
                }}>
                  <div onPointerDown={onNeedleDown} style={{
                    position: "absolute", top: 0,
                    left: "50%", transform: "translateX(-50%)",
                    width: 12, height: 16,
                    background: "linear-gradient(180deg,#8B5CFF,#A47CFF)",
                    borderRadius: "0 0 4px 4px",
                    cursor: "ew-resize", pointerEvents: "all",
                    touchAction: "none",
                  }} />
                  <div style={{
                    position: "absolute", top: 0, bottom: 0,
                    left: "50%", transform: "translateX(-50%)",
                    width: 1.5, background: "#8B5CFF", opacity: 0.85,
                  }} />
                </div>
              </div>
            </div>

            {/* ── Tracks + Labels row ─────────────────────────── */}
            <div style={{ flex: 1, display: "flex", position: "relative" }} onClick={onTrackClick}>

              {/* Sticky label column */}
              <div style={{
                position: "sticky", left: 0, zIndex: 10,
                width: LABEL_W, minWidth: LABEL_W, flexShrink: 0,
              }}
                className="bg-studio-base border-r border-studio-border"
              >
                <LabelColumn />
              </div>

              {/* Tracks */}
              <div style={{ flex: 1, position: "relative", paddingBottom: 4 }}>
                {/* Needle line over tracks */}
                <div style={{
                  position: "absolute", top: 0, bottom: 0, zIndex: 5,
                  left: `${needlePct}%`,
                  width: 1.5, background: "#8B5CFF", opacity: 0.7,
                  pointerEvents: "none",
                }} />
                <Layers />
              </div>

            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center w-full h-full text-ink-muted dark:text-[rgba(255,255,255,.25)] text-[13px] italic py-8">
            Import a video to get started
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ruler ──────────────────────────────────────────────────────────────────
function Ruler({ totalTime }: { totalTime: number }) {
  if (!totalTime) return <div style={{ height: RULER_H }} />;
  const divs = 12;
  const steps = Array.from({ length: divs + 1 }, (_, i) => (i * totalTime) / divs);
  const micro = Array.from({ length: divs * 5 }, (_, i) => (i * totalTime) / (divs * 5));

  return (
    <div style={{ height: RULER_H, position: "relative", width: "100%", borderBottom: "1px solid rgba(0,0,0,.07)" }}
      className="bg-studio-base select-none">
      {micro.map((t, i) => {
        const nearMain = steps.some(s => Math.abs(s - t) < totalTime / 200);
        return (
          <div key={i} style={{
            position: "absolute", bottom: 0,
            left: `${(t / totalTime) * 100}%`,
            width: nearMain ? 1.5 : 1,
            height: nearMain ? 10 : 5,
            background: nearMain ? "#9DA3B4" : "#C5CAD4",
            opacity: nearMain ? 0.8 : 0.45,
          }} />
        );
      })}
      {steps.map((t, i) => (
        <div key={i} style={{
          position: "absolute", top: 3,
          left: `${(t / totalTime) * 100}%`,
          transform: "translateX(-50%)",
          fontSize: 9.5, fontWeight: 600, color: "#89859F", whiteSpace: "nowrap",
        }}>
          {formatVideoDuration(t)}
        </div>
      ))}
    </div>
  );
}

// ── LabelColumn ────────────────────────────────────────────────────────────
function LabelColumn() {
  const {
    blursDetails, textsDetails, imagesDetails, clipsDetails, audioDetails,
    layerOrder, setLayerOrder
  } = useAppDetailsContext();

  const DEFAULT: LayerType[] = ["video","audio","image","text","blur"];
  const CFG = {
    blur:  { label: "Blur",  color: "#33D8A0" },
    text:  { label: "Text",  color: "#8B5CFF" },
    image: { label: "Image", color: "#EC4899" },
    audio: { label: "Audio", color: "#4C8CFF" },
    video: { label: "Video", color: "#FFB648" },
  } as const;

  // Sort descending by zIndex (same as Layers.tsx) so labels align with tracks
  const order = (layerOrder.length > 0
    ? [...layerOrder].sort((a, b) => b.zIndex - a.zIndex).map(l => l.type)
    : [...DEFAULT].reverse()) as LayerType[];
  const counts: Record<LayerType, number> = {
    blur: blursDetails.length, text: textsDetails.length,
    image: imagesDetails.length, audio: audioDetails.length, video: clipsDetails.length,
  };
  const active = order.filter(t => counts[t] > 0);

  const move = (type: LayerType, dir: "up" | "down") => {
    setLayerOrder(prev => {
      const types = prev.map(l => l.type);
      const i = types.indexOf(type);
      if (i === -1) return prev;
      const next = [...types];
      const j = dir === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((t, idx) => ({ type: t, zIndex: idx }));
    });
  };

  const rows: { key: string; type: LayerType; label: string; color: string; sub?: string; isFirst: boolean; isLast: boolean }[] = [];
  active.forEach((type, layerIdx) => {
    const isFirst = layerIdx === 0;
    const isLast  = layerIdx === active.length - 1;
    if (type === "video") {
      const sorted = [...clipsDetails].sort((a,b) => (a.zIndex??0)-(b.zIndex??0));
      sorted.forEach((clip, ci) => {
        rows.push({ key: `video-${clip.id}`, type, label: "Video", color: CFG.video.color,
          sub: clip.name?.slice(0,10), isFirst: isFirst && ci === 0, isLast: isLast && ci === sorted.length - 1 });
      });
    } else if (type === "audio") {
      audioDetails.forEach((track, ti) => {
        rows.push({ key: `audio-${track.id}`, type, label: "Audio", color: CFG.audio.color,
          sub: track.name?.slice(0,10), isFirst: isFirst && ti === 0, isLast: isLast && ti === audioDetails.length - 1 });
      });
    } else {
      rows.push({ key: type, type, label: CFG[type].label, color: CFG[type].color, isFirst, isLast });
    }
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP, paddingBottom: 4 }}>
      {rows.map((row) => (
        <div key={row.key} style={{
          height: ROW_H, flexShrink: 0,
          display: "flex", alignItems: "center",
          background: `${row.color}18`,
          borderLeft: `3px solid ${row.color}`,
          paddingLeft: 6, paddingRight: 4,
          gap: 4,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: row.color, lineHeight: 1.1 }}>{row.label}</div>
            {row.sub && <div style={{ fontSize: 8.5, color: "rgba(100,100,100,.8)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.sub}</div>}
          </div>
          {/* Show ▲▼ only on first row of each layer type */}
          {(!row.key.includes("video-") || row.key === `video-${clipsDetails[0]?.id}`) &&
           (!row.key.includes("audio-") || row.key === `audio-${audioDetails[0]?.id}`) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <button onClick={(e) => { e.stopPropagation(); move(row.type, "up"); }} disabled={row.isFirst}
                style={{ background: "none", border: "none", padding: "1px 2px", cursor: row.isFirst ? "default" : "pointer", opacity: row.isFirst ? 0.2 : 0.6, fontSize: 8, lineHeight: 1, color: "inherit" }}>▲</button>
              <button onClick={(e) => { e.stopPropagation(); move(row.type, "down"); }} disabled={row.isLast}
                style={{ background: "none", border: "none", padding: "1px 2px", cursor: row.isLast ? "default" : "pointer", opacity: row.isLast ? 0.2 : 0.6, fontSize: 8, lineHeight: 1, color: "inherit" }}>▼</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
