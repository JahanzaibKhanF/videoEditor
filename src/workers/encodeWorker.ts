/**
 * encodeWorker — runs inside a dedicated Worker (see webCodecsRender.ts for
 * why: this is the CPU-heavy part of export, kept off the main thread so
 * seeking/drawing the next frame doesn't have to wait for the previous
 * frame's encode to finish).
 *
 * Owns the VideoEncoder, AudioEncoder, and mp4-muxer Muxer for one export
 * job. Protocol (see webCodecsRender.ts for the sending side):
 *   → {type:"init", width, height, fps, totalFrames, hasAudio, audioSampleRate, audioChannels, streamToDisk}
 *   → {type:"audio", channelData: Float32Array[], length}   (sent once, optional)
 *   → {type:"frame", frame: VideoFrame (transferred), keyFrame: boolean}   (sent totalFrames times)
 *   → {type:"finish"}
 *   ← {type:"progress", fraction, label}
 *   ← {type:"diskChunk", data: Uint8Array (transferred), position}   (streamToDisk mode only, many times)
 *   ← {type:"done", buffer?: ArrayBuffer, streamedToDisk?: true}   (the finished .mp4 file, unless streamed to disk already)
 *   ← {type:"error", message}
 */
import { Muxer, ArrayBufferTarget, StreamTarget } from "mp4-muxer";

// The ambient `postMessage` in this file resolves to `Window.postMessage`'s
// signature under the project's "dom"-only tsconfig lib (no "webworker" lib,
// to avoid conflicting with every other file that assumes a window/document
// exist). It's still the real worker global at runtime — this alias just
// gives it the correct two-argument (message, transferList) worker shape.
const post: (message: unknown, transfer?: Transferable[]) => void = postMessage as never;

// Global safety net: VideoEncoder's `output`/`error` callbacks (and
// AudioEncoder's) fire ASYNCHRONOUSLY, outside the try/catch wrapping
// self.onmessage below — a throw inside them (e.g. muxer.addVideoChunk
// rejecting a chunk) was previously a genuinely uncaught worker exception.
// That's what showed up on the main thread as the generic, undiagnosable
// "Encode worker crashed." (worker.onerror only ever gets a bare message,
// no stack, no context on which chunk/frame). Catching it here and posting
// a proper structured {type:"error"} instead means: (1) a real, specific
// error message reaches the console instead of a dead end, (2) the
// existing error-handling path in webCodecsRender.ts (reject `finished`,
// unstick a pending waitForFrameAck) runs cleanly instead of the worker
// dying mid-frame with whatever was in flight — including the transferred
// VideoFrame for that frame — left in an undefined state.
self.addEventListener("error", (event) => {
  post({ type: "error", message: `Encode worker internal error: ${event.message ?? "unknown"}` });
  event.preventDefault();
});
self.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as { message?: string } | undefined;
  post({ type: "error", message: `Encode worker unhandled rejection: ${reason?.message ?? String(event.reason)}` });
  event.preventDefault();
});

let muxer: Muxer<ArrayBufferTarget> | Muxer<StreamTarget> | null = null;
let streamingToDisk = false;
let videoEncoder: VideoEncoder | null = null;
let audioEncoder: AudioEncoder | null = null;
let totalFrames = 1;
let framesEncoded = 0;
let audioSampleRate = 44100;
let audioChannels = 2;
let pendingAudioFlush: Promise<void> | null = null;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      await handleInit(msg);
    } else if (msg.type === "audio") {
      pendingAudioFlush = handleAudio(msg).catch((err) => {
        post({ type: "error", message: `Audio setup failed inside worker: ${(err as Error)?.message ?? String(err)}` });
        throw err; // still reject pendingAudioFlush so handleFinish's await surfaces it too
      });
    } else if (msg.type === "frame") {
      handleFrame(msg);
    } else if (msg.type === "finish") {
      await handleFinish();
    }
  } catch (err) {
    post({ type: "error", message: (err as Error)?.message ?? String(err) });
  }
};

