import React from "react";

export interface TextDetails {
  id: string;
  text: string;
  textX: number;
  textY: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  opacity: number;
  startTime: number;
  endTime: number;
  animation: string;
  zIndex?: number;
}

export interface ImageDetails {
  id: string;
  src: string;
  image: File;
  imageX: number;
  imageY: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  opacity?: number;
  startTime: number;
  endTime: number;
  animation: string;
  zIndex?: number;
  colorAdjustments?: ColorAdjustments;
  // The real original filename on disk (e.g. "vacation.jpg") — separate
  // from `id`, which is only ever an internal uuid. This is what relinking
  // a project's local media folder actually matches against; without it
  // there's nothing to match a re-picked file to at all.
  sourceFileName?: string;
}

/**
 * Color adjustments — manual grading controls, same set every normal video
 * editor has. Applied identically in the live canvas preview, the
 * WebCodecs export path, and the FFmpeg fallback path (see
 * compositeFrame.ts and clientRender.ts) so what you see while editing is
 * what actually renders.
 */
export interface ColorAdjustments {
  brightness: number;  // 1 = unchanged, 0 = black, 2 = double
  contrast: number;    // 1 = unchanged
  saturation: number;  // 1 = unchanged, 0 = grayscale
  temperature: number; // -100 (cool/blue) .. 0 (neutral) .. 100 (warm/orange)
}

export const DEFAULT_COLOR_ADJUSTMENTS: ColorAdjustments = {
  brightness: 1, contrast: 1, saturation: 1, temperature: 0,
};

export interface ClipDetails {
  duration: number;
  startTime: number | null;
  endTime: number | null;
  startPosition: number;
  endPosition: number;
  id: string;
  name?: string;
  src: string;
  video: string;
  transition: string;
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
  muted?: boolean;
  zIndex?: number;
  colorAdjustments?: ColorAdjustments;
  // Full duration of the underlying source file, independent of how much of
  // it this clip actually uses (startTime..endTime). Only set for clips
  // placed via a template slot, where the slot constrains the clip to a
  // fixed duration that may be shorter than the source asset — this is what
  // lets the template clip range selector know how far it can scrub.
  sourceDuration?: number;
  // Speed multiplier (or ramp) applied on export/preview. See
  // utils/speedRamp.ts for the ramp-curve shape when this is an array.
  speed?: number | SpeedRampPoint[];
  // The real original filename on disk (e.g. "vacation.mp4") — separate
  // from `video`, which is an internal synthetic identifier
  // ("video{timestamp}_{index}") used to group clips that share the same
  // underlying source file (e.g. two halves of a split clip). Relinking a
  // project's local media folder matches against THIS field, not `video` —
  // a picked file's real name can never match a synthetic internal id, and
  // matching against `video` (which earlier code did) meant relinking
  // never actually worked for any project, ever.
  sourceFileName?: string;
  // Set once AI background removal has been applied to this clip. `src` then
  // points at the transparent WebM (cached locally in bgRemovedStore.ts,
  // synced to Cloudinary at `url`). On reopen, useBgRemovedRestore rebuilds
  // `src` from the local blob (or `url`) instead of the original file.
  bgRemoved?: {
    assetId: string;
    url?: string;      // Cloudinary secure_url (cross-device copy)
    publicId?: string; // Cloudinary public_id — needed to delete the asset
  };
}

// A single control point in a speed ramp: at `atFraction` (0..1 through the
// clip's own trimmed duration), play back at `speedMultiplier`× — values are
// linearly interpolated between points, so e.g. [ {0,0.3}, {0.5,0.3},
// {0.55,3}, {1,3} ] holds slow-mo then snaps to fast motion.
export interface SpeedRampPoint {
  atFraction: number;
  speedMultiplier: number;
}

// Clip-level visual effects — layered on top of a clip's video during its
// active time range, rendered by compositeFrame.ts (so both live preview
// AND the WebCodecs export path get them automatically; the FFmpeg fallback
// path does NOT support these, since it builds its own separate ffmpeg
// filter graph rather than using the canvas compositor — documented at the
// call site in clientRender.ts).
export type ClipEffectType = "shake" | "wiggle" | "colorBurst" | "particles" | "gradientOverlay";

export interface ClipEffectDetails {
  id: string;
  clipId: string;
  type: ClipEffectType;
  startTime: number; // in the CLIP's own on-timeline window (startPosition..endPosition), seconds from clip start
  endTime: number;
  intensity: number;   // 0..1, meaning depends on type (jitter amount, wiggle angle, burst count, etc.)
  color: string;        // primary color (colorBurst/particles/gradientOverlay)
  secondaryColor?: string; // gradientOverlay's second stop
}

export interface BlurDetails {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  blurAmount: number;
  startTime: number;
  endTime: number;
  zIndex?: number;
}

export interface AudioDetails {
  id: string;
  /** which video clip this audio belongs to */
  clipId: string;
  name: string;
  startTime: number;
  endTime: number;
  volume: number;   // 0–1
  muted: boolean;
}

export type TransitionFrame = {
  id: string;
  frame: File;
  frameSrc: string;
};

export type AspectRatio =
  | "original"
  | "16:9"
  | "9:16"
  | "1:1"
  | "4:5"
  | "3:4"
  | "xfeeds"
  | "ytshorts"
  | "instareels"
  | "tiktok";

export type LayerType = "video" | "audio" | "image" | "text" | "blur";

export interface LayerOrder {
  type: LayerType;
  zIndex: number;
}



