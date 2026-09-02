"use client";

/**
 * useProjectAutosave — debounced save of the current editor state to Neon
 * via /api/projects, closing the "no autosave wiring" gap from earlier
 * sessions.
 *
 * Scope decision: media itself is never uploaded (ClipFlow reads local
 * video files straight from disk via the File System Access API — the
 * per-file handles are persisted separately in mediaHandleStore.ts). So
 * this only persists metadata: clip positions/timing/transitions,
 * text/image/blur layers, layer order, and aspect ratio — plus the *names*
 * of the media files each clip/image referenced, so a resumed project
 * knows which files to relink. Blob URLs
 * (`src` on clips/images) and raw `File` objects are stripped before
 * saving since neither survives a page reload.
 *
 * Only runs when signed in — matches the existing opt-in auth model
 * (guests can edit fully, project saving is one of the account-only
 * features that nudges sign-in).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";
import { useAppDetailsContext } from "../context/useAppContext";
import { useAuth } from "../context/useAuthContext";
import { migrateUntitledHandles } from "../utils/mediaHandleStore";

export type AutosaveStatus = "signed-out" | "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DEBOUNCE_MS = 4000;
// When a save keeps failing (most commonly the free-tier project cap), back
// the retry cadence right off so we're not firing a doomed POST every few
// seconds while the person is still editing.
const AUTOSAVE_ERROR_DEBOUNCE_MS = 20000;
const PROJECT_LIMIT_TOAST_ID = "clipflow-project-limit";

export function useProjectAutosave() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    clipsDetails, textsDetails, imagesDetails, blursDetails, audioDetails, clipEffects,
    layerOrder, selectedAspectRatio, totalTime, fps, videos, resumedProjectId,
  } = useAppDetailsContext();

  const [projectId, setProjectId] = useState<string | null>(resumedProjectId);
  const [status, setStatus] = useState<AutosaveStatus>(user ? "idle" : "signed-out");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // True when the last create failed because the account is at its project
  // cap — surfaced in the header pill and as a sticky toast.
  const [limitReached, setLimitReached] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  const projectIdRef = useRef<string | null>(resumedProjectId);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);
  // A resumed project's id can arrive slightly after mount (it's set once
  // the GET /api/projects/[id] fetch in EditorWithSetup resolves) — pick it
  // up if we don't already have one.
  useEffect(() => {
    if (resumedProjectId && !projectIdRef.current) {
      setProjectId(resumedProjectId);
      projectIdRef.current = resumedProjectId;
    }
  }, [resumedProjectId]);

  const buildSnapshot = useCallback(() => ({
    clips: clipsDetails.map(({ src: _src, ...rest }) => rest),
    texts: textsDetails,
    images: imagesDetails.map(({ src: _src, image: _image, ...rest }) => rest),
    blurs: blursDetails,
    audio: audioDetails,
    clipEffects,
    layerOrder,
    aspectRatio: selectedAspectRatio,
    totalTime,
    fps,
    // Names only — used to prompt "relink these files" when a project is reopened.
    mediaNames: videos.map((v) => v.name),
  }), [clipsDetails, textsDetails, imagesDetails, blursDetails, audioDetails, clipEffects, layerOrder, selectedAspectRatio, totalTime, fps, videos]);

  const save = useCallback(async () => {
    if (!user || savingRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    try {
      const projectJson = buildSnapshot();
      const currentId = projectIdRef.current;

      if (!currentId) {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Untitled project",
            aspectRatio: selectedAspectRatio,
            projectJson,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const message = data.error ?? "Could not create project.";
          if (res.status === 403) {
            setLimitReached(true);
            // toastId dedupes, so repeated failed autosaves don't stack.
            toast.error(message, { toastId: PROJECT_LIMIT_TOAST_ID, autoClose: false });
          }
          throw new Error(message);
        }
        const data = await res.json();
        setLimitReached(false);
        toast.dismiss(PROJECT_LIMIT_TOAST_ID);
        setProjectId(data.project.id);
        migrateUntitledHandles(data.project.id);
        if (searchParams.get("project") !== data.project.id) {
          router.replace(`/?project=${data.project.id}`, { scroll: false });
        }
      } else {
        const res = await fetch(`/api/projects/${currentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aspectRatio: selectedAspectRatio, projectJson }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Could not save project.");
        }
      }
      setStatus("saved");
      setErrorMessage(null);
    } catch (err) {
      console.error("[useProjectAutosave]", err);
      setStatus("error");
      setErrorMessage((err as Error).message);
    } finally {
      savingRef.current = false;
    }
  }, [user, buildSnapshot, selectedAspectRatio]);

  // Debounced autosave whenever tracked editor state changes.
  useEffect(() => {
    if (!user) { setStatus("signed-out"); return; }

    const hasContent = clipsDetails.length > 0 || textsDetails.length > 0 || imagesDetails.length > 0;
    if (!hasContent) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = statusRef.current === "error" ? AUTOSAVE_ERROR_DEBOUNCE_MS : AUTOSAVE_DEBOUNCE_MS;
    timerRef.current = setTimeout(() => { save(); }, delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // Deliberately re-runs on every tracked field change, not just length —
    // position/timing/text edits should debounce-trigger a save too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipsDetails, textsDetails, imagesDetails, blursDetails, audioDetails, clipEffects, layerOrder, selectedAspectRatio, user, save]);

  // Save immediately when the tab is about to close, best-effort.
  useEffect(() => {
    const handler = () => { if (user && projectIdRef.current) save(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [user, save]);

  // A project was deleted elsewhere (RecentProjectsPanel) — if we were
  // blocked at the project cap, a slot is now free, so retry the create now
  // instead of waiting for the next edit.
  useEffect(() => {
    const onSlotFreed = () => {
      if (statusRef.current === "error" && !projectIdRef.current) {
        setLimitReached(false);
        save();
      }
    };
    window.addEventListener("clipflow:project-slot-freed", onSlotFreed);
    return () => window.removeEventListener("clipflow:project-slot-freed", onSlotFreed);
  }, [save]);

  return { projectId, status, saveNow: save, errorMessage, limitReached };
}
