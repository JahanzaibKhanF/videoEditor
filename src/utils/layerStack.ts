import { ClipDetails, ImageDetails, TextDetails, BlurDetails } from "../types/types";

export type LayerKind = "video" | "image" | "text" | "blur";

export interface StackEntry {
  kind: LayerKind;
  /** Effective zIndex used to sort — same "lower = frontmost" convention as compositeFrame.ts. */
  z: number;
  /** Set when kind === "video": the track id (clip.zIndex) this entry represents. */
  trackZ?: number;
  /** Set when kind !== "video": the individual image/text/blur's own id. */
  id?: string;
}

export interface StackRun {
  kind: LayerKind;
  entries: StackEntry[];
}

/**
 * Builds ONE merged, z-sorted list spanning every layer type — the same
 * merge compositeFrame.ts does for actual drawing (see MergedLayer there).
 * Video clips are collapsed to one entry per TRACK (matching
 * VideoClipsRangeSlider's own track grouping — several non-overlapping
 * clips can share a track/zIndex).
 *
 * Sorted ascending by z, i.e. LOWEST zIndex (frontmost, drawn on top) comes
 * FIRST — so rendering this list top-to-bottom puts the frontmost layer at
 * the top of the timeline, exactly matching Adobe After Effects' layer
 * panel convention and, critically, exactly matching what's actually drawn
 * on screen (previously the visible block order — video/image/text/blur —
 * was controlled by a totally separate `layerOrder` state that had no
 * effect on the real per-item zIndex compositing, so the timeline could
 * show one stacking order while the canvas showed another).
 */
export function buildMergedEntries(
  clips: ClipDetails[],
  images: ImageDetails[],
  texts: TextDetails[],
  blurs: BlurDetails[],
): StackEntry[] {
  const trackZs = Array.from(new Set(clips.map(c => c.zIndex ?? 0)));
  const entries: StackEntry[] = [
    ...trackZs.map(z => ({ kind: "video" as const, z, trackZ: z })),
    ...images.map(i => ({ kind: "image" as const, z: i.zIndex ?? 0, id: i.id })),
    ...texts.map(t => ({ kind: "text" as const, z: t.zIndex ?? 0, id: t.id })),
    ...blurs.map(b => ({ kind: "blur" as const, z: b.zIndex ?? 0, id: b.id })),
  ];
  return entries.sort((a, b) => a.z - b.z);
}

/**
 * Partitions the merged list into maximal runs of consecutive same-type
 * entries — e.g. [image, image, video, blur, video] becomes 4 runs:
 * [image,image] [video] [blur] [video]. Each run is rendered by that type's
 * existing (self-contained, drag-capable) component, filtered down to just
 * that run's items, so a layer type can appear in the stack more than once
 * — an image can sit strictly between two video tracks, a blur strictly
 * between two images, etc. — while still reusing each component's own
 * drag/resize/select logic unchanged.
 */
export function groupIntoRuns(entries: StackEntry[]): StackRun[] {
  const runs: StackRun[] = [];
  for (const e of entries) {
    const last = runs[runs.length - 1];
    if (last && last.kind === e.kind) last.entries.push(e);
    else runs.push({ kind: e.kind, entries: [e] });
  }
  return runs;
}