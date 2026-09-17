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
import ShapesRangeSlider from "./ShapesRangeSlider";
import BrushRangeSlider from "./BrushRangeSlider";
import KeyframeLane from "../timeline/KeyframeLane";
import { buildMergedEntries, groupIntoRuns } from "../../utils/layerStack";

export const ROW_H = 36;
export const ROW_GAP = 3;
// Text/image/blur chips are 28px each with a 3px gap (not ROW_H, which is
// what video/audio rows actually use).
export const ITEM_H = 28;
const ITEM_GAP = 3;

export default function Layers() {
  const {
    videos, blursDetails, textsDetails, imagesDetails, clipsDetails, audioDetails,
    shapesDetails, brushesDetails, activeTemplate,
  } = useAppDetailsContext();

  // A composition doesn't need a video clip to be editable — a text/shape/
  // image-only project (no footage at all, After Effects-style) still needs
  // its layer rows visible so they can be dragged/trimmed/reordered. This
  // used to just check `videos.length`, which hid the ENTIRE timeline layer
  // list for a video-less project even though those layers could already be
  // added and played (see the totalTime/playback fixes elsewhere this
  // session) — they just had no visible timeline row to edit them from.
  const hasAnyLayer = videos.length > 0 || textsDetails.length > 0 || imagesDetails.length > 0
    || blursDetails.length > 0 || shapesDetails.length > 0 || brushesDetails.length > 0;
  if (!hasAnyLayer) return null;
  // Template mode locks all clip/text/blur editing to the dedicated
  // TemplateBar + TemplateClipRangeModal flow — clips never appear as
  // draggable/trimmable rows on the main timeline here, matching the spec
  // (no direct timeline manipulation while a template is active).
  if (activeTemplate) return null;

  const entries = buildMergedEntries(clipsDetails, imagesDetails, textsDetails, blursDetails, shapesDetails, brushesDetails);
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

        if (run.kind === "text") {
          // Text shares video's "track" model — several non-overlapping
          // text layers (most commonly a batch of auto-generated captions,
          // which never overlap in time) sit on the SAME row instead of
          // each forcing its own line.
          const textTrackZs = run.entries.map(e => e.trackZ!);
          const h = Math.max(ROW_H, textTrackZs.length * (ITEM_H + ITEM_GAP) - ITEM_GAP);
          return (
            <div key={`run-${runIdx}-text`} style={{ height: h, position: "relative" }}>
              <TextRangeSlider onlyTrackZs={textTrackZs} />
            </div>
          );
        }

        const ids = run.entries.map(e => e.id!);
        const h = Math.max(ROW_H, ids.length * (ITEM_H + ITEM_GAP) - ITEM_GAP);
        return (
          <div key={`run-${runIdx}-${run.kind}`} style={{ height: h, position: "relative" }}>
            {run.kind === "blur" && <BlurRangeSlider onlyIds={ids} />}
            {run.kind === "image" && <ImagesRangeSlider onlyIds={ids} />}
            {run.kind === "shape" && <ShapesRangeSlider onlyIds={ids} />}
            {run.kind === "brush" && <BrushRangeSlider onlyIds={ids} />}
          </div>
        );
      })}
      <KeyframeLane />
    </div>
  );
}