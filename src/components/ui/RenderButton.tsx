"use client";

/**
 * RenderButton — triggers export with inline progress modal.
 * - No color change on button during render
 * - "See Later" sends to background (no floating pill — handled elsewhere)
 * - X always cancels AND closes
 */
import { useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { CheckCircle2, XCircle, Ban, Film, X, Download } from "@/utils/icons";
import { renderVideo } from "../../utils/renderVideo";
import { cancelRenderJob } from "../../utils/renderJobRegistry";

export default function RenderButton() {
  const {
    containerDimenions, videos, mediaPath, primaryVideoDimensions,
    textsDetails, blursDetails, imagesDetails, clipsDetails, audioDetails, clipEffects,
    totalTime, fps, transitionsFrames, imageRefs, layerOrder,
    renderJobs, setRenderJobs,
    setProcessedVideoLink, setIsShowProcessedVideo,
  } = useAppDetailsContext();

  const [showModal, setShowModal] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  // Jobs we've already auto-downloaded, so a re-render of the progress
  // callback for the same finished job doesn't download it twice.
  const downloadedJobs = useRef<Set<string>>(new Set());

  // Auto-save the finished export straight to the browser's downloads with
  // a unique name — no save dialog. (User choice: "Auto-download to
  // Downloads".)
  const autoDownload = (url: string, sourceName?: string) => {
    const base = (sourceName ?? videos[0]?.video.name ?? "export").replace(/\.[^.]+$/, "") || "export";
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").replace(/\..+$/, "");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}-${stamp}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const disabled = videos.length < 1;
  const activeJob = activeJobId ? renderJobs.find(j => j.jobId === activeJobId) : null;
  const isDone = activeJob?.processName === "Completed" || activeJob?.processName === "Failed" || activeJob?.processName === "Cancelled";

  const barColor = activeJob?.processName === "Completed" ? "#10B981"
    : activeJob?.processName === "Failed" ? "#EF4444"
    : activeJob?.processName === "Cancelled" ? "#6B7280"
    : "#8B5CFF";

  const handleRender = async () => {
    setShowModal(true);

    try {
      await renderVideo(
        videos, mediaPath, primaryVideoDimensions, containerDimenions,
        textsDetails, blursDetails, imagesDetails, clipsDetails, audioDetails,
        totalTime, fps, transitionsFrames,
        (update) => {
          // Track "is this a brand new job" OUTSIDE the setRenderJobs
          // updater below — updater functions must be pure (React can
          // invoke them more than once, e.g. under Strict Mode), so
          // calling a second component's setState (setActiveJobId) from
          // inside another setState's updater is what was triggering
          // "Cannot update a component while rendering a different
          // component". This check only needs the current renderJobs
          // list, which we already have in the outer closure.
          const isNewJob = !renderJobs.some(j => j.jobId === update.jobId);
          if (isNewJob) {
            setActiveJobId(update.jobId);
          }

          if (
            update.processName === "Completed" &&
            update.videoUrl &&
            !downloadedJobs.current.has(update.jobId)
          ) {
            downloadedJobs.current.add(update.jobId);
            autoDownload(update.videoUrl, update.name);
          }

          setRenderJobs(prev => {
            const idx = prev.findIndex(j => j.jobId === update.jobId);
            if (idx === -1) {
              return [...prev, {
                jobId: update.jobId,
                name: update.name ?? videos[0]?.video.name ?? "export",
                processName: update.processName ?? "Queued",
                progress: update.progress ?? 0,
                logs: update.logs ?? [],
                cancelled: update.cancelled ?? false,
                videoUrl: update.videoUrl,
              }];
            }
            const updated = [...prev];
            updated[idx] = { ...updated[idx], ...update };
            return updated;
          });
        },
        imageRefs, layerOrder,
        clipEffects,
      );
    } catch (err) {
      console.error("Render failed:", err);
    }
  };

  // X button — always cancel active job AND close modal
  const handleClose = () => {
    if (activeJobId && !isDone) {
      cancelRenderJob(activeJobId);
      setRenderJobs(prev => prev.map(j => j.jobId === activeJobId
        ? { ...j, processName: "Cancelled", cancelled: true } : j));
    }
    setShowModal(false);
    setActiveJobId(null);
  };

  const handleSeeLater = () => {
    setShowModal(false);
    // job stays in renderJobs — user can check it from the queue button
  };

  const handleWatch = () => {
    if (activeJob?.videoUrl) {
      setProcessedVideoLink(activeJob.videoUrl);
      setIsShowProcessedVideo(true);
    }
    setShowModal(false);
    setActiveJobId(null);
  };

  const handleDone = () => {
    setShowModal(false);
    setActiveJobId(null);
  };

  return (
    <>
      {/* Export button — no color change during render */}
      <button
        onClick={handleRender}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold border-none cursor-pointer font-[inherit] transition-all flex-shrink-0
          ${disabled
            ? "bg-[rgba(255,255,255,.08)] text-[rgba(255,255,255,.3)] cursor-not-allowed"
            : "text-white hover:opacity-90 active:scale-95"
          }`}
        style={disabled ? {} : {
          background: "linear-gradient(135deg,#8B5CFF 0%,#A47CFF 40%,#8B5CFF 100%)",
          boxShadow: "0 2px 10px rgba(139,92,255,.35)",
        }}
      >
        <Download size={13} strokeWidth={2.2} />
        Export
      </button>

      {/* ── Progress Modal ──────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-[1000] bg-black/55 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-[420px] max-w-full rounded-[20px] overflow-hidden shadow-pop bg-studio-surface border border-studio-border">

            {/* Header — background is genuinely dynamic (depends on job state), stays inline */}
            <div className="px-6 pt-5 pb-4 flex items-start justify-between" style={{
              background: isDone
                ? (activeJob?.processName === "Completed" ? "linear-gradient(135deg,#059669,#10B981)" : "linear-gradient(135deg,#EF4444,#F87171)")
                : "linear-gradient(135deg,#8B5CFF,#A47CFF,#8B5CFF)",
            }}>
              <div>
                <div className="text-lg font-extrabold text-white mb-1 flex items-center gap-2">
                  {!activeJob ? "Starting export…"
                    : activeJob.processName === "Completed" ? (<><CheckCircle2 size={17} /> Export complete!</>)
                    : activeJob.processName === "Failed" ? (<><XCircle size={17} /> Export failed</>)
                    : activeJob.processName === "Cancelled" ? (<><Ban size={17} /> Cancelled</>)
                    : (<><Film size={16} /> {activeJob.processName}…</>)}
                </div>
                <div className="text-xs text-white/80 font-medium">
                  {activeJob?.name ?? videos[0]?.video.name ?? "export"}
                </div>
              </div>
              {/* X button — always visible, always cancels+closes */}
              <button onClick={handleClose} className="bg-white/20 border-none rounded-full w-7 h-7 cursor-pointer text-white flex items-center justify-center flex-shrink-0">
                <X size={14} strokeWidth={2.4} />
              </button>
            </div>

            <div className="px-6 py-5">
              {/* Progress bar — width/color are genuinely dynamic, stay inline */}
              <div className="h-2 rounded bg-studio-hover mb-2.5 overflow-hidden">
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: `${activeJob?.progress ?? 0}%`,
                  background: isDone ? barColor : "linear-gradient(90deg,#8B5CFF,#A47CFF)",
                  transition: "width .4s ease",
                }} />
              </div>

              <div className="flex items-center justify-between mb-5">
                <span className="text-[28px] font-black font-mono" style={{ color: barColor }}>
                  {activeJob?.progress ?? 0}%
                </span>
                <span className="text-xs text-ink-muted text-right">
                  {activeJob?.processName ?? "Initializing"}
                </span>
              </div>

              {/* Action buttons */}
              {/* On-screen error detail — never let a failure show only a generic status pill */}
              {isDone && activeJob?.processName === "Failed" && activeJob?.error && (
                <div className="mb-3.5 px-3 py-2.5 rounded-[10px] bg-danger/10 border border-danger/25 text-[11.5px] text-danger leading-relaxed break-words">
                  {activeJob.error}
                </div>
              )}

              <div className="flex gap-2">
                {!isDone && (
                  <button onClick={handleSeeLater}
                    className="flex-1 py-2.5 rounded-[10px] border-[1.5px] border-studio-border bg-transparent cursor-pointer text-[12.5px] font-bold text-ink-secondary">
                    See Later
                  </button>
                )}
                {isDone && activeJob?.processName === "Completed" && (
                  <>
                    <button onClick={handleWatch}
                      className="flex-1 py-2.5 rounded-[10px] border-none cursor-pointer text-[12.5px] font-bold text-white"
                      style={{ background: "linear-gradient(135deg,#8B5CFF,#A47CFF)" }}>
                      Watch Video
                    </button>
                    <button onClick={handleDone}
                      className="flex-1 py-2.5 rounded-[10px] border-[1.5px] border-studio-border bg-transparent cursor-pointer text-[12.5px] font-bold text-ink-secondary">
                      Close
                    </button>
                  </>
                )}
                {isDone && activeJob?.processName !== "Completed" && (
                  <button onClick={handleDone}
                    className="flex-1 py-2.5 rounded-[10px] border-[1.5px] border-studio-border bg-transparent cursor-pointer text-[12.5px] font-bold text-ink-secondary">
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}