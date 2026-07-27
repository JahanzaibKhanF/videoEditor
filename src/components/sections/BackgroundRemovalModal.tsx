"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { ClipDetails } from "../../types/types";
import { removeClipBackground } from "../../utils/backgroundRemoval";
import { Scissors, X, Loader2, CheckCircle2 } from "@/utils/icons";

export default function BackgroundRemovalModal({ clip, onClose }: { clip: ClipDetails; onClose: () => void }) {
  const { setClipsDetails } = useAppDetailsContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [quality, setQuality] = useState<"fast" | "quality">("fast");
  const [status, setStatus] = useState<"choosing" | "running" | "done" | "error" | "cancelled">("choosing");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const start = async () => {
    setStatus("running");
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { blobUrl } = await removeClipBackground({
        clip, quality, signal: controller.signal,
        onProgress: (p) => { setProgress(p.fraction); setLabel(p.label); },
        onFramePreview: (canvas) => {
          const target = canvasRef.current;
          if (!target) return;
          const ctx = target.getContext("2d");
          if (!ctx) return;
          target.width = canvas.width; target.height = canvas.height;
          ctx.clearRect(0, 0, target.width, target.height);
          ctx.drawImage(canvas, 0, 0);
        },
      });
      setResultUrl(blobUrl);
      setStatus("done");
    } catch (err) {
      if ((err as any)?.name === "AbortError") {
        setStatus("cancelled");
      } else {
        console.error("Background removal failed:", err);
        setErrorMsg((err as Error)?.message ?? "Something went wrong.");
        setStatus("error");
      }
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStatus("cancelled");
  };

  const applyResult = () => {
    if (!resultUrl) return;
    setClipsDetails(prev => prev.map(c => c.id === clip.id ? { ...c, src: resultUrl } : c));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1003] bg-black/70 backdrop-blur-md flex items-center justify-center px-4"
      onClick={e => { if (e.target === e.currentTarget && status !== "running") onClose(); }}>
      <div className="w-full max-w-[440px] rounded-2xl overflow-hidden bg-studio-surface border border-studio-border shadow-pop">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Scissors size={15} className="text-signal" />
            <div className="text-[15px] font-bold text-ink-primary font-display">Remove Background</div>
          </div>
          {status !== "running" && (
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-studio-hover flex items-center justify-center text-ink-secondary hover:text-ink-primary transition-colors">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Live preview */}
        <div className="mx-5 rounded-xl overflow-hidden aspect-video relative"
          style={{ background: "repeating-conic-gradient(#2a2a38 0% 25%, #1c1c26 0% 50%) 50% / 16px 16px" }}>
          <canvas ref={canvasRef} className="w-full h-full object-contain" />
          {status === "choosing" && (
            <div className="absolute inset-0 flex items-center justify-center text-ink-faint text-[12px] italic">
              Preview will appear here once processing starts
            </div>
          )}
          {status === "running" && (
            <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 bg-black/60 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
              <Loader2 size={12} className="animate-spin text-white flex-shrink-0" />
              <span className="text-[10.5px] text-white/85 truncate">{label}</span>
            </div>
          )}
          {status === "done" && (
            <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-success/20 border border-success/40 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
              <CheckCircle2 size={12} className="text-success flex-shrink-0" />
              <span className="text-[10.5px] text-white/90">Done — real-time transparent background</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {status === "running" && (
          <div className="px-5 pt-3">
            <div className="h-1.5 rounded-full bg-studio-void overflow-hidden">
              <div className="h-full bg-signal transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="text-[10.5px] text-ink-faint text-right mt-1">{Math.round(progress * 100)}%</div>
          </div>
        )}

        {status === "error" && (
          <div className="mx-5 mt-3 rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-[11.5px] text-danger">
            {errorMsg}
          </div>
        )}
        {status === "cancelled" && (
          <div className="mx-5 mt-3 rounded-lg bg-studio-hover px-3 py-2 text-[11.5px] text-ink-secondary">
            Cancelled — no changes were made to your clip.
          </div>
        )}

        {/* Quality choice (only before starting) */}
        {status === "choosing" && (
          <div className="px-5 pt-4">
            <div className="text-[11px] font-semibold text-ink-secondary mb-1.5">Quality</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setQuality("fast")}
                className={`py-2 rounded-lg border text-[12px] font-bold transition-colors ${quality === "fast" ? "border-signal bg-signal/10 text-signal" : "border-studio-border text-ink-secondary hover:bg-studio-hover"}`}>
                Fast
              </button>
              <button onClick={() => setQuality("quality")}
                className={`py-2 rounded-lg border text-[12px] font-bold transition-colors ${quality === "quality" ? "border-signal bg-signal/10 text-signal" : "border-studio-border text-ink-secondary hover:bg-studio-hover"}`}>
                Perfect
              </button>
            </div>
            <p className="text-[10.5px] text-ink-faint mt-1.5">
              "Perfect" uses the full-precision model for cleaner edges (hair, fine detail) at the cost of noticeably slower processing.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 px-5 pt-4 pb-5">
          {status === "choosing" && (
            <button onClick={start}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
              style={{ background: "linear-gradient(135deg,#8B5CFF,#A47CFF)" }}>
              Start
            </button>
          )}
          {status === "running" && (
            <button onClick={cancel}
              className="flex-1 py-2.5 rounded-xl border border-danger/40 bg-danger/10 text-danger text-[13px] font-bold hover:bg-danger/15 transition-colors">
              Cancel
            </button>
          )}
          {status === "done" && (
            <>
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-studio-border text-ink-secondary text-[13px] font-bold hover:bg-studio-hover transition-colors">
                Discard
              </button>
              <button onClick={applyResult}
                className="flex-[2] py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
                style={{ background: "linear-gradient(135deg,#8B5CFF,#A47CFF)" }}>
                Apply to clip
              </button>
            </>
          )}
          {(status === "error" || status === "cancelled") && (
            <button onClick={() => setStatus("choosing")} className="flex-1 py-2.5 rounded-xl border border-studio-border text-ink-secondary text-[13px] font-bold hover:bg-studio-hover transition-colors">
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
