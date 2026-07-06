"use client";

import { useEffect, useState } from "react";
import { FaPlayCircle } from "react-icons/fa";
import { TiDelete } from "react-icons/ti";
import { useAppDetailsContext } from "../../context/useAppContext";
import VideoOutputModal from "../output/VideoOutputModal";
import { StoredVideo, deleteRecentVideo, listRecentVideos } from "../../utils/recentVideosStore";

function RecentVideos() {
  const { setProcessedVideoLink } = useAppDetailsContext();
  const [recentVideos, setRecentVideos] = useState<StoredVideo[]>([]);
  const [thumbnails, setThumbnails] = useState<{ [id: string]: string }>({});
  const [isShowProcessedVideo, setIsShowProcessedVideo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listRecentVideos();
      setRecentVideos(data);

      // Generate thumbnails locally from the first frame of each stored blob.
      data.forEach((video) => {
        if (thumbnails[video.id]) return;
        const url = URL.createObjectURL(video.blob);
        const el = document.createElement("video");
        el.src = url;
        el.muted = true;
        el.playsInline = true;
        el.onloadeddata = () => {
          el.currentTime = Math.min(0.5, (el.duration || 1) - 0.05);
        };
        el.onseeked = () => {
          const canvas = document.createElement("canvas");
          canvas.width = el.videoWidth || 320;
          canvas.height = el.videoHeight || 180;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
            setThumbnails((prev) => ({ ...prev, [video.id]: canvas.toDataURL("image/jpeg", 0.7) }));
          }
          URL.revokeObjectURL(url);
          el.remove();
        };
        el.onerror = () => URL.revokeObjectURL(url);
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error reading local videos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
    // Refresh whenever the output modal closes (a new export may have completed).
  }, [isShowProcessedVideo]);

  const handleDeleteRecentVideo = async (id: string) => {
    await deleteRecentVideo(id);
    setRecentVideos((prev) => prev.filter((video) => video.id !== id));
  };

  return (
    <div className=" bg-[#ededed] flex flex-col gap-4 overflow-hidden h-full  border-white/10 ">
      <p className="text-sm  p-1 ">Recent Renders</p>

      {error && (
        <div className="flex-1 flex justify-center items-center text-red-500 text-sm">
          {error} {" Recent Videos"}
        </div>
      )}

      {!loading && !error && recentVideos.length === 0 && (
        <div className="flex-1 flex justify-center items-center text-[#555] text-sm italic">
          No Videos Found
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent px-2">
        {loading && (
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3 px-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                className={`aspect-video rounded-lg  animate-pulse ${
                  Math.random() > 0.5
                    ? "animation-delay:-0.3s bg-gray-500/50"
                    : "bg-gray-600/50"
                }`}
                key={i}
              ></div>
            ))}
          </div>
        )}
        {!loading && !error && recentVideos.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
            {recentVideos.map((video) => {
              return (
                <div key={video.id} className="flex flex-col gap-1">
                  <div
                    onClick={() => {
                      setProcessedVideoLink(URL.createObjectURL(video.blob));
                      setIsShowProcessedVideo(true);
                    }}
                    className="relative group border border-[#333] rounded-lg overflow-hidden aspect-video bg-[#121212] cursor-pointer hover:border-signal transition"
                  >
                    {thumbnails[video.id] && (
                      <img
                        src={thumbnails[video.id]}
                        className="w-full h-full object-cover"
                        alt={video.name}
                      />
                    )}

                    <TiDelete
                      className="absolute top-1 right-1 p-1 bg-[#1e1e1e] text-red-500 rounded-full text-xl opacity-0 group-hover:opacity-100 transition hover:scale-110"
                      title="Delete video"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRecentVideo(video.id);
                      }}
                    />

                    <FaPlayCircle className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/80 text-4xl group-hover:text-white transition" />
                  </div>

                  <p
                    className="text-xs text-gray-400 truncate max-w-full px-1"
                    title={video.name}
                  >
                    {video.name}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isShowProcessedVideo && (
        <VideoOutputModal setIsShowProcessedVideo={setIsShowProcessedVideo} />
      )}
    </div>
  );
}

export default RecentVideos;
