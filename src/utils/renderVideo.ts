/**
 * renderVideo — top-level export entry point.
 *
 * 2026-08-24 CHANGE (explicit request: always use WebCodecs, no silent
 * engine-swap): this used to catch ANY WebCodecs failure — including a
 * mid-render encode-worker crash — and quietly retry the whole export on
 * the FFmpeg.wasm pipeline instead. That's the "progressive enhancement"
 * pattern real editors use for the ONE case where it actually makes sense
 * (browser genuinely can't do WebCodecs at all — currently non-Chromium:
 * Firefox/Safari don't implement it), but it was ALSO firing for real
 * WebCodecs bugs, which just papered over the crash with a different,
 * slower engine instead of surfacing it. Now:
 *   - No WebCodecs support at all → still falls back to FFmpeg (there is
 *     genuinely no other export option on those browsers).
 *   - WebCodecs IS supported but something fails mid-render → the job is
 *     marked Failed with the real error message, NOT silently retried on a
 *     different engine. See webCodecsRender.ts / encodeWorker.ts for the
 *     backpressure + fail-fast fixes aimed at the actual crash cause.
 */
import { v4 as uuidv4 } from "uuid";
import {
  AudioDetails, BlurDetails, ClipDetails, ImageDetails, RenderJob, TextDetails, TransitionFrame, ClipEffectDetails,
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
  clipEffects: ClipEffectDetails[] = [],
  saveHandle?: FileSystemFileHandle,
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
      clipEffects,
      audioTracks: audioDetails,
      layerOrder: layerOrder ?? [],
      imageEls: imageRefs ?? {},
      width, height, fps: outFps,
      totalDuration: totalTime,
      videoConfig,
      saveHandle,
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
    // No more silent fallback here — surface the real failure on THIS job
    // so it shows up in RenderButton.tsx's error box, and let the person
    // decide what to do next (retry, shorten the export, etc.) instead of
    // transparently re-running on a different engine.
    const message = (err as Error)?.message ?? String(err);
    console.error("[renderVideo] WebCodecs export failed:", err);
    onJobUpdate({ jobId, processName: "Failed", progress: 0, logs: [message], error: message });
    return jobId;
  } finally {
    unregisterJob(jobId);
  }
}