// Template slot — one video clip slot in a CapCut-style template
export interface TemplateSlot {
  slotIndex: number;
  label: string;
  durationSecs: number;
  file?: File;
  objectUrl?: string;
}

export interface ActiveTemplate {
  templateId: string;
  templateName: string;
  accentColor: string;
  coverImage: string | null;
  aspectRatio: string;
  slots: TemplateSlot[];
}

export interface RenderJob {
  jobId: string;
  name: string;          // e.g. "video1.mp4"
  processName: string;
  progress: number;
  logs: string[];
  cancelled: boolean;
  videoUrl?: string;     // set when completed (local blob: URL)
  error?: string;
}

export interface AppContextType {
  previewScale: number | null;
  setPreviewScale: React.Dispatch<React.SetStateAction<number | null>>;
  timelineZoom: number;
  setTimelineZoom: React.Dispatch<React.SetStateAction<number>>;
  primaryVideoDimensions: { width: number; height: number };
  setPrimaryVideoDimensions: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  containerDimenions: { width: number; height: number };
  setContainerDimenions: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  selectedAspectRatio: AspectRatio;
  setSelectedAspectRatio: (value: AspectRatio) => void;
  isCompositionSettingsOpen: boolean;
  setIsCompositionSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  clipsDetails: ClipDetails[];
  setClipsDetails: React.Dispatch<React.SetStateAction<ClipDetails[]>>;
  clipEffects: ClipEffectDetails[];
  setClipEffects: React.Dispatch<React.SetStateAction<ClipEffectDetails[]>>;
  textsDetails: TextDetails[];
  blursDetails: BlurDetails[];
  setBlursDetails: React.Dispatch<React.SetStateAction<BlurDetails[]>>;
  selectedClipId: string | null;
  setSelectedClipId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedTextId: string | null;
  setSelectedTextId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedBlurId: string | null;
  setSelectedBlurId: React.Dispatch<React.SetStateAction<string | null>>;
  setTextsDetails: React.Dispatch<React.SetStateAction<TextDetails[]>>;
  imagesDetails: ImageDetails[];
  setImagesDetails: React.Dispatch<React.SetStateAction<ImageDetails[]>>;
  audioDetails: AudioDetails[];
  setAudioDetails: React.Dispatch<React.SetStateAction<AudioDetails[]>>;
  layerOrder: LayerOrder[];
  setLayerOrder: React.Dispatch<React.SetStateAction<LayerOrder[]>>;

  canvasEl: React.RefObject<HTMLCanvasElement>;
  canvasElForAnimations: React.RefObject<HTMLCanvasElement>;
  videoRef?: React.RefObject<HTMLVideoElement>; // deprecated - use EngineControls
  animationPlayerRef?: React.RefObject<any>;
  videos: { video: File; name: string }[];
  setVideos: React.Dispatch<React.SetStateAction<{ video: File; name: string }[]>>;
  mediaPath: string;
  setMediaPath: React.Dispatch<React.SetStateAction<string>>;
  imageRefs: Record<string, HTMLImageElement | null>;
  setImageRefs: React.Dispatch<React.SetStateAction<Record<number, HTMLImageElement | null>>>;
  isMediaImporting: boolean;
  setIsMediaImporting: React.Dispatch<React.SetStateAction<boolean>>;
  mediaImportError: string;
  setMediaImportError: React.Dispatch<React.SetStateAction<string>>;
  currentTime: number;
  setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
  totalTime: number;
  setTotalTime: React.Dispatch<React.SetStateAction<number>>;
  fps: number | null;
  setFps: React.Dispatch<React.SetStateAction<number | null>>;
  seekTime: number;
  setSeekTime: React.Dispatch<React.SetStateAction<number>>;
  jumpTo: number;
  setJumpTo: React.Dispatch<React.SetStateAction<number>>;
  isShowProcessedVideo: boolean;
  setIsShowProcessedVideo: React.Dispatch<React.SetStateAction<boolean>>;
  isBlurModalOpen: boolean;
  setIsBlurModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedImageID: string | null;
  setSelectedImageID: React.Dispatch<React.SetStateAction<string | null>>;
  processedVideoLink: string;
  setProcessedVideoLink: React.Dispatch<React.SetStateAction<string>>;
  transitionsFrames: TransitionFrame[];
  setTransitionsFrames: React.Dispatch<React.SetStateAction<TransitionFrame[]>>;
  activeClipIndex: number | null;
  setActiveClipIndex: React.Dispatch<React.SetStateAction<number | null>>;
  renderJobs: RenderJob[];
  setRenderJobs: React.Dispatch<React.SetStateAction<RenderJob[]>>;
  activeTemplate: ActiveTemplate | null;
  setActiveTemplate: React.Dispatch<React.SetStateAction<ActiveTemplate | null>>;
  // Set once when a saved project is reopened whose video/image files
  // aren't found in the currently-linked local media folder — drives
  // MediaRelinkBanner.tsx. Cleared as files are matched by name.
  missingMediaNames: string[];
  setMissingMediaNames: React.Dispatch<React.SetStateAction<string[]>>;
  // Non-null only when the current session started from "Resume project"
  // rather than a new blank/template project — lets useProjectAutosave
  // save back to the same row instead of creating a new one.
  resumedProjectId: string | null;
  setResumedProjectId: React.Dispatch<React.SetStateAction<string | null>>;
}

// Engine control functions injected into context from Screen
export interface EngineControls {
  play: () => void;
  pause: () => void;
  seekTo: (t: number) => void;
  isPlaying: () => boolean;
}
