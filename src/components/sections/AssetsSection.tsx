"use client";

import { X, Type, Droplets, Plus, Film, ImageIcon, FolderOpen, type LucideIcon } from "@/utils/icons";
import { useAppDetailsContext } from "../../context/useAppContext";
import { formatVideoSize } from "../../utils/formatVideoSize";
import { addClipToTimeline } from "../../utils/addClipToTimeline";
import { deleteVideo } from "../../utils/deleteVideo";

function SectionHeader({ icon: Icon, label, count, color }: { icon: LucideIcon; label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 px-0.5">
      <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: `${color}18`, color }}>
        <Icon size={11} />
      </div>
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="text-[10px] text-ink-faint font-mono">{count}</span>
    </div>
  );
}

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
    activeTemplate,
  } = useAppDetailsContext();

  const isEmpty =
    imagesDetails.length === 0 &&
    textsDetails.length === 0 &&
    blursDetails.length === 0 &&
    videos.length === 0;

  return (
    <div className="bg-studio-surface flex flex-col gap-4 h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 pt-3.5">
        <FolderOpen size={13} className="text-signal" />
        <p className="text-[13px] font-bold text-ink-primary font-display">Assets</p>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin px-3 pb-3 flex flex-col gap-5">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-ink-faint">
            <FolderOpen size={22} className="opacity-40" />
            <p className="text-[12px] italic">Import videos to get started</p>
          </div>
        ) : (
          <>
            {videos.length > 0 && (
              <div>
                <SectionHeader icon={Film} label="Videos" count={videos.length} color="#FFB648" />
                <div className="flex flex-col gap-1.5">
                  {videos.map((video, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-studio-border bg-studio-raised hover:border-signal/40 hover:bg-studio-hover transition-all group"
                    >
                      <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-scrub/20 to-signal/10 border border-studio-border">
                        <Film size={13} className="text-ink-secondary" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[11.5px] font-semibold text-ink-primary">{video.name}</p>
                        <p className="truncate text-[9.5px] text-ink-faint">
                          {formatVideoSize(video.video.size)} · {video.video.type || "video"}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          title={activeTemplate ? "Not available in template mode" : "Add to timeline"}
                          disabled={!!activeTemplate}
                          onClick={(e) => {
                            if (activeTemplate) return;
                            // Adding animation for video adding to timeline
                            const chip = document.createElement("div");
                            chip.innerText = video.name || "Clip";
                            Object.assign(chip.style, {
                              width: "90px",
                              height: "40px",
                              backgroundColor: "#8B5CFF",
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
                          className="w-6 h-6 flex items-center justify-center text-ink-secondary hover:bg-signal/15 hover:text-signal rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <Plus size={13} />
                        </button>
                        <button
                          aria-label="Delete video"
                          disabled={video.name === "video1"}
                          onClick={() => {
                            deleteVideo({
                              video,
                              setVideos,
                              setClipsDetails,
                              setTotalTime,
                            });
                          }}
                          className="w-6 h-6 flex items-center justify-center text-ink-secondary hover:bg-danger/15 hover:text-danger rounded-md disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {imagesDetails.length > 0 && (
              <div>
                <SectionHeader icon={ImageIcon} label="Images" count={imagesDetails.length} color="#8B5CFF" />
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                  {imagesDetails.map((detail) => {
                    const isSelected = selectedImageID === detail.id;
                    return (
                      <div
                        key={detail.id}
                        className={`relative group w-full aspect-video rounded-lg border-[1.5px] transition-colors ${
                          isSelected ? "border-signal" : "border-studio-border hover:border-signal/40"
                        } cursor-pointer overflow-hidden bg-studio-raised`}
                        onClick={() => {
                          setSelectedImageID(detail.id);
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={detail.src}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        <button
                          aria-label="Delete image"
                          onClick={(e) => {
                            e.stopPropagation();
                            setImagesDetails((prev) =>
                              prev.filter((prev) => prev.id !== detail.id)
                            );
                          }}
                          className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center text-white bg-black/60 hover:bg-danger rounded-full opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {textsDetails.length > 0 && (
              <div>
                <SectionHeader icon={Type} label="Text" count={textsDetails.length} color="#4C8CFF" />
                <div className="flex flex-col gap-1.5">
                  {textsDetails.map((detail) => {
                    const isSelected = selectedTextId === detail.id;
                    return (
                      <div
                        key={detail.id}
                        onClick={() => {
                          setSelectedTextId(detail.id);
                        }}
                        className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg border-[1.5px] text-[11.5px] bg-studio-raised text-ink-primary group cursor-pointer transition-colors ${
                          isSelected ? "border-signal bg-signal/8" : "border-studio-border hover:border-signal/40"
                        }`}
                      >
                        <div className="w-6 h-6 rounded-md bg-[#4C8CFF]/12 text-[#4C8CFF] flex items-center justify-center flex-shrink-0">
                          <Type size={12} />
                        </div>
                        <p className="truncate flex-1 font-medium">{detail.text}</p>
                        <button
                          aria-label="Delete text"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTextsDetails((prev) =>
                              prev.filter((d) => d.id !== detail.id)
                            );
                          }}
                          className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-ink-faint hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {blursDetails.length > 0 && (
              <div>
                <SectionHeader icon={Droplets} label="Blurs" count={blursDetails.length} color="#33D8A0" />
                <div className="flex flex-col gap-1.5">
                  {blursDetails.map((detail, index) => {
                    const isSelected = selectedBlurId === detail.id;
                    return (
                      <div
                        key={detail.id}
                        onClick={() => setSelectedBlurId(detail.id)}
                        className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg border-[1.5px] text-[11.5px] bg-studio-raised text-ink-primary group cursor-pointer transition-colors ${
                          isSelected ? "border-signal bg-signal/8" : "border-studio-border hover:border-signal/40"
                        }`}
                      >
                        <div className="w-6 h-6 rounded-md bg-success/12 text-success flex items-center justify-center flex-shrink-0">
                          <Droplets size={12} />
                        </div>
                        <p className="truncate flex-1 font-medium">
                          Blur {index + 1} <span className="text-ink-faint font-mono">({detail.blurAmount})</span>
                        </p>
                        <button
                          aria-label="Delete blur"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBlursDetails((prev) =>
                              prev.filter((d) => d.id !== detail.id)
                            );
                          }}
                          className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-ink-faint hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X size={12} />
                        </button>
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
