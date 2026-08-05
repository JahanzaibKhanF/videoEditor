import { removeBackground } from "@imgly/background-removal";
import { Decoder, Reader, tools } from "ts-ebml";
import { Buffer } from "buffer";
import { ClipDetails } from "../types/types";

// ts-ebml's code references `Buffer` as a Node-style global (not an import),
// since it was written for Node's EBML parsing use case originally. Webpack 5
// no longer auto-polyfills Node core globals like earlier versions did, so
// without this, Buffer is simply undefined in the browser and ts-ebml throws
// immediately. A runtime assignment here is simpler and safer than a webpack
// ProvidePlugin — importing a separate top-level `webpack` package into
// next.config.mjs to register one caused a version mismatch with Next's own
// internal webpack (`parser.getLocation is not a function`), since Next
// bundles its own webpack rather than using whatever version is in
// node_modules.
if (typeof window !== "undefined" && !(window as unknown as { Buffer?: unknown }).Buffer) {
  (window as unknown as { Buffer: unknown }).Buffer = Buffer;
}

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

/**
 * Runs background removal across a clip's trimmed range, one frame at a
 * time (there's no dedicated "video" mode in the underlying model — it's
 * fundamentally an image segmentation model — so a video is just "many
 * images" here, which is also why this can take a while and needs a real
 * progress/cancel UI rather than being instant).
 *
 * The output keeps genuine alpha transparency (not a green-screen swap):
 * we composite each processed frame onto a canvas and record that canvas's
 * stream with MediaRecorder into a WebM. Chrome/Chromium preserve alpha in
 * canvas-captured WebM recordings, and since the rest of this app already
 * assumes a Chromium-class browser (WebCodecs, requestVideoFrameCallback),
 * relying on that here is consistent with everything else, not a new
 * limitation — the result plays back with a transparent background and
 * composites correctly over whatever's beneath it in the timeline.
 */
export async function removeClipBackground(opts: BgRemovalOptions): Promise<BgRemovalResult> {
  const { clip, quality, processFps = 12, onProgress, onFramePreview, signal } = opts;

  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

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

  // Off-DOM canvas we grab each source frame into (input to the model)
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = w; srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext("2d")!;

  // Visible-to-the-caller canvas the CUT-OUT result gets painted onto —
  // this is what onFramePreview shows live, and also what MediaRecorder
  // captures into the final output.
  const outCanvas = document.createElement("canvas");
  outCanvas.width = w; outCanvas.height = h;
  const outCtx = outCanvas.getContext("2d", { alpha: true })!;

  const stream = outCanvas.captureStream(processFps);
  const chunks: Blob[] = [];
  const preferredMime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    .find(m => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: preferredMime, videoBitsPerSecond: 8_000_000 });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const recordingDone = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start();

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
      onProgress?.({
        fraction: (i + 1) / totalFrames,
        frameIndex: i + 1, totalFrames,
        label: `Removing background — frame ${i + 1} of ${totalFrames}`,
      });
    }
  } finally {
    recorder.stop();
    await recordingDone;
    sourceVideo.src = "";
  }

  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

  const rawBlob = new Blob(chunks, { type: "video/webm" });
  // MediaRecorder's output is a well-documented, still-not-fixed Chromium
  // quirk: the WebM container it writes has no real Duration/Cues in its
  // header (it's a live stream format, written incrementally, with no way
  // to know the total length up front) — every <video> that later loads
  // this blob reports `duration: Infinity` and can't seek reliably, which
  // is exactly "plays a few frames and gets stuck": CanvasEngine drives
  // playback by setting `video.currentTime` directly, and seeking on a
  // video with broken duration metadata doesn't work. Patch the container
  // header once here (adds proper Duration + Cues) so every future <video>
  // that loads this blob — including the ones CanvasEngine creates when
  // this becomes a clip's src — seeks correctly with no special-casing
  // needed anywhere else in the app.
  const blob = await fixWebmDuration(rawBlob);
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, blob };
}

async function fixWebmDuration(blob: Blob): Promise<Blob> {
  try {
    const buf = await blob.arrayBuffer();
    const decoder = new Decoder();
    const reader = new Reader();
    reader.logging = false;
    reader.drop_default_duration = false;
    const elements = decoder.decode(buf);
    for (const elm of elements) reader.read(elm);
    reader.stop();
    if (!reader.duration || reader.cues.length === 0) return blob; // nothing to fix, or reader couldn't parse it — fall back to the original rather than risk corrupting it
    const refinedMetadata = tools.makeMetadataSeekable(reader.metadatas, reader.duration, reader.cues);
    const body = buf.slice(reader.metadataSize);
    return new Blob([refinedMetadata, body], { type: blob.type });
  } catch {
    // Best-effort — if this fails for any reason, the clip still works for
    // straight-through playback, just without reliable seeking. Better to
    // hand back a working-if-imperfect blob than throw away the whole
    // background-removal result over a metadata patch failing.
    return blob;
  }
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = Math.min(Math.max(0, time), video.duration || time);
    setTimeout(resolve, 500); // fallback so one stuck seek can't hang the whole process
  });
}
