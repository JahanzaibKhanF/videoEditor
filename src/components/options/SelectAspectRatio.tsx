"use client";

import { useEffect, useRef } from "react";
import { AspectRatio } from "../../types/types";
import { useAppDetailsContext } from "../../context/useAppContext";

export default function SelectAspectRatio() {
  const { selectedAspectRatio, setSelectedAspectRatio, containerDimenions, videos, clipsDetails, setClipsDetails } = useAppDetailsContext();
  const changed = useRef(false);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedAspectRatio(e.target.value as AspectRatio);
    changed.current = true;
  };

  useEffect(() => {
    if (changed.current && containerDimenions.width > 0 && containerDimenions.height > 0) {
      clipsDetails.forEach(clip => {
        const nx = containerDimenions.width / 2 - (clip.width * clip.scale) / 2;
        const ny = containerDimenions.height / 2 - (clip.height * clip.scale) / 2;
        setClipsDetails(prev => prev.map(c => c.id === clip.id ? { ...c, x: nx, y: ny, scale: 1 } : c));
      });
      changed.current = false;
    }
  }, [containerDimenions.width, containerDimenions.height, clipsDetails, setClipsDetails]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span className="ctrl-label">Ratio</span>
      <select
        value={selectedAspectRatio}
        onChange={handleChange}
        disabled={videos.length < 1}
        className="ctrl-select"
        style={{ opacity: videos.length < 1 ? 0.5 : 1, cursor: videos.length < 1 ? "not-allowed" : "pointer" }}
      >
        <option value="original">Original</option>
        <option value="16:9">16:9</option>
        <option value="9:16">9:16</option>
        <option value="1:1">1:1</option>
        <option value="4:5">4:5</option>
        <option value="3:4">3:4</option>
        <option value="ytshorts">YT Shorts</option>
        <option value="instareels">Reels</option>
        <option value="tiktok">TikTok</option>
        <option value="xfeeds">X Feeds</option>
      </select>
    </div>
  );
}
