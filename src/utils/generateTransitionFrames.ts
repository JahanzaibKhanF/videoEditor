import { Dispatch, SetStateAction } from "react";
import { ClipDetails, TransitionFrame } from "../types/types";

export const generateTransitionFrames = async (
  clipsDetails: Array<ClipDetails>,
  setTransitionsFrames: Dispatch<SetStateAction<Array<TransitionFrame>>>
) => {
  const updatedFrames: TransitionFrame[] = [];

  for (let i = 0; i < clipsDetails.length - 1; i++) {
    const currentClip = clipsDetails[i];
    const nextClip = clipsDetails[i + 1];

    if (currentClip.transition !== "none") {
      const result = await captureFrameFromVideo(
        currentClip.src,
        nextClip.startTime ?? 0,
        currentClip.id
      );

      if (result) {
        updatedFrames.push({
          id: currentClip.id,
          frame: result.file,
          frameSrc: result.src,
        });
      }
    }
  }

  setTransitionsFrames(updatedFrames);
};

const captureFrameFromVideo = (
  videoSrc: string,
  time: number,
  clipId: string
): Promise<{ file: File; src: string } | null> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.src = videoSrc;
    video.crossOrigin = "anonymous";
    video.currentTime = time + 0.01;

    video.onloadeddata = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `${clipId}-transition.jpg`, {
            type: "image/jpeg",
          });
          const src = URL.createObjectURL(blob);
          resolve({ file, src });
        } else {
          resolve(null);
        }
      }, "image/jpeg");
    };

    video.onerror = () => resolve(null);
  });
};
