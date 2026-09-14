"use client";

/**
 * MotionPresetPreviewStage — live preview for the Motion Presets admin UI
 * (app/settings/page.tsx). Same DOM-based, no-canvas-needed spirit as
 * TemplatePreviewStage.tsx: doesn't need pixel parity with the real
 * compositor, needs "does the timing/shape feel right" while authoring.
 *
 * Two modes:
 *  - "animation": a single colored box driven by the preset's real
 *    `keyframes` (see templateAnimationRecipes.ts / templateKeyframePreview.ts)
 *    — the same fractional-keyframe data a template text layer uses.
 *  - "transition": two labelled cards ("A"/"B", standing in for the
 *    outgoing/incoming clip — no real media needed) driven by the SAME
 *    `computeTransition` progress math the real compositor uses
 *    (AnimationEngine.ts), mapped to CSS per transition type. The
 *    transition's actual algorithm stays code-defined (see the boundary
 *    note in motionPresets.ts) — this visualizes it, doesn't reinvent it.
 */
import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "@/utils/icons";
import { TemplateJsonKeyframeTrack } from "../../utils/templateInterpreter";
import { evalTemplateKf } from "../../utils/templateKeyframePreview";
import { computeTransition } from "../../utils/AnimationEngine";

interface Props {
  kind: "animation" | "transition";
  engineKey: string;
  /** animation mode only */
  keyframes?: TemplateJsonKeyframeTrack[];
  accentColor?: string;
  /** small, non-interactive, always auto-looping — for the presets grid card */
  compact?: boolean;
  /**
   * Controlled time/playing (both required together) — lets the editor
   * modal share ONE playhead between this preview and a KeyframeEditor's
   * "seek to key" buttons, same pattern TemplateBuilderModal uses with
   * TemplatePreviewStage. Omitted (the compact grid-card case) = the stage
   * just free-runs its own loop.
   */
  time?: number;
  onSeek?: (t: number) => void;
  playing?: boolean;
  onPlayingChange?: (p: boolean) => void;
}

export const ANIM_PREVIEW_DUR = 2.5;
export const TRANS_PREVIEW_DUR = 2.0;
// computeTransition's own window is [clipEndTime - 0.6, clipEndTime] (0.6s is
// fixed inside AnimationEngine.ts) — placing clipEndTime at 1.3s inside our
// 2s loop gives a 0.7s "hold on A" pause, the 0.6s transition, then a 0.7s
// "hold on B" pause, so both cards are clearly visible at rest.
const TRANS_WINDOW_END = 1.3;

export default function MotionPresetPreviewStage({
  kind, engineKey, keyframes, accentColor = "#8B5CFF", compact = false,
  time: timeProp, onSeek, playing: playingProp, onPlayingChange,
}: Props) {
  const controlled = timeProp !== undefined && onSeek !== undefined;
  const [localTime, setLocalTime] = useState(0);
  const [localPlaying, setLocalPlaying] = useState(true);
  const time = controlled ? timeProp! : localTime;
  const playing = controlled ? (playingProp ?? true) : localPlaying;
  const setTime = controlled ? onSeek! : setLocalTime;
  const setPlaying = controlled ? (onPlayingChange ?? (() => {})) : setLocalPlaying;

  const rafRef = useRef<number | null>(null);
  const totalDur = kind === "animation" ? ANIM_PREVIEW_DUR : TRANS_PREVIEW_DUR;
  // `setTime` may be a plain `(t: number) => void` callback (controlled
  // mode's `onSeek`), not a React state setter — so the tick can't rely on
  // a functional updater to read "current" time; it tracks it in a ref
  // instead, kept in sync with whatever `time` actually is each render.
  const timeRef = useRef(time);
  useEffect(() => { timeRef.current = time; }, [time]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = timeRef.current + dt;
      const wrapped = next >= totalDur ? 0 : next;
      timeRef.current = wrapped;
      setTime(wrapped);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, totalDur]);

  const stageW = compact ? 96 : 320;
  const stageH = compact ? 54 : 180;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative overflow-hidden rounded-lg border border-studio-border flex-shrink-0"
        style={{ width: stageW, height: stageH, background: "#0b0b12" }}>
        {kind === "animation"
          ? <AnimationStage time={time} totalDur={totalDur} keyframes={keyframes} accentColor={accentColor} stageW={stageW} stageH={stageH} />
          : <TransitionStage time={time} engineKey={engineKey} accentColor={accentColor} />}
      </div>
      {!compact && (
        <div className="w-full flex items-center gap-2" style={{ maxWidth: stageW }}>
          <button onClick={() => setPlaying(!playing)}
            className="w-7 h-7 rounded-lg bg-signal text-studio-void flex items-center justify-center flex-shrink-0">
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <input type="range" min={0} max={totalDur} step={0.02} value={time}
            onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)); }}
            className="flex-1 accent-signal" />
          <span className="text-[10px] font-mono text-ink-faint w-10 text-right">{time.toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
}

