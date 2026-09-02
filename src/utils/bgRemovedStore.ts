"use client";

/**
 * bgRemovedStore — local (per-browser) persistence for AI background-removal
 * output.
 *
 * When you "Apply to clip" in the Remove Background panel, the transparent
 * WebM the model produced is only a `blob:` URL in memory — it dies on
 * refresh, so the clip falls back to its original (background intact). This
 * store keeps that WebM blob in IndexedDB keyed by a stable `assetId`, so a
 * reopened project re-applies it instantly with no re-processing.
 *
 * A copy is ALSO uploaded to Cloudinary (see /api/bg-removed) so the result
 * survives on a different browser/device — this local copy is just the fast
 * path. Cleanup: entries are removed when their clip/project goes away (see
 * useBgRemovedRestore + the project DELETE route).
 */

const DB_NAME = "clipflow-bg-removed";
const DB_VERSION = 1;
const STORE_NAME = "clips";

interface BgRemovedRecord {
  assetId: string;
  projectId: string; // "untitled" until the project gets a real id
  blob: Blob;
  createdAt: number;
}

// IndexedDB index keys can't be null — a project without an id yet is
// bucketed under "untitled". Restore looks assets up by assetId directly
// (not project-scoped), so this only affects project-scoped cleanup.
const pid = (projectId: string | null) => projectId ?? "untitled";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "assetId" });
        store.createIndex("projectId", "projectId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBgRemoved(rec: { assetId: string; projectId: string | null; blob: Blob }): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const record: BgRemovedRecord = {
        assetId: rec.assetId,
        projectId: pid(rec.projectId),
        blob: rec.blob,
        createdAt: Date.now(),
      };
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* best-effort — the Cloudinary copy is the durable one */
  }
}

export async function getBgRemovedBlob(assetId: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    const rec = await new Promise<BgRemovedRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(assetId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rec?.blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteBgRemoved(assetIds: string[]): Promise<void> {
  if (assetIds.length === 0) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      assetIds.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* best-effort */
  }
}

/** Every stored entry (assetId + age) this browser has for a given project. */
export async function listBgRemovedForProject(
  projectId: string | null,
): Promise<{ assetId: string; createdAt: number }[]> {
  try {
    const db = await openDb();
    const recs = await new Promise<BgRemovedRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).index("projectId").getAll(IDBKeyRange.only(pid(projectId)));
      req.onsuccess = () => resolve(req.result as BgRemovedRecord[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return recs.map((r) => ({ assetId: r.assetId, createdAt: r.createdAt }));
  } catch {
    return [];
  }
}

export async function deleteBgRemovedForProject(projectId: string | null): Promise<void> {
  const entries = await listBgRemovedForProject(projectId);
  await deleteBgRemoved(entries.map((e) => e.assetId));
}
