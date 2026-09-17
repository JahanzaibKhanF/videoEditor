"use client";

import React, { createContext, useState, useContext, useRef, useCallback, useEffect } from "react";
import {
  AppContextType, ActiveTemplate, AudioDetails, BlurDetails, BrushDetails, ClipDetails, ClipEffectDetails,
  ImageDetails, LayerOrder, RenderJob, ShapeDetails, TextDetails, TransitionFrame,
} from "../types/types";

export const AppContext = createContext<AppContextType | null>(null);

export const AppContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [previewScale, setPreviewScale] = useState<number | null>(0.5);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [primaryVideoDimensions, setPrimaryVideoDimensions] = useState({ width: 0, height: 0 });
  const [containerDimenions, setContainerDimenions] = useState({ width: 0, height: 0 });
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AppContextType["selectedAspectRatio"]>("original");
  const [isCompositionSettingsOpen, setIsCompositionSettingsOpen] = useState(false);
  const [clipsDetails, setClipsDetails] = useState<ClipDetails[]>([]);
  const [clipEffects, setClipEffects] = useState<ClipEffectDetails[]>([]);
  const [textsDetails, setTextsDetails] = useState<TextDetails[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedBlurId, setSelectedBlurId] = useState<string | null>(null);
  const [imagesDetails, setImagesDetails] = useState<ImageDetails[]>([]);
  const [blursDetails, setBlursDetails] = useState<BlurDetails[]>([]);
  const [shapesDetails, setShapesDetails] = useState<ShapeDetails[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [brushesDetails, setBrushesDetails] = useState<BrushDetails[]>([]);
  const [selectedBrushId, setSelectedBrushId] = useState<string | null>(null);
  const [isDrawingBrush, setIsDrawingBrush] = useState(false);
  const [brushDraft, setBrushDraft] = useState({ color: "#FF4D6D", strokeWidth: 10 });
  const [audioDetails, setAudioDetails] = useState<AudioDetails[]>([]);
  const [layerOrder, setLayerOrder] = useState<LayerOrder[]>([]);
  const [transitionsFrames, setTransitionsFrames] = useState<TransitionFrame[]>([]);

  // Legacy refs kept so nothing crashes — no longer used for playback
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const canvasElForAnimations = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationPlayerRef = useRef<any>(null);

  const [mediaPath, setMediaPath] = useState("");
  const [videos, setVideos] = useState<{ video: File; name: string }[]>([]);
  const [imageRefs, setImageRefs] = useState<Record<string, HTMLImageElement | null>>({});
  const [isMediaImporting, setIsMediaImporting] = useState(false);
  const [mediaImportError, setMediaImportError] = useState("");
  const [isShowProcessedVideo, setIsShowProcessedVideo] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // A brand-new, completely empty project still gets a real, playable
  // timeline (5s) from the start — matches the "empty layer defaults to 5s"
  // behavior everywhere content gets added (MediaPanel/ShapesPanel/
  // InteractionOverlay), and lets Composition Settings / Play work before
  // anything has been added at all. Loading a saved project or applying a
  // template always overwrites this with the real value right after. The
  // Composition Settings duration field can both raise and lower this
  // (lowering is floored at the current content's own end, if any).
  const [totalTime, setTotalTime] = useState(5);
  const [seekTime, setSeekTime] = useState(0);
  const [fps, setFps] = useState<number | null>(null);
  const [jumpTo, setJumpTo] = useState(0);
  const [isBlurModalOpen, setIsBlurModalOpen] = useState(false);
  const [selectedImageID, setSelectedImageID] = useState<string | null>(null);
  const [processedVideoLink, setProcessedVideoLink] = useState("");
  const [activeClipIndex, setActiveClipIndex] = useState<number | null>(null);
  const [renderJobs, setRenderJobs] = useState<RenderJob[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<ActiveTemplate | null>(null);
  const [missingMediaNames, setMissingMediaNames] = useState<string[]>([]);
  const [resumedProjectId, setResumedProjectId] = useState<string | null>(null);

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  // Lightweight, session-only undo: not a per-action command stack (that
  // would mean threading a "record this change" call through every single
  // setClipsDetails/setTextsDetails/etc. call site across the whole app —
  // dozens of files). Instead, this watches the same "document" fields
  // useProjectAutosave already tracks and debounce-snapshots them, coalescing
  // a burst of rapid changes (a drag, a slider scrub) into one undo step —
  // same trade-off most editors make for continuous-value edits. Snapshots
  // hold the live array/object references directly (not serialized), which
  // is safe because every mutation in this codebase already replaces arrays
  // immutably (`prev.map/filter/[...prev, x]`), never mutates in place.
  interface DocSnapshot {
    clips: ClipDetails[]; texts: TextDetails[]; images: ImageDetails[]; blurs: BlurDetails[];
    shapes: ShapeDetails[]; brushes: BrushDetails[]; audio: AudioDetails[];
  }
  const snapshot = useCallback((): DocSnapshot => ({
    clips: clipsDetails, texts: textsDetails, images: imagesDetails, blurs: blursDetails,
    shapes: shapesDetails, brushes: brushesDetails, audio: audioDetails,
  }), [clipsDetails, textsDetails, imagesDetails, blursDetails, shapesDetails, brushesDetails, audioDetails]);

  const applySnapshot = useCallback((s: DocSnapshot) => {
    setClipsDetails(s.clips); setTextsDetails(s.texts); setImagesDetails(s.images);
    setBlursDetails(s.blurs); setShapesDetails(s.shapes); setBrushesDetails(s.brushes);
    setAudioDetails(s.audio);
  }, []);

  const historyRef = useRef<{ past: DocSnapshot[]; future: DocSnapshot[] }>({ past: [], future: [] });
  const lastCommittedRef = useRef<DocSnapshot | null>(null);
  const restoringRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HISTORY_LIMIT = 100;

  // Debounce-commit a history step whenever the tracked document actually
  // changes — skipped right after an undo/redo applies its own snapshot, so
  // restoring history doesn't get recorded as a NEW change.
  useEffect(() => {
    if (lastCommittedRef.current === null) { lastCommittedRef.current = snapshot(); return; }
    if (restoringRef.current) { restoringRef.current = false; lastCommittedRef.current = snapshot(); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const prev = lastCommittedRef.current;
    debounceRef.current = setTimeout(() => {
      historyRef.current.past.push(prev);
      if (historyRef.current.past.length > HISTORY_LIMIT) historyRef.current.past.shift();
      historyRef.current.future = [];
      lastCommittedRef.current = snapshot();
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipsDetails, textsDetails, imagesDetails, blursDetails, shapesDetails, brushesDetails, audioDetails]);

  const undo = useCallback(() => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const { past, future } = historyRef.current;
    if (past.length === 0) return;
    const prevSnap = past.pop()!;
    future.push(snapshot());
    restoringRef.current = true;
    lastCommittedRef.current = prevSnap;
    applySnapshot(prevSnap);
  }, [snapshot, applySnapshot]);

  const redo = useCallback(() => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    const nextSnap = future.pop()!;
    past.push(snapshot());
    restoringRef.current = true;
    lastCommittedRef.current = nextSnap;
    applySnapshot(nextSnap);
  }, [snapshot, applySnapshot]);

  // Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) to redo — ignored while
  // typing in an input/textarea/contentEditable so it doesn't fight a text
  // field's own native undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "z" && e.key.toLowerCase() !== "y") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      const isRedo = (e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y";
      e.preventDefault();
      if (isRedo) redo(); else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // A text/image/blur layer newly added at "the full composition length"
  // (MediaPanel's addText/addImage/addBlur default) keeps following the
  // composition as it grows, the same way an After Effects layer dragged
  // out to the comp's own duration marker keeps up when you lengthen the
  // comp — but only until the user deliberately trims that specific layer
  // to something else, at which point it naturally stops matching this
  // condition and is left alone. Detected structurally (no extra "is
  // following" field needed): a layer whose endTime still exactly equals
  // the PREVIOUS totalTime, at the moment totalTime grows, was clearly
  // still spanning "the whole comp" and gets carried along; anything
  // already trimmed short doesn't match and is untouched.
  const prevTotalTimeRef = useRef(totalTime);
  useEffect(() => {
    const prev = prevTotalTimeRef.current;
    if (totalTime > prev + 0.001) {
      const stillFollowing = (end: number) => Math.abs(end - prev) < 0.05;
      setTextsDetails(ts => ts.map(t => stillFollowing(t.endTime) ? { ...t, endTime: totalTime } : t));
      setImagesDetails(is => is.map(i => stillFollowing(i.endTime) ? { ...i, endTime: totalTime } : i));
      setBlursDetails(bs => bs.map(b => stillFollowing(b.endTime) ? { ...b, endTime: totalTime } : b));
    }
    prevTotalTimeRef.current = totalTime;
  }, [totalTime]);

  // A video-less project's duration auto-fits to its content's own latest
  // end — both growing (already true, add-handlers already bump totalTime
  // up) AND shrinking as content is trimmed shorter, so trimming a text/
  // shape/blur/brush's end time is reflected immediately without a trip to
  // Composition Settings. Video-based projects keep the existing
  // grow-only behavior (never auto-shrinks) — trimming a CLIP is a much
  // more deliberate, frequent editing action there, and silently shortening
  // the whole timeline every time would be surprising.
  useEffect(() => {
    if (clipsDetails.length > 0) return;
    const maxEnd = Math.max(
      0,
      ...textsDetails.map(t => t.endTime ?? 0),
      ...imagesDetails.map(i => i.endTime ?? 0),
      ...blursDetails.map(b => b.endTime ?? 0),
      ...shapesDetails.map(s => s.endTime ?? 0),
      ...brushesDetails.map(b => b.endTime ?? 0),
    );
    if (maxEnd > 0) {
      setTotalTime(prev => (Math.abs(prev - maxEnd) > 0.001 ? maxEnd : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipsDetails.length, textsDetails, imagesDetails, blursDetails, shapesDetails, brushesDetails]);

  return (
    <AppContext.Provider value={{
      previewScale, setPreviewScale,
      timelineZoom, setTimelineZoom,
      primaryVideoDimensions, setPrimaryVideoDimensions,
      containerDimenions, setContainerDimenions,
      selectedAspectRatio, setSelectedAspectRatio,
      isCompositionSettingsOpen, setIsCompositionSettingsOpen,
      clipsDetails, setClipsDetails,
      clipEffects, setClipEffects,
      textsDetails, setTextsDetails,
      selectedClipId, setSelectedClipId,
      selectedTextId, setSelectedTextId,
      selectedBlurId, setSelectedBlurId,
      imagesDetails, setImagesDetails,
      blursDetails, setBlursDetails,
      shapesDetails, setShapesDetails,
      selectedShapeId, setSelectedShapeId,
      brushesDetails, setBrushesDetails,
      selectedBrushId, setSelectedBrushId,
      isDrawingBrush, setIsDrawingBrush,
      brushDraft, setBrushDraft,
      audioDetails, setAudioDetails,
      layerOrder, setLayerOrder,
      canvasEl, canvasElForAnimations,
      videoRef, animationPlayerRef,
      videos, setVideos,
      mediaPath, setMediaPath,
      imageRefs, setImageRefs,
      isMediaImporting, setIsMediaImporting,
      mediaImportError, setMediaImportError,
      currentTime, setCurrentTime,
      totalTime, setTotalTime,
      fps, setFps,
      seekTime, setSeekTime,
      jumpTo, setJumpTo,
      isBlurModalOpen, setIsBlurModalOpen,
      selectedImageID, setSelectedImageID,
      isShowProcessedVideo, setIsShowProcessedVideo,
      processedVideoLink, setProcessedVideoLink,
      transitionsFrames, setTransitionsFrames,
      activeClipIndex, setActiveClipIndex,
      renderJobs, setRenderJobs,
      activeTemplate, setActiveTemplate,
      missingMediaNames, setMissingMediaNames,
      resumedProjectId, setResumedProjectId,
      undo, redo,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppDetailsContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppDetailsContext must be used within AppContextProvider");
  return context;
};

// ── Engine controls context ────────────────────────────────────────────────────
// Wires play/pause/seekTo from CanvasEngine into any component via hook
export interface BufferedRange { start: number; end: number; }

interface EngineControls {
  play: () => void;
  pause: () => void;
  seekTo: (t: number) => void;
  isPlaying: boolean;
  // Buffered ranges (master-timeline seconds) + live stall state, driven by
  // CanvasEngine's real video "progress"/"waiting"/"canplay" events — lets
  // any component (the buffered scrub bar, a future mini-map, etc.) show
  // real load state without reaching into the engine itself.
  bufferedRanges: BufferedRange[];
  setBufferedRanges: (r: BufferedRange[]) => void;
  isBuffering: boolean;
  setIsBuffering: (b: boolean) => void;
  notifyEnded: () => void;
  setControls: (c: { play: () => void; pause: () => void; seekTo: (t: number) => void }) => void;
}

export const EngineControlsContext = React.createContext<EngineControls>({
  play: () => {}, pause: () => {}, seekTo: () => {}, isPlaying: false,
  bufferedRanges: [], setBufferedRanges: () => {},
  isBuffering: false, setIsBuffering: () => {},
  notifyEnded: () => {}, setControls: () => {},
});

export function EngineControlsProvider({ children }: { children: React.ReactNode }) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [bufferedRanges, setBufferedRanges] = React.useState<BufferedRange[]>([]);
  const [isBuffering, setIsBuffering] = React.useState(false);
  const playRef = React.useRef<() => void>(() => {});
  const pauseRef = React.useRef<() => void>(() => {});
  const seekRef = React.useRef<(t: number) => void>(() => {});

  const setControls = React.useCallback((c: { play: () => void; pause: () => void; seekTo: (t: number) => void }) => {
    playRef.current = () => { c.play(); setIsPlaying(true); };
    pauseRef.current = () => { c.pause(); setIsPlaying(false); };
    // seekTo: always pause isPlaying state — engine handles actual playback resume
    seekRef.current = (t: number) => { c.seekTo(t); };
  }, []);

  return (
    <EngineControlsContext.Provider value={{
      play: () => playRef.current(),
      pause: () => pauseRef.current(),
      seekTo: (t) => seekRef.current(t),
      isPlaying,
      bufferedRanges, setBufferedRanges,
      isBuffering, setIsBuffering,
      notifyEnded: () => setIsPlaying(false),
      setControls,
    }}>
      {children}
    </EngineControlsContext.Provider>
  );
}

export const useEngineControls = () => React.useContext(EngineControlsContext);
