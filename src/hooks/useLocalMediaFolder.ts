"use client";

import { useCallback, useEffect, useState } from "react";
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

/**
 * Links a local folder via the File System Access API so media never has
 * to be uploaded to a server. The directory handle is persisted in
 * IndexedDB (handles themselves are structured-cloneable and survive
 * reloads in supporting browsers), so returning users are only asked to
 * re-confirm permission — not re-pick the folder — on their next visit.
 */
export function useLocalMediaFolder(): UseLocalMediaFolderResult {
  const { resumedProjectId } = useAppDetailsContext();
  const [supported, setSupported] = useState(false);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [files, setFiles] = useState<LocalMediaFile[]>([]);
  const [permissionState, setPermissionState] =
    useState<UseLocalMediaFolderResult["permissionState"]>("unknown");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && !!window.showDirectoryPicker);
  }, []);

  const readFiles = useCallback(async (handle: FileSystemDirectoryHandle) => {
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
    setFiles(collected);
  }, []);

  const tryRestore = useCallback(async () => {
    try {
      const saved = await idbGet<FileSystemDirectoryHandle>(handleKeyFor(resumedProjectId));
      if (!saved) {
        // Nothing saved for THIS project specifically — reset so we don't
        // keep showing a previous project's folder as if it were this
        // one's.
        setDirHandle(null);
        setFiles([]);
        setPermissionState("unknown");
        return;
      }
      // queryPermission needs no user gesture — if Chrome still considers
      // this origin+handle "granted" from a previous visit (it persists
      // this across sessions for as long as the browser keeps the grant),
      // this reconnects and loads files with ZERO clicks needed at all.
      const state: "granted" | "prompt" | "denied" = await saved.queryPermission({ mode: "read" });
      setDirHandle(saved);
      setPermissionState(state);
      if (state === "granted") {
        await readFiles(saved);
      } else {
        setFiles([]);
      }
    } catch {
      // No saved handle yet, or IndexedDB unavailable — fine, user just
      // links a folder fresh via the button.
    }
  }, [readFiles, resumedProjectId]);

  useEffect(() => {
    if (supported) tryRestore();
  }, [supported, resumedProjectId, tryRestore]);

  const linkFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      setError("Your browser doesn't support local folder linking. Try Chrome or Edge.");
      return;
    }
    setLinking(true);
    setError(null);
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      await idbSet(handleKeyFor(resumedProjectId), handle);
      setDirHandle(handle);
      setPermissionState("granted");
      await readFiles(handle);
    } catch (err) {
      const e = err as DOMException;
      if (e?.name === "AbortError") {
        // User closed the picker (or Chrome's own "this is a system
        // folder" dialog forced them to cancel) — not a real error, no
        // message needed; they can just try again or use "pick files
        // directly" instead.
      } else {
        setError(
          (e?.message ? `Couldn't link that folder: ${e.message}. ` : "Couldn't link that folder. ") +
          "If you picked Downloads, Desktop, Documents, or your home folder directly, Chrome blocks those — try a subfolder instead, or use \"pick files directly\" below."
        );
      }
    } finally {
      setLinking(false);
    }
  }, [readFiles, resumedProjectId]);

  const linkIndividualFiles = useCallback(async () => {
    if (!window.showOpenFilePicker) {
      setError("Your browser doesn't support picking individual files this way. Try Chrome or Edge.");
      return;
    }
    setLinking(true);
    setError(null);
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
      setFiles((prev) => {
        const byName = new Map(prev.map((f) => [f.name, f]));
        for (const f of picked) byName.set(f.name, f);
        return Array.from(byName.values());
      });
      if (!dirHandle) setPermissionState("granted"); // no folder handle, but we do have usable files now
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") {
        setError((err as Error)?.message ? `Couldn't open those files: ${(err as Error).message}` : "Couldn't open those files. Please try again.");
      }
    } finally {
      setLinking(false);
    }
  }, [dirHandle]);

  const reconnectFolder = useCallback(async () => {
    if (!dirHandle) return;
    setLinking(true);
    setError(null);
    try {
      // @ts-expect-error — requestPermission is part of the File System
      // Access permissions spec, not yet in TS's default lib types.
      const state: "granted" | "denied" = await dirHandle.requestPermission({ mode: "read" });
      setPermissionState(state);
      if (state === "granted") {
        await readFiles(dirHandle);
      } else {
        setError("Permission denied — ClipFlow can't read that folder without access.");
      }
    } finally {
      setLinking(false);
    }
  }, [dirHandle, readFiles]);

  const forgetFolder = useCallback(async () => {
    await idbSet(handleKeyFor(resumedProjectId), null);
    setDirHandle(null);
    setFiles([]);
    setPermissionState("unknown");
  }, [resumedProjectId]);

  return {
    supported,
    folderName: dirHandle?.name ?? null,
    files,
    permissionState,
    linking,
    error,
    linkFolder,
    reconnectFolder,
    forgetFolder,
    linkIndividualFiles,
  };
}
