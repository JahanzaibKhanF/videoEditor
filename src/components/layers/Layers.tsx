"use client";

/**
 * Layers — track rows only.
 * Layer order from context controls both visual stack AND compositor draw order.
 * New layers always seeded at top (highest zIndex).
 */
import { useEffect } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import BlurRangeSlider from "./BlurRangeSlider";
import ImagesRangeSlider from "./ImagesRangeSlider";
import TextRangeSlider from "./TextRangeSlider";
import VideoClipsRangeSlider from "./VideoClipsRangeSlider";
import { LayerType } from "../../types/types";

const DEFAULT_ORDER: LayerType[] = ["video","image","text","blur"];
export const ROW_H = 36;
export const ROW_GAP = 3;

export default function Layers() {
  const {
    videos, blursDetails, textsDetails, imagesDetails, clipsDetails, audioDetails,
    layerOrder, setLayerOrder, activeTemplate,
  } = useAppDetailsContext();

  // Seed layer order once — blur, text, image always on top
  useEffect(() => {
    if (layerOrder.length === 0) {
      setLayerOrder(DEFAULT_ORDER.map((type, zIndex) => ({ type, zIndex })));
    }
  }, []); // eslint-disable-line

  if (!videos.length) return null;
  // Template mode locks all clip/text/blur editing to the dedicated
  // TemplateBar + TemplateClipRangeModal flow — clips never appear as
  // draggable/trimmable rows on the main timeline here, matching the spec
  // (no direct timeline manipulation while a template is active).
  if (activeTemplate) return null;

  // Sort descending so highest zIndex (text/blur) appears at TOP of timeline.
  // "audio" is filtered out here even if an older saved project's
  // layerOrder still has it — audio no longer has its own top-level block
  // (see VideoClipsRangeSlider), it renders paired directly under its own
  // clip's video row instead, so it can't be independently reordered
  // relative to "video" as a whole anymore.
  const order = (layerOrder.length > 0
    ? [...layerOrder].sort((a, b) => b.zIndex - a.zIndex).map(l => l.type).filter(t => t !== "audio")
    : [...DEFAULT_ORDER].reverse()) as LayerType[];
  const has: Record<LayerType, boolean> = {
    blur:  blursDetails.length > 0,
    text:  textsDetails.length > 0,
    image: imagesDetails.length > 0,
    audio: false, // never its own block — see above
    video: clipsDetails.length > 0,
  };

  const active = order.filter(t => has[t]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
      {active.map(type => {
        // Every layer type stacks one sub-row per item internally (see
        // TextRangeSlider/ImagesRangeSlider/BlurRangeSlider/
        // VideoClipsRangeSlider), but this row wrapper used to always
        // allocate a single fixed ROW_H for text/image/blur regardless of
        // how many items existed — with 2+ items of the same type, the
        // extra sub-rows overflowed the fixed-height wrapper and visually
        // overlapped whichever row came next. Text/image/blur items are
        // 28px each with a 3px gap (not ROW_H, which is what video/audio
        // actually use) — match that exactly here.
        const ITEM_H = 28, ITEM_GAP = 3;
        // "video" block height = one row per TRACK (clip.zIndex group, see
        // VideoClipsRangeSlider) — multiple non-overlapping clips can share
        // a track/row now, so this is no longer clipsDetails.length — PLUS
        // one extra row for each track that has at least one paired audio
        // clip beneath it.
        const videoTrackIds = new Set(clipsDetails.map(c => c.zIndex ?? 0));
        let tracksWithAudio = 0;
        videoTrackIds.forEach(z => {
          const hasAudio = clipsDetails.some(c => (c.zIndex ?? 0) === z && audioDetails.some(a => a.clipId === c.id));
          if (hasAudio) tracksWithAudio += 1;
        });
        const videoBlockRows = videoTrackIds.size + tracksWithAudio;
        const h = type === "video"
          ? Math.max(ROW_H, videoBlockRows * (ROW_H + ROW_GAP) - ROW_GAP)
          : type === "text"
          ? Math.max(ROW_H, textsDetails.length * (ITEM_H + ITEM_GAP) - ITEM_GAP)
          : type === "image"
          ? Math.max(ROW_H, imagesDetails.length * (ITEM_H + ITEM_GAP) - ITEM_GAP)
          : Math.max(ROW_H, blursDetails.length * (ITEM_H + ITEM_GAP) - ITEM_GAP);

        return (
          <div key={type} style={{ height: h, position: "relative" }}>
            {type === "blur"  && <BlurRangeSlider />}
            {type === "text"  && <TextRangeSlider />}
            {type === "image" && <ImagesRangeSlider />}
            {type === "video" && <VideoClipsRangeSlider />}
          </div>
        );
      })}
    </div>
  );
}