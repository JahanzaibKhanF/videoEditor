import { toast } from "react-toastify";
import { v4 as uuidv4 } from "uuid";
import { AudioDetails, ClipDetails } from "../types/types";

// Minimum distance (in timeline seconds) the playhead must be from either
// edge of a clip for a split to be allowed — splitting right at an edge
// would just produce a zero-length segment.
const MIN_SEGMENT = 0.05;

/**
 * Splits a clip at the current playhead position into two clips.
 *
 * TRACK INTEGRITY FIX: both resulting segments keep the SAME `zIndex` as
 * the original clip (zIndex doubles as the track id — see
 * VideoClipsRangeSlider.tsx). Previously this function didn't exist at all
 * (the file only re-exported addClipToTimeline under the wrong name), so
 * nothing enforced this — any from-scratch reimplementation that pushed the
 * new half onto `clipsDetails` without explicitly carrying `zIndex` over
 * would default it to whatever a fresh clip gets (0 / a brand-new track),
 * which is exactly the "second half jumps to a different track" bug. Both
 * halves below explicitly inherit `original.zIndex`, and only a manual
 * drag (VideoClipsRangeSlider's moveClipToTrack) ever changes it again.
 *
 * @param selectedClipId  The clip to split, if the user has one selected.
 *   May be null/stale (e.g. the selection doesn't actually sit under the
 *   playhead) — in that case we fall back to searching every track for
 *   whichever single clip the playhead is currently over.
 */
export const spliteLayer = (
  selectedClipId: string | null,
  clipsDetails: Array<ClipDetails>,
  setClipsDetails: React.Dispatch<React.SetStateAction<Array<ClipDetails>>>,
  currentTime: number,
  audioDetails: Array<AudioDetails>,
  setAudioDetails: React.Dispatch<React.SetStateAction<Array<AudioDetails>>>
): void => {
  // Every clip (on any track) whose body genuinely contains the playhead,
  // with enough margin on both sides to produce two real segments.
  const candidates = clipsDetails.filter(c => {
    const sp = c.startPosition ?? 0;
    const ep = c.endPosition ?? 0;
    return currentTime > sp + MIN_SEGMENT && currentTime < ep - MIN_SEGMENT;
  });

  let target: ClipDetails | undefined =
    (selectedClipId ? candidates.find(c => c.id === selectedClipId) : undefined);

  if (!target) {
    if (candidates.length === 1) {
      target = candidates[0];
    } else if (candidates.length === 0) {
      toast.error("Move the playhead over a clip to split it.");
      return;
    } else {
      // Multiple tracks overlap the playhead and nothing usable was
      // selected — ask rather than silently guessing which track's clip
      // the user meant, since that guess is exactly what could land the
      // cut on the wrong track.
      toast.error("Select the clip you want to split first (multiple clips are under the playhead).");
      return;
    }
  }

  const original = target;
  const sp = original.startPosition ?? 0;
  const ep = original.endPosition ?? 0;
  const st = original.startTime ?? 0;
  const et = original.endTime ?? original.duration ?? 0;

  // 1:1 mapping between timeline seconds and source seconds — the same
  // model resize-left/resize-right use in VideoClipsRangeSlider, so a clip
  // split right where a manual trim would have landed produces identical
  // startTime/endTime math.
  const splitSourceTime = st + (currentTime - sp);

  const rightId = uuidv4();

  const leftClip: ClipDetails = {
    ...original,
    endPosition: currentTime,
    endTime: splitSourceTime,
    // A hard cut shouldn't inherit the original clip's outgoing transition
    // into what is now its own right-hand half — that transition (if any)
    // belongs on the new right segment, which is still the thing that
    // borders whatever came after the original clip.
    transition: "none",
  };

  const rightClip: ClipDetails = {
    ...original,
    id: rightId,
    startPosition: currentTime,
    endPosition: ep,
    startTime: splitSourceTime,
    endTime: et,
    // SAME TRACK as the original — see function doc comment above.
    zIndex: original.zIndex,
  };

  setClipsDetails(prev => {
    const idx = prev.findIndex(c => c.id === original.id);
    if (idx === -1) return prev;
    const next = [...prev];
    next.splice(idx, 1, leftClip, rightClip);
    return next;
  });

  // Carry the paired audio along, split at the same playhead position, so
  // the right-hand video segment doesn't end up silently unlinked from any
  // audio.
  const originalAudio = audioDetails.find(a => a.clipId === original.id);
  if (originalAudio && currentTime > originalAudio.startTime && currentTime < originalAudio.endTime) {
    const rightAudio: AudioDetails = {
      ...originalAudio,
      id: uuidv4(),
      clipId: rightId,
      startTime: currentTime,
    };
    setAudioDetails(prev => {
      const idx = prev.findIndex(a => a.id === originalAudio.id);
      if (idx === -1) return [...prev, rightAudio];
      const next = [...prev];
      next[idx] = { ...next[idx], endTime: currentTime };
      next.splice(idx + 1, 0, rightAudio);
      return next;
    });
  }

  toast.success("Clip split.");
};