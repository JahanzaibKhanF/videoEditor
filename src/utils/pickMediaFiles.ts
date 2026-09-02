"use client";

/**
 * One way to let the user pick local media files, used by both the media
 * panel's Import button and the relink banner's "Locate" action.
 *
 * Prefers `showOpenFilePicker` (Chromium) because it hands back
 * `FileSystemFileHandle`s we can persist in IndexedDB — that's what lets a
 * reopened project re-link its files automatically later. Falls back to a
 * plain `<input type="file">` on browsers without it (Firefox/Safari);
 * those picks work for the current session but can't be auto-relinked
 * after a reload.
 */
export interface PickedMediaFile {
  file: File;
  handle?: FileSystemFileHandle;
}

export async function pickMediaFiles(): Promise<PickedMediaFile[]> {
  if (typeof window !== "undefined" && window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({ multiple: true });
      return await Promise.all(
        handles.map(async (handle) => ({ file: await handle.getFile(), handle })),
      );
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return [];
      throw err;
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "video/*,image/*";
    input.onchange = () => resolve(Array.from(input.files ?? []).map((file) => ({ file })));
    // Not every browser fires `cancel`; the promise just stays pending in
    // that case, which is harmless (no files were added).
    input.oncancel = () => resolve([]);
    input.click();
  });
}
