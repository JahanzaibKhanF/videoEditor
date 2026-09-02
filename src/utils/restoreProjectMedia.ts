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
    // A clip with AI background removal applied doesn't play from its
    // original file — it plays from a transparent WebM that
    // useBgRemovedRestore rehydrates separately (local cache / Cloudinary).
    // Leave src empty for it to fill, and never list its source file as
    // "missing" — relinking the original wouldn't help.
    if ((c as ClipDetails).bgRemoved?.assetId) {
      return { ...c, src: "" } as ClipDetails;
    }
    // sourceFileName is the real filename on disk and what a relinked file
    // can actually match — `video` is only ever an internal synthetic id
    // ("video{timestamp}_{index}") and can never equal a real file's name.
    // Falling back to `video` only matters for projects saved before this
    // field existed; those will still need one manual re-pick since their
    // saved data never recorded a real filename to match against at all.
    const matchKey = c.sourceFileName ?? c.video;
    const file = filesByName.get(matchKey);
    if (!file) {
      missing.add(matchKey);
      return { ...c, src: "" };
    }
    if (!videosByName.has(c.video)) {
      videosByName.set(c.video, { video: file, name: c.video });
    }
    return { ...c, src: URL.createObjectURL(file) };
  });

  const images: ImageDetails[] = savedImages.map((img) => {
    const matchKey = img.sourceFileName ?? img.id;
    const file = filesByName.get(matchKey);
    if (!file) {
      missing.add(matchKey);
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
