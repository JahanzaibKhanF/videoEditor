/**
 * enhanceClipVideo — "AI Enhance": resolution, denoise, and color, each
 * Off/Low/High (or Off/HD/FHD for resolution), in Basic (fast classical
 * algorithms) or Advanced (real AI models for resolution + denoise; a
 * stronger classical pass for color — see frameEnhance.ts for why) mode.
 *
 * Structurally mirrors backgroundRemoval.ts (same seek-per-frame loop,
 * mediabunny CanvasSource encode, index-based frame timing) — the
 * difference is what happens to each frame's pixels, and this output needs
 * no alpha channel, so it encodes to a plain MP4 instead of an alpha WebM.
 *
 * Per-frame pipeline (each stage only runs if its control is above Off):
 *   1. Resolution — scale up to the target height (skipped if the source
 *      is already there or taller)
 *   2. Denoise — clean up the (possibly just-upscaled) frame
 *   3. Color — one final auto-color-corrected pass
 */
import {
  Output, Mp4OutputFormat, BufferTarget, CanvasSource,
  getFirstEncodableVideoCodec, type VideoCodec,
} from "mediabunny";
import { ClipDetails } from "../types/types";
import { buildCanvasFilterString } from "./colorAdjustments";
import { detectAutoColor, applySoftenDenoise, RESOLUTION_TARGET_HEIGHT, EnhanceLevel } from "./frameEnhance";

export type EnhanceMode = "basic" | "advanced";

export interface EnhanceSettings {
  mode: EnhanceMode;
  resolution: EnhanceLevel; // 1 = HD (720p), 2 = FHD (1080p)
  denoise: EnhanceLevel;
  color: EnhanceLevel;
}

export interface EnhanceProgress {
  fraction: number;
  label: string;
}

export interface EnhanceResult {
  blobUrl: string;
  blob: Blob;
}

export interface EnhanceOptions {
  clip: ClipDetails;
  settings: EnhanceSettings;
  processFps?: number;
  onProgress?: (p: EnhanceProgress) => void;
  onFramePreview?: (canvas: HTMLCanvasElement) => void;
  signal: AbortSignal;
}

export const MAX_ENHANCE_SECONDS = 30;

const VIDEO_CODEC_CANDIDATES: VideoCodec[] = ["avc", "vp9", "vp8"];

let enhanceWorker: Worker | null = null;
function getWorker(): Worker {
  if (!enhanceWorker) {
    enhanceWorker = new Worker(new URL("../workers/enhanceWorker.ts", import.meta.url), { type: "module" });
  }
  return enhanceWorker;
}

/** One request/response round-trip with the AI worker for a single frame. */
function processFrameAI(task: "resolution" | "denoise", bitmap: ImageBitmap, onProgress?: (p: EnhanceProgress) => void): Promise<ImageData> {
  const worker = getWorker();
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; fraction?: number; label?: string; data?: ArrayBuffer; width?: number; height?: number; channels?: number; message?: string };
      if (msg.type === "progress") {
        onProgress?.({ fraction: msg.fraction ?? 0, label: msg.label ?? "" });
        return; // keep listening for the eventual result
      }
      worker.removeEventListener("message", onMessage);
      if (msg.type === "result") {
        resolve(rawBytesToImageData(new Uint8ClampedArray(msg.data!), msg.width!, msg.height!, msg.channels!));
      } else {
        reject(new Error(msg.message ?? "AI enhance failed."));
      }
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({ type: "process", task, frame: bitmap }, [bitmap]);
  });
}

function rawBytesToImageData(bytes: Uint8ClampedArray, width: number, height: number, channels: number): ImageData {
  // Rebuilt onto a plain ArrayBuffer — `bytes` arrives via a structured-clone
  // transfer, which TS's DOM lib types as the wider `ArrayBufferLike`
  // (SharedArrayBuffer-compatible), while `ImageData`'s constructor wants a
  // concrete `ArrayBuffer` specifically.
  if (channels === 4) return new ImageData(new Uint8ClampedArray(bytes), width, height);
  // Models here output RGB (channels=3) — expand to RGBA for ImageData/canvas.
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < bytes.length; i += 3, j += 4) {
    rgba[j] = bytes[i]; rgba[j + 1] = bytes[i + 1]; rgba[j + 2] = bytes[i + 2]; rgba[j + 3] = 255;
  }
  return new ImageData(rgba, width, height);
}

