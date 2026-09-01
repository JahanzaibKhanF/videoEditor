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
 * utils/compositeFrame.ts) once per output frame, against decoded canvases
 * for the correct local time of that frame. Once a frame is drawn to an
 * OffscreenCanvas, it's wrapped as a transferable `VideoFrame` and handed
 * off to encodeWorker.ts, which owns the actual VideoEncoder/AudioEncoder/
 * Muxer and does the CPU-heavy encoding off the main thread — the main
 * thread can start decoding/drawing the next frame while the previous one
 * is still being encoded, instead of the two happening strictly serially.
 *
 * SOURCE-FRAME DECODING (2026-08-07 change): this used to seek a hidden
 * <video> element per frame, per active clip (`vid.currentTime = t`, wait
 * for `seeked`/`requestVideoFrameCallback`). A real seek on an
 * HTMLVideoElement is a slow round trip through the browser's whole media
 * pipeline, done hundreds/thousands of times per export — that was the
 * actual export-speed bottleneck, not the encoder. Replaced with
 * Mediabunny's `CanvasSink`, which demuxes + decodes straight through
 * WebCodecs' `VideoDecoder` (the same underlying browser API the encoder
 * side already uses) and services a whole batch of requested timestamps
 * per source without redoing shared decode work — no <video> element, no
 * seek-and-wait, in decode order. Compositing, encoding, muxing, and the
 * FFmpeg fallback below are unrelated to this and are unchanged.
 */
import {
  ClipDetails, TextDetails, ImageDetails, BlurDetails, AudioDetails, LayerOrder, ClipEffectDetails,
} from "../types/types";
import { pickVideoEncoderConfig, isAudioEncodingSupported, PickedVideoConfig } from "./videoCodecSelect";
import { mapOutputElapsedToSourceTime, totalSourceConsumed } from "./speedRamp";
import { Input, ALL_FORMATS, BlobSource, CanvasSink } from "mediabunny";

export interface WebCodecsRenderParams {
  clips: ClipDetails[];
  texts: TextDetails[];
  images: ImageDetails[];
  blurs: BlurDetails[];
  clipEffects?: ClipEffectDetails[];
  audioTracks: AudioDetails[];
  layerOrder: LayerOrder[];
  imageEls: Record<number, HTMLImageElement | null>;
  width: number;
  height: number;
  fps: number;
  totalDuration: number;
  videoConfig: PickedVideoConfig;
  onProgress?: (fraction: number, label: string) => void;
  /**
   * When provided, the muxed output is streamed straight to this file on
   * disk as it's encoded instead of being held in memory the whole time —
   * see the DISK STREAMING comment in encodeWorker.ts. Get one via
   * `window.showSaveFilePicker()` (Chrome/Edge only — check
   * `"showSaveFilePicker" in window` first) BEFORE calling this function.
   * Omit to keep the previous in-memory behavior (fine for short exports).
   */
  saveHandle?: FileSystemFileHandle;
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
  const { clips, texts, images, blurs, clipEffects = [], audioTracks, layerOrder, imageEls, width, height, fps, totalDuration, videoConfig, onProgress, saveHandle } = params;

  onProgress?.(0, "Opening video sources…");

