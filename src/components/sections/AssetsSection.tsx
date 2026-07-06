"use client";

import { TiDelete } from "react-icons/ti";
import { CiText } from "react-icons/ci";
import { MdBlurOn } from "react-icons/md";
import { BiPlus, BiX } from "react-icons/bi";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoSize } from "../../utils/formatVideoSize";
import { addClipToTimeline } from "../../utils/addClipToTimeline";
import { deleteVideo } from "../../utils/deleteVideo";

export default function AssetsSection() {
  const {
    imagesDetails,
    selectedImageID,
    setSelectedImageID,
    setImagesDetails,
    textsDetails,
    setSelectedTextId,
    selectedTextId,
    setTextsDetails,
    blursDetails,
    setBlursDetails,
    selectedBlurId,
    setSelectedBlurId,
    videos,
    setVideos,
    clipsDetails,
    setClipsDetails,
    setTotalTime,
    setPrimaryVideoDimensions,
  } = useAppDetailsContext();

  const isEmpty =
    imagesDetails.length === 0 &&
    textsDetails.length === 0 &&
    blursDetails.length === 0 &&
    videos.length === 0;

  return (
    <div className="bg-studio-surface flex flex-col gap-4 h-full overflow-hidden">
      <p className="text-sm p-1 font-semibold text-ink-primary font-display">Assets</p>

      <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent px-2 flex flex-col gap-6">
        {isEmpty ? (
          <div className="flex-1 flex justify-center items-center text-ink-faint text-sm italic">
            Import videos to get started
          </div>
        ) : (
          <>
            {videos.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-ink-muted uppercase mb-2 tracking-wide font-semibold">
                  Videos
                </p>

                {/* Table Header */}
                <div className="grid grid-cols-5 text-xs text-ink-muted px-3 py-2 border-b border-studio-border">
                  <span className="col-span-2">File</span>
                  <span className="text-right">Size</span>
                  <span className="text-right">Type</span>
                  <span className="text-center">Actions</span>
                </div>

                {/* Table Rows */}
                {videos.map((video, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-5 items-center text-xs text-ink-primary px-3 py-2 border-b border-studio-border hover:bg-studio-hover"
                  >
                    {/* Name */}
                    <p className="truncate col-span-2">
                      ({video.name}){" "}
                      <span className="text-ink-faint">{video.video.name}</span>
                    </p>

                    {/* Size */}
                    <span className="text-right text-ink-muted">
                      {formatVideoSize(video.video.size)}
                    </span>

                    {/* Type */}
                    <span className="text-right text-ink-muted">
                      {video.video.type}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center justify-center gap-2">
                      <button
                        title="Add to timeline"
                        onClick={(e) => {
                          // Adding animation for video adding to timeline
                          const chip = document.createElement("div");
                          chip.innerText = video.name || "Clip";
                          Object.assign(chip.style, {
                            width: "90px",
                            height: "40px",
                            backgroundColor: "#FF6A3D",
                            borderRadius: "10px",
                            position: "fixed",
                            top: `${e.clientY - 20}px`,
                            left: `${e.clientX - 45}px`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "white",
                            boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
                            opacity: "0.9",
                            transition:
                              "top 0.8s cubic-bezier(0.25, 1, 0.5, 1), left 0.8s ease, transform 0.8s ease, opacity 0.5s ease",
                            zIndex: "99999",
                          });
                          document.body.appendChild(chip);

                          // --- move toward bottom-right area ---
                          setTimeout(() => {
                            chip.style.top = "calc(100vh - 34vh)"; // timeline area (bottom third)
                            chip.style.left = `${window.innerWidth - 120}px`; // move near right edge
                            chip.style.transform = "scale(1.2)";
                          }, 50);

                          // --- fade out and remove ---
                          setTimeout(() => {
                            chip.style.opacity = "0";
                            chip.style.transform = "scale(0.4)";
                            setTimeout(() => chip.remove(), 400);
                          }, 950);

                          addClipToTimeline({
                            video,
                            setTotalTime,
                            clipsDetails,
                            setClipsDetails,
                            setPrimaryVideoDimensions,
                          });
                        }}
                        className="p-1 text-ink-secondary hover:bg-signal/20 hover:text-signal rounded-full transition-colors"
                      >
                        <BiPlus size={16} />
                      </button>
                      <button
                        title="Delete video"
                        disabled={video.name === "video1"}
                        onClick={() => {
                          deleteVideo({
                            video,
                            setVideos,
                            setClipsDetails,
                            setTotalTime,
                          });
                        }}
                        className="p-1 text-ink-secondary hover:bg-danger/20 hover:text-danger rounded-full disabled:opacity-50 transition-colors"
                      >
                        <BiX size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {imagesDetails.length > 0 && (
              <div>
                <p className="text-xs text-ink-muted uppercase mb-2 tracking-wide font-semibold">
                  Images
                </p>
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3  gap-2">
                  {imagesDetails.map((detail) => {
                    const isSelected = selectedImageID === detail.id;
                    return (
                      <div
                        key={detail.id}
                        className={`relative group w-full aspect-video rounded border ${
                          isSelected
                            ? "border-signal"
                            : "border-studio-border"
                        }  cursor-pointer overflow-hidden`}
                        onClick={() => {
                          setSelectedImageID(detail.id);
                        }}
                      >
                        <img
                          src={detail.src}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        <TiDelete
                          className="absolute top-1 right-1 p-1 text-red-500 bg-[#1e1e1e] rounded-full text-lg opacity-0 group-hover:opacity-100 transition hover:scale-110"
                          title="Delete image"
                          onClick={(e) => {
                            e.stopPropagation();
                            setImagesDetails((prev) =>
                              prev.filter((prev) => prev.id !== detail.id)
                            );
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {textsDetails.length > 0 && (
              <div>
                <p className="text-xs text-ink-muted uppercase mb-2 tracking-wide font-semibold">
                  Text
                </p>
                <div className="flex flex-col gap-2">
                  {textsDetails.map((detail) => {
                    const isSelected = selectedTextId === detail.id;
                    return (
                      <div
                        key={detail.id}
                        onClick={() => {
                          setSelectedTextId(detail.id);
                        }}
                        className={`relative flex items-center gap-2 p-2 rounded-lg border-2 text-sm bg-studio-raised text-ink-primary group cursor-pointer transition-colors ${
                          isSelected
                            ? "border-signal"
                            : "border-transparent"
                        } hover:border-signal/50`}
                      >
                        <CiText size={16} />
                        <p className="truncate flex-1">{detail.text}</p>
                        <TiDelete
                          className="absolute right-2 top-2 text-ink-secondary hover:text-danger cursor-pointer text-base opacity-0 group-hover:opacity-100 transition-colors"
                          title="Delete text"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTextsDetails((prev) =>
                              prev.filter((d) => d.id !== detail.id)
                            );
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {blursDetails.length > 0 && (
              <div>
                <p className="text-xs text-ink-muted uppercase mb-2 tracking-wide font-semibold">
                  Blurs
                </p>
                <div className="flex flex-col gap-2">
                  {blursDetails.map((detail, index) => {
                    const isSelected = selectedBlurId === detail.id;
                    return (
                      <div
                        key={detail.id}
                        onClick={() => setSelectedBlurId(detail.id)}
                        className={`relative flex items-center gap-2 p-2 rounded-lg border-2 text-sm bg-studio-raised text-ink-primary group cursor-pointer transition-colors ${
                          isSelected
                            ? "border-signal"
                            : "border-transparent"
                        } hover:border-signal/50`}
                      >
                        <MdBlurOn size={16} />
                        <p className="truncate flex-1">
                          Blur {index + 1} ({detail.blurAmount})
                        </p>
                        <TiDelete
                          className="absolute right-2 top-2 text-ink-secondary hover:text-danger cursor-pointer text-base opacity-0 group-hover:opacity-100 transition-colors"
                          title="Delete blur"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBlursDetails((prev) =>
                              prev.filter((d) => d.id !== detail.id)
                            );
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
