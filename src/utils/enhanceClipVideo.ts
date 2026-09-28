/**
 * enhanceClipVideo — "AI Enhance": resolution, denoise, and color, each
 * Off/Low/High (or Off/HD/FHD for resolution), in Basic (fast classical
 * algorithms) or Advanced (real AI models for resolution + denoise; a
 * stronger classical pass for color — see frameEnhance.ts for why) mode.
 *
 * Structurally mirrors backgroundRemoval.ts (mediabunny CanvasSource
 * encode, index-based frame timing) — the difference is what happens to
 * each frame's pixels, and this output needs no alpha channel, so it
 * encodes to a plain MP4 instead of an alpha WebM.
 *
 * OUTPUT FRAME RATE — always a smooth OUTPUT_FPS (24), for both modes. An
 * earlier version processed (and encoded) at a much lower rate in Advanced
 * mode (as low as 6fps) purely to keep the slow AI models' total run time
 * down — but that meant the ENCODED result genuinely only had 6 unique
 * images per second, which reads as stuck/juddery both in the review
 * preview and in the final exported file, not just "lower quality". Basic
 * mode is cheap per frame, so it simply runs its (classical, no model)
 * pipeline at the full output rate directly. Advanced mode can't afford to
 * run its slow AI models at the full rate (that's the same total run time
 * problem all over again) — instead it computes the AI result at a sparse
 * set of "keyframes" (still ~6/s of unique AI work, unchanged run time
 * budget from before) and CROSS-FADES between consecutive keyframes for
 * every frame in between, so the output timeline still has real 24fps
 * motion instead of a hard, choppy hold on the same stale frame.
 */
import {
  Output, Mp4OutputFormat, BufferTarget, CanvasSource,
  getFirstEncodableVideoCodec, type VideoCodec,
} from "mediabunny";
import { ClipDetails } from "../types/types";
import { buildCanvasFilterString } from "./colorAdjustments";
import { detectAutoColor, applyNoiseOnlyDenoise, applySharpen, RESOLUTION_TARGET_HEIGHT, EnhanceLevel } from "./frameEnhance";

export type EnhanceMode = "basic" | "advanced";

export interface EnhanceSettings {
  mode: EnhanceMode;
  resolution: EnhanceLevel; // 1 = FHD (1080p), 2 = HD (720p)
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
  onProgress?: (p: EnhanceProgress) => void;
  onFramePreview?: (canvas: HTMLCanvasElement) => void;
  signal: AbortSignal;
}

export const MAX_ENHANCE_SECONDS = 30;

// The output's real frame rate — smooth, normal-video territory. Never
// lowered for Advanced mode; see the file comment for why (that used to be
// where the choppiness came from).
const OUTPUT_FPS = 24;
// Advanced mode only: one fresh AI computation every this-many output
// frames (4 → 6 AI computations/sec at 24fps, matching the old 6fps
// advanced rate's total AI workload/run time) — every frame in between is
// a cross-fade blend of its two surrounding AI keyframes, not a hold.
const AI_KEYFRAME_STRIDE = 4;

const VIDEO_CODEC_CANDIDATES: VideoCodec[] = ["avc", "vp9", "vp8"];

// The AI models here are transformer-based, so their WASM memory use scales
// with input pixel count — feeding a real clip's actual frame size straight
// in (anything above small-test-clip resolution) reliably crashes the model
// with `std::bad_alloc` inside OrtRun(). Capping the input before it ever
// reaches the model keeps memory use bounded regardless of the source
// clip's real resolution; the model's output still gets scaled up to the
// real target size afterward, so this only affects how much detail the AI
// itself has to work from, not the final output size. Denoise's model is a
// heavier 4x model, so it gets a smaller cap.
const AI_RESOLUTION_MAX_DIM = 480;
const AI_DENOISE_MAX_DIM = 384;

