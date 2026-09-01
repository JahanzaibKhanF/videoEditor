"use client";

/**
 * CompositorCanvas — single canvas that draws everything.
 * Video frames (via CanvasEngine) + text + images + blur + transitions + animations.
 * InteractionOverlay sits on top as a plain-DOM interaction layer only (no canvas library).
 */

import { useEffect, useRef } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { CanvasEngine } from "../../utils/CanvasEngine";
import { compositeFrame } from "../../utils/compositeFrame";

interface Props {
  width: number;
  height: number;
  onTimeUpdate: (t: number) => void;
  onEngineReady: (engine: CanvasEngine) => void;
  // Fires when a clip finishes playing naturally (not on manual pause).
  // Optional so existing callers that don't care still compile unchanged.
  onEnded?: () => void;
}

export default function CompositorCanvas({ width, height, onTimeUpdate, onEngineReady, onEnded }: Props) {
  const {
    clipsDetails, textsDetails, imagesDetails, blursDetails, clipEffects,
    audioDetails, layerOrder, currentTime, fps, imageRefs,
  } = useAppDetailsContext();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  // Cache last drawn frame per src — prevents black flicker during seek/buffer
  // (reserved for future use; referenced via `void` so strict TS build doesn't flag it as unused)
  const lastFrameCache = useRef<Map<string, ImageBitmap>>(new Map());
  void lastFrameCache;

  // ── ALL mutable state in refs so drawFrame never goes stale ──────────
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onEngineReadyRef = useRef(onEngineReady);
  const onEndedRef = useRef(onEnded);
  const clipsRef = useRef(clipsDetails);
  const textsRef = useRef(textsDetails);
  const imagesRef = useRef(imagesDetails);
  const blursRef = useRef(blursDetails);
  const clipEffectsRef = useRef(clipEffects);
  const imageRefsRef = useRef(imageRefs);
  const audioDetailsRef = useRef(audioDetails);
  const layerOrderRef = useRef(layerOrder);
  const fpsRef = useRef(fps ?? 30);
  const timeRef = useRef(currentTime);
  const widthRef = useRef(width);
  const heightRef = useRef(height);

  // Keep all refs current
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
  useEffect(() => { onEngineReadyRef.current = onEngineReady; }, [onEngineReady]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { clipsRef.current = clipsDetails; }, [clipsDetails]);
  useEffect(() => { textsRef.current = textsDetails; }, [textsDetails]);
  useEffect(() => { imagesRef.current = imagesDetails; }, [imagesDetails]);
  useEffect(() => { blursRef.current = blursDetails; }, [blursDetails]);
  useEffect(() => { clipEffectsRef.current = clipEffects; }, [clipEffects]);
  useEffect(() => { imageRefsRef.current = imageRefs; }, [imageRefs]);
  useEffect(() => { audioDetailsRef.current = audioDetails; }, [audioDetails]);
  useEffect(() => { layerOrderRef.current = layerOrder; }, [layerOrder]);
  useEffect(() => { fpsRef.current = fps ?? 30; engineRef.current?.setTargetFps(fps ?? 30); }, [fps]);
  useEffect(() => { timeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { widthRef.current = width; }, [width]);
  useEffect(() => { heightRef.current = height; }, [height]);

  // ── drawFrame as a stable ref — never recreated, always reads latest data ──
  const drawFrameRef = useRef(() => {});
  drawFrameRef.current = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const w = widthRef.current;
    const h = heightRef.current;
    if (!canvas || !ctx || w === 0 || h === 0) return;

    const engine = engineRef.current;
    compositeFrame({
      ctx, width: w, height: h,
      t: timeRef.current,
      fps: fpsRef.current,
      clips: clipsRef.current,
      texts: textsRef.current,
      images: imagesRef.current,
      blurs: blursRef.current,
      clipEffects: clipEffectsRef.current,
      imageEls: imageRefsRef.current,
      layerOrder: layerOrderRef.current,
      // Keyed by clip.id, not clip.src — see the bug-fix note in
      // CanvasEngine.ts for why (two clips can share the same source file).
      getVideoDrawable: (clipId) => {
        const vid = engine?.getVideoElement(clipId);
        return (vid && vid.readyState >= 2) ? vid : null;
      },
    });
  };

  // Stable wrapper so engine callbacks always call latest drawFrame
  const drawFrame = () => drawFrameRef.current();

  // ── Sync audio window ─────────────────────────────────────────────────
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const track of audioDetails) {
      const clip = clipsDetails.find(c => c.id === track.clipId);
      if (!clip) continue;
      const outsideWindow = currentTime < track.startTime || currentTime > track.endTime;
      // clip.id, not clip.src — the video pool is keyed per clip now (see
      // CanvasEngine.ts), so this must match.
      engine.setClipAudio(clip.id, track.muted || outsideWindow, track.volume ?? 1);
    }
  }, [currentTime, clipsDetails, audioDetails]);

  // ── Initialize canvas + engine ONCE ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size canvas to match composition dimensions
    canvas.width = widthRef.current;
    canvas.height = heightRef.current;
    // alpha:true (not false) is deliberate: a clip's video can genuinely
    // have transparent regions now (background-removed clips, recorded as
    // alpha-preserving WebM — see backgroundRemoval.ts), composited over
    // whatever's on a lower layer. alpha:false unconditionally treats
    // every pixel as fully opaque regardless of what's actually in the
    // source, which is what was silently flattening transparency to solid
    // black — nothing to do with the recording itself, the canvas simply
    // couldn't represent transparency at all with this flag set.
    ctxRef.current = canvas.getContext("2d", { alpha: true })!;

    const engine = new CanvasEngine(canvas);
    engineRef.current = engine;

    // Engine calls drawFrame via stable ref — no stale closures
    engine.onTimeUpdate = (t) => {
      timeRef.current = t;
      onTimeUpdateRef.current(t);
      drawFrame();
    };
    engine.onFrameReady = () => drawFrame();
    engine.onEnded = () => {
      // Reset the visible playhead to 0 on natural end (existing behavior)
      // AND tell the parent playback actually stopped, so the play/pause
      // button's `isPlaying` state doesn't stay stuck on "playing" forever
      // — this callback used to only do the first half, leaving nothing
      // to ever flip `isPlaying` back to false after a clip finished on
      // its own (only an explicit manual pause did).
      onTimeUpdateRef.current(0);
      onEndedRef.current?.();
    };

    if (clipsRef.current.length > 0) engine.load(clipsRef.current);
    onEngineReadyRef.current(engine);
    drawFrame();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ONLY run once — engine is stable for the lifetime of the component

  // ── Resize canvas when composition dimensions change ──────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;
    canvas.width = width;
    canvas.height = height;
    ctxRef.current = canvas.getContext("2d", { alpha: true })!;
    drawFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]); // only resize, don't recreate engine

  // ── Reload engine when clips change ──────────────────────────────────
  useEffect(() => {
    if (engineRef.current && clipsDetails.length > 0) {
      engineRef.current.load(clipsDetails);
    }
    drawFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipsDetails]);

  // ── Redraw overlays on content changes (not currentTime — engine owns that) ──
  useEffect(() => {
    drawFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textsDetails, imagesDetails, blursDetails]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "block" }}
    />
  );
}