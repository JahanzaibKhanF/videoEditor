"use client";

/**
 * KeyframeLane — thin diamond lane under the selected layer's timeline rows:
 * one sub-row per active keyframe track, PLUS (if the layer has a preset
 * `animation`) a distinct amber "Animation" row so a fadeIn/slideUp/etc.
 * shows up as something you can see and remove right alongside real
 * keyframes — not a separate, invisible concept. Full-width so everything
 * lines up with the clips / ruler / playhead above (no label column of its
 * own — labels float at each row's left edge).
 *
 *  • click a diamond    → select it + move the playhead there
 *  • drag a diamond      → retime (real keyframes always; the Animation
 *                          marker only for text/image, whose entrance plays
 *                          at their own `startTime` — a clip's animation is
 *                          anchored to the clip's position on the main
 *                          timeline instead, so that one is delete-only here)
 *  • right-click / ✕      → delete (a real key, or the whole animation)
 *  • double-click a row   → add a key at that time (current interpolated value)
 *
 * There is deliberately no playhead line here — the main timeline needle
 * already runs the full height of the track area, including this lane.
 */
import { useRef, useState, PointerEvent as ReactPointerEvent } from "react";
import { useAppDetailsContext, useEngineControls } from "../../context/useAppContext";
import { KeyframeTrack, KfProp } from "../../types/types";
import { propMeta, retimeKey, removeKey, upsertKey, upsertTrack, evalTrack } from "../../utils/keyframes";
import { X, Sparkles } from "@/utils/icons";

const ROW_H = 15;
const MIN_SEP = 0.05;

type Sel = { kind: "prop"; prop: KfProp; id: string } | { kind: "anim" } | null;