  // ── 1. Open one CanvasSink PER CLIP (not per unique source file).
  //
  // BUG FIX ("Encode worker crashed" when a video is used twice at once —
  // e.g. a clip duplicated, blurred and stretched to fill the frame as its
  // OWN background layer, sitting behind the original): this used to open
  // one shared CanvasSink per unique `src`, and key every decode-timestamp
  // request and decoded-canvas cache by that same src string. When two
  // clips pointed at the same file and were both visible on the same
  // output frame, every one of those maps collapsed the two clips onto a
  // single entry — whichever clip came later in the `clips` array silently
  // overwrote the other's requested local time on every frame. Two clips
  // showed IDENTICAL decoded content regardless of their own trim/speed,
  // and — critically — the moment the two clips' active ranges didn't
  // fully overlap, the sequence of timestamps handed to that shared sink
  // could jump BACKWARD (e.g. clip A's schedule for frames where only A is
  // active, then clip B's much-earlier local time the instant both become
  // active). WebCodecs' VideoDecoder requires strictly non-decreasing
  // decode timestamps per stream — that backward jump throws inside
  // Mediabunny's CanvasSink and took the whole export down with it.
  //
  // Fixed by opening an independent CanvasSink per CLIP id, so two clips
  // sharing a file get two fully independent decode pipelines with their
  // own always-monotonic timestamp schedules — the network fetch is still
  // deduplicated per unique src (below) so this doesn't re-download
  // anything, it only re-demuxes/decodes independently, which is the only
  // way to give overlapping same-source clips correct, crash-proof output.
  //
  // `alpha: true` unconditionally: there's no per-clip flag telling us
  // which sources are background-removed (transparent) videos, so every
  // sink is opened alpha-capable to match the alpha:true export canvas
  // below — a no-op cost for ordinary opaque sources.
  const uniqueSrcs = Array.from(new Set(clips.map(c => c.src)));
  const blobCache = new Map<string, Blob>();
  await Promise.all(uniqueSrcs.map(async (src) => {
    try {
      blobCache.set(src, await (await fetch(src)).blob());
    } catch (err) {
      console.error("[webCodecsRender] failed to fetch source:", src, err);
    }
  }));

  const sinks = new Map<string, CanvasSink>(); // keyed by clip.id
  await Promise.all(clips.map(async (clip) => {
    const blob = blobCache.get(clip.src);
    if (!blob) return; // that source failed to fetch — compositeFrame already tolerates a missing drawable
    try {
      const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
      const track = await input.getPrimaryVideoTrack();
      if (!track) return; // audio-only / broken source — compositeFrame already tolerates a missing drawable
      sinks.set(clip.id, new CanvasSink(track, { alpha: true }));
    } catch (err) {
      console.error("[webCodecsRender] failed to open source via Mediabunny:", clip.src, err);
    }
  }));

  // ── 2. Mix audio up front (independent of the video frame loop) ────────
  onProgress?.(0.05, "Mixing audio…");
  let mixedAudio: AudioBuffer | null = null;
  try {
    const audioSupported = audioTracks.length > 0 ? await isAudioEncodingSupported(44100, 2) : false;
    mixedAudio = audioTracks.length > 0 && audioSupported
      ? await mixAudioTracks(audioTracks, clips, totalDuration)
      : null;
  } catch (err) {
    // DIAGNOSTIC (2026-08-21): a throw here used to propagate up disguised
    // as the encode worker's own generic "crashed" message once it reached
    // renderVideo.ts's single catch-all — nothing pointed at audio mixing
    // specifically. Tagging it here means the console now says WHERE it
    // actually failed instead of leaving every failure looking identical.
    throw new Error(`Audio mixing failed: ${(err as Error)?.message ?? String(err)}`);
  }

