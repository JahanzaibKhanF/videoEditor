"use client";

/**
 * CaptionsPanel — inline sidebar auto-captions, same "choosing / running /
 * done / error / cancelled" shape as BackgroundRemovalPanel: pick the clip,
 * hit Start, watch progress, then Add/Discard. Runs Whisper (tiny, quantized)
 * entirely client-side via captionWorker.ts — no upload, no per-minute cost.
 *
 * Each transcribed phrase becomes its OWN real text layer (not a locked
 * overlay) — draggable, restylable, retimeable exactly like any text you'd
 * type by hand, just placed and timed automatically. A shared bold-white/
 * black-outline default style is applied across the batch so the result is
 * immediately usable without hand-styling every segment.
 */
import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAppDetailsContext } from "../../context/useAppContext";
import { ClipDetails } from "../../types/types";
import { generateCaptions, checkMemoryCapability, CaptionChunk, MemoryCapabilityResult } from "../../utils/generateCaptions";
import { measureWrappedTextHeight } from "../../utils/measureText";
import { frontmostZ } from "../../utils/zStack";
import { Captions, Loader2, CheckCircle2, RotateCcw, AlertTriangle, Zap, Ban, Sparkles } from "@/utils/icons";

export default function CaptionsPanel({ clip }: { clip: ClipDetails }) {
  const {
    setTextsDetails, clipsDetails, imagesDetails, textsDetails, blursDetails, shapesDetails, brushesDetails,
    containerDimenions,
  } = useAppDetailsContext();
  const abortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<"choosing" | "running" | "done" | "error" | "cancelled">("choosing");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [chunks, setChunks] = useState<CaptionChunk[]>([]);
  const [memCheck, setMemCheck] = useState<MemoryCapabilityResult>({ supported: undefined });

  useEffect(() => { setMemCheck(checkMemoryCapability()); }, []);

  // Re-arm whenever the selected clip changes, so a previous clip's result
  // never bleeds into this one.
  useEffect(() => {
    abortRef.current?.abort();
    setStatus("choosing");
    setProgress(0);
    setChunks([]);
    setErrorMsg("");
  }, [clip.id]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const start = async () => {
    setStatus("running");
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await generateCaptions({
        clip, signal: controller.signal,
        onProgress: (p) => { setProgress(p.fraction); setLabel(p.label); },
      });
      if (result.length === 0) throw new Error("Didn't catch any speech in this clip.");
      setChunks(result);
      setStatus("done");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setStatus("cancelled");
      } else {
        console.error("Caption generation failed:", err);
        setErrorMsg((err as Error)?.message ?? "Something went wrong.");
        setStatus("error");
      }
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStatus("cancelled");
  };

  const discard = () => {
    setStatus("choosing");
    setChunks([]);
  };

  const addToTimeline = () => {
    const w = Math.max(160, containerDimenions.width * 0.82);
    const x = (containerDimenions.width - w) / 2;
    const fontSize = Math.max(20, Math.min(72, Math.round(containerDimenions.height * 0.06)));
    const marginBottom = containerDimenions.height * 0.1;
    const clipStart = clip.startPosition ?? 0;
    const clipEnd = clip.endPosition ?? clipStart + (clip.duration ?? 0);

    const zIndex = frontmostZ([
      ...clipsDetails.map(c => c.zIndex ?? 0), ...imagesDetails.map(i => i.zIndex ?? 0),
      ...textsDetails.map(t => t.zIndex ?? 0), ...blursDetails.map(b => b.zIndex ?? 0),
      ...shapesDetails.map(s => s.zIndex ?? 0), ...brushesDetails.map(b => b.zIndex ?? 0),
    ]);

    const newTexts = chunks.map((c) => {
      const h = measureWrappedTextHeight(c.text, fontSize, "Arial", 1.15, w, true, false);
      const startTime = Math.max(clipStart, clipStart + c.start);
      const endTime = Math.min(clipEnd, clipStart + c.end);
      return {
        id: uuidv4(),
        text: c.text,
        textX: x, textY: containerDimenions.height - h - marginBottom,
        width: w, height: h,
        fontSize, lineHeight: 1.15, fontFamily: "Arial",
        textColor: "#ffffff", backgroundColor: "transparent",
        shadowColor: "transparent", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
        isBold: true, isItalic: false, isUnderline: false,
        opacity: 1,
        startTime, endTime: Math.max(startTime + 0.1, endTime),
        animation: "none",
        zIndex,
        strokeColor: "#000000", strokeWidth: Math.max(2, Math.round(fontSize * 0.09)),
      };
    });

    setTextsDetails(prev => [...prev, ...newTexts]);
    setStatus("choosing");
    setChunks([]);
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
              <Captions size={20} color="white" />
              <span className="absolute -top-1.5 -right-1.5 text-[7.5px] font-black bg-white text-signal rounded-full px-1.5 py-px leading-tight">AI</span>
            </div>
            <div>
              <div className="text-[14.5px] font-bold text-white">Auto Captions</div>
              <div className="text-[11px] text-white/80">Transcribe this clip's speech into timed text</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chip(Sparkles, "Free & offline")}
            {chip(Ban, "Cancel anytime")}
            {chip(CheckCircle2, "Fully editable after")}
          </div>
        </div>
      )}

      {status === "choosing" && memCheck.supported === false && (
        <div className="rounded-lg bg-warning/10 border border-warning/30 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-warning leading-snug">
              <span className="font-bold">This device reports limited memory (~{memCheck.deviceMemoryGB}GB).</span>{" "}
              The speech model may run slowly or fail to load — you can still try.
            </div>
          </div>
        </div>
      )}

      {status === "running" && (
        <div className="rounded-xl p-5 flex flex-col items-center gap-3"
          style={{ background: "repeating-conic-gradient(#2a2a38 0% 25%, #1c1c26 0% 50%) 50% / 16px 16px" }}>
          <Loader2 size={22} className="animate-spin text-signal" />
          <span className="text-[11.5px] text-ink-secondary text-center">{label || "Working…"}</span>
          <div className="w-full h-1.5 rounded-full bg-studio-void overflow-hidden">
            <div className="h-full transition-all" style={{ width: `${Math.round(progress * 100)}%`, background: "linear-gradient(90deg,#8B5CFF,#4C8CFF)" }} />
          </div>
          <span className="text-[10.5px] text-ink-faint">{Math.round(progress * 100)}%</span>
        </div>
      )}

      {status === "done" && (
        <>
          <div className="flex items-center gap-1.5 rounded-lg bg-success/10 border border-success/30 px-3 py-2">
            <CheckCircle2 size={13} className="text-success flex-shrink-0" />
            <span className="text-[11.5px] text-ink-primary">Generated {chunks.length} caption{chunks.length === 1 ? "" : "s"}</span>
          </div>
          <div className="max-h-48 overflow-y-auto scrollbar-thin flex flex-col gap-1.5 rounded-lg border border-studio-border bg-studio-void/40 p-2">
            {chunks.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className="text-ink-faint font-mono flex-shrink-0 w-9">{c.start.toFixed(1)}s</span>
                <span className="text-ink-secondary leading-snug">{c.text}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {status === "error" && (
        <div className="flex items-start gap-2 rounded-lg bg-danger/10 border border-danger/30 px-3 py-2.5">
          <AlertTriangle size={14} className="text-danger flex-shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-danger leading-snug">{errorMsg}</div>
        </div>
      )}
      {status === "cancelled" && (
        <div className="rounded-lg bg-studio-hover px-3 py-2 text-[11.5px] text-ink-secondary">
          Cancelled — no changes were made.
        </div>
      )}

      <div className="flex gap-2">
        {status === "choosing" && (
          <button onClick={start}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
            style={{ background: "linear-gradient(135deg,#8B5CFF,#A47CFF)" }}>
            <Zap size={13} /> Generate Captions
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
            <button onClick={addToTimeline}
              className="flex-[2] py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
              style={{ background: "linear-gradient(135deg,#8B5CFF,#A47CFF)" }}>
              Add to timeline
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
