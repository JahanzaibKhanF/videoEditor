import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

/**
 * ffmpegEngine — strict module-level singleton around @ffmpeg/ffmpeg.
 *
 * WHY A MODULE-LEVEL SINGLETON (not a React `useRef` inside a component):
 * A `useRef` only protects a *single component instance* from re-creating the
 * engine on re-render — it does NOT protect against two different components
 * (e.g. RenderButton + RenderingLoader) each independently trying to load
 * their own copy of the multi-megabyte WASM core, which is what actually
 * causes the silent freeze/crash: two concurrent `ffmpeg.load()` calls
 * fighting over the same WASM linear memory.
 *
 * Module-scoped variables in an ES module are a true singleton — there is
 * exactly one instance of `ffmpegInstance` / `loadPromise` for the entire
 * app, no matter how many components or how many times React (StrictMode
 * or otherwise) re-renders them. This is the correct pattern for a
 * heavyweight, stateful, non-React resource like a WASM module.
 */

const CORE_VERSION = "0.12.6";
// IMPORTANT: must be the UMD build, not the ESM build.
// The ESM core (`dist/esm`) resolves its own internal module imports
// relative to its own script URL. Once that URL is converted to a
// `blob:` URL (required so the WASM core can be loaded cross-origin
// without COOP/COEP headers), there's no meaningful "directory" for a
// blob URL to resolve a relative import against, so FFmpeg's internal
// worker throws `Cannot find module 'blob:...'` before ever finishing
// load — this is a load-time failure, not a rendering/color/animation
// bug; nothing downstream ever runs. The UMD build is the standard
// single-threaded core designed to work with toBlobURL()+classic
// worker loading (no SharedArrayBuffer/multi-thread requirement here).
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

/** Last load/runtime error, exposed so UI components can render it instead of failing silently. */
export let lastEngineError: string | null = null;

export type EngineLogHandler = (message: string) => void;

// Global log subscribers — every render call can attach its own listener
// without re-registering a new `ffmpeg.on('log', ...)` handler each time
// (which would leak listeners across renders).
const logSubscribers = new Set<EngineLogHandler>();

export function subscribeEngineLogs(handler: EngineLogHandler): () => void {
  logSubscribers.add(handler);
  return () => logSubscribers.delete(handler);
}

/**
 * Returns a ready-to-use FFmpeg instance. Safe to call from multiple
 * components/handlers concurrently — every caller awaits the *same*
 * in-flight load instead of starting a second one.
 */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  // Another caller already kicked off loading — piggyback on it instead of
  // starting a second, competing `.load()` call.
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const ffmpeg = new FFmpeg();

      // ── Deep logging: every internal FFmpeg log line is forwarded to the
      // browser console AND to any UI subscriber (e.g. an on-screen debug
      // panel), so a failed render is never silent again. ─────────────────
      ffmpeg.on("log", ({ message }) => {
        // eslint-disable-next-line no-console
        console.log("[ffmpeg]", message);
        logSubscribers.forEach(fn => {
          try { fn(message); } catch { /* a broken subscriber must not break ffmpeg */ }
        });
      });

      ffmpeg.on("progress", ({ progress, time }) => {
        console.debug("[ffmpeg progress]", Math.round(progress * 100) + "%", `t=${time}`);
      });

      console.log("[ffmpegEngine] Loading WASM core (UMD build, fix 2026-07-06) from", CORE_BASE_URL);

      const coreURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript");
      const wasmURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm");

      await ffmpeg.load({ coreURL, wasmURL });

      console.log("[ffmpegEngine] FFmpeg core loaded successfully.");
      lastEngineError = null;
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    } catch (err) {
      // Surface the real reason instead of letting the caller see "nothing
      // happened". Common causes: COOP/COEP headers missing (see vite.config.ts),
      // unpkg.com blocked by an extension/CSP, or offline.
      const message = err instanceof Error ? err.message : String(err);
      lastEngineError = `FFmpeg failed to load: ${message}`;
      console.error("[ffmpegEngine]", lastEngineError, err);
      ffmpegInstance = null;
      throw new Error(lastEngineError);
    } finally {
      // Always release the lock, success or failure, so a retry after a
      // failed load can actually try again instead of hanging forever.
      loadPromise = null;
    }
  })();

  return loadPromise;
}

/** Hard-resets the engine (used to recover from a corrupted/crashed WASM instance). */
export async function terminateFFmpeg(): Promise<void> {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch (err) {
      console.warn("[ffmpegEngine] terminate() threw (instance was likely already dead):", err);
    }
  }
  ffmpegInstance = null;
  loadPromise = null;
}

export function isFFmpegLoaded(): boolean {
  return !!ffmpegInstance?.loaded;
}