  // ── 3. Spin up the encode worker ────────────────────────────────────────
  let worker: Worker;
  try {
    worker = new Worker(new URL("../workers/encodeWorker.ts", import.meta.url), { type: "module" });
  } catch (err) {
    throw new Error(`Encode worker failed to start: ${(err as Error)?.message ?? String(err)}`);
  }
  const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));

  // If we have a save-file handle, open its writable stream NOW (before
  // "init" is posted below) and keep it HERE on the main thread — see the
  // DISK STREAMING comment in encodeWorker.ts's handleInit for why it can't
  // just be transferred into the worker (FileSystemWritableFileStream
  // isn't transferable in every browser — DataCloneError). Instead the
  // worker posts back small "diskChunk" messages and this thread performs
  // the actual positioned writes.
  let diskWritable: FileSystemWritableFileStream | null = null;
  if (saveHandle) {
    try {
      diskWritable = await saveHandle.createWritable();
    } catch (err) {
      // Not fatal — just means we fall back to the in-memory path below,
      // same as if no saveHandle had been passed at all.
      console.error("[webCodecsRender] couldn't open writable stream for save handle, falling back to in-memory:", err);
      diskWritable = null;
    }
  }
  // Chained onto for every "diskChunk" message so writes always land in the
  // order the worker sent them — message-handler invocations for two
  // different "diskChunk" messages CAN overlap (the handler below is async,
  // and the browser doesn't wait for one dispatch's returned promise before
  // delivering the next queued message), so without this a slow write for
  // an earlier chunk could still be in flight when a later chunk's write
  // starts, landing bytes at the wrong position in the file.
  let diskWriteQueue: Promise<void> = Promise.resolve();
  let diskWriteFailure: Error | null = null;

  let ackResolve: (() => void) | null = null;
  let ackReject: ((err: Error) => void) | null = null;
  let workerFailure: Error | null = null;
  const finished = new Promise<Blob>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "progress") {
        onProgress?.(0.1 + msg.fraction * 0.85, msg.label ?? "Encoding…");
      } else if (msg.type === "frameAck") {
        ackResolve?.();
        ackResolve = null; ackReject = null;
      } else if (msg.type === "diskChunk") {
        diskWriteQueue = diskWriteQueue.then(async () => {
          if (diskWriteFailure || !diskWritable) return;
          try {
            await diskWritable.write({ type: "write", position: msg.position, data: msg.data });
          } catch (err) {
            diskWriteFailure = new Error(`Failed writing to disk: ${(err as Error)?.message ?? String(err)}`);
          }
        });
      } else if (msg.type === "done") {
        if (msg.streamedToDisk && saveHandle && diskWritable) {
          // Every "diskChunk" write was queued above, possibly still in
          // flight — wait for the whole queue to actually finish (in
          // order) before closing the file, then read it back once as a
          // Blob so the rest of the app keeps working exactly as before
          // (recent-videos list, "Watch Video" preview). A single bounded
          // read of an already-finished file is nothing like the
          // growing-buffer-during-encode problem this whole change exists
          // to avoid.
          diskWriteQueue
            .then(async () => {
              if (diskWriteFailure) throw diskWriteFailure;
              await diskWritable!.close();
              return saveHandle!.getFile();
            })
            .then(resolve)
            .catch(reject);
        } else {
          resolve(new Blob([msg.buffer], { type: "video/mp4" }));
        }
      } else if (msg.type === "error") {
        const err = new Error(msg.message);
        workerFailure = err;
        ackReject?.(err); // unstick the frame loop if it's mid-wait
        ackResolve = null; ackReject = null;
        reject(err);
      }
    };
    worker.onerror = (e) => {
      const err = new Error(e.message || "Encode worker crashed.");
      workerFailure = err;
      ackReject?.(err); // without this, a crash mid-export left the frame
      ackResolve = null; ackReject = null; // loop awaiting an ack that would
      reject(err);                         // never come — a silent hang
    };
  });
  // `finished` is the real result the caller awaits once the frame loop
  // completes — but if the worker fails WHILE we're still in that loop (not
  // yet awaiting `finished`), its rejection would otherwise sit unobserved
  // until we got there, which is exactly what a bare "Uncaught (in promise)"
  // console error is. Attaching a no-op catch immediately marks it as
  // observed without affecting the real `await finished` below.
  finished.catch(() => {});
  // Resolves once the worker signals its encode queue has drained enough to
  // accept another frame — see encodeWorker.ts's backpressure comment for
  // why this matters (without it, a slower encoder falls behind and the
  // worker's memory usage balloons until the browser kills it). Rejects
  // immediately (instead of hanging forever) if the worker has already
  // failed or fails while we're waiting.
  const waitForFrameAck = (): Promise<void> => {
    if (workerFailure) return Promise.reject(workerFailure);
    return new Promise((resolve, reject) => { ackResolve = resolve; ackReject = reject; });
  };

  worker.postMessage({
    type: "init",
    width, height, fps, totalFrames,
    videoCodec: videoConfig.codec,
    muxerVideoCodec: videoConfig.muxerCodec,
    bitrate: videoConfig.bitrate,
    hasAudio: !!mixedAudio,
    audioSampleRate: mixedAudio?.sampleRate ?? 44100,
    audioChannels: mixedAudio?.numberOfChannels ?? 2,
    streamToDisk: !!diskWritable,
  });

  if (mixedAudio) {
    // Transfer raw interleaved PCM once — the worker encodes it independently
    // of the per-frame video loop below (video/audio are muxed by timestamp,
    // not by call order).
    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < mixedAudio.numberOfChannels; ch++) channelData.push(mixedAudio.getChannelData(ch).slice());
    worker.postMessage({ type: "audio", channelData, length: mixedAudio.length }, channelData.map(c => c.buffer));
  }

  // ── 4. Frame loop — decode + draw on main thread, transfer to worker ───
  const offscreen = new OffscreenCanvas(width, height);
  const ctx = offscreen.getContext("2d", { alpha: true }) as OffscreenCanvasRenderingContext2D;

  // Pre-plan, in exact frame order, which local source timestamp each
  // active clip needs at every output frame. This is cheap arithmetic (no
  // decoding happens here) and lets each source's CanvasSink service its
  // whole export's worth of requests as one batched, forward `canvasesAtTimestamps`
  // call instead of a cold lookup every frame — Mediabunny can then decode
  // in order and never re-decode shared work between nearby requests.
  // Keyed by clip.id throughout (see the bug-fix note above `sinks`).
  const perFrameClipTimes: Map<string, number>[] = new Array(totalFrames);
  const requestedTimestamps = new Map<string, number[]>();
  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    const active = clips.filter(c => t >= (c.startPosition ?? 0) && t <= (c.endPosition ?? Infinity));
    const perClip = new Map<string, number>();
    for (const c of active) {
      if (!sinks.has(c.id)) continue; // source failed to open — compositeFrame tolerates a missing drawable
      const localTime = mapOutputElapsedToSourceTime(c, t - (c.startPosition ?? 0));
      perClip.set(c.id, localTime);
      if (!requestedTimestamps.has(c.id)) requestedTimestamps.set(c.id, []);
      requestedTimestamps.get(c.id)!.push(localTime);
    }
    perFrameClipTimes[i] = perClip;
  }

  type CanvasIter = AsyncIterator<{ canvas: HTMLCanvasElement | OffscreenCanvas; timestamp: number } | null>;
  const sinkIterators = new Map<string, CanvasIter>();
  for (const [clipId, sink] of sinks) {
    const timestamps = requestedTimestamps.get(clipId) ?? [];
    sinkIterators.set(clipId, sink.canvasesAtTimestamps(timestamps)[Symbol.asyncIterator]() as CanvasIter);
  }

  const currentCanvasByClipId = new Map<string, HTMLCanvasElement | OffscreenCanvas | null>();
  const getVideoDrawable = (clipId: string) => currentCanvasByClipId.get(clipId) ?? null;

  try {
    for (let i = 0; i < totalFrames; i++) {
      // FAIL-FAST GUARD (fixes the "VideoFrame was garbage collected without
      // being closed" warning): if the worker already died on a PRIOR
      // iteration, `workerFailure` is set here before we've had a chance to
      // notice via `waitForFrameAck()` (that only rejects once we're
      // actually awaiting it). Without this check the loop would happily
      // create ANOTHER full-resolution VideoFrame and hand it to a dead
      // worker — `postMessage` to an already-terminated/crashed worker
      // doesn't throw, it just silently drops the message, so that frame's
      // `close()` would never be called by anyone. Bailing out immediately
      // means we never manufacture a frame nobody is going to consume.
      if (workerFailure) throw workerFailure;
      const t = i / fps;

      const perClip = perFrameClipTimes[i];
      await Promise.all(Array.from(perClip.keys()).map(async (clipId) => {
        const it = sinkIterators.get(clipId);
        if (!it) return;
        const { value } = await it.next();
        currentCanvasByClipId.set(clipId, value ? value.canvas : null);
      }));

      try {
        compositeFrameSafe(ctx, width, height, t, fps, clips, texts, images, blurs, clipEffects, imageEls, layerOrder, getVideoDrawable);
      } catch (err) {
        throw new Error(`Compositing failed at frame ${i} (t=${t.toFixed(2)}s): ${(err as Error)?.message ?? String(err)}`);
      }

      let frame: VideoFrame;
      try {
        frame = new VideoFrame(offscreen, { timestamp: Math.round((t * 1_000_000)) });
      } catch (err) {
        throw new Error(`Failed to create VideoFrame at frame ${i}: ${(err as Error)?.message ?? String(err)}`);
      }
      const keyFrame = i % (fps * 2) === 0; // one keyframe every ~2s
      try {
        worker.postMessage({ type: "frame", frame, keyFrame }, [frame]);
      } catch (err) {
        // postMessage itself threw (e.g. worker already gone) — the transfer
        // never completed, so `frame` is still OURS and would otherwise leak
        // until GC. Close it explicitly before propagating the failure.
        frame.close();
        throw new Error(`Failed to send frame ${i} to encode worker: ${(err as Error)?.message ?? String(err)}`);
      }
      await waitForFrameAck();

      if (i % 10 === 0) onProgress?.(0.1 + (i / totalFrames) * 0.85, `Rendering frame ${i + 1} / ${totalFrames}`);
    }

    worker.postMessage({ type: "finish" });
    const blob = await finished;
    return blob;
  } finally {
    worker.terminate();
    // Release each iterator's internal decoder resources (per Mediabunny's
    // "always call return() on a manually-driven iterator" guidance).
    await Promise.all(Array.from(sinkIterators.values()).map(it => it.return?.(undefined)?.catch(() => {})));
  }
}

