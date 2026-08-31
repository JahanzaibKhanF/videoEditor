"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAppDetailsContext } from "../context/useAppContext";

// Minimal ambient types for the File System Access API — not yet in
// TypeScript's default DOM lib, so we declare just what we use.
declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker?: (options?: { multiple?: boolean; excludeAcceptAllOption?: boolean }) => Promise<FileSystemFileHandle[]>;
  }
}

const DB_NAME = "clipflow-fs-handles";
const STORE_NAME = "handles";
// Handles are now scoped PER PROJECT rather than one single global slot —
// each saved project remembers its own linked folder, so reopening project
// A doesn't ask you to relink the folder you last used for project B. New,
// not-yet-saved projects (no id assigned until the first autosave) share a
// single "untitled" slot, same as the old global behavior — there's no
// project id to scope by until it actually gets one.
function handleKeyFor(projectId: string | null): string {
  return `mediaFolder:${projectId ?? "untitled"}`;
}

/**
 * Called once from useProjectAutosave.ts the moment a brand-new project
 * gets assigned a real database id. Until that point, any folder linked
 * while working on it was saved under the shared "untitled" slot (there's
 * no project id to scope by before the project is ever saved) — without
 * this migration, reopening that project later (by its real id) would find
 * no saved handle at all and ask to relink from scratch, even though a
 * folder WAS already linked for it.
 */
export async function migrateLocalMediaHandleToProject(newProjectId: string): Promise<void> {
  try {
    const untitledHandle = await idbGet<FileSystemDirectoryHandle>(handleKeyFor(null));
    if (untitledHandle) {
      await idbSet(handleKeyFor(newProjectId), untitledHandle);
      // Deliberately NOT clearing the "untitled" slot — the next brand-new
      // project a person starts should still default to "probably the same
      // folder as last time" rather than asking to relink immediately too.
    }
  } catch {
    // Best-effort — worst case, the person just relinks manually once.
  }
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface LocalMediaFile {
  name: string;
  kind: "video" | "image" | "other";
  handle: FileSystemFileHandle;
  getFile: () => Promise<File>;
}

export interface UseLocalMediaFolderResult {
  supported: boolean;
  folderName: string | null;
  files: LocalMediaFile[];
  permissionState: "granted" | "prompt" | "denied" | "unknown";
  linking: boolean;
  error: string | null;
  linkFolder: () => Promise<void>;
  reconnectFolder: () => Promise<void>;
  forgetFolder: () => Promise<void>;
  /**
   * Fallback for when folder-level linking isn't an option: Chrome's
   * directory picker (showDirectoryPicker) refuses to let you select
   * several common "well-known" directories directly — Downloads, Desktop,
   * Documents, your home folder, drive roots — showing its own native "this
   * is a system folder, choose another" message before you can even
   * confirm. That's a hard browser restriction with no workaround from web
   * content; picking a SUBFOLDER inside one of those still works fine. This
   * method sidesteps the whole problem a different way: it picks
   * INDIVIDUAL FILES instead of a folder (showOpenFilePicker has no such
   * restriction), and adds them straight to the matched file list — no
   * directory handle, no permission-persistence dance, just the files
   * themselves, immediately usable.
   */
  linkIndividualFiles: () => Promise<void>;
}

function classify(name: string): LocalMediaFile["kind"] {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "video";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  return "other";
}

// ── SHARED STORE (module-level singleton) ──────────────────────────────
//
// REAL BUG THIS FIXES: this hook used to keep ALL of its state (dirHandle,
// files, permissionState, linking, error) in local `useState` — fine for a
// hook called from exactly one place, but this one is called from BOTH
// `MediaPanel.tsx` AND `MediaRelinkBanner.tsx`. Two separate `useState`
// call sites means two completely independent copies of "is a folder
// linked / what files does it have," which never synchronized with each
// other except by each separately re-reading IndexedDB on their own mount.
//
// Concretely, this produced exactly the symptom reported: linking or
// reconnecting the folder from MediaPanel updated ONLY MediaPanel's own
// copy of `files`/`permissionState` — MediaRelinkBanner's separate copy
// had no idea anything changed, so the "N media files aren't linked yet"
// banner kept showing even though the folder WAS actually linked, right
// up until something forced a full remount (e.g. a hard refresh) to
// re-sync both copies from IndexedDB from scratch. On a fresh project it
// could look even worse: MediaPanel might briefly show "granted" while
// MediaRelinkBanner (mounted a beat earlier/later, or just never told)
// still renders the stale "relink" state.
//
// Fixed by moving the actual state out of React entirely into ONE
// module-level store that every call site reads via `useSyncExternalStore`
// and writes through the setter functions below. There is now only ever a
// single dirHandle/files/permissionState for the whole app at any given
// time, so a change made from any one component is instantly visible to
// every other component using this hook — no remount required, and no more
// "I just linked it and it still says relink."
interface FolderStore {
  supported: boolean;
  dirHandle: FileSystemDirectoryHandle | null;
  files: LocalMediaFile[];
  permissionState: UseLocalMediaFolderResult["permissionState"];
  linking: boolean;
  error: string | null;
  // Which project's handle/files `dirHandle`/`files` currently reflect —
  // lets the restore effect avoid re-doing the IndexedDB round trip every
  // time a new component instance of this hook happens to mount.
  restoredForKey: string | null;
}

let store: FolderStore = {
  supported: false,
  dirHandle: null,
  files: [],
  permissionState: "unknown",
  linking: false,
  error: null,
  restoredForKey: null,
};

const listeners = new Set<() => void>();

function setStore(partial: Partial<FolderStore>) {
  store = { ...store, ...partial };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): FolderStore {
  return store;
}

// SSR-safe snapshot — the store's initial shape is identical on server and
// client, so this can just reuse getSnapshot.
function getServerSnapshot(): FolderStore {
  return store;
}

async function readFilesIntoStore(handle: FileSystemDirectoryHandle): Promise<void> {
  const collected: LocalMediaFile[] = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === "file") {
      const fh = entry as FileSystemFileHandle;
      collected.push({
        name,
        kind: classify(name),
        handle: fh,
        getFile: () => fh.getFile(),
      });
    }
  }
  setStore({ files: collected });
}

