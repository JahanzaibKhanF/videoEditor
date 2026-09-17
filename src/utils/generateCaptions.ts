/**
 * generateCaptions — orchestrates auto-caption generation for one clip:
 * extract its own audio (audioExtraction.ts), hand it to captionWorker.ts
 * (Whisper, off the main thread so the UI never freezes), and return
 * timestamped phrase segments ready to become text layers.
 *
 * Mirrors backgroundRemoval.ts's shape (onProgress, AbortSignal) so the UI
 * panel can reuse the same choosing/running/done/error pattern.
 */
import { ClipDetails } from "../types/types";
import { extractClipAudio } from "./audioExtraction";

export interface CaptionChunk {
  text: string;
  start: number; // seconds, relative to the clip's OWN trimmed span
  end: number;
}

export interface CaptionProgress {
  fraction: number;
  label: string;
}

export interface GenerateCaptionsOptions {
  clip: ClipDetails;
  onProgress?: (p: CaptionProgress) => void;
  signal: AbortSignal;
}

// Informational only, same spirit as backgroundRemoval's checkAlphaCapability
// — `navigator.deviceMemory` isn't supported everywhere (notably Safari), so
// `supported: undefined` just means "unknown," not "will fail."
export interface MemoryCapabilityResult {
  supported: boolean | undefined;
  deviceMemoryGB?: number;
}

export function checkMemoryCapability(): MemoryCapabilityResult {
  const deviceMemoryGB = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  if (typeof deviceMemoryGB !== "number") return { supported: undefined };
  return { supported: deviceMemoryGB >= 2, deviceMemoryGB };
}

export async function generateCaptions(opts: GenerateCaptionsOptions): Promise<CaptionChunk[]> {
  const { clip, onProgress, signal } = opts;
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

  onProgress?.({ fraction: 0, label: "Reading audio…" });
  const audio = await extractClipAudio(clip);
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

  const worker = new Worker(new URL("../workers/captionWorker.ts", import.meta.url), { type: "module" });

  return new Promise<CaptionChunk[]>((resolve, reject) => {
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", onAbort);

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; fraction?: number; label?: string; chunks?: CaptionChunk[]; message?: string };
      if (msg.type === "progress") {
        onProgress?.({ fraction: msg.fraction ?? 0, label: msg.label ?? "" });
      } else if (msg.type === "result") {
        cleanup();
        resolve(msg.chunks ?? []);
      } else if (msg.type === "error") {
        cleanup();
        reject(new Error(msg.message ?? "Transcription failed."));
      }
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("The speech-recognition worker crashed."));
    };

    // Transfer the buffer instead of copying — this array can be several
    // MB for a longer clip, no reason to duplicate it across the postMessage
    // boundary.
    worker.postMessage({ type: "transcribe", audio: audio.buffer }, [audio.buffer]);
  });
}
