"use client";

/**
 * EnhancePanel — AI Enhance for a selected clip: Resolution / Denoise /
 * Color, each a click-to-cycle ring (Off/Low/High, or Off/HD/FHD for
 * Resolution), under an overall Basic/Advanced mode switch — same
 * choosing/running/done/error/cancelled shape as BackgroundRemovalPanel.
 *
 * Basic = fast classical algorithms, always available. Advanced = real AI
 * models for Resolution and Denoise (see enhanceWorker.ts); Advanced Color
 * is a stronger pass of the SAME classical auto-color algorithm, not a
 * separate model — flagged here rather than silently implied as "more AI".
 * Capped at 30s clips — Enhance is real per-frame model work, not instant.
 */
import { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { ClipDetails } from "../../types/types";
import { enhanceClipVideo, EnhanceMode, MAX_ENHANCE_SECONDS } from "../../utils/enhanceClipVideo";
import { EnhanceLevel } from "../../utils/frameEnhance";
import RingDial from "../ui/RingDial";
import { Sparkles, Loader2, CheckCircle2, RotateCcw, AlertTriangle, Zap, Gem, Ban } from "@/utils/icons";

export default function EnhancePanel({ clip }: { clip: ClipDetails }) {
  const { setClipsDetails } = useAppDetailsContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [mode, setMode] = useState<EnhanceMode>("basic");
  const [resolution, setResolution] = useState<EnhanceLevel>(0);
  const [denoise, setDenoise] = useState<EnhanceLevel>(0);
  const [color, setColor] = useState<EnhanceLevel>(0);

  const [status, setStatus] = useState<"choosing" | "running" | "done" | "error" | "cancelled">("choosing");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  const clipDuration = (clip.endTime ?? clip.duration ?? 0) - (clip.startTime ?? 0);
  const tooLong = clipDuration > MAX_ENHANCE_SECONDS + 0.05;
  const nothingSelected = resolution === 0 && denoise === 0 && color === 0;

  useEffect(() => {
    abortRef.current?.abort();
    setStatus("choosing");
    setProgress(0);
    setResultUrl(null);
    setResultBlob(null);
    setErrorMsg("");
  }, [clip.id]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const start = async () => {
    setStatus("running");
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { blobUrl, blob } = await enhanceClipVideo({
        clip, settings: { mode, resolution, denoise, color }, signal: controller.signal,
        onProgress: (p) => { setProgress(p.fraction); setLabel(p.label); },
        onFramePreview: (canvas) => {
          const target = canvasRef.current;
          if (!target) return;
          const ctx = target.getContext("2d");
          if (!ctx) return;
          target.width = canvas.width; target.height = canvas.height;
          ctx.drawImage(canvas, 0, 0);
        },
      });
      setResultUrl(blobUrl);
      setResultBlob(blob);
      setStatus("done");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setStatus("cancelled");
      } else {
        console.error("Enhance failed:", err);
        setErrorMsg((err as Error)?.message ?? "Something went wrong.");
        setStatus("error");
      }
    }
  };

  const cancel = () => { abortRef.current?.abort(); setStatus("cancelled"); };
  const discard = () => { setStatus("choosing"); setResultUrl(null); setResultBlob(null); };

  const applyResult = () => {
    if (!resultUrl || !resultBlob) return;
    const span = clipDuration;
    // The result video's own dimensions may have changed (Resolution ring
    // above Off) — read them back off the preview canvas we already painted
    // to, rather than re-decoding the blob just to ask its size.
    const w = canvasRef.current?.width || clip.width;
    const h = canvasRef.current?.height || clip.height;
    setClipsDetails(prev => prev.map(c => c.id === clip.id
      ? { ...c, src: resultUrl, startTime: 0, endTime: span, duration: span, sourceDuration: span, width: w, height: h }
      : c));
    setStatus("choosing");
    setResultUrl(null);
    setResultBlob(null);
    setResolution(0); setDenoise(0); setColor(0);
  };

  const chip = (Icon: any, text: string) => (
    <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-2.5 py-1">
      <Icon size={10} color="white" />
      <span className="text-[9.5px] font-semibold text-white/90">{text}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {status === "choosing" && (
        <div className="rounded-xl p-4 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg,#8B5CFF 0%,#4C8CFF 60%,#33D8A0 100%)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0 relative">
              <Sparkles size={20} color="white" />
              <span className="absolute -top-1.5 -right-1.5 text-[7.5px] font-black bg-white text-signal rounded-full px-1.5 py-px leading-tight">AI</span>
            </div>
            <div>
              <div className="text-[14.5px] font-bold text-white">AI Enhance</div>
              <div className="text-[11px] text-white/80">Sharpen, clean up, and color-correct this clip</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chip(Ban, "Cancel anytime")}
            {chip(CheckCircle2, `Up to ${MAX_ENHANCE_SECONDS}s clips`)}
          </div>
        </div>
      )}

      {status === "choosing" && tooLong && (
        <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2.5">
          <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-warning leading-snug">
            This clip is {clipDuration.toFixed(1)}s — Enhance works on clips up to {MAX_ENHANCE_SECONDS}s. Trim it shorter first.
          </div>
        </div>
      )}

      <div className="rounded-xl overflow-hidden aspect-video relative bg-studio-void">
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
            <span className="text-[10px] text-white/90">Done</span>
          </div>
        )}
      </div>

      {status === "running" && (
        <div>
          <div className="h-1.5 rounded-full bg-studio-void overflow-hidden">
            <div className="h-full transition-all" style={{ width: `${Math.round(progress * 100)}%`, background: "linear-gradient(90deg,#8B5CFF,#4C8CFF)" }} />
          </div>
          <div className="text-[10.5px] text-ink-faint text-right mt-1">{Math.round(progress * 100)}%</div>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-start gap-2 rounded-lg bg-danger/10 border border-danger/30 px-3 py-2.5">
          <AlertTriangle size={14} className="text-danger flex-shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-danger leading-snug">{errorMsg}</div>
        </div>
      )}
      {status === "cancelled" && (
        <div className="rounded-lg bg-studio-hover px-3 py-2 text-[11.5px] text-ink-secondary">
          Cancelled — no changes were made to your clip.
        </div>
      )}

      {status === "choosing" && (
        <>
          <div>
            <div className="text-[11px] font-semibold text-ink-secondary mb-1.5">Mode</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMode("basic")}
                className={`flex flex-col items-start gap-1.5 p-3 rounded-xl text-left transition-all ${mode === "basic" ? "ring-2 ring-signal" : "hover:brightness-110"}`}
                style={{ background: "linear-gradient(135deg,#4C4C5E,#2E2E3A)" }}>
                <Zap size={15} className="text-white" />
                <span className="text-[12px] font-bold text-white">Basic</span>
                <span className="text-[9.5px] text-white/70">Fast, always available</span>
              </button>
              <button onClick={() => setMode("advanced")}
                className={`flex flex-col items-start gap-1.5 p-3 rounded-xl text-left transition-all ${mode === "advanced" ? "ring-2 ring-signal" : "hover:brightness-110"}`}
                style={{ background: "linear-gradient(135deg,#8B5CFF,#4C8CFF)" }}>
                <Gem size={15} className="text-white" />
                <span className="text-[12px] font-bold text-white">Advanced</span>
                <span className="text-[9.5px] text-white/70">Real AI models, slower</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-around py-2 rounded-xl bg-studio-surface border border-studio-border">
            <RingDial label="Resolution" value={resolution} labels={["Off", "HD", "FHD"]} onChange={setResolution} accent="#4C8CFF" />
            <RingDial label="Denoise" value={denoise} labels={["Off", "Low", "High"]} onChange={setDenoise} accent="#33D8A0" />
            <RingDial label="Color" value={color} labels={["Off", "On", "On+"]} onChange={setColor} accent="#FFB648" />
          </div>
          {mode === "advanced" && (
            <p className="text-[10px] text-ink-faint leading-snug px-0.5">
              Color in Advanced mode is a stronger version of the same auto-correction — Resolution and Denoise are the two that run a real AI model.
            </p>
          )}
        </>
      )}

      <div className="flex gap-2">
        {status === "choosing" && (
          <button onClick={start} disabled={tooLong || nothingSelected}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg,#8B5CFF,#A47CFF)" }}>
            <Sparkles size={13} /> Start
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
