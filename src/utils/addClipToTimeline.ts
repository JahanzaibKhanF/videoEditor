import { toast } from "react-toastify";
import { v4 as uuidv4 } from "uuid";
import { AudioDetails, ClipDetails } from "../types/types";

export const addClipToTimeline = ({
  video,
  clipsDetails,
  setTotalTime,
  setClipsDetails,
  setPrimaryVideoDimensions,
  setAudioDetails,
}: {
  video: { video: File; name: string };
  clipsDetails: Array<ClipDetails>;
  setTotalTime: React.Dispatch<React.SetStateAction<number>>;
  setClipsDetails: React.Dispatch<React.SetStateAction<Array<ClipDetails>>>;
  setPrimaryVideoDimensions: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setAudioDetails?: React.Dispatch<React.SetStateAction<Array<AudioDetails>>>;
}) => {
  const objectUrl = URL.createObjectURL(video.video);
  const videoEl = document.createElement("video");
  videoEl.preload = "metadata";
  videoEl.src = objectUrl;

  videoEl.onloadedmetadata = () => {
    const duration = videoEl.duration || 0;
    const width = videoEl.videoWidth || 0;
    const height = videoEl.videoHeight || 0;

    const maxEnd = clipsDetails.reduce(
      (max, clip) => Math.max(max, clip.endPosition ?? 0),
      0
    );

    if (clipsDetails.length === 0) {
      setPrimaryVideoDimensions({ width, height });
    }

    const clipId = uuidv4();

    const newClip: ClipDetails = {
      id: clipId,
      name: video.name,
      duration,
      startPosition: maxEnd,
      endPosition: maxEnd + duration,
      startTime: 0,
      endTime: duration,
      transition: "none",
      src: objectUrl,
      video: video.name,
      x: 0,
      y: 0,
      scale: 1,
      width,
      height,
      zIndex: clipsDetails.length, // stack video overlays by order added
    };

    setClipsDetails(prev => [...prev, newClip]);
    setTotalTime(prev => Math.max(prev, maxEnd + duration));

    // Create matching audio track entry
    if (setAudioDetails) {
      const audioEntry: AudioDetails = {
        id: uuidv4(),
        clipId,
        name: video.name,
        startTime: maxEnd,
        endTime: maxEnd + duration,
        volume: 1,
        muted: false,
      };
      setAudioDetails(prev => [...prev, audioEntry]);
    }

    videoEl.remove();
  };

  videoEl.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    videoEl.remove();
    toast.error("Failed to load video metadata.");
  };
};
