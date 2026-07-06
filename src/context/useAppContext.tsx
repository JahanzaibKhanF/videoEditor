"use client";

import React, { createContext, useState, useContext, useRef } from "react";
import {
  AppContextType, ActiveTemplate, AudioDetails, BlurDetails, ClipDetails,
  ImageDetails, LayerOrder, RenderJob, TextDetails, TransitionFrame,
} from "../types/types";

export const AppContext = createContext<AppContextType | null>(null);

export const AppContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [previewScale, setPreviewScale] = useState<number | null>(0.5);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [primaryVideoDimensions, setPrimaryVideoDimensions] = useState({ width: 0, height: 0 });
  const [containerDimenions, setContainerDimenions] = useState({ width: 0, height: 0 });
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AppContextType["selectedAspectRatio"]>("original");
  const [isCompostionSettingsOpen, setIsCompostionSettingsOpen] = useState(false);
  const [clipsDetails, setClipsDetails] = useState<ClipDetails[]>([]);
  const [textsDetails, setTextsDetails] = useState<TextDetails[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedBlurId, setSelectedBlurId] = useState<string | null>(null);
  const [imagesDetails, setImagesDetails] = useState<ImageDetails[]>([]);
  const [blursDetails, setBlursDetails] = useState<BlurDetails[]>([]);
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
  const [imageRefs, setImageRefs] = useState<Record<number, HTMLImageElement | null>>({});
  const [isMediaImporting, setIsMediaImporting] = useState(false);
  const [mediaImportError, setMediaImportError] = useState("");
  const [isShowProcessedVideo, setIsShowProcessedVideo] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [seekTime, setSeekTime] = useState(0);
  const [fps, setFps] = useState<number | null>(null);
  const [jumpTo, setJumpTo] = useState(0);
  const [isBlurModalOpen, setIsBlurModalOpen] = useState(false);
  const [selectedImageID, setSelectedImageID] = useState<string | null>(null);
  const [processedVideoLink, setProcessedVideoLink] = useState("");
  const [activeClipIndex, setActiveClipIndex] = useState<number | null>(null);
  const [renderJobs, setRenderJobs] = useState<RenderJob[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<ActiveTemplate | null>(null);

  return (
    <AppContext.Provider value={{
      previewScale, setPreviewScale,
      timelineZoom, setTimelineZoom,
      primaryVideoDimensions, setPrimaryVideoDimensions,
      containerDimenions, setContainerDimenions,
      selectedAspectRatio, setSelectedAspectRatio,
      isCompostionSettingsOpen, setIsCompostionSettingsOpen,
      clipsDetails, setClipsDetails,
      textsDetails, setTextsDetails,
      selectedClipId, setSelectedClipId,
      selectedTextId, setSelectedTextId,
      selectedBlurId, setSelectedBlurId,
      imagesDetails, setImagesDetails,
      blursDetails, setBlursDetails,
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
interface EngineControls {
  play: () => void;
  pause: () => void;
  seekTo: (t: number) => void;
  isPlaying: boolean;
  notifyEnded: () => void;
  setControls: (c: { play: () => void; pause: () => void; seekTo: (t: number) => void }) => void;
}

export const EngineControlsContext = React.createContext<EngineControls>({
  play: () => {}, pause: () => {}, seekTo: () => {}, isPlaying: false,
  notifyEnded: () => {}, setControls: () => {},
});

export function EngineControlsProvider({ children }: { children: React.ReactNode }) {
  const [isPlaying, setIsPlaying] = React.useState(false);
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
      notifyEnded: () => setIsPlaying(false),
      setControls,
    }}>
      {children}
    </EngineControlsContext.Provider>
  );
}

export const useEngineControls = () => React.useContext(EngineControlsContext);
