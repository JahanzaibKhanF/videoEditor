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
  startAt,
}: {
  video: { video: File; name: string };
  clipsDetails: Array<ClipDetails>;
  setTotalTime: React.Dispatch<React.SetStateAction<number>>;
  setClipsDetails: React.Dispatch<React.SetStateAction<Array<ClipDetails>>>;
  setPrimaryVideoDimensions: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setAudioDetails?: React.Dispatch<React.SetStateAction<Array<AudioDetails>>>;
  // Explicit placement override. Callers importing MULTIPLE files in one
  // batch should compute this themselves and chain calls sequentially
  // (using the resolved end position returned below as the next file's
  // startAt) rather than relying on the `clipsDetails` snapshot, which is
  // captured once per call and goes stale the moment more than one clip is
  // being added in the same batch — every file would otherwise compute the
  // same "current last clip" position and land on top of each other instead
  // of stacking one after another. When omitted, falls back to the last
  // clip's end time from `clipsDetails` (correct for single-file imports).
  startAt?: number;
}): Promise<number> => {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(video.video);
    const videoEl = document.createElement("video");
    videoEl.preload = "metadata";
    videoEl.src = objectUrl;

    videoEl.onloadedmetadata = () => {
      const duration = videoEl.duration || 0;
      const width = videoEl.videoWidth || 0;
      const height = videoEl.videoHeight || 0;

      const maxEnd = startAt ?? clipsDetails.reduce(
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
        sourceFileName: video.video.name,
        x: 0,
        y: 0,
        scale: 1,
        width,
        height,
        // All sequentially-imported clips land on the SAME base track
        // (zIndex 0 = "Video 1") one after another in time, matching every
        // other NLE's default import behaviour. zIndex here doubles as the
        // clip's TRACK id (see VideoClipsRangeSlider.tsx) — clips only end
        // up on a different track when the user explicitly drags/moves one
        // there. Previously this was `clipsDetails.length`, which gave every
        // single imported clip its own unique "track" and was the root
        // cause of the timeline growing a brand-new row per clip (and per
        // split) instead of laying clips out along one row.
        zIndex: 0,
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
      resolve(maxEnd + duration);
    };

    videoEl.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      videoEl.remove();
      toast.error("Failed to load video metadata.");
      resolve(startAt ?? clipsDetails.reduce((max, clip) => Math.max(max, clip.endPosition ?? 0), 0));
    };
  });
};