async function tryRestore(projectId: string | null): Promise<void> {
  const key = handleKeyFor(projectId);
  try {
    const saved = await idbGet<FileSystemDirectoryHandle>(key);
    if (!saved) {
      // Nothing saved for THIS project specifically — reset so we don't
      // keep showing a previous project's folder as if it were this one's.
      setStore({ dirHandle: null, files: [], permissionState: "unknown", restoredForKey: key });
      return;
    }
    // queryPermission needs no user gesture — if Chrome still considers
    // this origin+handle "granted" from a previous visit (it persists this
    // across sessions for as long as the browser keeps the grant), this
    // reconnects and loads files with ZERO clicks needed at all.
    const state: "granted" | "prompt" | "denied" =
      (await saved.queryPermission?.({ mode: "read" })) ?? "prompt";
    setStore({ dirHandle: saved, permissionState: state, restoredForKey: key });
    if (state === "granted") {
      await readFilesIntoStore(saved);
    } else {
      setStore({ files: [] });
    }
  } catch {
    // No saved handle yet, or IndexedDB unavailable — fine, user just
    // links a folder fresh via the button.
    setStore({ restoredForKey: key });
  }
}

/**
 * Links a local folder via the File System Access API so media never has
 * to be uploaded to a server. The directory handle is persisted in
 * IndexedDB (handles themselves are structured-cloneable and survive
 * reloads in supporting browsers), so returning users are only asked to
 * re-confirm permission — not re-pick the folder — on their next visit.
 */
