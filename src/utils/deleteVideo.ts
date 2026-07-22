import { ClipDetails } from "../types/types";

export const deleteVideo = ({
  video,
  setVideos,
  setClipsDetails,
  setTotalTime,
}: {
  video: { video: File; name: string };
  setVideos: React.Dispatch<
    React.SetStateAction<Array<{ video: File; name: string }>>
  >;
  setClipsDetails: React.Dispatch<React.SetStateAction<Array<ClipDetails>>>;
  setTotalTime: React.Dispatch<React.SetStateAction<number>>;
}) => {
  setVideos((prev) => prev.filter((v) => v.name !== video.name));

  setClipsDetails((prev) => {
    const filtered = prev.filter((clip) => clip.name !== video.name);

    const newTotal = filtered.reduce(
      (max, clip) => Math.max(max, clip.endPosition ?? 0),
      0
    );
    setTotalTime(newTotal);

    return filtered;
  });
};
