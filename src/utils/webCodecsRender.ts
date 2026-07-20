/**
 * webCodecsRender — export pipeline built on the WebCodecs API instead of
 * FFmpeg.wasm. Primary export path when supported; clientRender.ts (FFmpeg)
 * remains as the automatic fallback for browsers without WebCodecs (Firefox,
 * Safari as of writing — this is a real, current platform limitation, not a
 * choice made here).
 *
 * Architecture, and why it's safe to reuse so much existing code:
 * Instead of re-implementing compositing (transitions/text/images/blur/
 * animations) a second time for export, this drives the exact same
 * `compositeFrame()` function the live preview uses (see
 * utils/compositeFrame.ts) once per output frame, against <video> elements
 * seeked to the correct local time for that frame. That's the one part that
 * MUST happen on the main thread — video seeking requires a real
 * HTMLVideoElement, which doesn't exist inside a Worker. Once a frame is
 * drawn to an OffscreenCanvas, it's wrapped as a transferable `VideoFrame`
 * and handed off to encodeWorker.ts, which owns the actual VideoEncoder/
 * AudioEncoder/Muxer and does the CPU-heavy encoding off the main thread —
 * this is the "use a worker to make it faster" part: the main thread can
 * start seeking/drawing the next frame while the previous one is still
 * being encoded, instead of the two happening strictly serially.
 */
import {
  ClipDetails, TextDetails, ImageDetails, BlurDetails, AudioDetails, LayerOrder,
} from "../types/types";
import { pickVideoEncoderConfig, isAudioEncodingSupported, PickedVideoConfig } from "./videoCodecSelect";

export interface WebCodecsRenderParams {
  clips: ClipDetails[];
  texts: TextDetails[];
  images: ImageDetails[];
  blurs: BlurDetails[];
  audioTracks: AudioDetails[];
  layerOrder: LayerOrder[];
  imageEls: Record<number, HTMLImageElement | null>;
  width: number;
  height: number;
  fps: number;
  totalDuration: number;
  videoConfig: PickedVideoConfig;
  onProgress?: (fraction: number, label: string) => void;
}

/**
 * The real check — actually asks the browser whether it can encode THIS
 * project's real resolution, not a fixed 1280×720 sample. Returns the
 * picked config so the caller never has to re-decide (and risk disagreeing
 * with what was actually verified) — this is what fixed the AVC-level bug.
 */
export async function pickSupportedWebCodecsConfig(width: number, height: number, fps: number): Promise<PickedVideoConfig | null> {
  if (typeof window === "undefined") return null;
  return pickVideoEncoderConfig(width, height, fps);
}

