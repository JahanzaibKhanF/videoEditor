/**
 * recentVideosStore — replaces the old `recentVideosURL` backend endpoint.
 *
 * Previously the server kept a list of exported renders and the client polled
 * `GET /api/user/videos/` every 15s. Now that rendering happens fully on-device,
 * we persist finished exports (as Blobs) in IndexedDB so:
 *   1) the "Recent Renders" panel still works,
 *   2) finished exports survive a page refresh (plain `blob:` object URLs do not),
 *   3) nothing ever leaves the user's browser.
 */

const DB_NAME = "video-editor-local";
const DB_VERSION = 1;
const STORE_NAME = "recent_videos";

export interface StoredVideo {
  id: string;
  name: string;
  blob: Blob;
  mimeType: string;
  thumbnail: string | null; // data URL
  createdAt: number;
  sizeBytes: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function saveRecentVideo(video: Omit<StoredVideo, "id" | "createdAt">): Promise<StoredVideo> {
  const db = await openDB();
  const record: StoredVideo = {
    ...video,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save video"));
  });
  db.close();
  return record;
}

export async function listRecentVideos(): Promise<StoredVideo[]> {
  const db = await openDB();
  const records = await new Promise<StoredVideo[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as StoredVideo[]);
    req.onerror = () => reject(req.error ?? new Error("Failed to list videos"));
  });
  db.close();
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteRecentVideo(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete video"));
  });
  db.close();
}
