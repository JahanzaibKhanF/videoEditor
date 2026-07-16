"use client";

/**
 * RenderButton — triggers export with inline progress modal.
 * - No color change on button during render
 * - "See Later" sends to background (no floating pill — handled elsewhere)
 * - X always cancels AND closes
 */
import { useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { CheckCircle2, XCircle, Ban, Film, X, Download } from "@/utils/icons";
import { renderVideo } from "../../utils/renderVideo";
import { cancelRenderJob } from "../../utils/renderJobRegistry";

export default function RenderButton() {
  const {
    containerDimenions, videos, mediaPath, primaryVideoDimensions,
    textsDetails, blursDetails, imagesDetails, clipsDetails, audioDetails,
    totalTime, fps, transitionsFrames, imageRefs, layerOrder,
    renderJobs, setRenderJobs,
    setProcessedVideoLink, setIsShowProcessedVideo,
  } = useAppDetailsContext();

  const [showModal, setShowModal] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

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
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,.55)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            width: 420, borderRadius: 20, overflow: "hidden",
            boxShadow: "0 32px 64px rgba(0,0,0,.55)",
            background: "#111120", border: "1px solid #211F33",
          }}>

            {/* Header */}
            <div style={{
              padding: "20px 24px 16px",
              background: isDone
                ? (activeJob?.processName === "Completed" ? "linear-gradient(135deg,#059669,#10B981)" : "linear-gradient(135deg,#EF4444,#F87171)")
                : "linear-gradient(135deg,#8B5CFF,#A47CFF,#8B5CFF)",
              display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "white", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  {!activeJob ? "Starting export…"
                    : activeJob.processName === "Completed" ? (<><CheckCircle2 size={17} /> Export complete!</>)
                    : activeJob.processName === "Failed" ? (<><XCircle size={17} /> Export failed</>)
                    : activeJob.processName === "Cancelled" ? (<><Ban size={17} /> Cancelled</>)
                    : (<><Film size={16} /> {activeJob.processName}…</>)}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.8)", fontWeight: 500 }}>
                  {activeJob?.name ?? videos[0]?.video.name ?? "export"}
                </div>
              </div>
              {/* X button — always visible, always cancels+closes */}
              <button onClick={handleClose} style={{
                background: "rgba(255,255,255,.2)", border: "none", borderRadius: "50%",
                width: 28, height: 28, cursor: "pointer", color: "white",
                fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center",
                justifyContent: "center", flexShrink: 0, lineHeight: 1,
              }}><X size={14} strokeWidth={2.4} /></button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Progress bar */}
              <div style={{ height: 8, borderRadius: 4, background: "#1F1F35", marginBottom: 10, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: `${activeJob?.progress ?? 0}%`,
                  background: isDone ? barColor : "linear-gradient(90deg,#8B5CFF,#A47CFF)",
                  transition: "width .4s ease",
                }} />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: barColor, fontFamily: "monospace" }}>
                  {activeJob?.progress ?? 0}%
                </span>
                <span style={{ fontSize: 12, color: "#89859F", textAlign: "right" }}>
                  {activeJob?.processName ?? "Initializing"}
                </span>
              </div>

              {/* Action buttons */}
              {/* On-screen error detail — never let a failure show only a generic status pill */}
              {isDone && activeJob?.processName === "Failed" && activeJob?.error && (
                <div style={{
                  marginBottom: 14, padding: "10px 12px", borderRadius: 10,
                  background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
                  fontSize: 11.5, color: "#FF8FA3", lineHeight: 1.5, wordBreak: "break-word",
                }}>
                  {activeJob.error}
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                {!isDone && (
                  <button onClick={handleSeeLater} style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid #211F33",
                    background: "transparent", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                    color: "#B8B4D1",
                  }}>
                    See Later
                  </button>
                )}
                {isDone && activeJob?.processName === "Completed" && (
                  <>
                    <button onClick={handleWatch} style={{
                      flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                      background: "linear-gradient(135deg,#8B5CFF,#A47CFF)", cursor: "pointer",
                      fontSize: 12.5, fontWeight: 700, color: "white",
                    }}>Watch Video</button>
                    <button onClick={handleDone} style={{
                      flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid #211F33",
                      background: "transparent", cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#B8B4D1",
                    }}>Close</button>
                  </>
                )}
                {isDone && activeJob?.processName !== "Completed" && (
                  <button onClick={handleDone} style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid #211F33",
                    background: "transparent", cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#B8B4D1",
                  }}>Close</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
