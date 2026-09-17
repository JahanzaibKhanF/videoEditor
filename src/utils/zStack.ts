/**
 * zStack — shared helpers for the UNIFIED z-index stack that video tracks,
 * images, text, and blur regions all live in together (see
 * compositeFrame.ts). Every layer type used to have its own hand-copied
 * version of this exact math (moveClipToTrack/moveImageStack/
 * moveTextStack/moveBlurStack) which was easy for one copy to drift from
 * the others. Centralizing it here means "up"/"down" behaves identically
 * everywhere, and a layer moving through the stack always lands on a
 * fractional zIndex strictly between its two neighbours (or one past the
 * current front/back) so it NEVER collides with — or silently reassigns —
 * another layer's zIndex as a side effect.
 *
 * Convention (matches every layer type's existing comments): LOWER zIndex
 * = FRONTMOST (drawn last / on top). "up" moves toward the front (lower
 * zIndex), "down" moves toward the back (higher zIndex).
 */

/**
 * Given the current zIndex of the layer being moved and every OTHER layer's
 * zIndex in the whole stack (video tracks + images + text + blur, minus the
 * one being moved), return the new zIndex that lands it one step toward the
 * front ("up") or back ("down").
 */
export function computeAdjacentZ(dir: "up" | "down", curZ: number, othersZ: number[]): number {
  const zs = Array.from(new Set([...othersZ, curZ])).sort((a, b) => a - b);
  const idx = zs.indexOf(curZ);

  if (dir === "up") {
    if (idx === 0) return zs[idx] - 1;
    const cand = zs[idx - 1];
    const beyond = idx - 2 >= 0 ? zs[idx - 2] : cand - 1;
    return (cand + beyond) / 2;
  } else {
    if (idx === zs.length - 1) return zs[idx] + 1;
    const cand = zs[idx + 1];
    const beyond = idx + 2 < zs.length ? zs[idx + 2] : cand + 1;
    return (cand + beyond) / 2;
  }
}

/**
 * zIndex to give a BRAND NEW layer (freshly imported image, newly added
 * blur/text region) so it starts life at the very FRONT of the whole
 * stack — matching every other NLE/design tool's "new layer goes on top"
 * default — instead of implicitly landing at zIndex 0, which could tie
 * with (or land behind) whatever's already been manually reordered in the
 * stack, producing an apparently-random stacking position.
 */
export function frontmostZ(allExistingZ: number[]): number {
  if (allExistingZ.length === 0) return 0;
  return Math.min(...allExistingZ) - 1;
}

/**
 * Same track-resolution math as VideoClipsRangeSlider.tsx's own
 * `resolveTargetTrack` (kept as a separate, generic copy rather than a
 * shared import — video's version is delicate, already-proven code, not
 * worth the regression risk of refactoring it just to dedupe this), for any
 * OTHER layer type that also wants "multiple non-overlapping items share a
 * track/row" behavior (see TextRangeSlider.tsx). `others` is every other
 * item of the SAME layer type (never the one being moved); `otherLayerZs`
 * is every other layer TYPE's zIndex, so a track move can also land in a
 * slot between/beyond those (shared unified stack).
 */
export function resolveTargetTrackGeneric(
  dir: "up" | "down",
  curZ: number,
  start: number,
  end: number,
  others: { zIndex?: number; start: number; end: number }[],
  otherLayerZs: number[] = [],
): number {
  const tracks = Array.from(new Set([...others.map(o => o.zIndex ?? 0), curZ])).sort((a, b) => a - b);
  const idx = tracks.indexOf(curZ);
  const overlaps = (z: number) => others.some(o => (o.zIndex ?? 0) === z && start < o.end && end > o.start);
  if (dir === "down") {
    if (idx < tracks.length - 1) {
      const cand = tracks[idx + 1];
      if (!overlaps(cand)) return cand;
      const beyond = idx + 2 < tracks.length ? tracks[idx + 2] : cand + 1;
      return (cand + beyond) / 2;
    }
    return computeAdjacentZ("down", curZ, [...others.map(o => o.zIndex ?? 0), ...otherLayerZs]);
  } else {
    if (idx > 0) {
      const cand = tracks[idx - 1];
      if (!overlaps(cand)) return cand;
      const beyond = idx - 2 >= 0 ? tracks[idx - 2] : cand - 1;
      return (cand + beyond) / 2;
    }
    return computeAdjacentZ("up", curZ, [...others.map(o => o.zIndex ?? 0), ...otherLayerZs]);
  }
}