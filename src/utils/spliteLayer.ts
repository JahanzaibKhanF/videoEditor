import { toast } from "react-toastify";
import { v4 as uuidv4 } from "uuid";
import { AudioDetails, ClipDetails } from "../types/types";
import { hasSpeedRamp, splitSpeedAtFraction } from "./speedRamp";

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

  // SPEED-RAMP CONTINUITY FIX: without this, both halves below would
  // inherit `original.speed` (the same atFraction-keyed ramp array)
  // completely unchanged via the `...original` spread — and since
  // atFraction is relative to each clip's OWN on-timeline duration (see
  // speedRamp.ts), that means both halves would independently replay the
  // ENTIRE original ramp curve within their own shorter span, instead of
  // each picking up its correct slice of one continuous ramp. Only matters
  // for actual ramp arrays; a plain constant speed number is unaffected.
  const outputDuration = Math.max(0.0001, ep - sp);
  const fracSplit = (currentTime - sp) / outputDuration;
  const [leftSpeed, rightSpeed] = hasSpeedRamp(original)
    ? splitSpeedAtFraction(original.speed, fracSplit)
    : [original.speed, original.speed];

  const leftClip: ClipDetails = {
    ...original,
    endPosition: currentTime,
    endTime: splitSourceTime,
    speed: leftSpeed,
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
    speed: rightSpeed,
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
  //
  // BUG THIS FIXES: this used to only act when `currentTime` fell strictly
  // *inside the audio's own* startTime..endTime. That's usually true (audio
  // is created 1:1 with its clip's startPosition/endPosition — see
  // addClipToTimeline.ts), but AudioRangeSlider also lets someone drag an
  // audio chip independently of its clip, so the two can legitimately drift
  // apart. Whenever they had, the check silently failed and did NOTHING —
  // the single audio entry stayed attached to the LEFT clip's id no matter
  // which side of the cut it actually belonged on. That's exactly "the
  // clip stays on the same line but not its audio": if a later drag then
  // moved the RIGHT clip to a different track, its audio (still tagged
  // with the LEFT clip's id) stayed behind, because track lookup is by
  // clipId (see VideoClipsRangeSlider.tsx). Now every case is handled
  // explicitly, so the audio is always re-tagged onto whichever clip id it
  // actually falls under after the cut.
  const originalAudio = audioDetails.find(a => a.clipId === original.id);
  if (originalAudio) {
    if (currentTime <= originalAudio.startTime) {
      // The audio only starts after the cut — it belongs entirely to the
      // right-hand segment. Re-tag it rather than leaving it pointing at
      // the left clip's id.
      setAudioDetails(prev => prev.map(a =>
        a.id === originalAudio.id ? { ...a, clipId: rightId } : a
      ));
    } else if (currentTime >= originalAudio.endTime) {
      // The audio ends before the cut — it already belongs entirely to the
      // left-hand segment (which kept the original id), nothing to do.
    } else {
      // The cut falls inside the audio's own range — split it the same way
      // the clip itself was split.
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
  }


};