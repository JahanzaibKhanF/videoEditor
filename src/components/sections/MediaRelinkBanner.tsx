"use client";

/**
 * MediaRelinkBanner — shown when a resumed project has clips/images whose
 * source files aren't found in the currently-linked local media folder
 * (see restoreProjectMedia.ts and useProjectAutosave.ts for why: media is
 * never uploaded, only filenames are saved, so reopening a project on a
 * fresh session needs the same folder relinked before playback works).
 *
 * Re-attempts the match automatically whenever the linked folder's file
 * list changes — link once, everything that matches by name snaps back
 * into place without any per-clip manual picking.
 */
import { useEffect, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { useLocalMediaFolder } from "../../hooks/useLocalMediaFolder";
import { restoreProjectMedia } from "../../utils/restoreProjectMedia";
import { FolderInput, TriangleAlert, X } from "@/utils/icons";

export default function MediaRelinkBanner() {
  const {
    missingMediaNames, setMissingMediaNames,
    clipsDetails, setClipsDetails,
    imagesDetails, setImagesDetails,
    setVideos,
  } = useAppDetailsContext();
  const localFolder = useLocalMediaFolder();
  const [dismissed, setDismissed] = useState(false);
  const [matching, setMatching] = useState(false);

  // Whenever the linked folder's contents change, try to re-match
  // whatever's still missing against it by filename.
  useEffect(() => {
    if (missingMediaNames.length === 0) return;
    if (localFolder.permissionState !== "granted" || localFolder.files.length === 0) return;

    let cancelled = false;
    (async () => {
      setMatching(true);
      try {
        const filesByName = new Map<string, File>();
        for (const f of localFolder.files) {
          if (f.kind === "other") continue;
          filesByName.set(f.name, await f.getFile());
        }
        if (cancelled) return;

        const savedClips = clipsDetails.map(({ src: _s, ...rest }) => rest);
        const savedImages = imagesDetails.map(({ src: _s, image: _i, ...rest }) => rest);
        const result = restoreProjectMedia(savedClips, savedImages, filesByName);

        setClipsDetails(result.clips);
        setImagesDetails(result.images);
        if (result.videos.length > 0) {
          setVideos((prev) => {
            const byName = new Map(prev.map((v) => [v.name, v]));
            result.videos.forEach((v) => byName.set(v.name, v));
            return Array.from(byName.values());
          });
        }
        setMissingMediaNames(result.missingNames);
      } finally {
        if (!cancelled) setMatching(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localFolder.files, localFolder.permissionState]);

  if (missingMediaNames.length === 0 || dismissed) return null;

  return (
    <div className="flex items-center gap-2.5 px-4 py-2 bg-warning/10 border-b border-warning/25 flex-shrink-0">
      <TriangleAlert size={14} className="text-warning flex-shrink-0" />
      <p className="text-[12px] text-ink-secondary flex-1 min-w-0">
        <strong className="text-ink-primary">{missingMediaNames.length}</strong> media file
        {missingMediaNames.length !== 1 ? "s" : ""} from this project{" "}
        {missingMediaNames.length !== 1 ? "aren't" : "isn't"} linked yet — timing and layout are intact,
        but video won't play until you relink the original folder.
      </p>
      {localFolder.supported && (
        <button
          onClick={localFolder.folderName ? localFolder.reconnectFolder : localFolder.linkFolder}
          disabled={localFolder.linking || matching}
          className="flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-warning/20 text-warning hover:bg-warning/30 transition-colors flex-shrink-0 disabled:opacity-60"
        >
          <FolderInput size={12} />
          {localFolder.linking ? "Linking…" : matching ? "Matching…" : localFolder.folderName ? "Reconnect folder" : "Link media folder"}
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        className="w-6 h-6 rounded-full flex items-center justify-center text-ink-faint hover:bg-studio-hover transition-colors flex-shrink-0"
      >
        <X size={12} />
      </button>
    </div>
  );
}
