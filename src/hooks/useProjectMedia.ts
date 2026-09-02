"use client";

/**
 * useProjectMedia — keeps the current project's local media files linked.
 *
 * Replaces the old "link a folder" flow (useLocalMediaFolder). There is no
 * folder anymore: a project just remembers the actual files it uses via
 * persisted `FileSystemFileHandle`s (see mediaHandleStore.ts). On load this
 * hook automatically turns every still-granted handle back into a `File`
 * with zero clicks; anything the browser needs to re-prompt for is exposed
 * as `needsPermission` so the relink banner can offer a single "Reconnect
 * media" button.
 *
 * State lives in ONE module-level store read through `useSyncExternalStore`
 * so every call site (MediaPanel + MediaRelinkBanner) always sees the same
 * thing — a file linked from one is instantly visible to the other, no
 * remount required.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAppDetailsContext } from "../context/useAppContext";
import {
  resolveProjectMedia,
  putStoredHandle,
} from "../utils/mediaHandleStore";

function keyFor(projectId: string | null): string {
  return `media:${projectId ?? "untitled"}`;
}

interface MediaStore {
  supported: boolean;
  /** name → File, ready to use right now. */
  files: Map<string, File>;
  /** filenames with a saved handle that needs one permission click. */
  needsPermission: string[];
  /** filenames with no usable handle (moved/deleted/never saved). */
  unavailable: string[];
  reconnecting: boolean;
  /** which project key `files`/`needsPermission`/`unavailable` reflect. */
  loadedForKey: string | null;
}

let store: MediaStore = {
  supported: false,
  files: new Map(),
  needsPermission: [],
  unavailable: [],
  reconnecting: false,
  loadedForKey: null,
};

const listeners = new Set<() => void>();

function setStore(partial: Partial<MediaStore>) {
  store = { ...store, ...partial };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): MediaStore {
  return store;
}

async function autoResolve(projectId: string | null): Promise<void> {
  const key = keyFor(projectId);
  // Mark the key as loaded up front so two hook instances mounting at once
  // don't both kick off the same IndexedDB round trip.
  setStore({ loadedForKey: key });
  try {
    const res = await resolveProjectMedia(projectId, { request: false });
    setStore({
      files: res.files,
      needsPermission: res.needsPermission,
      unavailable: res.unavailable,
    });
  } catch {
    setStore({ files: new Map(), needsPermission: [], unavailable: [] });
  }
}

export interface UseProjectMediaResult {
  supported: boolean;
  files: Map<string, File>;
  needsPermission: string[];
  unavailable: string[];
  reconnecting: boolean;
  /** User-gesture path: re-prompt for every handle sitting at "prompt". */
  reconnect: () => Promise<void>;
  /** Persist freshly-picked files (and their handles) for auto-relink later. */
  registerFiles: (entries: { file: File; handle?: FileSystemFileHandle }[]) => Promise<void>;
}

export function useProjectMedia(): UseProjectMediaResult {
  const { resumedProjectId } = useAppDetailsContext();
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (typeof window !== "undefined" && !!window.showOpenFilePicker && !store.supported) {
      setStore({ supported: true });
    }
  }, []);

  // Auto-relink whichever project is active. Guarded by `loadedForKey` so a
  // second component mounting this hook doesn't redo the work.
  useEffect(() => {
    if (store.loadedForKey === keyFor(resumedProjectId)) return;
    autoResolve(resumedProjectId);
  }, [resumedProjectId]);

  const reconnect = useCallback(async () => {
    setStore({ reconnecting: true });
    try {
      const res = await resolveProjectMedia(resumedProjectId, { request: true });
      setStore({
        files: res.files,
        needsPermission: res.needsPermission,
        unavailable: res.unavailable,
      });
    } finally {
      setStore({ reconnecting: false });
    }
  }, [resumedProjectId]);

  const registerFiles = useCallback(
    async (entries: { file: File; handle?: FileSystemFileHandle }[]) => {
      const nextFiles = new Map(store.files);
      for (const { file, handle } of entries) {
        nextFiles.set(file.name, file);
        if (handle) await putStoredHandle(resumedProjectId, file.name, handle);
      }
      setStore({
        files: nextFiles,
        needsPermission: store.needsPermission.filter((n) => !nextFiles.has(n)),
        unavailable: store.unavailable.filter((n) => !nextFiles.has(n)),
      });
    },
    [resumedProjectId],
  );

  return {
    supported: state.supported,
    files: state.files,
    needsPermission: state.needsPermission,
    unavailable: state.unavailable,
    reconnecting: state.reconnecting,
    reconnect,
    registerFiles,
  };
}
