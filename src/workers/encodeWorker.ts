/**
 * encodeWorker — runs inside a dedicated Worker (see webCodecsRender.ts for
 * why: this is the CPU-heavy part of export, kept off the main thread so
 * seeking/drawing the next frame doesn't have to wait for the previous
 * frame's encode to finish).
 *
 * Owns the VideoEncoder, AudioEncoder, and mp4-muxer Muxer for one export
 * job. Protocol (see webCodecsRender.ts for the sending side):
 *   → {type:"init", width, height, fps, totalFrames, hasAudio, audioSampleRate, audioChannels}
 *   → {type:"audio", channelData: Float32Array[], length}   (sent once, optional)
 *   → {type:"frame", frame: VideoFrame (transferred), keyFrame: boolean}   (sent totalFrames times)
 *   → {type:"finish"}
 *   ← {type:"progress", fraction, label}
 *   ← {type:"done", buffer: ArrayBuffer}   (the finished .mp4 file)
 *   ← {type:"error", message}
 */
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

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

let muxer: Muxer<ArrayBufferTarget> | null = null;
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
}) {
  totalFrames = msg.totalFrames;
  audioSampleRate = msg.audioSampleRate;
  audioChannels = msg.audioChannels;

  const target = new ArrayBufferTarget();
  muxer = new Muxer({
    target,
    video: { codec: msg.muxerVideoCodec, width: msg.width, height: msg.height, frameRate: msg.fps },
    audio: msg.hasAudio ? { codec: "aac", numberOfChannels: msg.audioChannels, sampleRate: msg.audioSampleRate } : undefined,
    fastStart: "in-memory",
  });

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
  if (!videoEncoder) { msg.frame.close(); signalReadyForNextFrame(); return; }
  videoEncoder.encode(msg.frame, { keyFrame: msg.keyFrame });
  msg.frame.close();
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
  muxer.finalize();
  const { buffer } = muxer.target as ArrayBufferTarget;
  post({ type: "done", buffer }, [buffer]);
}