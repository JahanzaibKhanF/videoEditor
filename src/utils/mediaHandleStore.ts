"use client";

/**
 * Per-file handle persistence for project media.
 *
 * ClipFlow never uploads media — it reads the user's local video/image
 * files straight off disk via the File System Access API. To make a saved
 * project reopen WITHOUT asking the user to re-pick every file, we persist
 * each file's `FileSystemFileHandle` in IndexedDB, keyed by project id +
 * file name. Handles are structured-cloneable and survive reloads; the
 * browser also remembers the read-permission grant for a handle across
 * sessions for a while, so in the common case reopening a project re-links
 * every file with ZERO clicks. When the browser has dropped the grant we
 * only need ONE click ("Reconnect media") to re-request it for all of them
 * at once. A file that was moved/renamed/deleted on disk falls back to a
 * per-file "Locate" pick.
 *
 * There is deliberately NO folder concept — a project remembers the actual
 * files it uses, nothing else.
 */

const DB_NAME = "clipflow-fs-handles";
const STORE_NAME = "handles";

function keyFor(projectId: string | null): string {
  return `media:${projectId ?? "untitled"}`;
}

function openDb(): Promise<IDBDatabase> {
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
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

type HandleMap = Record<string, FileSystemFileHandle>;

export async function getStoredHandles(projectId: string | null): Promise<HandleMap> {
  try {
    return (await idbGet<HandleMap>(keyFor(projectId))) ?? {};
  } catch {
    return {};
  }
}

export async function putStoredHandle(
  projectId: string | null,
  fileName: string,
  handle: FileSystemFileHandle,
): Promise<void> {
  try {
    const current = await getStoredHandles(projectId);
    current[fileName] = handle;
    await idbSet(keyFor(projectId), current);
  } catch {
    /* best-effort — worst case the user re-picks this file next session */
  }
}

/**
 * A brand-new project has no id until its first autosave — any handles
 * saved while working on it live under the shared "untitled" slot. Called
 * from useProjectAutosave the moment a real id is assigned so reopening
 * that project later finds its files. The "untitled" slot is deliberately
 * left in place so the next new project still defaults to those files.
 */
export async function migrateUntitledHandles(newProjectId: string): Promise<void> {
  try {
    const untitled = await getStoredHandles(null);
    if (Object.keys(untitled).length === 0) return;
    const target = await getStoredHandles(newProjectId);
    await idbSet(keyFor(newProjectId), { ...untitled, ...target });
  } catch {
    /* best-effort */
  }
}

export interface ResolveResult {
  /** name → File for every handle we could read right now, no clicks needed. */
  files: Map<string, File>;
  /** names whose handle exists but needs a permission click to read. */
  needsPermission: string[];
  /** names with no usable handle at all (never saved, denied, moved/deleted). */
  unavailable: string[];
}

/**
 * Walk every stored handle for a project and try to turn it back into a
 * File. With `request:false` (the automatic pass on load) this only
 * resolves handles the browser still considers granted — no prompts, no
 * user gesture needed. With `request:true` (behind a user gesture — the
 * "Reconnect media" button) it also prompts once for the handles sitting
 * at "prompt".
 */
export async function resolveProjectMedia(
  projectId: string | null,
  opts: { request: boolean },
): Promise<ResolveResult> {
  const handles = await getStoredHandles(projectId);
  const files = new Map<string, File>();
  const needsPermission: string[] = [];
  const unavailable: string[] = [];

  for (const [name, handle] of Object.entries(handles)) {
    try {
      let perm = (await handle.queryPermission?.({ mode: "read" })) ?? "prompt";
      if (perm === "prompt" && opts.request) {
        perm = (await handle.requestPermission?.({ mode: "read" })) ?? "prompt";
      }
      if (perm === "granted") {
        files.set(name, await handle.getFile());
      } else if (perm === "prompt") {
        needsPermission.push(name);
      } else {
        unavailable.push(name);
      }
    } catch {
      // getFile() throws NotFoundError when the file was moved/renamed/deleted.
      unavailable.push(name);
    }
  }
  return { files, needsPermission, unavailable };
}
