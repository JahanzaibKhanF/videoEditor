"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { ClipDetails } from "../../types/types";
import { removeClipBackground } from "../../utils/backgroundRemoval";
import { Scissors, Loader2, CheckCircle2, RotateCcw } from "@/utils/icons";

/**
 * Inline sidebar version of background removal — this used to be a
 * full-screen modal (BackgroundRemovalModal), but it now lives directly in
 * the "Remove Background" sidebar tab: pick quality, hit Start, watch the
 * live preview/progress right there in the panel, then Apply/Discard —
 * no overlay, no separate dialog to manage.
 */
export default function BackgroundRemovalPanel({ clip }: { clip: ClipDetails }) {
  const { setClipsDetails } = useAppDetailsContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [quality, setQuality] = useState<"fast" | "quality">("fast");
  const [status, setStatus] = useState<"choosing" | "running" | "done" | "error" | "cancelled">("choosing");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  // Re-arm to "choosing" whenever the selected clip changes, so leftover
  // progress/result from a previous clip never bleeds into this one.
  useEffect(() => {
    abortRef.current?.abort();
    setStatus("choosing");
    setProgress(0);
    setResultUrl(null);
    setErrorMsg("");
  }, [clip.id]);

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

    // The processed output only ever covers this clip's OWN trimmed/split
    // span (removeClipBackground reads clip.startTime..clip.endTime, which
    // for a trimmed or split clip is already the sub-range into the source
    // video, not the full original file) — so the resulting blob starts
    // fresh at 0 and runs for exactly that span's length, regardless of
    // where startTime/endTime used to point into the old source.
    //
    // BUG THIS FIXES: applying used to only swap `src`, leaving the old
    // startTime/endTime (and duration) pointed at offsets into the ORIGINAL
    // source video. For any clip that had been trimmed or split, those
    // offsets no longer exist in the new (short, starts-at-0) result video,
    // so playback would seek past the end of it — a blank/frozen frame at
    // best, and out-of-range seeking at worst. Resetting startTime to 0 and
    // endTime/duration to the clip's own span keeps the new video's actual
    // content aligned with what's already on the timeline.
    const oldStart = clip.startTime ?? 0;
    const oldEnd = clip.endTime ?? clip.duration ?? oldStart;
    const span = Math.max(0.1, oldEnd - oldStart);

    setClipsDetails(prev => prev.map(c => c.id === clip.id
      ? { ...c, src: resultUrl, startTime: 0, endTime: span, duration: span, sourceDuration: span }
      : c));
    setStatus("choosing");
    setResultUrl(null);
  };

  const discard = () => {
    setStatus("choosing");
    setResultUrl(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Big colorful header card — mirrors the old tab's entry button, now
          living permanently at the top of the panel instead of gating a
          modal behind it. */}
      {status === "choosing" && (
        <div className="flex items-center gap-3 p-4 rounded-xl"
          style={{ background: "linear-gradient(135deg,#8B5CFF 0%,#4C8CFF 100%)" }}>
          <div className="w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0 relative">
            <Scissors size={20} color="white" />
            <span className="absolute -top-1.5 -right-1.5 text-[7.5px] font-black bg-white text-signal rounded-full px-1.5 py-px leading-tight">AI</span>
          </div>
          <div>
            <div className="text-[14px] font-bold text-white">Remove Background</div>
            <div className="text-[11px] text-white/75">Cut out the subject — live preview, cancel anytime</div>
          </div>
        </div>
      )}

      {/* Live preview */}
      <div className="rounded-xl overflow-hidden aspect-video relative"
        style={{ background: "repeating-conic-gradient(#2a2a38 0% 25%, #1c1c26 0% 50%) 50% / 16px 16px" }}>
        <canvas ref={canvasRef} className="w-full h-full object-contain" />
        {status === "choosing" && (
          <div className="absolute inset-0 flex items-center justify-center text-ink-faint text-[11px] italic text-center px-4">
            Preview will appear here once processing starts
          </div>
        )}
        {status === "running" && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 bg-black/60 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
            <Loader2 size={12} className="animate-spin text-white flex-shrink-0" />
            <span className="text-[10px] text-white/85 truncate">{label}</span>
          </div>
        )}
        {status === "done" && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-success/20 border border-success/40 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
            <CheckCircle2 size={12} className="text-success flex-shrink-0" />
            <span className="text-[10px] text-white/90">Done — transparent background</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {status === "running" && (
        <div>
          <div className="h-1.5 rounded-full bg-studio-void overflow-hidden">
            <div className="h-full bg-signal transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="text-[10.5px] text-ink-faint text-right mt-1">{Math.round(progress * 100)}%</div>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-[11.5px] text-danger">
          {errorMsg}
        </div>
      )}
      {status === "cancelled" && (
        <div className="rounded-lg bg-studio-hover px-3 py-2 text-[11.5px] text-ink-secondary">
          Cancelled — no changes were made to your clip.
        </div>
      )}

      {/* Quality choice (only before starting) */}
      {status === "choosing" && (
        <div>
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
      <div className="flex gap-2">
        {status === "choosing" && (
          <button onClick={start}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
            style={{ background: "linear-gradient(135deg,#8B5CFF,#A47CFF)" }}>
            <Scissors size={13} /> Start
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
            <button onClick={discard} className="flex-1 py-2.5 rounded-xl border border-studio-border text-ink-secondary text-[13px] font-bold hover:bg-studio-hover transition-colors">
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
          <button onClick={() => setStatus("choosing")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-studio-border text-ink-secondary text-[13px] font-bold hover:bg-studio-hover transition-colors">
            <RotateCcw size={12} /> Try again
          </button>
        )}
      </div>
    </div>
  );
}
