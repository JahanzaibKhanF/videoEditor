"use client";

/**
 * VideoClipsRangeSlider — real multi-clip TRACKS.
 *
 * `clip.zIndex` doubles as the clip's TRACK id. Every clip sharing the same
 * zIndex lives on the same horizontal row (same "track"), laid out by time —
 * exactly like every other NLE (CapCut/Premiere/etc). zIndex is no longer
 * assumed unique per clip: multiple non-overlapping clips can, and normally
 * do, share a track (e.g. sequentially-imported clips, or the two halves of
 * a split clip — see splitLayer.ts, which copies the original clip's
 * zIndex onto the new half so it stays on the exact same row/track it was
 * split from instead of spawning a new one).
 *
 * A clip can be moved to a different (existing or brand-new) track two ways:
 *  - Hold + drag it up/down past half a row's height ("hold and move up/down
 *    into new tracks").
 *  - Select it, then use the small ▲▼ chevrons that appear on the chip.
 * Both call `moveClipToTrack`, which picks the existing adjacent track if
 * the clip fits there without overlapping anything already on it, or
 * allocates a brand-new track (using a fractional zIndex slotted between
 * the two neighbouring tracks, or one beyond the current top/bottom track)
 * when it doesn't — so a track is only ever created when it's actually
 * needed, never as separate persisted state.
 *
 * Each track's paired audio (this track's clips' own audio, keyed by
 * clipId) renders as one shared lane directly beneath that track's video
 * row, so moving a clip to a new track carries its audio along automatically.
 */
