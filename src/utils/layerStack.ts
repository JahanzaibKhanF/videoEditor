import { ClipDetails, ImageDetails, TextDetails, BlurDetails, ShapeDetails, BrushDetails } from "../types/types";

export type LayerKind = "video" | "image" | "text" | "blur" | "shape" | "brush";

export interface StackEntry {
  kind: LayerKind;
  /** Effective zIndex used to sort — same "lower = frontmost" convention as compositeFrame.ts. */
  z: number;
  /** Set when kind === "video" or "text": the track id (zIndex) this entry represents — several non-overlapping items can share one track/row. */
  trackZ?: number;
  /** Set when kind is a single-item-per-row type: the individual image/blur/shape/brush's own id. */
  id?: string;
}

export interface StackRun {
  kind: LayerKind;
  entries: StackEntry[];
}

/**
 * Builds ONE merged, z-sorted list spanning every layer type — the same
 * merge compositeFrame.ts does for actual drawing (see MergedLayer there).
 * Video clips AND text layers are each collapsed to one entry per TRACK
 * (matching VideoClipsRangeSlider's / TextRangeSlider's own track grouping —
 * several non-overlapping clips, or captions, can share a track/zIndex,
 * e.g. auto-generated captions all sitting on the same row since they're
 * sequential and never overlap). Image/blur/shape/brush stay one row per
 * item — sharing a row isn't a thing anyone asked those layer types to do,
 * and it'd need the same track/collision machinery text just got.
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
  shapes: ShapeDetails[] = [],
  brushes: BrushDetails[] = [],
): StackEntry[] {
  const trackZs = Array.from(new Set(clips.map(c => c.zIndex ?? 0)));
  const textZs = Array.from(new Set(texts.map(t => t.zIndex ?? 0)));
  const entries: StackEntry[] = [
    ...trackZs.map(z => ({ kind: "video" as const, z, trackZ: z })),
    ...images.map(i => ({ kind: "image" as const, z: i.zIndex ?? 0, id: i.id })),
    ...textZs.map(z => ({ kind: "text" as const, z, trackZ: z })),
    ...blurs.map(b => ({ kind: "blur" as const, z: b.zIndex ?? 0, id: b.id })),
    ...shapes.map(s => ({ kind: "shape" as const, z: s.zIndex ?? 0, id: s.id })),
    ...brushes.map(b => ({ kind: "brush" as const, z: b.zIndex ?? 0, id: b.id })),
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