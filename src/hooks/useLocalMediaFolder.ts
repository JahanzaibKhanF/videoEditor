"use client";

import { useCallback, useEffect, useState } from "react";

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
const HANDLE_KEY = "mediaFolder";

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
      const saved = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
      if (!saved) return;
      const state: "granted" | "prompt" | "denied" = await saved.queryPermission({ mode: "read" });
      setDirHandle(saved);
      setPermissionState(state);
      if (state === "granted") {
        await readFiles(saved);
      }
    } catch {
      // No saved handle yet, or IndexedDB unavailable — fine, user just
      // links a folder fresh via the button.
    }
  }, [readFiles]);

  useEffect(() => {
    if (supported) tryRestore();
  }, [supported, tryRestore]);

  const linkFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      setError("Your browser doesn't support local folder linking. Try Chrome or Edge.");
      return;
    }
    setLinking(true);
    setError(null);
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      await idbSet(HANDLE_KEY, handle);
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
  }, [readFiles]);

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
    await idbSet(HANDLE_KEY, null);
    setDirHandle(null);
    setFiles([]);
    setPermissionState("unknown");
  }, []);

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
