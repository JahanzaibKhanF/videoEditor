/**
 * CanvasEngine — the core compositor.
 *
 * One hidden HTMLVideoElement per clip src (never in DOM, just for decoding).
 * Drives playback via requestAnimationFrame + wall-clock dt.
 * Seek is synchronous to the RAF loop — loop is stopped during seek, restarted after.
 */

import { ClipDetails } from "../types/types";

export type EngineState = "idle" | "playing" | "paused" | "ended";

export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private videoPool: Map<string, HTMLVideoElement> = new Map();
  private clips: ClipDetails[] = [];
  private _currentTime = 0;
  private _state: EngineState = "idle";
  private rafId: number | null = null;
  private lastRealTime: number | null = null;
  private _isSeeking = false;
  private _seekToken = 0;

  public onTimeUpdate: ((t: number) => void) | null = null;
  public onEnded: (() => void) | null = null;
  public onFrameReady: (() => void) | null = null;
  // Fires whenever the aggregate "is any currently-active video waiting on
  // data" state changes — driven by real `waiting`/`canplay`/`playing`
  // events per <video>, not polling. Screen.tsx uses this to show a real
  // loading indicator (like After Effects' "please wait") instead of
  // letting the canvas just go black while a clip buffers or seeks.
  public onBufferingChange: ((isBuffering: boolean) => void) | null = null;
  private waitingSrcs = new Set<string>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  // ── Load clips ────────────────────────────────────────────────────────
  load(clips: ClipDetails[]) {
    this.clips = [...clips].sort((a, b) => a.startPosition - b.startPosition);
    const newSrcs = new Set(clips.map(c => c.src));

    for (const [src, vid] of this.videoPool) {
      if (!newSrcs.has(src)) {
        vid.src = "";
        vid.load();
        this.videoPool.delete(src);
        if (this.waitingSrcs.delete(src)) this.onBufferingChange?.(this.waitingSrcs.size > 0);
      }
    }

    for (const clip of clips) {
      if (!this.videoPool.has(clip.src)) {
        const vid = document.createElement("video");
        vid.src = clip.src;
        vid.preload = "auto";
        vid.muted = clip.muted ?? false;
        vid.playsInline = true;
        vid.load();
        this.videoPool.set(clip.src, vid);
        this._attachBufferingListeners(vid, clip.src);
      }
    }

    this._syncAllVideoPositions();
    this._drawFrame();
  }

  private _attachBufferingListeners(vid: HTMLVideoElement, src: string) {
    const markWaiting = () => {
      this.waitingSrcs.add(src);
      this.onBufferingChange?.(this.waitingSrcs.size > 0);
    };
    const markReady = () => {
      if (this.waitingSrcs.delete(src)) {
        this.onBufferingChange?.(this.waitingSrcs.size > 0);
      }
    };
    vid.addEventListener("waiting", markWaiting);
    vid.addEventListener("stalled", markWaiting);
    vid.addEventListener("canplay", markReady);
    vid.addEventListener("playing", markReady);
    vid.addEventListener("loadeddata", markReady);
    vid.addEventListener("error", markReady);
  }

  // ── Play ──────────────────────────────────────────────────────────────
  play() {
    if (this._state === "playing") return;
    if (this._isSeeking) return; // wait for seek to finish
    this._state = "playing";
    this.lastRealTime = null;
    this._stopRAF();
    this._startRAF();
  }

  // ── Pause ─────────────────────────────────────────────────────────────
  pause() {
    if (this._state === "paused") return;
    this._state = "paused";
    this.lastRealTime = null;
    this._stopRAF();
    for (const vid of this.videoPool.values()) vid.pause();
    this._drawFrame();
  }

  // ── Seek ──────────────────────────────────────────────────────────────
  // Uses a monotonically increasing token rather than the shared
  // `_isSeeking` boolean to identify "am I still the most recent seek".
  // BUG THIS FIXES: with a shared boolean, rapidly scrubbing the timeline
  // (seekTo called again before the previous seek's video.seeked promises
  // resolve) could let an OLDER seek's completion callback fire after a
  // NEWER seek had already started. The older callback would see
  // `_isSeeking === true` (set by the newer seek) and wrongly conclude it
  // was still current, so it cleared `_isSeeking` itself — which then made
  // the actual newest seek's own completion callback see `_isSeeking ===
  // false` and think *it* had been superseded, so it silently returned
  // without ever calling _drawFrame/onTimeUpdate or resuming playback.
  // Net effect: playback could permanently fail to resume after scrubbing,
  // looking exactly like "stuck" video. A per-call token makes staleness
  // unambiguous: only the call whose token still matches `_seekToken` when
  // its promises resolve is allowed to finalize anything.
  seekTo(globalTime: number) {
    const myToken = ++this._seekToken;
    const wasPlaying = this._state === "playing";

    // Stop the RAF loop completely during seek to prevent stale-frame draws
    this._stopRAF();
    for (const vid of this.videoPool.values()) vid.pause();

    this._currentTime = Math.max(0, Math.min(globalTime, this._totalDuration()));
    this.lastRealTime = null;
    this._isSeeking = true;

    // Draw black+whatever is ready immediately so canvas isn't blank
    this._drawFrame();
    this.onTimeUpdate?.(this._currentTime);

    // Seek every video to its correct local position
    const seekPromises: Promise<void>[] = [];

    for (const clip of this.clips) {
      const vid = this.videoPool.get(clip.src);
      if (!vid) continue;
      const inRange = this._currentTime >= (clip.startPosition ?? 0) &&
                      this._currentTime <= (clip.endPosition ?? 0);
      const localTime = inRange
        ? Math.max(0, (clip.startTime ?? 0) + (this._currentTime - (clip.startPosition ?? 0)))
        : Math.max(0, clip.startTime ?? 0);

      if (Math.abs(vid.currentTime - localTime) > 0.04) {
        seekPromises.push(new Promise<void>(resolve => {
          const onSeeked = () => { vid.removeEventListener("seeked", onSeeked); resolve(); };
          const onError = () => { vid.removeEventListener("error", onError); resolve(); };
          vid.addEventListener("seeked", onSeeked);
          vid.addEventListener("error", onError);
          vid.currentTime = localTime;
          // Fallback timeout in case seeked never fires (some browsers/codecs)
          setTimeout(resolve, 500);
        }));
      }
    }

    Promise.all(seekPromises).then(() => {
      if (myToken !== this._seekToken) return; // a newer seek started, this one is stale — no-op
      this._isSeeking = false;
      this._drawFrame();
      this.onTimeUpdate?.(this._currentTime);
      if (wasPlaying && this._state !== "ended") {
        this._state = "playing";
        this.lastRealTime = null;
        this._startRAF();
      }
    });
  }

  getCurrentTime() { return this._currentTime; }
  getState() { return this._state; }

  // ── Dispose ───────────────────────────────────────────────────────────
  dispose() {
    this._isSeeking = false;
    this._stopRAF();
    if (this.videoPool) {
      for (const vid of this.videoPool.values()) { try { vid.pause(); vid.src = ""; } catch {} }
      this.videoPool.clear();
    }
    this._state = "idle";
  }

  // ── Audio control ─────────────────────────────────────────────────────
  setClipMuted(src: string, muted: boolean) {
    const vid = this.videoPool.get(src);
    if (vid) vid.muted = muted;
  }

  setClipAudio(src: string, muted: boolean, volume: number) {
    const vid = this.videoPool.get(src);
    if (vid) {
      vid.muted = muted;
      vid.volume = Math.max(0, Math.min(1, volume));
    }
  }

  // ── PRIVATE ───────────────────────────────────────────────────────────

  private _totalDuration() {
    if (!this.clips.length) return 0;
    return Math.max(...this.clips.map(c => c.endPosition));
  }

  private _getActiveClips(): ClipDetails[] {
    return this.clips.filter(c =>
      this._currentTime >= (c.startPosition ?? 0) &&
      this._currentTime <= (c.endPosition ?? 0)
    );
  }

  private _syncAllVideoPositions() {
    for (const clip of this.clips) {
      const vid = this.videoPool.get(clip.src);
      if (!vid) continue;
      const localTime = (clip.startTime ?? 0) + (this._currentTime - (clip.startPosition ?? 0));
      if (this._currentTime >= clip.startPosition && this._currentTime <= clip.endPosition) {
        if (Math.abs(vid.currentTime - localTime) > 0.1) vid.currentTime = Math.max(0, localTime);
      }
    }
  }

  private _stopRAF() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * _startRAF — the main playback loop.
   *
   * Mobile GPU overload / "blinking" fix:
   *   On desktop the browser's native vsync (60 Hz) is fine, but on mobile
   *   GPUs a full 60 fps canvas decode+composite loop can overwhelm the
   *   hardware scaler, causing dropped frames that appear as black flashes.
   *   We gate every draw behind a wall-clock interval derived from the
   *   project fps (e.g. 30 fps → draw at most every 33 ms). If the RAF fires
   *   faster than that interval we skip the draw but still advance time and
   *   sync audio/video elements, so playback timing stays accurate.
   *
   *   Additionally, we skip drawing entirely when the tab is hidden
   *   (document.hidden) because decoding video frames for an invisible canvas
   *   wastes battery on mobile without any user benefit.
   */
  private _startRAF() {
    this._stopRAF(); // ensure no double-loop
    let lastDrawMs = 0;

    const loop = (now: number) => {
      if (this._state !== "playing") return;
      if (this._isSeeking) { this.rafId = requestAnimationFrame(loop); return; }

      // Advance the logical clock using wall-clock delta (clamped to 100 ms
      // to avoid a huge jump after the tab was backgrounded) — but ONLY
      // while nothing is actively buffering. Before this, the clock always
      // advanced on wall-clock time regardless of whether the video could
      // actually supply a frame for that time, so during a stall the
      // seekbar kept sliding forward while the picture stayed frozen —
      // instead of pausing like Premiere/After Effects do while waiting.
      const isBuffering = this.waitingSrcs.size > 0;
      if (this.lastRealTime !== null && !isBuffering) {
        const dt = Math.min((now - this.lastRealTime) / 1000, 0.1);
        this._currentTime += dt;
      }
      this.lastRealTime = now;

      const total = this._totalDuration();
      if (this._currentTime >= total) {
        this._currentTime = total;
        this._state = "ended";
        for (const vid of this.videoPool.values()) vid.pause();
        this._drawFrame();
        this.onTimeUpdate?.(this._currentTime);
        this.onEnded?.();
        return;
      }

      // Keep video elements in sync regardless of whether we draw a frame.
      const activeClips = this._getActiveClips();
      for (const clip of activeClips) {
        const vid = this.videoPool.get(clip.src);
        if (!vid) continue;
        const localTime = (clip.startTime ?? 0) + (this._currentTime - (clip.startPosition ?? 0));
        if (Math.abs(vid.currentTime - localTime) > 0.15) {
          vid.currentTime = Math.max(0, localTime);
        }
        if (vid.paused) vid.play().catch(() => {});
      }
      for (const [src, vid] of this.videoPool) {
        if (!activeClips.some(c => c.src === src) && !vid.paused) vid.pause();
      }

      // FPS-throttled draw — skip canvas work if the frame is too early or
      // the tab is hidden. This is the key mobile blinking fix.
      const frameIntervalMs = 1000 / (this._targetFps ?? 30);
      const shouldDraw = !document.hidden && (now - lastDrawMs) >= frameIntervalMs - 2; // 2 ms slack
      if (shouldDraw) {
        this._drawFrame();
        this.onTimeUpdate?.(this._currentTime);
        lastDrawMs = now;
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  // Target fps for the throttle — set by the caller via setTargetFps().
  private _targetFps: number = 30;
  public setTargetFps(fps: number) { this._targetFps = Math.max(1, fps); }

  // ── Draw all active clips to canvas ───────────────────────────────────
  private _drawFrame() {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, width, height);

    const activeClips = this._getActiveClips().sort(
      (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
    );

    for (const clip of activeClips) {
      const vid = this.videoPool.get(clip.src);
      if (!vid || vid.readyState < 2) continue;
      const x = clip.x ?? 0;
      const y = clip.y ?? 0;
      const w = (clip.width ?? width) * (clip.scale ?? 1);
      const h = (clip.height ?? height) * (clip.scale ?? 1);
      try { this.ctx.drawImage(vid, x, y, w, h); } catch {}
    }

    this.onFrameReady?.();
  }

  getVideoElement(src: string): HTMLVideoElement | undefined {
    return this.videoPool.get(src);
  }
}