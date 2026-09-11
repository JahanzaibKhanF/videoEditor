"use client";

/**
 * KeyframeLane — thin diamond lane under the selected layer's timeline rows:
 * one sub-row per active keyframe track. Full-width so everything lines up
 * with the clips / ruler / playhead above (no label column of its own —
 * labels float at each row's left edge).
 *
 *  • click a diamond    → select it + move the playhead there
 *  • drag a diamond      → retime
 *  • right-click / ✕      → delete
 *  • double-click a row   → add a key at that time (current interpolated value)
 *
 * Preset animations (the `animation` field) are intentionally NOT shown here
 * — they're a separate, independent system from manual keyframes and both
 * apply together at render time (see applyKfOverride in compositeFrame.ts).
 * Surfacing the animation as a fake "keyframe" in this lane was tried and
 * reverted: it only ever showed a single marker at the layer's start, which
 * read as confusing/broken rather than useful. The one place an animation's
 * timing/shape IS worth editing as real keyframes is the template builder
 * (settings page), which generates genuine per-property tracks up front
 * instead of a marker — see TemplateBuilder.tsx / templateAnimationRecipes.ts.
 *
 * There is deliberately no playhead line here — the main timeline needle
 * already runs the full height of the track area, including this lane.
 */
import { useRef, useState, PointerEvent as ReactPointerEvent } from "react";
import { useAppDetailsContext, useEngineControls } from "../../context/useAppContext";
import { KeyframeTrack, KfProp } from "../../types/types";
import { propMeta, retimeKey, removeKey, upsertKey, upsertTrack, evalTrack } from "../../utils/keyframes";
import { X } from "@/utils/icons";

const ROW_H = 15;

type Sel = { prop: KfProp; id: string } | null;

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

  if (selectedClipId) {
    const c = clipsDetails.find(x => x.id === selectedClipId);
    tracks = c?.keyframes;
    commit = t => setClipsDetails(prev => prev.map(x => x.id === selectedClipId ? { ...x, keyframes: t } : x));
  } else if (selectedTextId) {
    const el = textsDetails.find(x => x.id === selectedTextId);
    tracks = el?.keyframes;
    commit = t => setTextsDetails(prev => prev.map(x => x.id === selectedTextId ? { ...x, keyframes: t } : x));
  } else if (selectedImageID) {
    const el = imagesDetails.find(x => x.id === selectedImageID);
    tracks = el?.keyframes;
    commit = t => setImagesDetails(prev => prev.map(x => x.id === selectedImageID ? { ...x, keyframes: t } : x));
  } else if (selectedBlurId) {
    const b = blursDetails.find(x => x.id === selectedBlurId);
    tracks = b?.keyframes;
    commit = t => setBlursDetails(prev => prev.map(x => x.id === selectedBlurId ? { ...x, keyframes: t } : x));
  }

  if (!tracks || tracks.length === 0) return null;
  const trk = tracks;

  const seek = (t: number) => { setCurrentTime(t); seekTo(t); };
  const timeAtX = (clientX: number) => {
    const r = laneRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * totalTime;
  };

  const dragKey = (track: KeyframeTrack, id: string) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setSel({ prop: track.prop, id });
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

  const selKey = sel ? trk.find(t => t.prop === sel.prop)?.keys.find(k => k.id === sel.id) : undefined;

  return (
    <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,.07)", position: "relative" }}>
      <div ref={laneRef} style={{ position: "relative" }}>
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
              const on = sel?.prop === track.prop && sel.id === k.id;
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

      {selKey && sel && (
        <button
          onClick={() => { commit(upsertTrack(trk, removeKey(trk.find(t => t.prop === sel.prop)!, sel.id))); setSel(null); }}
          className="absolute right-1 top-0 flex items-center gap-1 text-[8.5px] font-bold text-danger bg-danger/15 border border-danger/30 rounded px-1 py-px hover:bg-danger/25 transition-colors"
          style={{ lineHeight: 1.2 }}
        >
          <X size={9} /> {propMeta(sel.prop).label} @ {selKey.t.toFixed(2)}s
        </button>
      )}
    </div>
  );
}