function AnimationStage({
  time, totalDur, keyframes, accentColor, stageW, stageH,
}: { time: number; totalDur: number; keyframes: TemplateJsonKeyframeTrack[] | undefined; accentColor: string; stageW: number; stageH: number }) {
  const kf = evalTemplateKf(keyframes, totalDur > 0 ? time / totalDur : 0);
  const boxW = stageW * 0.42, boxH = stageH * 0.36;
  const opacity = kf.opacity ?? 1;
  const tx = (kf.x ?? 0) * stageW, ty = (kf.y ?? 0) * stageH;
  const scale = kf.scale ?? 1;
  const rotation = kf.rotation ?? 0;
  const blur = kf.blur ?? 0;
  return (
    <div
      style={{
        position: "absolute",
        left: (stageW - boxW) / 2 + tx, top: (stageH - boxH) / 2 + ty,
        width: boxW, height: boxH, borderRadius: 6,
        background: accentColor, opacity,
        transform: `scale(${scale}) rotate(${rotation}deg)`,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
      }}
    />
  );
}

// CSS analogue of compositeFrame.ts's `applyTransition` canvas switch — card
// "B" (incoming) is the one that moves/reveals per `progress`; card "A"
// (outgoing) stays put underneath except where a type explicitly changes it
// (dip-to-black/white fades everything through a color overlay).
function transitionStyle(type: string, progress: number): { b: React.CSSProperties; overlay?: React.CSSProperties } {
  const b: React.CSSProperties = { opacity: 1 };
  switch (type) {
    case "dipToBlack":
    case "dipToWhite": {
      const color = type === "dipToWhite" ? "#fff" : "#000";
      b.opacity = progress >= 0.5 ? 1 : 0;
      return { b, overlay: { background: color, opacity: progress < 0.5 ? progress * 2 : (1 - progress) * 2 } };
    }
    case "wipeLeftToRight":
      b.clipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`; break;
    case "wipeTopToBottom":
      b.clipPath = `inset(0 0 ${(1 - progress) * 100}% 0)`; break;
    case "slideIn":
    case "push":
      b.transform = `translateX(${(1 - progress) * 100}%)`; break;
    case "slideRight":
      b.transform = `translateX(${-(1 - progress) * 100}%)`; break;
    case "slideUp":
      b.transform = `translateY(${(1 - progress) * 100}%)`; break;
    case "zoom":
      b.transform = `scale(${1 + progress * 0.3})`; b.opacity = 0.5 + progress * 0.5; break;
    case "scaleIn":
      b.transform = `scale(${progress})`; break;
    case "blurIn":
      b.filter = `blur(${(1 - progress) * 10}px)`; b.opacity = progress; break;
    case "flipIn":
      b.transform = `scaleX(${Math.abs(Math.cos(progress * Math.PI))})`; b.opacity = progress > 0.5 ? 1 : 0; break;
    case "crossDissolve":
    case "filmDissolve":
    case "morphCut":
    default:
      b.opacity = progress; break;
  }
  return { b };
}

function TransitionStage({ time, engineKey, accentColor }: { time: number; engineKey: string; accentColor: string }) {
  const trans = computeTransition(engineKey, time, TRANS_WINDOW_END, 30);
  const progress = trans ? trans.progress : (time < TRANS_WINDOW_END - 0.6 ? 0 : 1);
  const { b, overlay } = transitionStyle(engineKey, progress);
  const cardCls = "absolute inset-0 flex items-center justify-center text-white font-bold text-xl select-none";
  return (
    <>
      <div className={cardCls} style={{ background: "#334155" }}>A</div>
      <div className={cardCls} style={{ background: accentColor, ...b }}>B</div>
      {overlay && <div className="absolute inset-0 pointer-events-none" style={overlay} />}
    </>
  );
}