async function handleInit(msg: {
  width: number; height: number; fps: number; totalFrames: number;
  videoCodec: string; muxerVideoCodec: "avc" | "vp9"; bitrate: number;
  hasAudio: boolean; audioSampleRate: number; audioChannels: number;
  streamToDisk?: boolean;
}) {
  totalFrames = msg.totalFrames;
  audioSampleRate = msg.audioSampleRate;
  audioChannels = msg.audioChannels;

  // DISK STREAMING (2026-08-21, revised): a `FileSystemWritableFileStream`
  // turned out to NOT be transferable into a worker at all in this browser
  // — `DataCloneError: FileSystemWritableFileStream object could not be
  // cloned` — so the writable stream stays on the MAIN THREAD (which is
  // where it has to live anyway; that's who owns the file handle). Instead,
  // this worker uses mp4-muxer's `StreamTarget`, whose `onData` callback
  // fires with each chunk of muxed bytes AND the exact byte position they
  // belong at (mp4-muxer sometimes needs to patch earlier bytes once their
  // final size is known, not just append) — each chunk gets forwarded to
  // the main thread as a `diskChunk` message, and the main thread performs
  // the actual positioned write via `writable.write({type:'write',
  // position, data})`, which natively supports exactly this kind of
  // out-of-order/patch write. Net effect is the same as directly owning the
  // stream: nothing accumulates in this worker's memory, because every
  // chunk is handed off and forgotten immediately instead of being kept
  // around in an in-memory buffer.
  streamingToDisk = !!msg.streamToDisk;

  const muxerOptions = {
    video: { codec: msg.muxerVideoCodec, width: msg.width, height: msg.height, frameRate: msg.fps },
    audio: msg.hasAudio ? { codec: "aac" as const, numberOfChannels: msg.audioChannels, sampleRate: msg.audioSampleRate } : undefined,
    // MEMORY FIX (2026-08-21): this was `'in-memory'`, which per mp4-muxer's
    // own docs holds EVERY encoded video/audio chunk in a separate buffered
    // list — on top of the final target's own buffer — purely so it can
    // compute and place the moov (metadata) box before the media data for
    // "progressive playback" (start playing before the whole file has
    // downloaded). That's a real, expensive feature — for a video being
    // streamed over a network. It's dead weight here: this file goes
    // straight to a local download, never streamed, so nothing ever
    // benefits from progressive playback. `false` places metadata at the
    // END of the file instead (irrelevant for a fully-downloaded local
    // file) and, per mp4-muxer's docs, is "fastest and uses the least
    // memory". Required (not just preferred) when streaming to disk —
    // `'in-memory'` is fundamentally incompatible with a streaming target.
    fastStart: false as const,
  };

  muxer = streamingToDisk
    ? new Muxer({
        ...muxerOptions,
        target: new StreamTarget({
          onData: (data, position) => {
            // .slice() copies — mp4-muxer may reuse the underlying buffer
            // after this callback returns, and we're about to transfer
            // ownership of it away to the main thread.
            const chunk = data.slice();
            post({ type: "diskChunk", data: chunk, position }, [chunk.buffer]);
          },
          chunked: true, // batch small writes into ~16MiB chunks — far fewer postMessage round-trips than one per mp4 box
        }),
      })
    : new Muxer({ ...muxerOptions, target: new ArrayBufferTarget() });

  videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer!.addVideoChunk(chunk, meta);
      } catch (err) {
        post({ type: "error", message: `Failed to mux video chunk: ${(err as Error)?.message ?? String(err)}` });
      }
    },
    error: (err) => post({ type: "error", message: `Video encode failed: ${err.message}` }),
  });
  // This codec string was already verified via VideoEncoder.isConfigSupported
  // against this exact width/height/framerate/bitrate on the main thread
  // (see videoCodecSelect.ts) — configure() here should not be able to
  // reject it. If it somehow still does (e.g. a browser quirk), the error
  // callback above surfaces it and renderVideo.ts's try/catch falls back
  // to the FFmpeg pipeline rather than leaving the export stuck.
  videoEncoder.configure({
    codec: msg.videoCodec,
    width: msg.width,
    height: msg.height,
    bitrate: msg.bitrate,
    framerate: msg.fps,
  });

  if (msg.hasAudio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        try {
          muxer!.addAudioChunk(chunk, meta);
        } catch (err) {
          post({ type: "error", message: `Failed to mux audio chunk: ${(err as Error)?.message ?? String(err)}` });
        }
      },
      error: (err) => post({ type: "error", message: `Audio encode failed: ${err.message}` }),
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: msg.audioSampleRate,
      numberOfChannels: msg.audioChannels,
      bitrate: 128_000,
    });
  }
}

async function handleAudio(msg: { channelData: Float32Array[]; length: number }) {
  if (!audioEncoder) return;
  const CHUNK = 1024;
  const channels = msg.channelData.length;

  for (let start = 0; start < msg.length; start += CHUNK) {
    const n = Math.min(CHUNK, msg.length - start);
    // Planar layout: all of channel 0's samples, then all of channel 1's, etc.
    const planar = new Float32Array(n * channels);
    for (let ch = 0; ch < channels; ch++) {
      planar.set(msg.channelData[ch].subarray(start, start + n), ch * n);
    }
    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate: audioSampleRate,
      numberOfFrames: n,
      numberOfChannels: audioChannels,
      timestamp: Math.round((start / audioSampleRate) * 1_000_000),
      data: planar,
    });
    audioEncoder.encode(audioData);
    audioData.close();
  }
}

