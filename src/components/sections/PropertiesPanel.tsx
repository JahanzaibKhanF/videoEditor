"use client";

import { useState } from "react";
import { MousePointerClick, VolumeX, Volume2 } from "@/utils/icons";
import TextEditor from "./TextEditor";
import AnimationSelection from "../animations/AnimationSelection";
import ClipTransitionSelector from "../transitions/ClipTransitionSelector";
import { useAppDetailsContext } from "../../context/useAppContext";
import Slider from "../ui/Slider";
import NumberInput from "../ui/NumberInput";

const TABS = ["Edit", "Animation", "Transitions"] as const;

export default function PropertiesPanel() {
  const [tab, setTab] = useState<typeof TABS[number]>("Edit");
  const {
    textsDetails, blursDetails, imagesDetails,
    setBlursDetails, setImagesDetails,
    selectedBlurId, selectedImageID,
    selectedClipId, clipsDetails, setClipsDetails,
    audioDetails, setAudioDetails,
  } = useAppDetailsContext();

  const panel = "bg-studio-raised border border-studio-border rounded-xl p-3.5";
  const label = "text-[11px] text-[#6B7280] dark:text-[rgba(255,255,255,.45)] font-semibold min-w-[52px]";
  const sectionTitle = "text-[10.5px] font-bold uppercase tracking-[.7px] text-[#6B7280] dark:text-[rgba(255,255,255,.35)] mb-3";
  const row = "flex items-center gap-2.5";

  return (
    <div className="flex flex-col h-full bg-studio-surface">
      {/* Tab bar */}
      <div className="flex border-b border-studio-border flex-shrink-0">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[11.5px] font-semibold cursor-pointer border-none bg-transparent font-[inherit] border-b-2 transition-all
              ${tab === t
                ? "text-signal border-signal"
                : "text-[#6B7280] dark:text-[rgba(255,255,255,.4)] border-transparent hover:text-signal"
              }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 flex flex-col gap-3">
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
                <div className={sectionTitle}>Video Clip</div>
                <div className="flex flex-col gap-3">
                  <div className="text-[11.5px] font-semibold text-ink-primary truncate">{clip.name}</div>

                  {/* Audio mute */}
                  <div className={row}>
                    <span className={label}>Audio</span>
                    <button
                      onClick={() => audio && setAudioDetails(prev => prev.map(a => a.clipId === selectedClipId ? { ...a, muted: !a.muted } : a))}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "5px 12px", borderRadius: 8, border: "none",
                        cursor: audio ? "pointer" : "not-allowed",
                        fontFamily: "inherit", fontSize: 11, fontWeight: 700,
                        background: isMuted ? "rgba(239,68,68,.1)" : "rgba(16,185,129,.1)",
                        color: isMuted ? "#EF4444" : "#10B981",
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
                      <span className="text-[11px] text-ink-muted dark:text-[rgba(255,255,255,.35)] font-mono min-w-[32px] text-right">
                        {Math.round(vol * 100)}%
                      </span>
                    </div>
                  )}

                  {/* Scale */}
                  <div className={row}>
                    <span className={label}>Scale</span>
                    <Slider value={clip.scale ?? 1} min={0.1} max={2}
                      onChange={v => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, scale: v } : cl))} />
                    <span className="text-[11px] text-ink-muted dark:text-[rgba(255,255,255,.35)] font-mono min-w-[32px] text-right">
                      {((clip.scale ?? 1) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* X / Y */}
                  <div className={row}>
                    <span className={label}>Position</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-ink-muted font-bold">X</span>
                      <NumberInput value={Math.round(clip.x ?? 0)} step={1}
                        onChange={v => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, x: v } : cl))} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-ink-muted font-bold">Y</span>
                      <NumberInput value={Math.round(clip.y ?? 0)} step={1}
                        onChange={v => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, y: v } : cl))} />
                    </div>
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
                <div className={sectionTitle}>Blur Region</div>
                <div className={row}>
                  <span className={label}>Intensity</span>
                  <Slider value={blur.blurAmount ?? 10} min={0} max={100} step={1}
                    onChange={v => setBlursDetails(prev => prev.map(b => b.id === selectedBlurId ? { ...b, blurAmount: v } : b))} />
                  <NumberInput value={blur.blurAmount ?? 10} min={0} max={100} step={1}
                    onChange={v => setBlursDetails(prev => prev.map(b => b.id === selectedBlurId ? { ...b, blurAmount: v } : b))} />
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
                <div className={sectionTitle}>Image</div>
                <div className={row}>
                  <span className={label}>Opacity</span>
                  <Slider value={img.opacity ?? 1} min={0} max={1}
                    onChange={v => setImagesDetails(prev => prev.map(i => i.id === selectedImageID ? { ...i, opacity: v } : i))} />
                  <span className="text-[11px] text-ink-muted dark:text-[rgba(255,255,255,.35)] font-mono min-w-[32px] text-right">
                    {Math.round((img.opacity ?? 1) * 100)}%
                  </span>
                </div>
              </div>
            );
          })()}

          {/* ── Text ─────────────────────────────────────────── */}
          {textsDetails.length > 0 && <TextEditor />}

          {/* ── Empty state ──────────────────────────────────── */}
          {!selectedClipId && textsDetails.length === 0 && blursDetails.length === 0 && imagesDetails.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-ink-muted dark:text-[rgba(255,255,255,.2)]">
              <MousePointerClick size={30} strokeWidth={1.4} className="opacity-50" />
              <p className="text-[12px] text-center font-medium">Select an element<br />to edit its properties</p>
            </div>
          )}
        </>}

        {tab === "Animation" && <AnimationSelection />}
        {tab === "Transitions" && <ClipTransitionSelector />}
      </div>
    </div>
  );
}
