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
import AudioRangeSlider from "./AudioRangeSlider";
import { LayerType } from "../../types/types";

const DEFAULT_ORDER: LayerType[] = ["video","audio","image","text","blur"];
export const ROW_H = 36;
export const ROW_GAP = 3;

export default function Layers() {
  const {
    videos, blursDetails, textsDetails, imagesDetails, clipsDetails, audioDetails,
    layerOrder, setLayerOrder,
  } = useAppDetailsContext();

  // Seed layer order once — blur, text, image always on top
  useEffect(() => {
    if (layerOrder.length === 0) {
      setLayerOrder(DEFAULT_ORDER.map((type, zIndex) => ({ type, zIndex })));
    }
  }, []); // eslint-disable-line

  if (!videos.length) return null;

  // Sort descending so highest zIndex (text/blur) appears at TOP of timeline
  const order = (layerOrder.length > 0
    ? [...layerOrder].sort((a, b) => b.zIndex - a.zIndex).map(l => l.type)
    : [...DEFAULT_ORDER].reverse()) as LayerType[];
  const has: Record<LayerType, boolean> = {
    blur:  blursDetails.length > 0,
    text:  textsDetails.length > 0,
    image: imagesDetails.length > 0,
    audio: audioDetails.length > 0,
    video: clipsDetails.length > 0,
  };

  const active = order.filter(t => has[t]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
      {active.map(type => {
        // Video/audio: one row per item; others: one row total
        const h = type === "video"
          ? Math.max(ROW_H, clipsDetails.length * (ROW_H + ROW_GAP) - ROW_GAP)
          : type === "audio"
          ? Math.max(ROW_H, audioDetails.length * (ROW_H + ROW_GAP) - ROW_GAP)
          : ROW_H;

        return (
          <div key={type} style={{ height: h, position: "relative" }}>
            {type === "blur"  && <BlurRangeSlider />}
            {type === "text"  && <TextRangeSlider />}
            {type === "image" && <ImagesRangeSlider />}
            {type === "audio" && <AudioRangeSlider />}
            {type === "video" && <VideoClipsRangeSlider />}
          </div>
        );
      })}
    </div>
  );
}
