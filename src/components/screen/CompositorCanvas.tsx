"use client";

/**
 * CompositorCanvas — single canvas that draws everything.
 * Video frames (via CanvasEngine) + text + images + blur + transitions + animations.
 * Fabric.js (FabricOverlay) sits on top as invisible interaction layer only.
 */

import { useEffect, useRef } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { CanvasEngine } from "../../utils/CanvasEngine";
import { computeAnimState, computeTransition } from "../../utils/AnimationEngine";

interface Props {
  width: number;
  height: number;
  onTimeUpdate: (t: number) => void;
  onEngineReady: (engine: CanvasEngine) => void;
}

export default function CompositorCanvas({ width, height, onTimeUpdate, onEngineReady }: Props) {
  const {
    clipsDetails, textsDetails, imagesDetails, blursDetails,
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
  const clipsRef = useRef(clipsDetails);
  const textsRef = useRef(textsDetails);
  const imagesRef = useRef(imagesDetails);
  const blursRef = useRef(blursDetails);
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
  useEffect(() => { clipsRef.current = clipsDetails; }, [clipsDetails]);
  useEffect(() => { textsRef.current = textsDetails; }, [textsDetails]);
  useEffect(() => { imagesRef.current = imagesDetails; }, [imagesDetails]);
  useEffect(() => { blursRef.current = blursDetails; }, [blursDetails]);
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

    const t = timeRef.current;
    const clips = clipsRef.current;
    const texts = textsRef.current;
    const images = imagesRef.current;
    const blurs = blursRef.current;
    const refs = imageRefsRef.current;
    const currentFps = fpsRef.current;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const lo = layerOrderRef.current;
    const defaultOrder = ["video", "audio", "image", "text", "blur"];
    const drawOrder = lo.length > 0
      ? [...lo].sort((a, b) => a.zIndex - b.zIndex).map(l => l.type)
      : defaultOrder;

    const engine = engineRef.current;
    const clipsSorted = [...clips].sort((a, b) => (a.startPosition ?? 0) - (b.startPosition ?? 0));

    for (const layerType of drawOrder) {
      if (layerType === "video" || layerType === "audio") {
        if (!engine) continue;
        const activeClips = clipsSorted.filter(c =>
          t >= (c.startPosition ?? 0) && t <= (c.endPosition ?? Infinity)
        ).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

        for (const clip of activeClips) {
          const vid = engine.getVideoElement(clip.src);
          if (!vid || vid.readyState < 2) continue;
          const cw = (clip.width ?? w) * (clip.scale ?? 1);
          const ch = (clip.height ?? h) * (clip.scale ?? 1);
          ctx.save();
          try { ctx.drawImage(vid, clip.x ?? 0, clip.y ?? 0, cw, ch); } catch {}
          const ci = clipsSorted.findIndex(c => c.id === clip.id);
          if (ci >= 0 && ci < clipsSorted.length - 1 && clip.transition && clip.transition !== "none") {
            const trans = computeTransition(clip.transition, t, clip.endPosition ?? 0, currentFps);
            if (trans) {
              const nextVid = engine.getVideoElement(clipsSorted[ci + 1]?.src ?? "");
              applyTransition(ctx, trans.type, trans.progress, w, h, nextVid);
            }
          }
          ctx.restore();
        }
      } else if (layerType === "image") {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          if (t < img.startTime || t > img.endTime) continue;
          const el = refs[i];
          if (!el) continue;
          const anim = computeAnimState(img.animation, t, img.startTime, img.endTime, currentFps, img.imageX, img.imageY, w, h, 100);
          if (!anim.visible) continue;
          const dw = img.width * (img.scaleX ?? 1), dh = img.height * (img.scaleY ?? 1);
          ctx.save();
          if (anim.blur > 0) ctx.filter = `blur(${anim.blur}px)`;
          ctx.globalAlpha = Math.max(0, Math.min(1, anim.opacity)) * (img.opacity ?? 1);
          ctx.translate(anim.tx + dw / 2, anim.ty + dh / 2);
          ctx.rotate((anim.rotation * Math.PI) / 180);
          ctx.scale(anim.scale * anim.scaleX, anim.scale * anim.scaleY);
          try { ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh); } catch {}
          ctx.filter = "none";
          ctx.restore();
        }
      } else if (layerType === "text") {
        for (const text of texts) {
          if (t < text.startTime || t > text.endTime) continue;
          const anim = computeAnimState(text.animation, t, text.startTime, text.endTime, currentFps, text.textX, text.textY, w, h, text.fontSize);
          if (!anim.visible) continue;
          const tw2 = text.width ?? 200, th2 = text.height ?? text.fontSize * 1.4;
          ctx.save();
          if (anim.blur > 0) ctx.filter = `blur(${anim.blur}px)`;
          ctx.globalAlpha = Math.max(0, Math.min(1, anim.opacity * (text.opacity ?? 1)));
          ctx.translate(anim.tx + tw2 / 2, anim.ty + th2 / 2);
          ctx.rotate((anim.rotation * Math.PI) / 180);
          ctx.scale(anim.scale * anim.scaleX, anim.scale * anim.scaleY);
          ctx.font = `${text.isItalic ? "italic" : "normal"} ${text.isBold ? "bold" : "normal"} ${text.fontSize}px "${text.fontFamily ?? "Arial"}", sans-serif`;
          ctx.textBaseline = "top";
          if (text.backgroundColor && text.backgroundColor !== "transparent") {
            ctx.fillStyle = text.backgroundColor; ctx.fillRect(-tw2 / 2, -th2 / 2, tw2, th2);
          }
          if (text.shadowColor && text.shadowColor !== "transparent") {
            ctx.shadowColor = text.shadowColor; ctx.shadowBlur = text.shadowBlur ?? 0;
            ctx.shadowOffsetX = text.shadowOffsetX ?? 0; ctx.shadowOffsetY = text.shadowOffsetY ?? 0;
          }
          ctx.fillStyle = text.textColor ?? "#fff";
          drawWrappedText(ctx, text.text, -tw2 / 2, -th2 / 2, tw2, text.fontSize * (text.lineHeight ?? 1.2));
          ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.filter = "none";
          ctx.restore();
        }
      } else if (layerType === "blur") {
        for (const blur of blurs) {
          if (t < blur.startTime || t > blur.endTime) continue;
          ctx.save();
          ctx.filter = `blur(${blur.blurAmount ?? 10}px)`;
          try {
            const region = ctx.getImageData(blur.x, blur.y, blur.width, blur.height);
            const off = new OffscreenCanvas(blur.width, blur.height);
            const offCtx = off.getContext("2d")!;
            offCtx.putImageData(region, 0, 0);
            ctx.drawImage(off, blur.x, blur.y);
          } catch {
            ctx.fillStyle = "rgba(100,100,120,0.35)";
            ctx.fillRect(blur.x, blur.y, blur.width, blur.height);
          }
          ctx.filter = "none";
          ctx.restore();
        }
      }
    }
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
      engine.setClipAudio(clip.src, track.muted || outsideWindow, track.volume ?? 1);
    }
  }, [currentTime, clipsDetails, audioDetails]);

  // ── Initialize canvas + engine ONCE ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size canvas to match composition dimensions
    canvas.width = widthRef.current;
    canvas.height = heightRef.current;
    ctxRef.current = canvas.getContext("2d", { alpha: false })!;

    const engine = new CanvasEngine(canvas);
    engineRef.current = engine;

    // Engine calls drawFrame via stable ref — no stale closures
    engine.onTimeUpdate = (t) => {
      timeRef.current = t;
      onTimeUpdateRef.current(t);
      drawFrame();
    };
    engine.onFrameReady = () => drawFrame();
    engine.onEnded = () => { onTimeUpdateRef.current(0); };

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
    ctxRef.current = canvas.getContext("2d", { alpha: false })!;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  let ly = y;
  for (const line of text.split("\n")) {
    let cur = "";
    for (const word of line.split(" ")) {
      const test = cur ? cur + " " + word : word;
      if (ctx.measureText(test).width > maxW && cur) {
        ctx.fillText(cur, x, ly); cur = word; ly += lineH;
      } else { cur = test; }
    }
    if (cur) ctx.fillText(cur, x, ly);
    ly += lineH;
  }
}