export async function enhanceClipVideo(opts: EnhanceOptions): Promise<EnhanceResult> {
  const { clip, settings, processFps, onProgress, onFramePreview, signal } = opts;
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (typeof VideoEncoder === "undefined") {
    throw new Error("This browser doesn't support WebCodecs, which Enhance needs to produce the result video.");
  }

  const sourceVideo = document.createElement("video");
  sourceVideo.src = clip.src;
  sourceVideo.muted = true;
  sourceVideo.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    sourceVideo.onloadedmetadata = () => resolve();
    sourceVideo.onerror = () => reject(new Error("Couldn't load this clip's video for Enhance."));
  });

  const startTime = clip.startTime ?? 0;
  const endTime = clip.endTime ?? clip.duration ?? sourceVideo.duration;
  const clipDuration = Math.max(0.1, endTime - startTime);
  if (clipDuration > MAX_ENHANCE_SECONDS + 0.05) {
    sourceVideo.src = "";
    throw new Error(`Enhance works on clips up to ${MAX_ENHANCE_SECONDS}s — trim this clip shorter first.`);
  }

  const srcW = sourceVideo.videoWidth || clip.width || 1280;
  const srcH = sourceVideo.videoHeight || clip.height || 720;

  // Resolution: only scales UP, and only if the target is actually taller
  // than the source (never downscale, never a no-op upscale).
  const targetH = settings.resolution > 0 ? RESOLUTION_TARGET_HEIGHT[settings.resolution as 1 | 2] : 0;
  const doResize = settings.resolution > 0 && targetH > srcH;
  const scale = doResize ? targetH / srcH : 1;
  let outW = Math.round(srcW * scale), outH = Math.round(srcH * scale);
  outW -= outW % 2; outH -= outH % 2; // even dimensions for the encoder

  const fps = processFps ?? (settings.mode === "advanced" ? 6 : 15);
  const totalFrames = Math.max(1, Math.round(clipDuration * fps));

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = srcW; srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext("2d")!;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW; outCanvas.height = outH;
  const outCtx = outCanvas.getContext("2d")!;

  // Advanced Resolution's AI upscaler is a fixed 2x model — if that lands
  // short of the requested target, a plain canvas resize covers the rest;
  // if it overshoots, downscale back down to the target.
  const aiUpscaleFactor = 2;

  onProgress?.({ fraction: 0, label: "Analyzing color…" });
  const colorAdj = settings.color > 0
    ? await sampleColorAdjustments(sourceVideo, startTime, clipDuration, settings.color, settings.mode === "advanced", signal)
    : null;

  const codec = await getFirstEncodableVideoCodec(VIDEO_CODEC_CANDIDATES, { width: outW, height: outH, bitrate: 8_000_000 });
  if (!codec) throw new Error("This browser/device can't encode video for Enhance.");

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const videoSource = new CanvasSource(outCanvas, { codec, bitrate: 8_000_000 });
  output.addVideoTrack(videoSource);
  await output.start();

  const frameDuration = 1 / fps;

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const localTime = startTime + (i / totalFrames) * clipDuration;
      await seekVideo(sourceVideo, localTime);
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

      srcCtx.drawImage(sourceVideo, 0, 0, srcW, srcH);

      // ── Stage 1: resolution ──────────────────────────────────────────
      if (!doResize) {
        outCtx.drawImage(srcCanvas, 0, 0, outW, outH);
      } else if (settings.mode === "basic") {
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = "high";
        outCtx.drawImage(srcCanvas, 0, 0, outW, outH);
      } else {
        const bitmap = await createImageBitmap(srcCanvas);
        const aiImage = await processFrameAI("resolution", bitmap, i === 0 ? onProgress : undefined);
        const aiCanvas = document.createElement("canvas");
        aiCanvas.width = aiImage.width; aiCanvas.height = aiImage.height;
        aiCanvas.getContext("2d")!.putImageData(aiImage, 0, 0);
        outCtx.drawImage(aiCanvas, 0, 0, outW, outH);
      }
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

      // ── Stage 2: denoise ──────────────────────────────────────────────
      if (settings.denoise > 0) {
        if (settings.mode === "basic") {
          applySoftenDenoise(outCtx, outW, outH, settings.denoise);
        } else {
          const bitmap = await createImageBitmap(outCanvas);
          const aiImage = await processFrameAI("denoise", bitmap, i === 0 ? onProgress : undefined);
          const aiCanvas = document.createElement("canvas");
          aiCanvas.width = aiImage.width; aiCanvas.height = aiImage.height;
          aiCanvas.getContext("2d")!.putImageData(aiImage, 0, 0);
          // The realworld-SR denoiser is a 4x model — resample its output
          // back down to this frame's actual working size so denoise never
          // changes resolution on its own (that's Stage 1's job).
          outCtx.drawImage(aiCanvas, 0, 0, outW, outH);
        }
      }
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

      // ── Stage 3: color ──────────────────────────────────────────────
      if (colorAdj) {
        outCtx.save();
        outCtx.filter = buildCanvasFilterString(colorAdj);
        outCtx.drawImage(outCanvas, 0, 0);
        outCtx.filter = "none";
        outCtx.restore();
      }

      onFramePreview?.(outCanvas);
      await videoSource.add(i * frameDuration, frameDuration);

      onProgress?.({
        fraction: (i + 1) / totalFrames,
        label: `Enhancing — frame ${i + 1} of ${totalFrames}`,
      });
    }
  } catch (err) {
    await output.cancel().catch(() => {});
    sourceVideo.src = "";
    throw err;
  }

  videoSource.close();
  sourceVideo.src = "";

  if (signal.aborted) {
    await output.cancel().catch(() => {});
    throw new DOMException("Cancelled", "AbortError");
  }

  await output.finalize();
  const buffer = (output.target as BufferTarget).buffer!;
  const blob = new Blob([buffer], { type: "video/mp4" });
  const blobUrl = URL.createObjectURL(blob);
  void aiUpscaleFactor; // kept for the comment above; not otherwise referenced
  return { blobUrl, blob };
}

async function sampleColorAdjustments(
  video: HTMLVideoElement, startTime: number, duration: number, level: EnhanceLevel, refined: boolean, signal: AbortSignal,
) {
  const sampleCount = refined ? 5 : 3;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d")!;
  const samples: HTMLCanvasElement[] = [];
  for (let i = 0; i < sampleCount; i++) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    await seekVideo(video, startTime + (duration * (i + 0.5)) / sampleCount);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const snap = document.createElement("canvas");
    snap.width = canvas.width; snap.height = canvas.height;
    snap.getContext("2d")!.drawImage(canvas, 0, 0);
    samples.push(snap);
  }
  const adj = detectAutoColor(samples, refined || level === 2);
  return adj;
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = Math.min(Math.max(0, time), video.duration || time);
    setTimeout(resolve, 500);
  });
}
