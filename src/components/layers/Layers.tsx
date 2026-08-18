"use client";

/**
 * Layers — the actual draggable track rows.
 *
 * REWRITE: this used to render 4 fixed blocks (video, image, text, blur)
 * stacked in whatever order a separate `layerOrder` state said — but that
 * state had NO effect on actual on-screen compositing (compositeFrame.ts
 * merges every layer type by its own per-item zIndex regardless of
 * `layerOrder`; see the comment there). So the timeline could show
 * "Image" sitting above "Video" as a whole block while, on screen, half
 * the images were actually drawn behind a video clip and half in front —
 * the timeline was lying about the real stacking order.
 *
 * Now the timeline is built from the exact same merged/z-sorted list
 * compositeFrame.ts draws from (see layerStack.ts) and split into runs so
 * a layer type can appear more than once in the stack (an image strictly
 * between two video tracks, etc.) — true Adobe-After-Effects-style: the
 * TOP row in this list is always the FRONTMOST thing on screen.
 */
import { useAppDetailsContext } from "../../context/useAppContext";
import BlurRangeSlider from "./BlurRangeSlider";
import ImagesRangeSlider from "./ImagesRangeSlider";
import TextRangeSlider from "./TextRangeSlider";
import VideoClipsRangeSlider from "./VideoClipsRangeSlider";
import { buildMergedEntries, groupIntoRuns } from "../../utils/layerStack";

export const ROW_H = 36;
export const ROW_GAP = 3;
// Text/image/blur chips are 28px each with a 3px gap (not ROW_H, which is
// what video/audio rows actually use).
const ITEM_H = 28;
const ITEM_GAP = 3;

export default function Layers() {
  const {
    videos, blursDetails, textsDetails, imagesDetails, clipsDetails, audioDetails,
    activeTemplate,
  } = useAppDetailsContext();

  if (!videos.length) return null;
  // Template mode locks all clip/text/blur editing to the dedicated
  // TemplateBar + TemplateClipRangeModal flow — clips never appear as
  // draggable/trimmable rows on the main timeline here, matching the spec
  // (no direct timeline manipulation while a template is active).
  if (activeTemplate) return null;

  const entries = buildMergedEntries(clipsDetails, imagesDetails, textsDetails, blursDetails);
  const runs = groupIntoRuns(entries);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
      {runs.map((run, runIdx) => {
        if (run.kind === "video") {
          const trackZs = run.entries.map(e => e.trackZ!);
          // Video block height = one row per TRACK in this run PLUS one
          // extra row for each track that has at least one paired audio
          // clip beneath it (matches VideoClipsRangeSlider's own layout).
          let tracksWithAudio = 0;
          trackZs.forEach(z => {
            const hasAudio = clipsDetails.some(c => (c.zIndex ?? 0) === z && audioDetails.some(a => a.clipId === c.id));
            if (hasAudio) tracksWithAudio += 1;
          });
          const rows = trackZs.length + tracksWithAudio;
          const h = Math.max(ROW_H, rows * (ROW_H + ROW_GAP) - ROW_GAP);
          return (
            <div key={`run-${runIdx}-video`} style={{ height: h, position: "relative" }}>
              <VideoClipsRangeSlider onlyTrackZs={trackZs} />
            </div>
          );
        }

        const ids = run.entries.map(e => e.id!);
        const h = Math.max(ROW_H, ids.length * (ITEM_H + ITEM_GAP) - ITEM_GAP);
        return (
          <div key={`run-${runIdx}-${run.kind}`} style={{ height: h, position: "relative" }}>
            {run.kind === "blur" && <BlurRangeSlider onlyIds={ids} />}
            {run.kind === "text" && <TextRangeSlider onlyIds={ids} />}
            {run.kind === "image" && <ImagesRangeSlider onlyIds={ids} />}
          </div>
        );
      })}
    </div>
  );
}