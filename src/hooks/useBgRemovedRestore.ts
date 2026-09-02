"use client";

/**
 * useBgRemovedRestore — on reopening a project, re-applies AI background
 * removal to any clip that had it, with no re-processing.
 *
 * A `bgRemoved` clip comes out of restoreProjectMedia with an empty `src`
 * (see there). This hook fills it in:
 *   1. from the local IndexedDB copy (instant, offline) if present, else
 *   2. from the Cloudinary copy at `bgRemoved.url` — downloaded once into
 *      the local cache so step 1 wins next time.
 * If neither exists (different device, cache evicted, upload had failed)
 * the clip keeps its empty src; the Remove Background panel can re-run it.
 *
 * Also opportunistically cleans local cache entries whose clip no longer
 * exists in the project.
 */
import { useEffect, useRef } from "react";
import { useAppDetailsContext } from "../context/useAppContext";
import {
  getBgRemovedBlob, saveBgRemoved, listBgRemovedForProject, deleteBgRemoved,
} from "../utils/bgRemovedStore";

export function useBgRemovedRestore() {
  const { clipsDetails, setClipsDetails, resumedProjectId } = useAppDetailsContext();
  const resolvingRef = useRef<Set<string>>(new Set());

  // Stable signature of which assets need resolving — only changes when a
  // bgRemoved clip appears without a src, so clip edits don't re-trigger.
  const pending = clipsDetails
    .filter((c) => c.bgRemoved?.assetId && !c.src)
    .map((c) => c.bgRemoved!.assetId)
    .join(",");

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    const assetIds = pending.split(",");

    (async () => {
      for (const assetId of assetIds) {
        if (cancelled || resolvingRef.current.has(assetId)) continue;
        resolvingRef.current.add(assetId);

        const clip = clipsDetails.find((c) => c.bgRemoved?.assetId === assetId);
        if (!clip) { resolvingRef.current.delete(assetId); continue; }

        let src = "";
        const local = await getBgRemovedBlob(assetId);
        if (local) {
          src = URL.createObjectURL(local);
        } else if (clip.bgRemoved?.url) {
          try {
            const res = await fetch(clip.bgRemoved.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            await saveBgRemoved({ assetId, projectId: resumedProjectId, blob });
            src = URL.createObjectURL(blob);
          } catch (err) {
            // Couldn't pull it into a local blob (offline, CORS) — fall back
            // to streaming straight from the CDN URL.
            console.warn("[useBgRemovedRestore] using remote url for", assetId, err);
            src = clip.bgRemoved.url;
          }
        }

        if (src && !cancelled) {
          setClipsDetails((prev) =>
            prev.map((c) => (c.bgRemoved?.assetId === assetId ? { ...c, src } : c)),
          );
        }
        resolvingRef.current.delete(assetId);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, resumedProjectId]);

  // Drop local cache entries for clips that are no longer in this project.
  // Only entries older than a minute are eligible — a just-applied asset
  // whose `setClipsDetails` hasn't landed yet must not look like an orphan.
  useEffect(() => {
    if (!resumedProjectId || clipsDetails.length === 0) return;
    let cancelled = false;
    (async () => {
      const stored = await listBgRemovedForProject(resumedProjectId);
      if (cancelled || stored.length === 0) return;
      const live = new Set(
        clipsDetails.map((c) => c.bgRemoved?.assetId).filter(Boolean) as string[],
      );
      const cutoff = Date.now() - 60_000;
      const orphans = stored
        .filter((e) => !live.has(e.assetId) && e.createdAt < cutoff)
        .map((e) => e.assetId);
      if (orphans.length > 0) await deleteBgRemoved(orphans);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resumedProjectId,
    clipsDetails.map((c) => c.bgRemoved?.assetId ?? "").join(","),
  ]);
}