// Wraps compositeFrame with a synchronous import so this file has no
// top-level dependency cycle risk with CompositorCanvas.
import { compositeFrame } from "./compositeFrame";
function compositeFrameSafe(
  ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, t: number, fps: number,
  clips: ClipDetails[], texts: TextDetails[], images: ImageDetails[], blurs: BlurDetails[],
  clipEffects: ClipEffectDetails[],
  imageEls: Record<number, HTMLImageElement | null>, layerOrder: LayerOrder[],
  getVideoDrawable: (src: string) => CanvasImageSource | null,
) {
  compositeFrame({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    width, height, t, fps, clips, texts, images, blurs, clipEffects, imageEls, layerOrder, getVideoDrawable,
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
    // Consistency fix: the FFmpeg fallback path (clientRender.ts) mutes a
    // track when EITHER the clip itself is muted OR its AudioDetails entry
    // is muted (`clip.muted || audioMeta?.muted`). This path only checked
    // `track.muted`, so if a clip's own `muted` flag were ever set, the
    // WebCodecs export would still include its audio while the FFmpeg
    // fallback would correctly drop it — a silent divergence between the
    // two export engines for what should be identical output.
    if (clip.muted) continue;

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

    // Speed ramps change how much SOURCE material a fixed on-timeline
    // window consumes; audio needs the matching playback rate or it drifts
    // out of sync with the (correctly ramped) video within a couple of
    // frames. A constant clip.speed maps exactly onto AudioBufferSourceNode
    // .playbackRate. A true multi-point ramp can't be represented by a
    // single rate — sample-accurate ramped audio would need the clip split
    // into several scheduled sources, one per ramp segment, which is out of
    // scope here — so multi-point ramps use the ramp's time-weighted
    // average rate as a reasonable approximation rather than silently
    // playing audio at the wrong (1×) speed.
    const speed = clip.speed;
    let rate = 1;
    if (typeof speed === "number" && speed > 0) {
      rate = speed;
    } else if (Array.isArray(speed) && speed.length > 0) {
      const totalConsumed = Math.max(0.0001, totalSourceConsumed(clip));
      const outputDuration = Math.max(0.0001, (clip.endPosition ?? 0) - (clip.startPosition ?? 0));
      rate = totalConsumed / outputDuration;
    }
    source.playbackRate.value = rate;

    try {
      source.start(when, clipLocalStart, playDuration * rate);
      anyScheduled = true;
    } catch {
      // Invalid scheduling params (e.g. offset past buffer end) — skip this track
    }
  }

  if (!anyScheduled) return null;
  return offlineCtx.startRendering();
}