function handleFrame(msg: { frame: VideoFrame; keyFrame: boolean }) {
  // BUG FIX ("A VideoFrame was garbage collected without being closed" +
  // generic "Encode worker crashed"): this used to call
  // `videoEncoder.encode(msg.frame, ...)` and `msg.frame.close()` as two
  // separate statements. `encode()` throws SYNCHRONOUSLY if the encoder is
  // no longer in a usable state — most commonly because an EARLIER frame's
  // encode already failed asynchronously (the `error` callback registered
  // in handleInit fires and the spec puts the encoder in the "closed"
  // state), and this frame arrived before the main thread had any chance
  // to react to that. When `encode()` throws, execution never reached the
  // `msg.frame.close()` line right after it — the transferred VideoFrame
  // was silently abandoned, which is exactly what the browser's GC warning
  // was reporting. The underlying encoder error still got reported via the
  // `error` callback, but this specific frame's memory leaked on top of it,
  // and this function returned without ever calling
  // `signalReadyForNextFrame()` either, which could leave the main thread's
  // `waitForFrameAck()` hanging until the separate `{type:"error"}` message
  // unstuck it.
  //
  // Fixed with try/finally: the frame is now ALWAYS closed exactly once no
  // matter how `encode()` behaves, and any throw is re-raised so
  // self.onmessage's existing try/catch reports it as a proper, specific
  // {type:"error"} instead of the frame just vanishing.
  let encoderMissing = false;
  try {
    if (!videoEncoder) { encoderMissing = true; return; }
    videoEncoder.encode(msg.frame, { keyFrame: msg.keyFrame });
  } finally {
    msg.frame.close();
  }
  if (encoderMissing) { signalReadyForNextFrame(); return; }
  framesEncoded++;
  if (framesEncoded % 5 === 0 || framesEncoded === totalFrames) {
    post({ type: "progress", fraction: framesEncoded / totalFrames, label: `Encoding frame ${framesEncoded} / ${totalFrames}` });
  }
  signalReadyForNextFrame();
}
// ── Backpressure ────────────────────────────────────────────────────────
// The main thread produces frames (seek + canvas draw) independently of how
// fast this worker's VideoEncoder can actually consume them. Without any
// throttling, a slower software encoder (common for higher resolutions, or
// just a slower machine) falls behind while the main thread keeps
// transferring full-resolution VideoFrame objects — each one several MB of
// raw pixel data — into this worker as fast as it can seek. The encoder's
// internal queue backs up, worker memory balloons, and the browser
// eventually kills the worker outright with a generic crash (no useful
// error message, surfaces on the main thread as "Encode worker crashed.").
//
// Fix: only tell the main thread it's clear to send the NEXT frame once
// the encoder's queue has drained below a safe watermark. This caps how far
// ahead frame production can ever get, at the cost of the main thread
// occasionally waiting a few ms for the encoder to catch up — trivial
// compared to a crashed export.
const QUEUE_HIGH_WATERMARK = 3;
function signalReadyForNextFrame() {
  const trySignal = () => {
    if (!videoEncoder || videoEncoder.encodeQueueSize <= QUEUE_HIGH_WATERMARK) {
      post({ type: "frameAck" });
    } else {
      // No native event for "queue size changed" — a short poll is the
      // standard approach used in the official WebCodecs samples.
      setTimeout(trySignal, 8);
    }
  };
  trySignal();
}

async function handleFinish() {
  if (pendingAudioFlush) await pendingAudioFlush;
  await videoEncoder?.flush();
  await audioEncoder?.flush();
  if (!muxer) throw new Error("Muxer was never initialized.");
  muxer.finalize(); // for streamingToDisk, this may still fire a few more onData calls (e.g. patching box sizes) — all forwarded via the same "diskChunk" messages above before we get here

  if (streamingToDisk) {
    // Every byte has already been forwarded via "diskChunk" messages —
    // nothing left to send. The main thread closes the actual file stream
    // once it's applied all of them (see webCodecsRender.ts).
    post({ type: "done", streamedToDisk: true });
  } else {
    const { buffer } = (muxer as Muxer<ArrayBufferTarget>).target;
    post({ type: "done", buffer }, [buffer]);
  }
}