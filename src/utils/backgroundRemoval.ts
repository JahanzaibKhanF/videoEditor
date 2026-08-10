import { removeBackground } from "@imgly/background-removal";
import {
  Output, WebMOutputFormat, BufferTarget, CanvasSource,
  canEncodeVideo, type VideoCodec,
} from "mediabunny";
import { ClipDetails } from "../types/types";

// Must match the installed @imgly/background-removal version (package.json) —
// used to build an explicit CDN publicPath instead of relying on the
// library's own bundler-unfriendly auto-detection (see modelConfig below).
const BG_REMOVAL_PKG_VERSION = "1.7.0";

export interface BgRemovalProgress {
  fraction: number;      // 0..1
  frameIndex: number;
  totalFrames: number;
  label: string;
}

export interface BgRemovalResult {
  blobUrl: string;
  blob: Blob;
}

export interface BgRemovalOptions {
  clip: ClipDetails;
  /** "fast" trades accuracy for speed (quantized model); "quality" ("perfect") uses the full-precision model. */
  quality: "fast" | "quality";
  /** Frames per second to process at — doesn't need to match the source/export fps; lower = much faster. */
  processFps?: number;
  onProgress?: (p: BgRemovalProgress) => void;
  /** Called every processed frame with a canvas already painted with the live result, for real-time preview. */
  onFramePreview?: (canvas: HTMLCanvasElement) => void;
  signal: AbortSignal;
}

// WebM only really supports alpha with these two codecs (in order of
// preference — VP9 gives smaller files).
const ALPHA_CODEC_CANDIDATES: VideoCodec[] = ["vp9", "vp8"];

/**
 * Picks a video codec this browser can actually encode WITH an alpha
 * channel, using mediabunny's own capability check instead of a hand-rolled
 * WebCodecs probe.
 *
 * WHY MEDIABUNNY'S canEncodeVideo() INSTEAD OF RAW isConfigSupported():
 * this app went through several rounds of hand-rolling alpha-capability
 * detection directly against the WebCodecs VideoEncoder API — explicit
 * hardwareAcceleration hints, multi-mode fallback loops, even a real
 * test-encode-and-flush round trip. Every one of those either failed to
 * fix a real "browser can't do this" case, or actively broke a config
 * that was already working, because raw WebCodecs' async failure modes
 * (configure() succeeding, then the encoder silently closing itself later
 * via the error callback) are genuinely easy to get wrong by hand.
 * mediabunny's own docs are explicit that `hardwareAcceleration` is "best
 * left on 'no-preference'" — the default — rather than steered by hand,
 * which matches what was actually working here before any of this
 * hand-rolled tuning started. Leaning on a maintained library for this
 * instead of re-deriving encoder-capability edge cases ourselves is the
 * more reliable path going forward.
 */
async function pickAlphaCodec(width: number, height: number): Promise<VideoCodec> {
  for (const codec of ALPHA_CODEC_CANDIDATES) {
    try {
      const ok = await canEncodeVideo(codec, { width, height, bitrate: 8_000_000, alpha: "keep" });
      if (ok) return codec;
    } catch { /* try the next candidate */ }
  }
  throw new Error(ALPHA_UNSUPPORTED_MESSAGE);
}

const ALPHA_UNSUPPORTED_MESSAGE =
  "This browser/device can't encode a transparent video. This is a browser limitation, not a bug in the app — " +
  "try the latest Chrome or Edge on desktop. It's not supported on Firefox or Safari, or in most mobile browsers.";

export type AlphaCapabilityResult =
  | { supported: true }
  | { supported: false; reason: "no-webcodecs" | "no-alpha-encoder" };

export async function checkAlphaCapability(): Promise<AlphaCapabilityResult> {
  if (typeof VideoEncoder === "undefined") return { supported: false, reason: "no-webcodecs" };
  try {
    await pickAlphaCodec(640, 360);
    return { supported: true };
  } catch {
    return { supported: false, reason: "no-alpha-encoder" };
  }
}

/**
 * Runs background removal across a clip's trimmed range, one frame at a
 * time (there's no dedicated "video" mode in the underlying model — it's
 * fundamentally an image segmentation model — so a video is just "many
 * images" here, which is also why this can take a while and needs a real
 * progress/cancel UI rather than being instant).
 *
 * ENCODING STRATEGY — why explicit per-frame timestamps, not
 * MediaRecorder + canvas.captureStream():
 * An earlier version of this recorded the output canvas with
 * `canvas.captureStream(fps)` + `MediaRecorder`. That records in REAL
 * (wall-clock) time — but per-frame ML inference is much slower than
 * real time (the "quality" model in particular can take a second or more
 * per frame on CPU). MediaRecorder has no idea the canvas only changes
 * once every ~1s of processing; it just samples on its own timer and
 * stamps each sample with the real time it captured it. The result: a
 * WebM whose *encoded frame durations* reflect how long each frame took
 * to PROCESS, not the source clip's actual timing — every processed
 * frame visibly held on screen for however long its inference took (the
 * "one frame for 11 seconds, then jump to the next" symptom) and a
 * total output duration that ~matched processing time instead of the
 * clip's real duration.
 * `CanvasSource.add(timestamp, duration)` (below) fixes this at the
 * root: playback timing is driven purely by frame INDEX (`i / processFps`),
 * completely decoupled from how long any frame took to compute. Frame 5
 * always lands at 5/processFps seconds into the output, whether producing
 * it took 10 ms or 10 s.
 *
 * The output keeps genuine alpha transparency (not a green-screen swap):
 * each cut-out frame is encoded with `alpha: "keep"` via mediabunny's
 * CanvasSource/Output pipeline, muxed straight into a WebM.
 */
