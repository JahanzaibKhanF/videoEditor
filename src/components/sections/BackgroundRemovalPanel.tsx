"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { ClipDetails } from "../../types/types";
import { removeClipBackground, checkAlphaCapability, AlphaCapabilityResult } from "../../utils/backgroundRemoval";
import { saveBgRemoved } from "../../utils/bgRemovedStore";
import { Scissors, Loader2, CheckCircle2, RotateCcw, Zap, Gem, AlertTriangle, Eye, Ban } from "@/utils/icons";

/**
 * Inline sidebar version of background removal — this used to be a
 * full-screen modal (BackgroundRemovalModal), but it now lives directly in
 * the "Remove Background" sidebar tab: pick quality, hit Start, watch the
 * live preview/progress right there in the panel, then Apply/Discard —
 * no overlay, no separate dialog to manage.
 */
export default function BackgroundRemovalPanel({ clip }: { clip: ClipDetails }) {
  const { setClipsDetails, resumedProjectId } = useAppDetailsContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [quality, setQuality] = useState<"fast" | "quality">("fast");
  const [status, setStatus] = useState<"choosing" | "running" | "done" | "error" | "cancelled">("choosing");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  // Checked once up front, not just discovered after the user hits Start —
  // "no alpha-capable VideoEncoder" is a real browser/device limitation
  // (Firefox/Safari and most mobile browsers can't do this at all), so we
  // probe for it immediately and show a clear, actionable card instead of
  // letting people run the model then hit a wall at the encode step.
  const [alphaCheck, setAlphaCheck] = useState<AlphaCapabilityResult | { supported: undefined }>({ supported: undefined });

  const runAlphaCheck = () => {
    setAlphaCheck({ supported: undefined });
    checkAlphaCapability().then(setAlphaCheck);
  };

  useEffect(() => { runAlphaCheck(); }, []);

  // Re-arm to "choosing" whenever the selected clip changes, so leftover
  // progress/result from a previous clip never bleeds into this one.
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
      const { blobUrl, blob } = await removeClipBackground({
        clip, quality, signal: controller.signal,
        onProgress: (p) => { setProgress(p.fraction); setLabel(p.label); },
        onFramePreview: (canvas) => {
          const target = canvasRef.current;
          if (!target) return;
          // alpha:true — this preview shows frames mid background-removal,
          // which genuinely have transparent pixels. Without it, the
          // preview panel would flatten them to opaque black even though
          // the actual output blob is fine (same root cause already fixed
          // for the main compositor canvas in CompositorCanvas.tsx).
          const ctx = target.getContext("2d", { alpha: true });
          if (!ctx) return;
          target.width = canvas.width; target.height = canvas.height;
          ctx.clearRect(0, 0, target.width, target.height);
          ctx.drawImage(canvas, 0, 0);
        },
      });
      setResultUrl(blobUrl);
      setResultBlob(blob);
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

  const applyResult = async () => {
    if (!resultUrl || !resultBlob) return;

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

    // Stable id tying together this clip, the local IndexedDB blob, and the
    // Cloudinary copy — so the result survives refresh (local) and other
    // devices (cloud). See useBgRemovedRestore + bgRemovedStore.
    const assetId = crypto.randomUUID();
    const blob = resultBlob;

    await saveBgRemoved({ assetId, projectId: resumedProjectId, blob });

    setClipsDetails(prev => prev.map(c => c.id === clip.id
      ? { ...c, src: resultUrl, startTime: 0, endTime: span, duration: span, sourceDuration: span, bgRemoved: { assetId } }
      : c));
    setStatus("choosing");
    setResultUrl(null);
    setResultBlob(null);

    // Upload a durable copy in the background (browser → Cloudinary direct,
    // using a signed ticket from our API). Autosave persists the returned
    // url/publicId; failure just means local-only (still works on this
    // browser).
    void (async () => {
      try {
        const ticketRes = await fetch("/api/bg-removed", { method: "POST" });
        if (!ticketRes.ok) return; // 401 (guest) / 503 (not configured) — fine
        const t = await ticketRes.json();

        const form = new FormData();
        form.append("file", new File([blob], `${assetId}.webm`, { type: "video/webm" }));
        form.append("api_key", t.apiKey);
        form.append("timestamp", String(t.timestamp));
        form.append("folder", t.folder);
        form.append("signature", t.signature);
        const up = await fetch(`https://api.cloudinary.com/v1_1/${t.cloudName}/video/upload`, {
          method: "POST",
          body: form,
        });
        const data = await up.json().catch(() => ({}));
        const url: string | undefined = data.secure_url;
        const publicId: string | undefined = data.public_id;
        if (!up.ok || !url || !publicId) return;

        setClipsDetails(prev => {
          const stillThere = prev.some(c => c.bgRemoved?.assetId === assetId);
          if (!stillThere) {
            // Clip was deleted before the upload finished — don't leave the
            // asset orphaned in Cloudinary.
            void fetch("/api/bg-removed", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ publicIds: [publicId] }),
            });
            return prev;
          }
          return prev.map(c => c.bgRemoved?.assetId === assetId
            ? { ...c, bgRemoved: { assetId, url, publicId } }
            : c);
        });
      } catch (err) {
        console.warn("[BackgroundRemovalPanel] cloud sync failed, keeping local copy:", err);
      }
    })();
  };

  const discard = () => {
    setStatus("choosing");
    setResultUrl(null);
    setResultBlob(null);
  };

  const chip = (Icon: any, text: string) => (
    <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-2.5 py-1">
      <Icon size={10} color="white" />
      <span className="text-[9.5px] font-semibold text-white/90">{text}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Big colorful header — mirrors the old tab's entry button, now
          living permanently at the top of the panel instead of gating a
          modal behind it. */}
      {status === "choosing" && (
        <div className="rounded-xl p-4 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg,#8B5CFF 0%,#4C8CFF 60%,#33D8A0 100%)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0 relative">
              <Scissors size={20} color="white" />
              <span className="absolute -top-1.5 -right-1.5 text-[7.5px] font-black bg-white text-signal rounded-full px-1.5 py-px leading-tight">AI</span>
            </div>
            <div>
              <div className="text-[14.5px] font-bold text-white">Remove Background</div>
              <div className="text-[11px] text-white/80">Cut out the subject on this clip</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chip(Eye, "Live preview")}
            {chip(Ban, "Cancel anytime")}
            {chip(CheckCircle2, "Real transparency")}
          </div>
        </div>
      )}

      {/* Browser capability warning — informational only. It's shown up
          front so the user isn't flying blind, but it does NOT block
          Start: this quick probe can be stricter than what the real
          encoder actually accepts on some browsers, and the real attempt
          is the only fully authoritative answer. Blocking on the probe
          alone risks refusing to even try on a setup that would have
          worked. */}
      {status === "choosing" && alphaCheck.supported === false && (
        <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-danger flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-danger leading-snug">
              <span className="font-bold">
                {alphaCheck.reason === "no-webcodecs"
                  ? "This browser doesn't support WebCodecs at all."
                  : "This browser might not support transparent-video encoding."}
              </span>{" "}
              You can still try — this is just a heads-up, not a hard block.
            </div>
          </div>
          <ul className="text-[10.5px] text-danger/90 leading-snug mt-2 ml-5 list-disc space-y-0.5">
            <li>Works best on desktop Chrome or Edge, latest version</li>
            <li>Not supported on Firefox, Safari, or most mobile browsers</li>
            <li>Some Linux/older-GPU setups lack this even in Chrome — check <span className="font-mono">chrome://gpu</span> for "Video Encode"</li>
          </ul>
          <button onClick={runAlphaCheck} className="mt-2 text-[10.5px] font-bold text-danger underline hover:no-underline">
            Check again
          </button>
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

      {/* Quality choice (only before starting) — colorful cards instead of
          plain toggle buttons */}
      {status === "choosing" && (
        <div>
          <div className="text-[11px] font-semibold text-ink-secondary mb-1.5">Quality</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setQuality("fast")}
              className={`flex flex-col items-start gap-1.5 p-3 rounded-xl text-left transition-all ${quality === "fast" ? "ring-2 ring-signal" : "hover:brightness-110"}`}
              style={{ background: "linear-gradient(135deg,#4C4C5E,#2E2E3A)" }}>
              <Zap size={15} className="text-white" />
              <span className="text-[12px] font-bold text-white">Fast</span>
              <span className="text-[9.5px] text-white/70">Quick cutout, good for most clips</span>
            </button>
            <button onClick={() => setQuality("quality")}
              className={`flex flex-col items-start gap-1.5 p-3 rounded-xl text-left transition-all ${quality === "quality" ? "ring-2 ring-signal" : "hover:brightness-110"}`}
              style={{ background: "linear-gradient(135deg,#8B5CFF,#4C8CFF)" }}>
              <Gem size={15} className="text-white" />
              <span className="text-[12px] font-bold text-white">Perfect</span>
              <span className="text-[9.5px] text-white/70">Cleaner edges, slower</span>
            </button>
          </div>
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