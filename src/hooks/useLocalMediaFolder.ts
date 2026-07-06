"use client";

import { useCallback, useEffect, useState } from "react";

// Minimal ambient types for the File System Access API — not yet in
// TypeScript's default DOM lib, so we declare just what we use.
declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
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
    // @ts-expect-error — values() is part of the async iterable directory
    // handle spec; not yet in TS's default lib types.
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
      // @ts-expect-error — queryPermission is part of the File System
      // Access permissions spec, not yet in TS's default lib types.
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
      // AbortError just means the user closed the picker — not a real error.
      if ((err as DOMException)?.name !== "AbortError") {
        setError("Couldn't link that folder. Please try again.");
      }
    } finally {
      setLinking(false);
    }
  }, [readFiles]);

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
  };
}
