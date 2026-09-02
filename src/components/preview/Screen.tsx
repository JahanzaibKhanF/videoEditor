"use client";

/**
 * Screen — the main preview area.
 *
 * Layer stack (bottom to top):
 *   1. CompositorCanvas    — draws video frames + text + images + blur + transitions + animations
 *   2. InteractionOverlay  — plain React/DOM interaction layer (select/drag/resize/inline text edit), no canvas library
 *
 * This is exactly how Adobe Express / Figma / Canva work:
 * - One canvas that composites everything
 * - A separate transparent interaction layer, built from real DOM elements, for UI handles
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { useEngineControls } from "../../context/useAppContext";
import { getFps } from "../../utils/getFps";
import CompositorCanvas from "./CompositorCanvas";
import InteractionOverlay from "./InteractionOverlay";
import TemplateLoaderBadge from "./TemplateLoaderBadge";
import { CanvasEngine } from "../../utils/CanvasEngine";

export default function Screen() {
  const {
    previewScale, setPreviewScale,
    primaryVideoDimensions, containerDimenions, setContainerDimenions,
    videos, isShowProcessedVideo,
    selectedAspectRatio, setCurrentTime, setSeekTime,
    setFps, activeTemplate,
  } = useAppDetailsContext();

  const { setControls, notifyEnded } = useEngineControls();
  const engineRef = useRef<CanvasEngine | null>(null);
  const notifyEndedRef = useRef(notifyEnded);
  useEffect(() => { notifyEndedRef.current = notifyEnded; }, [notifyEnded]);
  const parentRef = useRef<HTMLDivElement>(null);
  const [engineReady, setEngineReady] = useState(false);

  // ── Container dimensions from aspect ratio ────────────────────────
  useEffect(() => {
    if (videos.length === 0) {
      setContainerDimenions({ width: 1280, height: 720 });
      return;
    }
    const vw = primaryVideoDimensions.width || 1280;
    const vh = primaryVideoDimensions.height || 720;
    let cw = vw, ch = vh;
    switch (selectedAspectRatio) {
      case "16:9": case "xfeeds":    ch = vw / (16 / 9); break;
      case "9:16": case "ytshorts": case "instareels": case "tiktok":
        ch = vw * (16 / 9); break;
      case "1:1":  ch = vw; break;
      case "4:5":  ch = vw * (5 / 4); break;
      case "3:4":  ch = vw * (4 / 3); break;
    }
    setContainerDimenions({ width: Math.round(cw), height: Math.round(ch) });
  }, [selectedAspectRatio, primaryVideoDimensions, videos.length]);

  // ── Auto-fit preview scale ─────────────────────────────────────────
  useEffect(() => {
    const el = parentRef.current;
    if (!el || !containerDimenions.width || !containerDimenions.height) return;

    const recalcFit = () => {
      const pw = el.clientWidth - 40;
      const ph = el.clientHeight - 40;
      const fit = Math.min(1, pw / containerDimenions.width, ph / containerDimenions.height);
      setPreviewScale(parseFloat(fit.toFixed(3)));
    };

    recalcFit();

    // Re-fit whenever the preview container itself resizes — covers window
    // resize, device rotation, and switching between the desktop/mobile
    // layouts (which mount a differently-sized preview pane).
    const ro = new ResizeObserver(() => recalcFit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerDimenions]);

  // ── Scroll to zoom ─────────────────────────────────────────────────
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = e.deltaY < 0 ? 0.05 : -0.05;
      setPreviewScale(p => parseFloat(Math.min(1, Math.max(0.05, (p ?? 0.5) + d)).toFixed(3)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Spacebar ──────────────────────────────────────────────────────
  const { play, pause, isPlaying } = useEngineControls();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isShowProcessedVideo) {
        // Don't intercept spacebar when user is typing in a text box or input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        isPlaying ? pause() : play();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPlaying, isShowProcessedVideo]);

  // ── FPS detection ─────────────────────────────────────────────────
  useEffect(() => {
    if (videos.length === 0) return;
    const t = setTimeout(() => getFps(videos[0].video).then(setFps).catch(() => {}), 800);
    return () => clearTimeout(t);
  }, [videos]);

  // ── Engine ready callback ─────────────────────────────────────────
  const [isBuffering, setIsBuffering] = useState(false);

  const handleEngineReady = useCallback((engine: CanvasEngine) => {
    engineRef.current = engine;
    setEngineReady(true);
    engine.onBufferingChange = (buffering) => setIsBuffering(buffering);
    setControls({
      play: () => engine.play(),
      pause: () => engine.pause(),
      seekTo: (t: number) => {
        engine.seekTo(t);
        setCurrentTime(t);
        setSeekTime(t);
      },
    });
  }, [setControls, setCurrentTime, setSeekTime]);

  // ── Time update from engine ───────────────────────────────────────
  const handleTimeUpdate = useCallback((t: number) => {
    setCurrentTime(t);
    setSeekTime(t);
  }, [setCurrentTime, setSeekTime]);

  const { width, height } = containerDimenions;

  return (
    <div
      ref={parentRef}
      className="preview-stage w-full h-full flex items-center justify-center overflow-hidden relative"
    >
      <div
        style={{
          width,
          height,
          transform: `scale(${previewScale ?? 0.5})`,
          transformOrigin: "center center",
          position: "relative",
          flexShrink: 0,
          background: "#000",
          boxShadow: "0 0 0 1px rgba(0,0,0,.35), 0 30px 70px -10px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.04) inset",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        {width > 0 && height > 0 && (
          <>
            {/* Layer 1: The compositor — draws absolutely everything */}
            <CompositorCanvas
              width={width}
              height={height}
              onTimeUpdate={handleTimeUpdate}
              onEngineReady={handleEngineReady}
              // Wired to the existing (previously-unused) notifyEndedRef —
              // without this, isPlaying stayed stuck "true" after a clip
              // finished playing on its own, since only manual pause ever
              // reset it. See notifyEndedRef above.
              onEnded={() => notifyEndedRef.current()}
            />

            {/* Layer 2: interaction only — plain React/DOM (no canvas library), drag/resize handles + inline text edit */}
            {engineReady && (
              <InteractionOverlay width={width} height={height} />
            )}

            {/* Buffering indicator — real loading UI instead of letting the
                canvas just go black while a clip is seeking/fetching data,
                driven by actual video "waiting"/"canplay" events (see
                CanvasEngine.onBufferingChange), not a guess or a timer. */}
            {isBuffering && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: "rgba(0,0,0,.25)" }}>
                {activeTemplate ? (
                  <TemplateLoaderBadge color={activeTemplate.accentColor || "#8B5CFF"} />
                ) : (
                  <div className="flex flex-col items-center gap-2.5 px-5 py-4 rounded-xl" style={{ background: "rgba(10,10,19,.75)", backdropFilter: "blur(6px)" }}>
                    <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-signal animate-spin" />
                    <span className="text-[11px] font-semibold text-white/70 tracking-wide">Loading…</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {videos.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-[rgba(255,255,255,.25)]">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity=".5">
              <rect x="4" y="8" width="40" height="32" rx="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M19 17l14 7-14 7V17z" fill="currentColor" opacity=".6"/>
            </svg>
            <p className="text-[14px] font-semibold">No Media</p>
            <p className="text-[11px] opacity-60">{width}×{height} · {selectedAspectRatio}</p>
          </div>
        )}
      </div>

      {/* Zoom percentage indicator */}
      <div className="absolute bottom-3 right-3 bg-studio-surface/90 backdrop-blur-sm border border-studio-border rounded-full px-3 py-1 text-[11px] font-mono font-semibold text-ink-secondary select-none pointer-events-none">
        {Math.round((previewScale ?? 0.5) * 100)}%
      </div>
    </div>
  );
}