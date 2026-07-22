/**
 * renderVideo — top-level export entry point. Tries the WebCodecs pipeline
 * first (webCodecsRender.ts); if the browser doesn't support it (currently:
 * anything non-Chromium — Firefox and Safari don't implement WebCodecs) or
 * it throws for any reason, automatically falls back to the FFmpeg.wasm
 * pipeline (clientRender.ts), which works everywhere. This is the same
 * "progressive enhancement" pattern real video-editing web apps use — pick
 * the fastest/most modern path when available, never leave someone on an
 * unsupported browser with no export option at all.
 *
 * Same call signature and job-update contract as the old direct
 * `clientRender` call, so RenderButton.tsx barely had to change.
 */
import { v4 as uuidv4 } from "uuid";
import {
  AudioDetails, BlurDetails, ClipDetails, ImageDetails, RenderJob, TextDetails, TransitionFrame,
} from "../types/types";
import { clientRender } from "./clientRender";
import { renderWithWebCodecs, pickSupportedWebCodecsConfig } from "./webCodecsRender";
import { registerJob, isJobCancelled, unregisterJob } from "./renderJobRegistry";
import { saveRecentVideo } from "./recentVideosStore";
import type { useAppDetailsContext } from "../context/useAppContext";

type ImageRefs = ReturnType<typeof useAppDetailsContext>["imageRefs"];
type LayerOrderList = ReturnType<typeof useAppDetailsContext>["layerOrder"];

export async function renderVideo(
  videos: { video: File; name: string }[],
  mediaPath: string,
  primaryVideoDimensions: { width: number; height: number },
  containerDimensions: { width: number; height: number },
  textsDetails: TextDetails[],
  blursDetails: BlurDetails[],
  imagesDetails: ImageDetails[],
  clipsDetails: ClipDetails[],
  audioDetails: AudioDetails[],
  totalTime: number,
  fps: number | null,
  transitionsFrames: TransitionFrame[],
  onJobUpdate: (job: Partial<RenderJob> & { jobId: string }) => void,
  imageRefs?: ImageRefs,
  layerOrder?: LayerOrderList,
): Promise<string> {
  const width = Math.max(2, Math.round(containerDimensions.width || 1280));
  const height = Math.max(2, Math.round(containerDimensions.height || 720));
  const outFps = Math.round(fps || 30);

  // The real check: actually asks the browser whether it can encode THIS
  // project's real width/height/framerate, trying multiple AVC levels (and
  // VP9 as a last resort) rather than assuming one hardcoded level covers
  // every resolution. Returns the exact config that was verified, so the
  // encoder is configured with precisely what was checked — no chance of
  // the check and the actual encode disagreeing.
  const videoConfig = await pickSupportedWebCodecsConfig(width, height, outFps).catch(() => null);

  if (!videoConfig) {
    return clientRender(
      videos, mediaPath, primaryVideoDimensions, containerDimensions,
      textsDetails, blursDetails, imagesDetails, clipsDetails, audioDetails,
      totalTime, fps, transitionsFrames, onJobUpdate,
    );
  }

  const jobId = uuidv4();
  const videoName = videos[0]?.video.name ?? "export";
  registerJob(jobId);

  try {
    onJobUpdate({ jobId, processName: "Preparing…", progress: 0, logs: [], cancelled: false, name: videoName });

    const blob = await renderWithWebCodecs({
      clips: clipsDetails,
      texts: textsDetails,
      images: imagesDetails,
      blurs: blursDetails,
      audioTracks: audioDetails,
      layerOrder: layerOrder ?? [],
      imageEls: imageRefs ?? {},
      width, height, fps: outFps,
      totalDuration: totalTime,
      videoConfig,
      onProgress: (fraction, label) => {
        if (isJobCancelled(jobId)) return;
        onJobUpdate({ jobId, processName: "Rendering…", progress: Math.round(fraction * 100), logs: [label] });
      },
    });

    if (isJobCancelled(jobId)) {
      onJobUpdate({ jobId, processName: "Cancelled", progress: 0, logs: ["Cancelled by user."], cancelled: true });
      return jobId;
    }

    const videoUrl = URL.createObjectURL(blob);
    await saveRecentVideo({ name: videoName.replace(/\.[^.]+$/, "") + ".mp4", blob, mimeType: "video/mp4", thumbnail: null, sizeBytes: blob.size });
    onJobUpdate({ jobId, processName: "Completed", progress: 100, logs: ["Exported via WebCodecs (hardware-accelerated)."], videoUrl });
    return jobId;
  } catch (err) {
    console.error("[renderVideo] WebCodecs path failed, falling back to FFmpeg:", err);
    unregisterJob(jobId);
    // Fall back to the FFmpeg pipeline with a fresh job — surfaces as a new
    // job in the UI rather than silently swapping engines mid-job.
    return clientRender(
      videos, mediaPath, primaryVideoDimensions, containerDimensions,
      textsDetails, blursDetails, imagesDetails, clipsDetails, audioDetails,
      totalTime, fps, transitionsFrames, onJobUpdate,
    );
  } finally {
    unregisterJob(jobId);
  }
}