export async function renderWithWebCodecs(params: WebCodecsRenderParams): Promise<Blob> {
  const { clips, texts, images, blurs, audioTracks, layerOrder, imageEls, width, height, fps, totalDuration, videoConfig, onProgress } = params;

  onProgress?.(0, "Preparing video sources…");

  // ── 1. Prepare a hidden <video> per unique clip source, preloaded ──────
  const uniqueSrcs = Array.from(new Set(clips.map(c => c.src)));
  const videoEls = new Map<string, HTMLVideoElement>();
  await Promise.all(uniqueSrcs.map(src => new Promise<void>((resolve) => {
    const v = document.createElement("video");
    v.src = src;
    v.muted = true;
    v.preload = "auto";
    v.playsInline = true;
    const done = () => resolve();
    v.addEventListener("loadeddata", done, { once: true });
    v.addEventListener("error", done, { once: true });
    setTimeout(done, 4000); // don't hang forever on a slow/broken source
    videoEls.set(src, v);
  })));

  // ── 2. Mix audio up front (independent of the video frame loop) ────────
  onProgress?.(0.05, "Mixing audio…");
  const audioSupported = audioTracks.length > 0 ? await isAudioEncodingSupported(44100, 2) : false;
  const mixedAudio = audioTracks.length > 0 && audioSupported
    ? await mixAudioTracks(audioTracks, clips, totalDuration)
    : null;

  // ── 3. Spin up the encode worker ────────────────────────────────────────
  const worker = new Worker(new URL("../workers/encodeWorker.ts", import.meta.url), { type: "module" });
  const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));

  const finished = new Promise<Blob>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "progress") {
        onProgress?.(0.1 + msg.fraction * 0.85, msg.label ?? "Encoding…");
      } else if (msg.type === "done") {
        resolve(new Blob([msg.buffer], { type: "video/mp4" }));
      } else if (msg.type === "error") {
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => reject(new Error(e.message || "Encode worker crashed."));
  });

  worker.postMessage({
    type: "init",
    width, height, fps, totalFrames,
    videoCodec: videoConfig.codec,
    muxerVideoCodec: videoConfig.muxerCodec,
    bitrate: videoConfig.bitrate,
    hasAudio: !!mixedAudio,
    audioSampleRate: mixedAudio?.sampleRate ?? 44100,
    audioChannels: mixedAudio?.numberOfChannels ?? 2,
  });

  if (mixedAudio) {
    // Transfer raw interleaved PCM once — the worker encodes it independently
    // of the per-frame video loop below (video/audio are muxed by timestamp,
    // not by call order).
    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < mixedAudio.numberOfChannels; ch++) channelData.push(mixedAudio.getChannelData(ch).slice());
    worker.postMessage({ type: "audio", channelData, length: mixedAudio.length }, channelData.map(c => c.buffer));
  }

  // ── 4. Frame loop — seek + draw on main thread, transfer to worker ─────
  const offscreen = new OffscreenCanvas(width, height);
  const ctx = offscreen.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D;

  const getVideoDrawable = (src: string) => videoEls.get(src) ?? null;

  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;

    // Seek every clip that's active at this frame to its correct local time
    const active = clips.filter(c => t >= (c.startPosition ?? 0) && t <= (c.endPosition ?? Infinity));
    await Promise.all(active.map(c => {
      const vid = videoEls.get(c.src);
      if (!vid) return Promise.resolve();
      const localTime = Math.max(0, (c.startTime ?? 0) + (t - (c.startPosition ?? 0)));
      if (Math.abs(vid.currentTime - localTime) < 1 / fps / 2) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const onSeeked = () => { vid.removeEventListener("seeked", onSeeked); resolve(); };
        vid.addEventListener("seeked", onSeeked);
        vid.currentTime = localTime;
        setTimeout(resolve, 300); // fallback so one stuck seek can't hang the whole export
      });
    }));

    compositeFrameSafe(ctx, width, height, t, fps, clips, texts, images, blurs, imageEls, layerOrder, getVideoDrawable);

    const frame = new VideoFrame(offscreen, { timestamp: Math.round((t * 1_000_000)) });
    const keyFrame = i % (fps * 2) === 0; // one keyframe every ~2s
    worker.postMessage({ type: "frame", frame, keyFrame }, [frame]);

    if (i % 10 === 0) onProgress?.(0.1 + (i / totalFrames) * 0.85, `Rendering frame ${i + 1} / ${totalFrames}`);
  }

  worker.postMessage({ type: "finish" });

  try {
    const blob = await finished;
    return blob;
  } finally {
    worker.terminate();
    videoEls.forEach(v => { v.src = ""; v.load(); });
  }
}

// Wraps compositeFrame with a synchronous import so this file has no
// top-level dependency cycle risk with CompositorCanvas.
import { compositeFrame } from "./compositeFrame";
function compositeFrameSafe(
  ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, t: number, fps: number,
  clips: ClipDetails[], texts: TextDetails[], images: ImageDetails[], blurs: BlurDetails[],
  imageEls: Record<number, HTMLImageElement | null>, layerOrder: LayerOrder[],
  getVideoDrawable: (src: string) => CanvasImageSource | null,
) {
  compositeFrame({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    width, height, t, fps, clips, texts, images, blurs, imageEls, layerOrder, getVideoDrawable,
  });
}

// ── Audio mixing via OfflineAudioContext ────────────────────────────────
async function mixAudioTracks(
  audioTracks: AudioDetails[], clips: ClipDetails[], totalDuration: number,
): Promise<AudioBuffer | null> {
  const sampleRate = 44100;
  const numberOfChannels = 2;
  const length = Math.max(1, Math.ceil(totalDuration * sampleRate));
  const offlineCtx = new OfflineAudioContext(numberOfChannels, length, sampleRate);

  const decodeCache = new Map<string, AudioBuffer>();
  let anyScheduled = false;

  for (const track of audioTracks) {
    if (track.muted || track.volume <= 0) continue;
    const clip = clips.find(c => c.id === track.clipId);
    if (!clip) continue;

    let buffer = decodeCache.get(clip.src);
    if (!buffer) {
      try {
        const res = await fetch(clip.src);
        const arrayBuf = await res.arrayBuffer();
        buffer = await offlineCtx.decodeAudioData(arrayBuf);
        decodeCache.set(clip.src, buffer);
      } catch {
        continue; // no audio track in this clip, or failed to decode — skip silently
      }
    }

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    const gain = offlineCtx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, track.volume ?? 1));
    source.connect(gain).connect(offlineCtx.destination);

    const clipLocalStart = Math.max(0, clip.startTime ?? 0);
    const when = Math.max(0, track.startTime);
    const playDuration = Math.max(0, Math.min(track.endTime, totalDuration) - track.startTime);
    if (playDuration <= 0) continue;

    try {
      source.start(when, clipLocalStart, playDuration);
      anyScheduled = true;
    } catch {
      // Invalid scheduling params (e.g. offset past buffer end) — skip this track
    }
  }

  if (!anyScheduled) return null;
  return offlineCtx.startRendering();
}
