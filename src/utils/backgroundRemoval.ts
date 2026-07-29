import { removeBackground } from "@imgly/background-removal";
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
      // Raw pixels straight off the canvas — no PNG encode step at all
      // (previously: srcCanvas.toBlob(..., "image/png"), which encoded a
      // full PNG every single frame just to hand it to the model, which
      // would then decode it right back into pixels itself).
      const frameData = srcCtx.getImageData(0, 0, w, h);

      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const cutout = await removeBackground(frameData, modelConfig);
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

      // cutout's bytes are raw RGBA8 (see output.format above), so this
      // goes straight onto the canvas with zero decode step — previously:
      // createImageBitmap(cutout) had to fully decode a PNG every frame
      // just to get pixels back out again.
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

  const blob = new Blob(chunks, { type: "video/webm" });
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
