"use client";

import { FaMinus, FaPlus } from "react-icons/fa";
import { useAppDetailsContext } from "../../context/useAppContext";
import Slider from "../ui/Slider";

export default function PreviewScale() {
  const { previewScale, setPreviewScale } = useAppDetailsContext();
  const upd = (d: number) =>
    setPreviewScale(p => parseFloat(Math.min(1, Math.max(0.05, (p ?? 0.5) + d)).toFixed(3)));

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <button onClick={() => upd(-0.05)} className="ctrl-btn"><FaMinus size={8} /></button>
      <div style={{ width: 56 }}>
        <Slider min={0.05} max={1} step={0.001} value={previewScale ?? 0.5} onChange={setPreviewScale} />
      </div>
      <button onClick={() => upd(0.05)} className="ctrl-btn"><FaPlus size={8} /></button>
      <span className="ctrl-label font-mono text-[11px]" style={{ minWidth: 32, textAlign: "right" }}>
        {Math.round((previewScale ?? 0.5) * 100)}%
      </span>
    </div>
  );
}