export function useLocalMediaFolder(): UseLocalMediaFolderResult {
  const { resumedProjectId } = useAppDetailsContext();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (typeof window !== "undefined" && !!window.showDirectoryPicker && !store.supported) {
      setStore({ supported: true });
    }
  }, []);

  // Restore (or switch to) the handle for whichever project is currently
  // active. Guarded by `restoredForKey` so mounting a SECOND component that
  // also uses this hook (MediaPanel + MediaRelinkBanner, at the same time)
  // doesn't kick off a redundant duplicate IndexedDB read/permission
  // check — both instances share the same store either way.
  useEffect(() => {
    if (!state.supported) return;
    const key = handleKeyFor(resumedProjectId);
    if (store.restoredForKey === key) return;
    tryRestore(resumedProjectId);
  }, [state.supported, resumedProjectId]);

  const linkFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      setStore({ error: "Your browser doesn't support local folder linking. Try Chrome or Edge." });
      return;
    }
    setStore({ linking: true, error: null });
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      await idbSet(handleKeyFor(resumedProjectId), handle);
      setStore({ dirHandle: handle, permissionState: "granted", restoredForKey: handleKeyFor(resumedProjectId) });
      await readFilesIntoStore(handle);
    } catch (err) {
      const e = err as DOMException;
      if (e?.name === "AbortError") {
        // User closed the picker (or Chrome's own "this is a system
        // folder" dialog forced them to cancel) — not a real error, no
        // message needed; they can just try again or use "pick files
        // directly" instead.
      } else {
        setStore({
          error:
            (e?.message ? `Couldn't link that folder: ${e.message}. ` : "Couldn't link that folder. ") +
            "If you picked Downloads, Desktop, Documents, or your home folder directly, Chrome blocks those — try a subfolder instead, or use \"pick files directly\" below.",
        });
      }
    } finally {
      setStore({ linking: false });
    }
  }, [resumedProjectId]);

  const linkIndividualFiles = useCallback(async () => {
    if (!window.showOpenFilePicker) {
      setStore({ error: "Your browser doesn't support picking individual files this way. Try Chrome or Edge." });
      return;
    }
    setStore({ linking: true, error: null });
    try {
      const handles = await window.showOpenFilePicker({ multiple: true, excludeAcceptAllOption: false });
      const picked: LocalMediaFile[] = handles.map((fh) => ({
        name: fh.name,
        kind: classify(fh.name),
        handle: fh,
        getFile: () => fh.getFile(),
      }));
      // Merge with whatever's already linked (folder-based or previously
      // individually-picked) rather than replacing it, so this can be used
      // to top up just the couple of files a folder-relink missed.
      const byName = new Map(store.files.map((f) => [f.name, f]));
      for (const f of picked) byName.set(f.name, f);
      const nextFiles = Array.from(byName.values());
      if (!store.dirHandle) {
        setStore({ files: nextFiles, permissionState: "granted" }); // no folder handle, but we do have usable files now
      } else {
        setStore({ files: nextFiles });
      }
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") {
        setStore({
          error: (err as Error)?.message ? `Couldn't open those files: ${(err as Error).message}` : "Couldn't open those files. Please try again.",
        });
      }
    } finally {
      setStore({ linking: false });
    }
  }, []);

  const reconnectFolder = useCallback(async () => {
    if (!store.dirHandle) return;
    setStore({ linking: true, error: null });
    try {
      const state: "granted" | "denied" | "prompt" =
        (await store.dirHandle.requestPermission?.({ mode: "read" })) ?? "denied";
      setStore({ permissionState: state });
      if (state === "granted") {
        await readFilesIntoStore(store.dirHandle);
      } else {
        setStore({ error: "Permission denied — ClipFlow can't read that folder without access." });
      }
    } finally {
      setStore({ linking: false });
    }
  }, []);

  const forgetFolder = useCallback(async () => {
    await idbSet(handleKeyFor(resumedProjectId), null);
    setStore({ dirHandle: null, files: [], permissionState: "unknown" });
  }, [resumedProjectId]);

  return {
    supported: state.supported,
    folderName: state.dirHandle?.name ?? null,
    files: state.files,
    permissionState: state.permissionState,
    linking: state.linking,
    error: state.error,
    linkFolder,
    reconnectFolder,
    forgetFolder,
    linkIndividualFiles,
  };
}