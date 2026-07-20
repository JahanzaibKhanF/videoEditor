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
      pendingAudioFlush = handleAudio(msg);
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
    output: (chunk, meta) => muxer!.addVideoChunk(chunk, meta),
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
      output: (chunk, meta) => muxer!.addAudioChunk(chunk, meta),
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
  if (!videoEncoder) { msg.frame.close(); return; }
  videoEncoder.encode(msg.frame, { keyFrame: msg.keyFrame });
  msg.frame.close();
  framesEncoded++;
  if (framesEncoded % 5 === 0 || framesEncoded === totalFrames) {
    post({ type: "progress", fraction: framesEncoded / totalFrames, label: `Encoding frame ${framesEncoded} / ${totalFrames}` });
  }
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