export async function removeClipBackground(opts: BgRemovalOptions): Promise<BgRemovalResult> {
  const { clip, quality, processFps = 12, onProgress, onFramePreview, signal } = opts;

  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

  if (typeof VideoEncoder === "undefined") {
    throw new Error("This browser doesn't support WebCodecs, which background removal needs to produce a transparent video.");
  }

  const sourceVideo = document.createElement("video");
  sourceVideo.src = clip.src;
  sourceVideo.muted = true;
  sourceVideo.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    sourceVideo.onloadedmetadata = () => resolve();
    sourceVideo.onerror = () => reject(new Error("Couldn't load this clip's video for background removal."));
  });

  const startTime = clip.startTime ?? 0;
  const endTime = clip.endTime ?? clip.duration ?? sourceVideo.duration;
  const clipDuration = Math.max(0.1, endTime - startTime);
  const totalFrames = Math.max(1, Math.round(clipDuration * processFps));

  const w = sourceVideo.videoWidth || clip.width || 1280;
  const h = sourceVideo.videoHeight || clip.height || 720;
  // Both VP8 and VP9 require even dimensions.
  const encodeW = w % 2 === 0 ? w : w - 1;
  const encodeH = h % 2 === 0 ? h : h - 1;

  // Off-DOM canvas we grab each source frame into (input to the model)
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = w; srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext("2d")!;

  // Visible-to-the-caller canvas the CUT-OUT result gets painted onto —
  // this is what onFramePreview shows live, and it's also the canvas
  // mediabunny's CanvasSource captures directly for encoding.
  const outCanvas = document.createElement("canvas");
  outCanvas.width = w; outCanvas.height = h;
  const outCtx = outCanvas.getContext("2d", { alpha: true })!;

  const codec = await pickAlphaCodec(encodeW, encodeH);

  const output = new Output({
    format: new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(outCanvas, {
    codec,
    bitrate: 8_000_000,
    alpha: "keep",
    keyFrameInterval: 1, // seconds — keeps scrubbing/seeking responsive on low-motion cutout content
  });
  output.addVideoTrack(videoSource);
  await output.start();

  const frameDuration = 1 / processFps;

  const modelConfig = {
    model: (quality === "quality" ? "isnet" : "isnet_quint8") as "isnet" | "isnet_quint8",
    device: "cpu" as const,
    // Raw RGBA8 bytes, not PNG. The library still returns a Blob (that's
    // its fixed return type), but with this format its bytes are
    // uncompressed pixels — skips PNG-encoding the result entirely, and
    // lets us skip decoding it back on our end too (see putImageData below
    // instead of createImageBitmap+drawImage).
    output: { format: "image/x-rgba8" as const, quality: 1 },
    // The library tries to auto-detect its own asset base path and whether
    // it can spawn an internal worker, both by inspecting the current
    // script's URL — logic that's written for direct <script> usage and can
    // misbehave under a bundler (Next.js/webpack rewrites module URLs),
    // which is exactly the shape of a "url.replace is not a function"
    // crash. Pointing publicPath at IMG.LY's CDN directly and disabling
    // proxyToWorker sidesteps both of those auto-detection paths entirely.
    publicPath: `https://staticimgly.com/@imgly/background-removal-data/${BG_REMOVAL_PKG_VERSION}/dist/`,
    proxyToWorker: false,
  };

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

      const localTime = startTime + (i / totalFrames) * clipDuration;
      await seekVideo(sourceVideo, localTime);
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

      srcCtx.drawImage(sourceVideo, 0, 0, w, h);
      // NOTE: despite `ImageData` being listed in this library's
      // TypeScript ImageSource type, its actual runtime input handling
      // (imageSourceToImageData in the compiled source) only has real
      // cases for string/URL/ArrayBuffer/Blob — anything else, including
      // ImageData, silently falls through unhandled and crashes downstream
      // ("undefined is not iterable") once it's treated as already-decoded
      // pixel data that it isn't. So the input side has to go through a
      // Blob (the one path that's actually implemented, via imageDecode)
      // even though that costs a PNG encode+decode round-trip — verified
      // by reading the library's compiled source directly, not assumed.
      const frameBlob: Blob = await new Promise((resolve, reject) =>
        srcCanvas.toBlob(b => b ? resolve(b) : reject(new Error("Frame capture failed")), "image/png")
      );

      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const cutout = await removeBackground(frameBlob, modelConfig);
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

      // The OUTPUT side's raw-RGBA8 optimization is real and stays — that
      // code path (imageEncode's "image/x-rgba8" case) IS a genuine,
      // fully-implemented case in the compiled source, unlike the input
      // side above. So this still saves one full PNG decode per frame
      // versus createImageBitmap(cutout) + drawImage.
      const cutoutBytes = new Uint8ClampedArray(await cutout.arrayBuffer());
      outCtx.putImageData(new ImageData(cutoutBytes, w, h), 0, 0);

      onFramePreview?.(outCanvas);

      // The whole point: timestamp/duration come from the frame INDEX, not
      // from wall-clock time — see the big comment above for why.
      await videoSource.add(i * frameDuration, frameDuration);

      onProgress?.({
        fraction: (i + 1) / totalFrames,
        frameIndex: i + 1, totalFrames,
        label: `Removing background — frame ${i + 1} of ${totalFrames}`,
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
  const blob = new Blob([buffer], { type: "video/webm" });
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, blob };
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = Math.min(Math.max(0, time), video.duration || time);
    setTimeout(resolve, 500); // fallback so one stuck seek can't hang the whole process
  });
}