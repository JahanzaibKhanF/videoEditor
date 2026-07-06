"use client";

/**
 * RenderingLoader — background queue panel.
 * Shows as a small button near top-right when jobs exist.
 * Click to expand a dropdown panel showing all jobs.
 * X on each job: cancels if active, dismisses if done.
 */
import { useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { cancelRenderJob } from "../../utils/clientRender";

export default function RenderingLoader() {
  const { renderJobs, setRenderJobs, setProcessedVideoLink, setIsShowProcessedVideo } = useAppDetailsContext();
  const [expanded, setExpanded] = useState(false);

  if (renderJobs.length === 0) return null;

  const activeJobs = renderJobs.filter(j =>
    !["Completed","Failed","Cancelled"].includes(j.processName)
  );

  const cancel = (jobId: string) => {
    cancelRenderJob(jobId);
    setRenderJobs(prev => prev.map(j =>
      j.jobId === jobId ? { ...j, processName: "Cancelled", cancelled: true } : j
    ));
  };

  const dismiss = (jobId: string) => {
    setRenderJobs(prev => prev.filter(j => j.jobId !== jobId));
  };

  const handleX = (jobId: string) => {
    const job = renderJobs.find(j => j.jobId === jobId);
    const isDone = job && ["Completed","Failed","Cancelled"].includes(job.processName);
    if (isDone) dismiss(jobId);
    else cancel(jobId);
  };

  const statusColor = (s: string) =>
    s === "Completed" ? "#10B981" : s === "Failed" ? "#EF4444" : s === "Cancelled" ? "#6B7280" : "#FF6A3D";

  const totalPct = activeJobs.length > 0
    ? Math.round(activeJobs.reduce((s, j) => s + (j.progress ?? 0), 0) / activeJobs.length)
    : 100;

  return (
    <div style={{ position: "fixed", top: 48, right: 16, zIndex: 999 }}>
      {/* Dropdown panel */}
      {expanded && (
        <div style={{
          width: 320, borderRadius: 14, overflow: "hidden",
          background: "#fff", border: "1px solid #262B33",
          boxShadow: "0 8px 32px rgba(0,0,0,.18)",
          marginBottom: 6,
        }} className="dark:bg-[#1a1d27] dark:border-[rgba(255,255,255,.1)]">
          {/* Panel header */}
          <div style={{
            padding: "9px 14px", display: "flex", alignItems: "center", gap: 8,
            borderBottom: "1px solid #F2F4F7",
          }} className="dark:border-[rgba(255,255,255,.07)]">
            <span style={{ fontSize: 12, fontWeight: 700, flex: 1, color: "#0F1117" }} className="dark:text-white">
              Render Queue
            </span>
            <span style={{ fontSize: 10.5, color: "#9DA3B4" }}>{renderJobs.length} job{renderJobs.length !== 1 ? "s" : ""}</span>
            <button onClick={() => setExpanded(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#9DA3B4", fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
          </div>

          {/* Job list */}
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {renderJobs.map(job => {
              const isDone = ["Completed","Failed","Cancelled"].includes(job.processName);
              const bc = statusColor(job.processName);
              return (
                <div key={job.jobId} style={{ padding: "10px 14px", borderBottom: "1px solid #F2F4F7" }}
                  className="dark:border-[rgba(255,255,255,.05)]">
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, background: `${bc}18`, color: bc, borderRadius: 4, padding: "2px 5px", flexShrink: 0 }}>
                      {job.processName}
                    </span>
                    <span style={{ fontSize: 11, color: "#6B7280", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      className="dark:text-[rgba(255,255,255,.4)]">{job.name}</span>
                    {/* X always present — cancels active, dismisses done */}
                    <button onClick={() => handleX(job.jobId)}
                      style={{
                        background: isDone ? "rgba(107,114,128,.1)" : "rgba(239,68,68,.1)",
                        border: "none", borderRadius: 5, padding: "2px 7px",
                        cursor: "pointer", fontSize: 10, fontWeight: 700,
                        color: isDone ? "#6B7280" : "#EF4444", flexShrink: 0,
                      }}>✕</button>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 4, borderRadius: 2, background: "#F2F4F7", marginBottom: 5, overflow: "hidden" }}
                    className="dark:bg-[rgba(255,255,255,.07)]">
                    <div style={{
                      height: "100%", borderRadius: 2, width: `${job.progress}%`,
                      background: job.processName === "Failed" ? "#EF4444"
                        : job.processName === "Cancelled" ? "#6B7280"
                        : "linear-gradient(90deg,#FF6A3D,#FF8259)",
                      transition: "width .4s ease",
                    }} />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: bc, fontFamily: "monospace", minWidth: 30 }}>{job.progress}%</span>
                    {job.videoUrl && job.processName === "Completed" && (
                      <button onClick={() => {
                        setProcessedVideoLink(job.videoUrl!);
                        setIsShowProcessedVideo(true);
                        setExpanded(false);
                      }} style={{
                        background: "#FF6A3D", border: "none", color: "white",
                        borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontSize: 9.5, fontWeight: 700,
                      }}>Watch</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compact badge button */}
      <button onClick={() => setExpanded(p => !p)} style={{
        display: "flex", alignItems: "center", gap: 7,
        padding: "6px 12px", borderRadius: 20, border: "none",
        cursor: "pointer",
        background: activeJobs.length
          ? "linear-gradient(135deg,#FF6A3D,#FF8259)"
          : "#10B981",
        color: "white",
        boxShadow: "0 2px 12px rgba(0,0,0,.2)",
        fontSize: 11.5, fontWeight: 700,
        transition: "all .2s",
      }}>
        {activeJobs.length > 0 && (
          <span style={{
            width: 7, height: 7, borderRadius: "50%", background: "white", display: "inline-block",
            animation: "rlpulse 1.4s infinite",
          }} />
        )}
        {activeJobs.length > 0 ? `${totalPct}% · ${activeJobs.length} rendering` : `${renderJobs.length} job${renderJobs.length !== 1 ? "s" : ""} done`}
      </button>

      <style>{`@keyframes rlpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}`}</style>
    </div>
  );
}
