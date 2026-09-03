"use client";

import { v4 as uuidv4 } from "uuid";
import { useAppDetailsContext } from "../../context/useAppContext";
import { ClipDetails, ClipEffectDetails, ClipEffectType } from "../../types/types";
import Slider from "../ui/Slider";
import { FieldHint } from "../ui/Field";
import { Zap, Waves, Sparkles as SparklesIcon, Sparkle, Palette, X } from "@/utils/icons";

const EFFECT_TYPES: { type: ClipEffectType; label: string; Icon: any; gradient: string; defaultColor: string; defaultIntensity: number }[] = [
  { type: "shake", label: "Camera Shake", Icon: Zap, gradient: "linear-gradient(135deg,#4C4C5E,#8B8B9E)", defaultColor: "#FFFFFF", defaultIntensity: 0.5 },
  { type: "wiggle", label: "Wiggle", Icon: Waves, gradient: "linear-gradient(135deg,#33D8A0,#4C8CFF)", defaultColor: "#FFFFFF", defaultIntensity: 0.5 },
  { type: "colorBurst", label: "Color Burst", Icon: SparklesIcon, gradient: "linear-gradient(135deg,#FF4F70,#FF9D4C)", defaultColor: "#FF4F70", defaultIntensity: 0.7 },
  { type: "particles", label: "Particles", Icon: Sparkle, gradient: "linear-gradient(135deg,#FFD166,#FF9D4C)", defaultColor: "#FFD166", defaultIntensity: 0.6 },
  { type: "gradientOverlay", label: "Gradient Sweep", Icon: Palette, gradient: "linear-gradient(135deg,#8B5CFF,#FF4F70)", defaultColor: "#8B5CFF", defaultIntensity: 0.5 },
];

const SWATCHES = ["#FFFFFF", "#8B5CFF", "#FF4F70", "#4C8CFF", "#33D8A0", "#FFD166", "#FF9D4C"];

export default function ClipEffectsPanel({ clip }: { clip: ClipDetails }) {
  const { clipEffects, setClipEffects } = useAppDetailsContext();
  const onThisClip = clipEffects.filter(fx => fx.clipId === clip.id);
  const clipDuration = Math.max(0.1, (clip.endPosition ?? 0) - (clip.startPosition ?? 0));

  const addEffect = (type: ClipEffectType) => {
    const meta = EFFECT_TYPES.find(e => e.type === type)!;
    const newFx: ClipEffectDetails = {
      id: uuidv4(), clipId: clip.id, type,
      startTime: 0, endTime: clipDuration,
      intensity: meta.defaultIntensity,
      color: meta.defaultColor,
      secondaryColor: type === "gradientOverlay" ? "#FF4F70" : undefined,
    };
    setClipEffects(prev => [...prev, newFx]);
  };

  const updateEffect = (id: string, patch: Partial<ClipEffectDetails>) => {
    setClipEffects(prev => prev.map(fx => fx.id === id ? { ...fx, ...patch } : fx));
  };

  const removeEffect = (id: string) => setClipEffects(prev => prev.filter(fx => fx.id !== id));

  return (
    <div>
      <FieldHint className="mb-2">
        Tap a card to add it — like the effect drawers in CapCut/TikTok editors, stack as many as you want.
      </FieldHint>

      {/* Add cards — big and colorful, not a cramped icon strip */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {EFFECT_TYPES.map(({ type, label, Icon, gradient }) => (
          <button
            key={type}
            title={`Add ${label}`}
            onClick={() => addEffect(type)}
            className="relative overflow-hidden flex flex-col items-start justify-end gap-0.5 h-16 p-2.5 rounded-xl cursor-pointer transition-transform hover:scale-[1.03] active:scale-[0.98]"
            style={{ background: gradient }}
          >
            <Icon size={16} color="white" style={{ position: "absolute", top: 8, right: 8, opacity: 0.85 }} />
            <span className="text-[11.5px] font-bold text-white leading-tight text-left drop-shadow">{label}</span>
          </button>
        ))}
      </div>

      {/* Active effects on this clip */}
      {onThisClip.length === 0 ? (
        <FieldHint className="text-center py-2">No effects on this clip yet — tap one above to add it.</FieldHint>
      ) : (
        <div className="flex flex-col gap-2">
          {onThisClip.map(fx => {
            const meta = EFFECT_TYPES.find(e => e.type === fx.type)!;
            return (
              <div key={fx.id} className="rounded-lg border border-studio-border bg-studio-void p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <meta.Icon size={11} style={{ color: fx.color }} />
                    <span className="text-[11px] font-bold text-ink-primary">{meta.label}</span>
                  </div>
                  <button onClick={() => removeEffect(fx.id)} className="w-5 h-5 rounded-full flex items-center justify-center text-ink-faint hover:text-danger hover:bg-danger/10 transition-colors">
                    <X size={11} />
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] text-ink-muted font-semibold min-w-[44px]">Amount</span>
                  <Slider value={fx.intensity} min={0.05} max={1} onChange={v => updateEffect(fx.id, { intensity: v })} />
                  <span className="text-[10px] text-ink-faint font-mono min-w-[28px] text-right">{Math.round(fx.intensity * 100)}%</span>
                </div>

                {fx.type !== "shake" && fx.type !== "wiggle" && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] text-ink-muted font-semibold min-w-[44px]">Color</span>
                    {SWATCHES.map(c => (
                      <button key={c} onClick={() => updateEffect(fx.id, { color: c })}
                        className="w-4 h-4 rounded-full flex-shrink-0 cursor-pointer"
                        style={{ background: c, border: fx.color === c ? "2px solid #8B5CFF" : "1px solid rgba(255,255,255,.2)" }} />
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-ink-muted font-semibold min-w-[44px]">Range</span>
                  <Slider value={fx.startTime} min={0} max={clipDuration}
                    onChange={v => updateEffect(fx.id, { startTime: Math.min(v, fx.endTime - 0.1) })} />
                  <Slider value={fx.endTime} min={0} max={clipDuration}
                    onChange={v => updateEffect(fx.id, { endTime: Math.max(v, fx.startTime + 0.1) })} />
                </div>
                <div className="text-[9.5px] text-ink-faint font-mono text-right mt-0.5">
                  {fx.startTime.toFixed(1)}s – {fx.endTime.toFixed(1)}s of {clipDuration.toFixed(1)}s
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
