"use client";

import { useEffect, useState } from "react";
import { PiExportBold } from "react-icons/pi";
import { toast } from "react-toastify";
import { FaDownload } from "react-icons/fa";
import { useAppDetailsContext } from "../../context/useAppContext";
import DraggableWrapper from "../../utils/DraggableWrapper";
import Error from "../ui/Error";

export default function VideoOutputModal({ setIsShowProcessedVideo }: Readonly<{ setIsShowProcessedVideo: React.Dispatch<React.SetStateAction<boolean>> }>) {
  const [FileError, setFileError] = useState("");
  const { processedVideoLink } = useAppDetailsContext();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const modal = document.getElementById("video-output-modal");
    if (modal) modal.style.transform = "translateX(0)";
  }, []);

  // `processedVideoLink` is now always a local `blob:` URL produced by
  // clientRender() (or restored from IndexedDB via RecentVideos) — there is
  // no backend to fetch from anymore, so we just point <video> at it directly.
  useEffect(() => {
    if (!processedVideoLink) return;
    setIsLoading(true);
    setFileError("");
    const t = setTimeout(() => setIsLoading(false), 50);
    return () => clearTimeout(t);
  }, [processedVideoLink]);

  const exportvideo = (exportType: "download" | "circle") => {
    if (!processedVideoLink) { toast.error("Video not loaded yet."); return; }
    if (exportType === "download") {
      const fileName = `exported_${Date.now().toString(16)}.mp4`;
      const link = document.createElement("a");
      link.href = processedVideoLink;
      link.download = fileName;
      link.click();
    }
  };

  return (
    <DraggableWrapper closeOn={() => setIsShowProcessedVideo(false)} boxWidth={"50%"}>
      {FileError !== "" && <Error error={FileError} closerFunction={() => setFileError("")} />}

      <div id="video-output-modal" style={{ width: "100%", transition: "all .3s ease", transform: "translateX(-100%)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ height: 44, background: "#FFFFFF", borderBottom: "1px solid #262B33", display: "flex", alignItems: "center", padding: "0 16px", position: "relative" }}>
          <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 13, fontWeight: 700, color: "#0F1117" }}>Processed Video</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <button onClick={() => exportvideo("download")} disabled={isLoading || !!FileError || !processedVideoLink}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #262B33", background: "#F7F8FA", display: "flex", alignItems: "center", justifyContent: "center", cursor: (isLoading || !!FileError || !processedVideoLink) ? "not-allowed" : "pointer", color: "#555B6E", opacity: (isLoading || !!FileError || !processedVideoLink) ? 0.4 : 1, transition: "all .12s" }}
              onMouseEnter={e => { if (!isLoading && !FileError && processedVideoLink) (e.currentTarget as HTMLElement).style.background = "#F2F4F7"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#F7F8FA"; }}>
              <FaDownload size={13} />
            </button>
            <button onClick={() => exportvideo("circle")} disabled={isLoading || !!FileError || !processedVideoLink}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #262B33", background: "#F7F8FA", display: "flex", alignItems: "center", justifyContent: "center", cursor: (isLoading || !!FileError || !processedVideoLink) ? "not-allowed" : "pointer", color: "#555B6E", opacity: (isLoading || !!FileError || !processedVideoLink) ? 0.4 : 1, transition: "all .12s" }}
              onMouseEnter={e => { if (!isLoading && !FileError && processedVideoLink) (e.currentTarget as HTMLElement).style.background = "#F2F4F7"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#F7F8FA"; }}>
              <PiExportBold size={15} />
            </button>
          </div>
        </div>

        {/* Video area */}
        <div style={{ flex: 1, borderTop: "1px solid #262B33", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "#111218", minHeight: 300 }}>
          {isLoading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10, background: "rgba(0,0,0,.5)" }}>
              <span style={{ color: "white", fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Loading video…</span>
              <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,.15)", borderTop: "3px solid #FF6A3D", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            </div>
          )}
          <div style={{ position: "relative", width: "100%", maxHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {processedVideoLink && (
              <video src={processedVideoLink}
                onError={e => {
                  if (e.target instanceof HTMLVideoElement) setFileError(`Error in Processed Video: ${e.target.error?.message}`);
                  else setFileError("Error loading video");
                }}
                style={{ maxWidth: "100%", maxHeight: "60vh", width: "100%", height: "auto", objectFit: "contain", background: "#000" }}
                controls />
            )}
          </div>
        </div>
      </div>
    </DraggableWrapper>
  );
}
