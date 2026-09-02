"use client";

import { PiExportBold, FaDownload } from "@/utils/icons";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
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

      <div id="video-output-modal" className="w-full flex flex-col" style={{ transition: "all .3s ease", transform: "translateX(-100%)" }}>
        {/* Header */}
        <div className="h-11 bg-studio-surface border-b border-studio-border flex items-center px-4 relative">
          <span className="absolute left-1/2 -translate-x-1/2 text-[13px] font-bold text-ink-primary">Processed Video</span>
          <div className="ml-auto flex gap-2.5">
            <button onClick={() => exportvideo("download")} disabled={isLoading || !!FileError || !processedVideoLink}
              className="w-8 h-8 rounded-lg border border-studio-border bg-studio-raised flex items-center justify-center text-ink-secondary transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:cursor-pointer enabled:hover:bg-studio-hover">
              <FaDownload size={13} />
            </button>
            <button onClick={() => exportvideo("circle")} disabled={isLoading || !!FileError || !processedVideoLink}
              className="w-8 h-8 rounded-lg border border-studio-border bg-studio-raised flex items-center justify-center text-ink-secondary transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:cursor-pointer enabled:hover:bg-studio-hover">
              <PiExportBold size={15} />
            </button>
          </div>
        </div>

        {/* Video area */}
        <div className="flex-1 border-t border-studio-border relative flex items-center justify-center bg-studio-void" style={{ minHeight: 300 }}>
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/50">
              <span className="text-white text-[13px] font-medium mb-3">Loading video…</span>
              <div className="w-8 h-8 rounded-full animate-spin" style={{ border: "3px solid rgba(255,255,255,.15)", borderTop: "3px solid #8B5CFF" }} />
            </div>
          )}
          <div className="relative w-full flex items-center justify-center" style={{ maxHeight: "60vh" }}>
            {processedVideoLink && (
              <video src={processedVideoLink}
                onError={e => {
                  if (e.target instanceof HTMLVideoElement) setFileError(`Error in Processed Video: ${e.target.error?.message}`);
                  else setFileError("Error loading video");
                }}
                className="max-w-full w-full h-auto object-contain bg-black"
                style={{ maxHeight: "60vh" }}
                controls />
            )}
          </div>
        </div>
      </div>
    </DraggableWrapper>
  );
}