function capForAI(canvas: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
  const { width: w, height: h } = canvas;
  if (Math.max(w, h) <= maxDim) return canvas;
  const scale = maxDim / Math.max(w, h);
  const capped = document.createElement("canvas");
  capped.width = Math.max(1, Math.round(w * scale));
  capped.height = Math.max(1, Math.round(h * scale));
  capped.getContext("2d")!.drawImage(canvas, 0, 0, capped.width, capped.height);
  return capped;
}

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
  const { clip, settings, onProgress, onFramePreview, signal } = opts;
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

  const totalFrames = Math.max(1, Math.round(clipDuration * OUTPUT_FPS));
  const frameDuration = 1 / OUTPUT_FPS;

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = srcW; srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext("2d")!;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW; outCanvas.height = outH;
  const outCtx = outCanvas.getContext("2d")!;

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

  try {
    if (settings.mode === "basic") {
      // Cheap per frame (no model) — just run the real pipeline at the full
      // output rate directly, no keyframing/blending needed.
      for (let i = 0; i < totalFrames; i++) {
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
        const localTime = startTime + (i / totalFrames) * clipDuration;
        await seekVideo(sourceVideo, localTime);
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

        srcCtx.drawImage(sourceVideo, 0, 0, srcW, srcH);

        if (!doResize) {
          outCtx.drawImage(srcCanvas, 0, 0, outW, outH);
        } else {
          outCtx.imageSmoothingEnabled = true;
          outCtx.imageSmoothingQuality = "high";
          outCtx.drawImage(srcCanvas, 0, 0, outW, outH);
          // A plain resize alone just makes a bigger, softer image — a real
          // unsharp-mask pass gives Basic Quality some actual "repaired
          // detail" character too, not just more pixels.
          applySharpen(outCtx, outW, outH);
        }

        if (settings.denoise > 0) applyNoiseOnlyDenoise(outCtx, outW, outH, settings.denoise);

        if (colorAdj) {
          outCtx.save();
          outCtx.filter = buildCanvasFilterString(colorAdj);
          outCtx.drawImage(outCanvas, 0, 0);
          outCtx.filter = "none";
          outCtx.restore();
        }

        onFramePreview?.(outCanvas);
        await videoSource.add(i * frameDuration, frameDuration);
        onProgress?.({ fraction: (i + 1) / totalFrames, label: `Enhancing — frame ${i + 1} of ${totalFrames}` });
      }
    } else {
      // Advanced — sparse AI keyframes, cross-faded for every frame between
      // them, so the AI's total run time stays the same as before while the
      // output timeline still has real 24fps motion.
      const keyIndices: number[] = [];
      for (let i = 0; i < totalFrames; i += AI_KEYFRAME_STRIDE) keyIndices.push(i);
      if (keyIndices[keyIndices.length - 1] !== totalFrames - 1) keyIndices.push(totalFrames - 1);

      const keyCanvases = new Map<number, HTMLCanvasElement>();
      for (let k = 0; k < keyIndices.length; k++) {
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
        const idx = keyIndices[k];
        const localTime = startTime + (idx / totalFrames) * clipDuration;
        await seekVideo(sourceVideo, localTime);
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

        srcCtx.drawImage(sourceVideo, 0, 0, srcW, srcH);

        if (!doResize) {
          outCtx.drawImage(srcCanvas, 0, 0, outW, outH);
        } else {
          const bitmap = await createImageBitmap(capForAI(srcCanvas, AI_RESOLUTION_MAX_DIM));
          const aiImage = await processFrameAI("resolution", bitmap, k === 0 ? onProgress : undefined);
          const aiCanvas = document.createElement("canvas");
          aiCanvas.width = aiImage.width; aiCanvas.height = aiImage.height;
          aiCanvas.getContext("2d")!.putImageData(aiImage, 0, 0);
          outCtx.drawImage(aiCanvas, 0, 0, outW, outH);
        }
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

        if (settings.denoise > 0) {
          const bitmap = await createImageBitmap(capForAI(outCanvas, AI_DENOISE_MAX_DIM));
          const aiImage = await processFrameAI("denoise", bitmap, k === 0 ? onProgress : undefined);
          const aiCanvas = document.createElement("canvas");
          aiCanvas.width = aiImage.width; aiCanvas.height = aiImage.height;
          aiCanvas.getContext("2d")!.putImageData(aiImage, 0, 0);
          // The realworld-SR denoiser is a 4x model — resample its output
          // back down to this frame's actual working size so denoise never
          // changes resolution on its own (that's the resolution stage's job).
          outCtx.drawImage(aiCanvas, 0, 0, outW, outH);
        }
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

        const snap = document.createElement("canvas");
        snap.width = outW; snap.height = outH;
        snap.getContext("2d")!.drawImage(outCanvas, 0, 0);
        keyCanvases.set(idx, snap);

        onProgress?.({
          // Keyframe computation is the slow part (real AI work) — budget it
          // as the first 85% of the bar; the blend/encode pass below is fast.
          fraction: (0.85 * (k + 1)) / keyIndices.length,
          label: `Enhancing — keyframe ${k + 1} of ${keyIndices.length}`,
        });
      }

      let ki = 0;
      for (let i = 0; i < totalFrames; i++) {
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
        while (ki < keyIndices.length - 1 && keyIndices[ki + 1] <= i) ki++;
        const kA = keyIndices[ki], kB = keyIndices[Math.min(ki + 1, keyIndices.length - 1)];
        const t = kB === kA ? 0 : (i - kA) / (kB - kA);
        const canvasA = keyCanvases.get(kA)!, canvasB = keyCanvases.get(kB)!;

        outCtx.clearRect(0, 0, outW, outH);
        outCtx.globalAlpha = 1;
        outCtx.drawImage(canvasA, 0, 0);
        if (t > 0.001) {
          outCtx.globalAlpha = t;
          outCtx.drawImage(canvasB, 0, 0);
          outCtx.globalAlpha = 1;
        }

        if (colorAdj) {
          outCtx.save();
          outCtx.filter = buildCanvasFilterString(colorAdj);
          outCtx.drawImage(outCanvas, 0, 0);
          outCtx.filter = "none";
          outCtx.restore();
        }

        onFramePreview?.(outCanvas);
        await videoSource.add(i * frameDuration, frameDuration);
        onProgress?.({ fraction: 0.85 + 0.15 * ((i + 1) / totalFrames), label: `Finishing — frame ${i + 1} of ${totalFrames}` });
      }
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
