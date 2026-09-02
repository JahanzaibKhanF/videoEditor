"use client";

import { useState } from "react";
import { MousePointerClick, VolumeX, Volume2, Film, Droplets, ImageIcon, Sparkles, Shuffle, SlidersHorizontal, Wand2 } from "@/utils/icons";
import TextEditor from "../editors/TextEditor";
import AnimationSelection from "../animations/AnimationSelection";
import ClipTransitionSelector from "../transitions/ClipTransitionSelector";
import { useAppDetailsContext } from "../../context/useAppContext";
import Slider from "../ui/Slider";
import NumberInput from "../ui/NumberInput";
import ColorAdjustPanel from "../editors/ColorAdjustPanel";

const TABS = [
  { key: "Edit", icon: SlidersHorizontal },
  { key: "Animation", icon: Wand2 },
  { key: "Transitions", icon: Shuffle },
] as const;

export default function PropertiesPanel() {
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("Edit");
  const {
    textsDetails, blursDetails, imagesDetails,
    setBlursDetails, setImagesDetails,
    selectedBlurId, selectedImageID,
    selectedClipId, clipsDetails, setClipsDetails,
    audioDetails, setAudioDetails,
  } = useAppDetailsContext();

  const panel = "bg-studio-raised border border-studio-border rounded-xl overflow-hidden flex flex-col";
  const panelHeader = "flex items-center gap-2 px-3.5 py-2.5 border-b border-studio-border flex-shrink-0";
  // Bounded + independently scrollable — a section's own controls (audio,
  // color grading, etc.) can always be reached by scrolling THIS section,
  // instead of silently getting clipped when the whole options panel is
  // resized short and the outer scroll container ends up with too little
  // room to make every section fully visible at once.
  const panelBody = "p-3.5 flex flex-col gap-3 overflow-y-auto scrollbar-thin max-h-[46vh]";
  const label = "text-[11px] text-ink-muted font-semibold min-w-[52px]";
  const row = "flex items-center gap-2.5";

  const hasSelection = !!selectedClipId || textsDetails.length > 0 || blursDetails.length > 0 || imagesDetails.length > 0;

  return (
    <div className="flex flex-col h-full bg-studio-surface">
      {/* Tab bar — pill style */}
      <div className="flex gap-1 p-2 border-b border-studio-border flex-shrink-0">
        {TABS.map(({ key, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11.5px] font-bold cursor-pointer border-none font-[inherit] transition-all
              ${tab === key
                ? "bg-signal/12 text-signal"
                : "bg-transparent text-ink-muted hover:bg-studio-hover hover:text-ink-secondary"
              }`}>
            <Icon size={12} />
            {key}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 flex flex-col gap-3">
        {tab === "Edit" && <>

          {/* ── Selected clip ─────────────────────────────────── */}
          {(() => {
            const clip = clipsDetails.find(c => c.id === selectedClipId);
            const audio = audioDetails.find(a => a.clipId === selectedClipId);
            if (!clip) return null;
            const isMuted = audio?.muted ?? false;
            const vol = audio?.volume ?? 1;
            return (
              <div className={panel}>
                <div className={panelHeader}>
                  <div className="w-6 h-6 rounded-md bg-scrub/12 text-scrub flex items-center justify-center flex-shrink-0">
                    <Film size={12} />
                  </div>
                  <span className="text-[11.5px] font-bold text-ink-primary truncate flex-1">{clip.name}</span>
                </div>
                <div className={panelBody}>
                  {/* Audio mute */}
                  <div className={row}>
                    <span className={label}>Audio</span>
                    <button
                      onClick={() => audio && setAudioDetails(prev => prev.map(a => a.clipId === selectedClipId ? { ...a, muted: !a.muted } : a))}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-[11px] transition-colors"
                      style={{
                        cursor: audio ? "pointer" : "not-allowed",
                        background: isMuted ? "rgba(255,79,112,.1)" : "rgba(51,216,160,.1)",
                        color: isMuted ? "#FF4F70" : "#33D8A0",
                        opacity: audio ? 1 : 0.4,
                      }}>
                      {isMuted ? <><VolumeX size={12} /> Muted</> : <><Volume2 size={12} /> Audio On</>}
                    </button>
                  </div>

                  {/* Volume */}
                  {audio && !isMuted && (
                    <div className={row}>
                      <span className={label}>Volume</span>
                      <Slider value={vol} min={0} max={1}
                        onChange={v => setAudioDetails(prev => prev.map(a => a.clipId === selectedClipId ? { ...a, volume: v } : a))} />
                      <span className="text-[11px] text-ink-faint font-mono min-w-[32px] text-right">
                        {Math.round(vol * 100)}%
                      </span>
                    </div>
                  )}

                  {/* Scale */}
                  <div className={row}>
                    <span className={label}>Scale</span>
                    <Slider value={clip.scale ?? 1} min={0.1} max={2}
                      onChange={v => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, scale: v } : cl))} />
                    <span className="text-[11px] text-ink-faint font-mono min-w-[32px] text-right">
                      {((clip.scale ?? 1) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* X / Y */}
                  <div className={row}>
                    <span className={label}>Position</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-ink-faint font-bold">X</span>
                      <NumberInput value={Math.round(clip.x ?? 0)} step={1}
                        onChange={v => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, x: v } : cl))} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-ink-faint font-bold">Y</span>
                      <NumberInput value={Math.round(clip.y ?? 0)} step={1}
                        onChange={v => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, y: v } : cl))} />
                    </div>
                  </div>

                  <div className="pt-1 border-t border-studio-border">
                    <ColorAdjustPanel
                      adjustments={clip.colorAdjustments}
                      onChange={adj => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, colorAdjustments: adj } : cl))}
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Blur ─────────────────────────────────────────── */}
          {blursDetails.length > 0 && (() => {
            const blur = blursDetails.find(b => b.id === selectedBlurId);
            if (!blur) return null;
            return (
              <div className={panel}>
                <div className={panelHeader}>
                  <div className="w-6 h-6 rounded-md bg-success/12 text-success flex items-center justify-center flex-shrink-0">
                    <Droplets size={12} />
                  </div>
                  <span className="text-[11.5px] font-bold text-ink-primary">Blur Region</span>
                </div>
                <div className={panelBody}>
                  <div className={row}>
                    <span className={label}>Intensity</span>
                    <Slider value={blur.blurAmount ?? 10} min={0} max={100} step={1}
                      onChange={v => setBlursDetails(prev => prev.map(b => b.id === selectedBlurId ? { ...b, blurAmount: v } : b))} />
                    <NumberInput value={blur.blurAmount ?? 10} min={0} max={100} step={1}
                      onChange={v => setBlursDetails(prev => prev.map(b => b.id === selectedBlurId ? { ...b, blurAmount: v } : b))} />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Image ────────────────────────────────────────── */}
          {imagesDetails.length > 0 && (() => {
            const img = imagesDetails.find(i => i.id === selectedImageID);
            if (!img) return null;
            return (
              <div className={panel}>
                <div className={panelHeader}>
                  <div className="w-6 h-6 rounded-md bg-signal/12 text-signal flex items-center justify-center flex-shrink-0">
                    <ImageIcon size={12} />
                  </div>
                  <span className="text-[11.5px] font-bold text-ink-primary">Image</span>
                </div>
                <div className={panelBody}>
                  <div className={row}>
                    <span className={label}>Opacity</span>
                    <Slider value={img.opacity ?? 1} min={0} max={1}
                      onChange={v => setImagesDetails(prev => prev.map(i => i.id === selectedImageID ? { ...i, opacity: v } : i))} />
                    <span className="text-[11px] text-ink-faint font-mono min-w-[32px] text-right">
                      {Math.round((img.opacity ?? 1) * 100)}%
                    </span>
                  </div>

                  <div className="pt-1 border-t border-studio-border">
                    <ColorAdjustPanel
                      adjustments={img.colorAdjustments}
                      onChange={adj => setImagesDetails(prev => prev.map(i => i.id === selectedImageID ? { ...i, colorAdjustments: adj } : i))}
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Text ─────────────────────────────────────────── */}
          {textsDetails.length > 0 && <TextEditor />}

          {/* ── Empty state ──────────────────────────────────── */}
          {!hasSelection && (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-ink-faint">
              <div className="w-12 h-12 rounded-full bg-studio-hover flex items-center justify-center">
                <MousePointerClick size={20} strokeWidth={1.6} />
              </div>
              <p className="text-[12px] text-center font-medium text-ink-muted">Select an element<br />to edit its properties</p>
            </div>
          )}
        </>}

        {tab === "Animation" && <AnimationSelection />}
        {tab === "Transitions" && <ClipTransitionSelector />}
      </div>
    </div>
  );
}
