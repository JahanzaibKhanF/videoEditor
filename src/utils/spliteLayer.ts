import React from "react";
import { AudioDetails, ClipDetails } from "../types/types";
import { v4 as uuidv4 } from "uuid";

export const spliteLayer = (
  _videoRef: any,
  clipsDetails: Array<ClipDetails>,
  setClipsDetails: React.Dispatch<React.SetStateAction<Array<ClipDetails>>>,
  currentTime: number,
  audioDetails?: Array<AudioDetails>,
  setAudioDetails?: React.Dispatch<React.SetStateAction<Array<AudioDetails>>>
) => {
  // Find the clip being cut
  const clip = clipsDetails.find(
    c => currentTime > (c.startPosition ?? 0) && currentTime < (c.endPosition ?? 0)
  );
  if (!clip) return;

  const localTime = (clip.startTime ?? 0) + (currentTime - (clip.startPosition ?? 0));

  // Split the clip
  const secondClipId = uuidv4();

  setClipsDetails(prev => {
    const idx = prev.findIndex(c => c.id === clip.id);
    if (idx === -1) return prev;
    const updated = [...prev];

    updated[idx] = {
      ...updated[idx],
      endTime: localTime,
      endPosition: currentTime,
    };

    const second: ClipDetails = {
      ...updated[idx],
      id: secondClipId,
      startTime: localTime,
      endTime: clip.endTime,
      startPosition: currentTime,
      endPosition: clip.endPosition,
      transition: "none",
    };

    updated.splice(idx + 1, 0, second);
    return updated;
  });

  // Split matching audio track too
  if (audioDetails && setAudioDetails) {
    const audioTrack = audioDetails.find(a => a.clipId === clip.id);
    if (audioTrack && currentTime > audioTrack.startTime && currentTime < audioTrack.endTime) {
      setAudioDetails(prev => {
        const idx = prev.findIndex(a => a.clipId === clip.id);
        if (idx === -1) return prev;
        const updated = [...prev];

        // Trim first half
        updated[idx] = { ...updated[idx], endTime: currentTime };

        // Create second half
        const second: AudioDetails = {
          ...updated[idx],
          id: uuidv4(),
          clipId: secondClipId,
          startTime: currentTime,
          endTime: audioTrack.endTime,
        };

        updated.splice(idx + 1, 0, second);
        return updated;
      });
    }
  }
};
