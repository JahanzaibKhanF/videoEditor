import { ClipDetails, ImageDetails } from "../types/types";

/**
 * Rehydrates saved project metadata (clips/images minus their `src`/`image`,
 * since blob URLs and File objects never survive a save — see
 * useProjectAutosave.ts) against a name → File lookup built from the
 * user's relinked local media folder.
 *
 * Anything whose name isn't found in `filesByName` is still returned (so
 * its timing/position isn't lost) but with an empty `src` — Video.tsx /
 * CompositorCanvas treat that as "nothing to draw for now" rather than
 * crashing, and it'll show up correctly the moment the right folder is
 * linked and the project is reopened.
 */
export interface RestoreResult {
  clips: ClipDetails[];
  images: ImageDetails[];
  videos: { video: File; name: string }[];
  missingNames: string[];
}

export function restoreProjectMedia(
  savedClips: Array<Omit<ClipDetails, "src">>,
  savedImages: Array<Omit<ImageDetails, "src" | "image">>,
  filesByName: Map<string, File>
): RestoreResult {
  const missing = new Set<string>();
  const videosByName = new Map<string, { video: File; name: string }>();

  const clips: ClipDetails[] = savedClips.map((c) => {
    const file = filesByName.get(c.video);
    if (!file) {
      missing.add(c.video);
      return { ...c, src: "" };
    }
    if (!videosByName.has(c.video)) {
      videosByName.set(c.video, { video: file, name: c.video });
    }
    return { ...c, src: URL.createObjectURL(file) };
  });

  const images: ImageDetails[] = savedImages.map((img) => {
    // Images are matched by id since there's no separate name field —
    // callers that saved a `sourceName` in the future can extend this.
    const file = filesByName.get((img as { sourceName?: string }).sourceName ?? "");
    if (!file) {
      missing.add((img as { sourceName?: string }).sourceName ?? img.id);
      return { ...img, src: "", image: new File([], "missing") };
    }
    return { ...img, src: URL.createObjectURL(file), image: file };
  });

  return {
    clips,
    images,
    videos: Array.from(videosByName.values()),
    missingNames: Array.from(missing),
  };
}