function applyTransition(
  ctx: CanvasRenderingContext2D,
  type: string, progress: number,
  w: number, h: number,
  nextVid: HTMLVideoElement | undefined
) {
  const drawNext = () => {
    if (nextVid && nextVid.readyState >= 2) {
      try { ctx.drawImage(nextVid, 0, 0, w, h); } catch {}
    }
  };
  ctx.save();
  switch (type) {
    case "crossDissolve": case "filmDissolve": case "fadeIn":
      ctx.globalAlpha = progress; drawNext(); break;
    case "dipToBlack":
      ctx.fillStyle = "#000"; ctx.globalAlpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
      ctx.fillRect(0, 0, w, h); break;
    case "dipToWhite":
      ctx.fillStyle = "#fff"; ctx.globalAlpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
      ctx.fillRect(0, 0, w, h); break;
    case "wipeLeftToRight":
      ctx.beginPath(); ctx.rect(0, 0, w * progress, h); ctx.clip(); drawNext(); break;
    case "wipeTopToBottom":
      ctx.beginPath(); ctx.rect(0, 0, w, h * progress); ctx.clip(); drawNext(); break;
    case "slideIn": ctx.translate(-w * (1 - progress), 0); drawNext(); break;
    case "slideUp": ctx.translate(0, h * (1 - progress)); drawNext(); break;
    case "slideRight": ctx.translate(w * (1 - progress), 0); drawNext(); break;
    case "push": ctx.translate(-w * progress, 0); drawNext(); break;
    case "zoom":
      ctx.translate(w / 2, h / 2); ctx.scale(1 + progress * 0.3, 1 + progress * 0.3);
      ctx.translate(-w / 2, -h / 2); ctx.globalAlpha = 1 - progress * 0.5; drawNext(); break;
    case "blurIn":
      ctx.filter = `blur(${(1 - progress) * 10}px)`; ctx.globalAlpha = progress; drawNext(); ctx.filter = "none"; break;
    case "scaleIn":
      ctx.translate(w / 2, h / 2); ctx.scale(progress, progress); ctx.translate(-w / 2, -h / 2); drawNext(); break;
    case "flipIn":
      ctx.translate(w / 2, 0); ctx.scale(Math.abs(Math.cos(progress * Math.PI)), 1);
      ctx.translate(-w / 2, 0); if (progress > 0.5) drawNext(); break;
    default: ctx.globalAlpha = progress; drawNext(); break;
  }
  ctx.restore();
}