export default function KeyframeLane() {
  const {
    totalTime, setCurrentTime, activeTemplate,
    selectedClipId, clipsDetails, setClipsDetails,
    selectedTextId, textsDetails, setTextsDetails,
    selectedImageID, imagesDetails, setImagesDetails,
    selectedBlurId, blursDetails, setBlursDetails,
  } = useAppDetailsContext();
  const { seekTo } = useEngineControls();
  const laneRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Sel>(null);

  if (activeTemplate || !totalTime) return null;

  let tracks: KeyframeTrack[] | undefined;
  let commit: (t: KeyframeTrack[] | undefined) => void = () => {};
  let animation: string | undefined;
  let animStart = 0;
  let retimeAnimation: ((t: number) => void) | null = null;
  let clearAnimation: (() => void) | null = null;

  if (selectedClipId) {
    const c = clipsDetails.find(x => x.id === selectedClipId);
    tracks = c?.keyframes;
    commit = t => setClipsDetails(prev => prev.map(x => x.id === selectedClipId ? { ...x, keyframes: t } : x));
    animation = c?.animation;
    animStart = c?.startPosition ?? 0;
    clearAnimation = () => setClipsDetails(prev => prev.map(x => x.id === selectedClipId ? { ...x, animation: "none" } : x));
    // No retimeAnimation — a clip's animation is anchored to its position on
    // the main timeline, which is dragged via the clip itself, not here.
  } else if (selectedTextId) {
    const el = textsDetails.find(x => x.id === selectedTextId);
    tracks = el?.keyframes;
    commit = t => setTextsDetails(prev => prev.map(x => x.id === selectedTextId ? { ...x, keyframes: t } : x));
    animation = el?.animation;
    animStart = el?.startTime ?? 0;
    retimeAnimation = (t) => setTextsDetails(prev => prev.map(x => x.id === selectedTextId
      ? { ...x, startTime: Math.max(0, Math.min(t, x.endTime - MIN_SEP)) } : x));
    clearAnimation = () => setTextsDetails(prev => prev.map(x => x.id === selectedTextId ? { ...x, animation: "none" } : x));
  } else if (selectedImageID) {
    const el = imagesDetails.find(x => x.id === selectedImageID);
    tracks = el?.keyframes;
    commit = t => setImagesDetails(prev => prev.map(x => x.id === selectedImageID ? { ...x, keyframes: t } : x));
    animation = el?.animation;
    animStart = el?.startTime ?? 0;
    retimeAnimation = (t) => setImagesDetails(prev => prev.map(x => x.id === selectedImageID
      ? { ...x, startTime: Math.max(0, Math.min(t, x.endTime - MIN_SEP)) } : x));
    clearAnimation = () => setImagesDetails(prev => prev.map(x => x.id === selectedImageID ? { ...x, animation: "none" } : x));
  } else if (selectedBlurId) {
    const b = blursDetails.find(x => x.id === selectedBlurId);
    tracks = b?.keyframes;
    commit = t => setBlursDetails(prev => prev.map(x => x.id === selectedBlurId ? { ...x, keyframes: t } : x));
  }

  const hasAnimation = !!animation && animation !== "none";
  if ((!tracks || tracks.length === 0) && !hasAnimation) return null;
  const trk = tracks ?? [];

  const seek = (t: number) => { setCurrentTime(t); seekTo(t); };
  const timeAtX = (clientX: number) => {
    const r = laneRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * totalTime;
  };

  const dragKey = (track: KeyframeTrack, id: string) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setSel({ kind: "prop", prop: track.prop, id });
    let moved = false;
    const mv = (ev: PointerEvent) => { moved = true; commit(upsertTrack(trk, retimeKey(track, id, timeAtX(ev.clientX)))); };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      if (!moved) { const k = track.keys.find(x => x.id === id); if (k) seek(k.t); }
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const dragAnim = (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setSel({ kind: "anim" });
    let moved = false;
    const mv = (ev: PointerEvent) => { moved = true; retimeAnimation?.(timeAtX(ev.clientX)); };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      if (!moved) seek(animStart);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const selKey = sel?.kind === "prop" ? trk.find(t => t.prop === sel.prop)?.keys.find(k => k.id === sel.id) : undefined;

  return (
    <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,.07)", position: "relative" }}>
      <div ref={laneRef} style={{ position: "relative" }}>
        {hasAnimation && (
          <div key="__animation" style={{ position: "relative", height: ROW_H }}>
            <span className="text-warning/80" style={{ position: "absolute", left: 4, top: 2, fontSize: 8, fontWeight: 700, letterSpacing: 0.3, pointerEvents: "none", textShadow: "0 0 3px #000" }}>
              Animation
            </span>
            <div
              onPointerDown={retimeAnimation ? dragAnim : (e) => { e.stopPropagation(); setSel({ kind: "anim" }); }}
              onContextMenu={(e) => { e.preventDefault(); clearAnimation?.(); setSel(null); }}
              title={`${animation} @ ${animStart.toFixed(2)}s${retimeAnimation ? " — drag to retime, right-click to remove" : " — right-click to remove"}`}
              style={{
                position: "absolute", top: ROW_H / 2 - (sel?.kind === "anim" ? 6 : 5),
                width: sel?.kind === "anim" ? 12 : 10, height: sel?.kind === "anim" ? 12 : 10,
                left: `calc(${(animStart / totalTime) * 100}% - ${sel?.kind === "anim" ? 6 : 5}px)`,
                background: sel?.kind === "anim" ? "#fff" : "#FFB648", borderRadius: "50%",
                cursor: retimeAnimation ? "grab" : "pointer",
                border: `1.5px solid ${sel?.kind === "anim" ? "#FFB648" : "#fff"}`,
                boxShadow: "0 1px 3px rgba(0,0,0,.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Sparkles size={7} color={sel?.kind === "anim" ? "#FFB648" : "#fff"} />
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1 }} className="bg-warning/20" />
          </div>
        )}

        {trk.map((track, ti) => (
          <div
            key={track.prop}
            style={{ position: "relative", height: ROW_H }}
            onDoubleClick={(e) => {
              const t = timeAtX(e.clientX);
              const v = evalTrack(track, t) ?? propMeta(track.prop).neutral;
              commit(upsertTrack(trk, upsertKey(track, t, v)));
            }}
          >
            <span
              className="text-ink-faint"
              style={{ position: "absolute", left: 4, top: 2, fontSize: 8, fontWeight: 700, letterSpacing: 0.3, pointerEvents: "none", textShadow: "0 0 3px #000" }}
            >
              {propMeta(track.prop).label}
            </span>
            {track.keys.map((k) => {
              const on = sel?.kind === "prop" && sel.prop === track.prop && sel.id === k.id;
              return (
                <div
                  key={k.id}
                  onPointerDown={dragKey(track, k.id)}
                  onContextMenu={(e) => { e.preventDefault(); commit(upsertTrack(trk, removeKey(track, k.id))); if (on) setSel(null); }}
                  title={`${propMeta(track.prop).label} @ ${k.t.toFixed(2)}s — drag to move, right-click to delete`}
                  style={{
                    position: "absolute", top: ROW_H / 2 - (on ? 5 : 4),
                    width: on ? 10 : 8, height: on ? 10 : 8,
                    left: `calc(${(k.t / totalTime) * 100}% - ${on ? 5 : 4}px)`,
                    background: on ? "#fff" : "#8B5CFF", transform: "rotate(45deg)",
                    cursor: "grab", border: `1px solid ${on ? "#8B5CFF" : "#fff"}`, borderRadius: 1,
                    boxShadow: "0 1px 3px rgba(0,0,0,.4)",
                  }}
                />
              );
            })}
            {ti < trk.length - 1 && (
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1 }} className="bg-studio-border/30" />
            )}
          </div>
        ))}
      </div>

      {selKey && sel?.kind === "prop" && (
        <button
          onClick={() => { commit(upsertTrack(trk, removeKey(trk.find(t => t.prop === sel.prop)!, sel.id))); setSel(null); }}
          className="absolute right-1 top-0 flex items-center gap-1 text-[8.5px] font-bold text-danger bg-danger/15 border border-danger/30 rounded px-1 py-px hover:bg-danger/25 transition-colors"
          style={{ lineHeight: 1.2 }}
        >
          <X size={9} /> {propMeta(sel.prop).label} @ {selKey.t.toFixed(2)}s
        </button>
      )}
      {sel?.kind === "anim" && hasAnimation && (
        <button
          onClick={() => { clearAnimation?.(); setSel(null); }}
          className="absolute right-1 top-0 flex items-center gap-1 text-[8.5px] font-bold text-danger bg-danger/15 border border-danger/30 rounded px-1 py-px hover:bg-danger/25 transition-colors"
          style={{ lineHeight: 1.2 }}
        >
          <X size={9} /> Animation @ {animStart.toFixed(2)}s
        </button>
      )}
    </div>
  );
}