import React, { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";
import { ROW_H, ROW_GAP } from "./Layers";
import { transitionOptions } from "../../utils/transitionOptionsConstants";
import { Shuffle, ChevronUp, ChevronDown } from "@/utils/icons";
import { AudioTrackRow } from "./AudioRangeSlider";
import { ClipDetails, ImageDetails, TextDetails, BlurDetails } from "../../types/types";
import { computeAdjacentZ } from "../../utils/zStack";

const MIN_W_PCT = 1;

// Given a clip's own id + its live start/end position, work out which
// existing track it should land on when moving `dir`, or allocate a new one.
// `others` is every OTHER clip (never the one being moved); `otherLayerZs`
// is every image/text/blur's zIndex (also in the shared unified stack —
// see zStack.ts) so a clip can step to a slot BETWEEN two of those too, not
// just between two other video tracks.
function resolveTargetTrack(
  dir: "up" | "down",
  curZ: number,
  sp: number,
  ep: number,
  others: ClipDetails[],
  otherLayerZs: number[] = [],
): number {
  const tracks = Array.from(new Set([...others.map(c => c.zIndex ?? 0), curZ])).sort((a, b) => a - b);
  const idx = tracks.indexOf(curZ);
  const overlaps = (z: number) => others.some(c =>
    (c.zIndex ?? 0) === z && sp < (c.endPosition ?? 0) && ep > (c.startPosition ?? 0)
  );
  // If the immediately adjacent TRACK slot is free of overlapping clips,
  // still prefer stepping onto it (image/text/blur layers don't occupy a
  // "track" the same clip-overlap way, so they never block a track move —
  // computeAdjacentZ below is only used as a fallback when no track exists
  // in that direction at all, to land between/beyond image/text/blur layers).
  if (dir === "down") {
    if (idx < tracks.length - 1) {
      const cand = tracks[idx + 1];
      if (!overlaps(cand)) return cand;
      const beyond = idx + 2 < tracks.length ? tracks[idx + 2] : cand + 1;
      return (cand + beyond) / 2;
    }
    return computeAdjacentZ("down", curZ, [...others.map(c => c.zIndex ?? 0), ...otherLayerZs]);
  } else {
    if (idx > 0) {
      const cand = tracks[idx - 1];
      if (!overlaps(cand)) return cand;
      const beyond = idx - 2 >= 0 ? tracks[idx - 2] : cand - 1;
      return (cand + beyond) / 2;
    }
    return computeAdjacentZ("up", curZ, [...others.map(c => c.zIndex ?? 0), ...otherLayerZs]);
  }
}

export default function VideoClipsRangeSlider({ onlyTrackZs }: { onlyTrackZs?: number[] } = {}) {
  const {
    totalTime, setTotalTime,
    clipsDetails, setClipsDetails,
    audioDetails, setAudioDetails,
    setClipEffects,
    selectedClipId,
    setSelectedClipId: setCtxSel,
    setSelectedTextId: setCtxTextSel, setSelectedImageID: setCtxImageSel, setSelectedBlurId: setCtxBlurSel,
    imagesDetails, textsDetails, blursDetails,
  } = useAppDetailsContext();

  // Every image/text/blur zIndex — used so a video clip stepping up/down
  // past the last existing track can land in a slot between/beyond those
  // layers too (shared unified stack, see zStack.ts).
  const otherLayerZs = [
    ...imagesDetails.map((i: ImageDetails) => i.zIndex ?? 0),
    ...textsDetails.map((t: TextDetails) => t.zIndex ?? 0),
    ...blursDetails.map((b: BlurDetails) => b.zIndex ?? 0),
  ];

  const ref = useRef<HTMLDivElement>(null);
  const [selId, setSelId] = useState<string | null>(null);

  // Select this clip everywhere (timeline chip + preview overlay) and clear
  // any other kind of selection so exactly one object is ever active.
  const selectInScreen = (id: string | null) => {
    setSelId(id);
    setCtxSel(id);
    if (id) { setCtxTextSel(null); setCtxImageSel(null); setCtxBlurSel(null); }
  };

  // Deselect on outside click
  useEffect(() => {
    const fn = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".vc-chip")) setSelId(null);
    };
    window.addEventListener("pointerdown", fn);
    return () => window.removeEventListener("pointerdown", fn);
  }, []);

  // Delete on key
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || !selId || clipsDetails.length <= 1) return;
      setClipsDetails(prev => prev.filter(c => c.id !== selId));
      setAudioDetails(prev => prev.filter(a => a.clipId !== selId));
      setClipEffects(prev => prev.filter(fx => fx.clipId !== selId));
      setSelId(null); setCtxSel(null);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [selId, clipsDetails, setClipsDetails, setAudioDetails, setCtxSel]);

  // Move a clip to the next track up/down — used by both the drag gesture
  // (crossing a row-height threshold) and the chevron buttons on a selected
  // chip. Always collision-safe: lands on the neighbouring track if there's
  // room there, otherwise allocates a new one.
  const moveClipToTrack = (clipId: string, dir: "up" | "down") => {
    setClipsDetails(prev => {
      const clip = prev.find(c => c.id === clipId);
      if (!clip) return prev;
      const others = prev.filter(c => c.id !== clipId);
      const targetZ = resolveTargetTrack(dir, clip.zIndex ?? 0, clip.startPosition ?? 0, clip.endPosition ?? 0, others, otherLayerZs);
      return prev.map(c => c.id === clipId ? { ...c, zIndex: targetZ } : c);
    });
  };

  const drag = (e: React.PointerEvent, id: string, type: "move" | "resize-left" | "resize-right") => {
    e.preventDefault(); e.stopPropagation();
    selectInScreen(id);
    const el = ref.current;
    if (!el || !totalTime) return;
    const tw = el.offsetWidth;
    const startX = e.clientX;
    let startY = e.clientY;
    const origClip = clipsDetails.find(c => c.id === id)!;
    const origAudio = audioDetails.find(a => a.clipId === id);
    const minW = (MIN_W_PCT / 100) * totalTime;

    // Static snapshot of every OTHER clip — their own positions/tracks don't
    // change during this drag, only this clip's does.
    const otherClips = clipsDetails.filter(c => c.id !== id);
    let curZ = origClip.zIndex ?? 0;
    // Tracks THIS clip's own live endPosition across the drag — `up()`
    // below needs the just-finished value, and reading it back out of
    // `clipsDetails` there would be a stale closure (React state updates
    // from `mv`'s setClipsDetails calls are async and this native
    // mouseup listener isn't tied to a re-render), same as `otherClips`
    // being a fixed snapshot from drag-start above.
    let liveEp = origClip.endPosition ?? 0;

    // Same-track neighbours, fixed for the duration of a resize (resizing
    // never changes track).
    const sameTrackAtStart = otherClips.filter(c => (c.zIndex ?? 0) === curZ);
    const prevNeighbor = [...sameTrackAtStart]
      .filter(c => (c.endPosition ?? 0) <= (origClip.startPosition ?? 0) + 0.001)
      .sort((a, b) => (b.endPosition ?? 0) - (a.endPosition ?? 0))[0];
    const nextNeighbor = [...sameTrackAtStart]
      .filter(c => (c.startPosition ?? 0) >= (origClip.endPosition ?? 0) - 0.001)
      .sort((a, b) => (a.startPosition ?? 0) - (b.startPosition ?? 0))[0];

    const mv = (me: PointerEvent) => {
      const dt = ((me.clientX - startX) / tw) * totalTime;
      let sp = origClip.startPosition ?? 0;
      let ep = origClip.endPosition ?? 0;
      let st = origClip.startTime ?? 0;
      let et = origClip.endTime ?? 0;

      if (type === "move") {
        const dur = ep - sp;
        sp = Math.max(0, Math.min(totalTime - dur, sp + dt));
        ep = sp + dur;

        // Hold + drag vertically past half a row's height to retarget which
        // track this clip is on — the actual "up/down into new tracks" move.
        const dy = me.clientY - startY;
        if (Math.abs(dy) > ROW_H / 2) {
          const dir: "up" | "down" = dy > 0 ? "down" : "up";
          curZ = resolveTargetTrack(dir, curZ, sp, ep, otherClips, otherLayerZs);
          startY = me.clientY;
        }

        // Never let this clip overlap another clip already on its
        // (possibly just-changed) target track.
        const sameTrack = otherClips.filter(c => (c.zIndex ?? 0) === curZ);
        let lo = 0, hi = totalTime;
        for (const c of sameTrack) {
          const cs = c.startPosition ?? 0, ce = c.endPosition ?? 0;
          const mid = (cs + ce) / 2;
          if (sp + dur / 2 >= mid) lo = Math.max(lo, ce);
          else hi = Math.min(hi, cs);
        }
        sp = Math.max(lo, Math.min(Math.max(lo, hi - dur), sp));
        ep = sp + dur;

        // Move audio track by the same delta
        if (origAudio) {
          const aDur = origAudio.endTime - origAudio.startTime;
          const newAStart = Math.max(0, origAudio.startTime + (sp - (origClip.startPosition ?? 0)));
          setAudioDetails(prev => prev.map(a =>
            a.clipId === id ? { ...a, startTime: newAStart, endTime: newAStart + aDur } : a
          ));
        }
      } else if (type === "resize-left") {
        let nsp = Math.max(0, Math.min(ep - minW, sp + dt));
        if (prevNeighbor) nsp = Math.max(nsp, prevNeighbor.endPosition ?? 0);
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
        if (nextNeighbor) nep = Math.min(nep, nextNeighbor.startPosition ?? totalTime);
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
        c.id === id ? { ...c, startPosition: sp, endPosition: ep, startTime: st, endTime: et, zIndex: type === "move" ? curZ : c.zIndex } : c
      ));
      liveEp = ep;
    };

    const up = () => {
      // BUG FIX ("render includes extra black padding / stale-long
      // export duration after trimming a clip shorter"): this used to be
      // `setTotalTime(prev => Math.max(prev, maxEnd))`, which can only
      // ever GROW the timeline, never shrink it. Dragging a clip's right
      // edge to trim it shorter (resize-right) reduces that clip's
      // endPosition, but the overall project `totalTime` — which drives
      // export's total frame count in renderVideo.ts/webCodecsRender.ts —
      // stayed at whatever the longest point ever reached was. Concretely:
      // add a clip (totalTime grows to its full length), then trim it
      // shorter — totalTime never moved, so export still rendered frames
      // all the way out to the OLD, no-longer-real end of the timeline
      // (nothing active there, so just wasted trailing black frames, but
      // for the browser's encoder that's real extra encode/memory work it
      // didn't need to do, on every single export from then on).
      //
      // Fixed by actually RECOMPUTING totalTime from the current end of
      // every layer (clips, using this drag's just-finished `liveEp`
      // rather than a stale `clipsDetails` closure; plus images/texts/
      // blurs, so trimming video never cuts off other content that
      // extends further right).
      setTotalTime(() => {
        const maxClipEnd = otherClips.reduce((m, c) => Math.max(m, c.endPosition ?? 0), liveEp);
        const maxImageEnd = imagesDetails.reduce((m, i) => Math.max(m, i.endTime ?? 0), 0);
        const maxTextEnd = textsDetails.reduce((m, t) => Math.max(m, t.endTime ?? 0), 0);
        const maxBlurEnd = blursDetails.reduce((m, b) => Math.max(m, b.endTime ?? 0), 0);
        return Math.max(maxClipEnd, maxImageEnd, maxTextEnd, maxBlurEnd);
      });
      document.removeEventListener("pointermove", mv);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", mv);
    document.addEventListener("pointerup", up);
  };

  // ── Group clips into tracks (rows) by zIndex ──────────────────────────
  // When `onlyTrackZs` is given, this instance only renders that subset of
  // tracks — used by Layers.tsx to interleave a run of video tracks with
  // image/text/blur runs above and below it in the unified AE-style stack
  // (see layerStack.ts). Move/drag logic below still always operates
  // against the FULL clipsDetails from context, so a clip can still be
  // dragged/moved onto any track anywhere in the whole stack, not just one
  // rendered by this particular run.
  const allTrackIds = Array.from(new Set(clipsDetails.map(c => c.zIndex ?? 0))).sort((a, b) => a - b);
  const trackIds = onlyTrackZs ? allTrackIds.filter(z => onlyTrackZs.includes(z)) : allTrackIds;
  const clipsByTrack = trackIds.map(z => ({
    z,
    clips: clipsDetails.filter(c => (c.zIndex ?? 0) === z).sort((a, b) => (a.startPosition ?? 0) - (b.startPosition ?? 0)),
  }));

  // Row offset (in ROW_H units) of each track's video row, accounting for
  // every earlier track's video row PLUS its own audio row (if it has any
  // paired audio) — needed to position transition bridges and to size the
  // whole block in Layers.tsx.
  const rowOffsets: number[] = [];
  {
    let acc = 0;
    for (const t of clipsByTrack) {
      rowOffsets.push(acc);
      const hasAudio = t.clips.some(c => audioDetails.some(a => a.clipId === c.id));
      acc += 1 + (hasAudio ? 1 : 0);
    }
  }

  // A clip's `transition` describes the transition OUT of it, into
  // whichever clip starts right where it ends. Precompute each bridge's
  // (fromRow, toRow, timeFraction) so it can be drawn as a badge at the
  // exact boundary between the two clips.
  const bridges = totalTime > 0 ? clipsDetails
    .filter(clip => clip.transition && clip.transition !== "none")
    .map(clip => {
      const fromTrackIdx = trackIds.indexOf(clip.zIndex ?? 0);
      const nextClip = clipsDetails.find(c => Math.abs((c.startPosition ?? -999) - (clip.endPosition ?? 0)) < 0.05);
      if (!nextClip || fromTrackIdx === -1) return null;
      const toTrackIdx = trackIds.indexOf(nextClip.zIndex ?? 0);
      if (toTrackIdx === -1) return null;
      const meta = transitionOptions.find(t => t.key === clip.transition);
      return {
        id: `${clip.id}->${nextClip.id}`,
        fromRow: rowOffsets[fromTrackIdx], toRow: rowOffsets[toTrackIdx],
        leftPct: ((clip.endPosition ?? 0) / totalTime) * 100,
        label: meta?.name ?? clip.transition,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null) : [];

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", gap: ROW_GAP }}>
      {/* Transition bridges — drawn above all clip rows so they aren't
          clipped by any individual row's overflow:hidden */}
      {bridges.map(b => {
        const topFrom = b.fromRow * (ROW_H + ROW_GAP) + ROW_H / 2;
        const topTo = b.toRow * (ROW_H + ROW_GAP) + ROW_H / 2;
        const midTop = (topFrom + topTo) / 2;
        return (
          <div key={b.id} title={`Transition: ${b.label}`}
            style={{
              position: "absolute", zIndex: 20, left: `${b.leftPct}%`, top: midTop,
              transform: "translate(-50%, -50%)",
              width: 18, height: 18, borderRadius: "50%",
              background: "linear-gradient(135deg,#8B5CFF,#A47CFF)",
              border: "2px solid rgba(10,10,19,.9)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,.4)", cursor: "help", pointerEvents: "auto",
            }}>
            <Shuffle size={9} color="white" strokeWidth={2.6} />
          </div>
        );
      })}
      {clipsByTrack.map(({ z, clips: trackClips }) => {
        const pairedAudio = audioDetails.filter(a => trackClips.some(c => c.id === a.clipId));
        return (
          <React.Fragment key={`track-${z}`}>
            <div style={{ position: "relative", height: ROW_H, width: "100%", flexShrink: 0 }}>
              {trackClips.map(clip => {
                if (!totalTime || clip.startPosition === null || clip.endPosition === null) return null;
                const left = `${((clip.startPosition ?? 0) / totalTime) * 100}%`;
                const width = `${(((clip.endPosition ?? 0) - (clip.startPosition ?? 0)) / totalTime) * 100}%`;
                const dur = (clip.endPosition ?? 0) - (clip.startPosition ?? 0);
                const isSel = selId === clip.id || selectedClipId === clip.id;

                return (
                  <div key={clip.id} className="vc-chip"
                    onPointerDown={e => drag(e, clip.id, "move")}
                    onClick={e => { e.stopPropagation(); selectInScreen(clip.id); }}
                    style={{
                      position: "absolute", top: 0, left, width, height: "100%",
                      background: "linear-gradient(180deg, #FFC061 0%, #E8952B 100%)",
                      boxShadow: isSel
                        ? "0 0 0 2px #8B5CFF, 0 4px 14px -4px rgba(139,92,255,.55)"
                        : "inset 0 1px 0 rgba(255,255,255,.28), 0 1px 3px rgba(0,0,0,.28)",
                      borderRadius: 7, cursor: "move",
                      display: "flex", alignItems: "center",
                      overflow: "visible", userSelect: "none",
                      transition: "box-shadow .12s",
                    }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: 7, overflow: "hidden" }}>
                      {/* Left trim */}
                      <div onPointerDown={e => { e.stopPropagation(); drag(e, clip.id, "resize-left"); }}
                        style={{ position: "absolute", left: 0, top: 0, width: 8, height: "100%", cursor: "ew-resize", background: isSel ? "rgba(0,0,0,.16)" : "rgba(0,0,0,.08)", borderRadius: "7px 0 0 7px", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 2, height: 12, borderRadius: 2, background: "rgba(255,255,255,.75)" }} />
                      </div>
                      {/* Content */}
                      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 10px", overflow: "hidden", width: "100%", height: "100%" }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, opacity: .9 }}>
                          <rect x=".5" y="1.5" width="9" height="7" rx="1" stroke="white" strokeWidth="1" />
                          <path d="M3.5 3.5l3 2-3 2V3.5z" fill="white" />
                        </svg>
                        <span style={{ color: "white", fontSize: 10, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                          {clip.sourceFileName ?? clip.name}
                        </span>
                        <span style={{ color: "rgba(255,255,255,.85)", fontSize: 9.5, fontFamily: "monospace", flexShrink: 0 }}>
                          {dur < 60 ? dur.toFixed(1) + "s" : formatVideoDuration(dur)}
                        </span>
                      </div>
                      {/* Right trim */}
                      <div onPointerDown={e => { e.stopPropagation(); drag(e, clip.id, "resize-right"); }}
                        style={{ position: "absolute", right: 0, top: 0, width: 8, height: "100%", cursor: "ew-resize", background: isSel ? "rgba(0,0,0,.16)" : "rgba(0,0,0,.08)", borderRadius: "0 7px 7px 0", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 2, height: 12, borderRadius: 2, background: "rgba(255,255,255,.75)" }} />
                      </div>
                    </div>
                    {/* Move-to-track chevrons — only shown on the selected
                        chip, so idle rows stay clean. Click (not drag) way
                        to move a clip onto a new/adjacent track. */}
                    {isSel && (
                      <div style={{
                        position: "absolute", right: -18, top: "50%", transform: "translateY(-50%)",
                        display: "flex", flexDirection: "column", gap: 1, zIndex: 15,
                      }}>
                        <button title="Move to track above"
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); moveClipToTrack(clip.id, "up"); }}
                          style={{ background: "rgba(20,20,30,.85)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 3, padding: 1, cursor: "pointer", lineHeight: 0 }}>
                          <ChevronUp size={9} color="white" />
                        </button>
                        <button title="Move to track below"
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); moveClipToTrack(clip.id, "down"); }}
                          style={{ background: "rgba(20,20,30,.85)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 3, padding: 1, cursor: "pointer", lineHeight: 0 }}>
                          <ChevronDown size={9} color="white" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* This track's shared audio lane — every paired audio entry for
                every clip on this track shares ONE row (positioned by its
                own time range, absolutely, same pattern the video clips
                above use), directly beneath the track's video row. Moving a
                clip to a different track (see moveClipToTrack) carries its
                audio here automatically since audio is always looked up by
                clipId.
                BUG THIS FIXES: each audio entry used to render inside its
                OWN full-height block-flow row (AudioTrackRow used to size
                itself), so a track with 2+ audio clips (e.g. right after a
                split — the original audio stays on the left half, a new
                entry is created for the right half) stacked them as
                separate lines underneath each other instead of side-by-side
                on the same line the way the video clips themselves already
                correctly do. */}
            {pairedAudio.length > 0 && (
              <div style={{ position: "relative", height: ROW_H, width: "100%", flexShrink: 0 }}>
                {pairedAudio.map(track => (
                  <AudioTrackRow key={track.id} track={track} containerRef={ref} />
                ))}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}