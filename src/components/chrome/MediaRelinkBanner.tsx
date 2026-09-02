"use client";

/**
 * MediaRelinkBanner — shown when a resumed project has clips/images whose
 * source files aren't linked yet (see restoreProjectMedia.ts and
 * useProjectAutosave.ts: media is never uploaded, only the file names are
 * saved, so a project reopened on a fresh session has to re-link the real
 * files before playback works).
 *
 * Most of the time there's nothing to do here: useProjectMedia
 * auto-relinks every file whose handle the browser still has permission
 * for, and this banner never even shows. It only appears when the browser
 * dropped the permission grant (one "Reconnect media" click re-grants all)
 * or a file was moved/renamed/deleted ("Locate files" to re-pick).
 */
import { useEffect } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { useProjectMedia } from "../../hooks/useProjectMedia";
import { pickMediaFiles } from "../../utils/pickMediaFiles";
import { restoreProjectMedia } from "../../utils/restoreProjectMedia";
import { FolderInput, TriangleAlert } from "@/utils/icons";

export default function MediaRelinkBanner() {
  const {
    missingMediaNames, setMissingMediaNames,
    clipsDetails, setClipsDetails,
    imagesDetails, setImagesDetails,
    setVideos,
  } = useAppDetailsContext();
  const media = useProjectMedia();

  // Whenever the set of linked files changes, re-match anything still
  // missing against it by filename. Idempotent, and the ref-stable
  // setMissingMediaNames below keeps it from looping.
  useEffect(() => {
    if (missingMediaNames.length === 0) return;
    const canResolveSome = missingMediaNames.some((n) => media.files.has(n));
    if (!canResolveSome) return;

    const savedClips = clipsDetails.map(({ src: _s, ...rest }) => rest);
    const savedImages = imagesDetails.map(({ src: _s, image: _i, ...rest }) => rest);
    const result = restoreProjectMedia(savedClips, savedImages, media.files);

    // A bg-removed clip's src comes from useBgRemovedRestore, not from
    // re-matching its original file — don't let this re-match blank it.
    setClipsDetails(result.clips.map((rc) => {
      if (!rc.bgRemoved?.assetId) return rc;
      const prev = clipsDetails.find((c) => c.id === rc.id);
      return prev?.src ? { ...rc, src: prev.src } : rc;
    }));
    setImagesDetails(result.images);
    if (result.videos.length > 0) {
      setVideos((prev) => {
        const byName = new Map(prev.map((v) => [v.name, v]));
        result.videos.forEach((v) => byName.set(v.name, v));
        return Array.from(byName.values());
      });
    }
    setMissingMediaNames((prev) =>
      prev.length === result.missingNames.length && prev.every((n, i) => n === result.missingNames[i])
        ? prev
        : result.missingNames,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.files, missingMediaNames]);

  if (missingMediaNames.length === 0) return null;

  const needsReconnect = media.needsPermission.length > 0;
  const locateFiles = async () => {
    const picked = await pickMediaFiles();
    if (picked.length > 0) await media.registerFiles(picked);
  };

  return (
    <div className="flex flex-col gap-1.5 px-4 py-2 bg-warning/10 border-b border-warning/25 flex-shrink-0">
      <div className="flex items-center gap-2.5">
        <TriangleAlert size={14} className="text-warning flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-ink-secondary">
            <strong className="text-ink-primary">{missingMediaNames.length}</strong> media file
            {missingMediaNames.length !== 1 ? "s" : ""} from this project{" "}
            {missingMediaNames.length !== 1 ? "aren't" : "isn't"} linked yet — timing and layout are intact,
            but video won't play until {missingMediaNames.length !== 1 ? "they're" : "it's"} relinked.
          </p>
          <p className="text-[11px] text-ink-faint mt-0.5 truncate" title={missingMediaNames.join(", ")}>
            Looking for: <span className="font-mono">{missingMediaNames.join(", ")}</span>
          </p>
        </div>
        {needsReconnect ? (
          <button
            onClick={media.reconnect}
            disabled={media.reconnecting}
            className="flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-warning/20 text-warning hover:bg-warning/30 transition-colors flex-shrink-0 disabled:opacity-60"
          >
            <FolderInput size={12} />
            {media.reconnecting ? "Reconnecting…" : "Reconnect media"}
          </button>
        ) : (
          <button
            onClick={locateFiles}
            className="flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-warning/20 text-warning hover:bg-warning/30 transition-colors flex-shrink-0"
          >
            <FolderInput size={12} />
            Locate files
          </button>
        )}
      </div>
    </div>
  );
}
