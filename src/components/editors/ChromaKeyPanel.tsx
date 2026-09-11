"use client";

/**
 * ChromaKeyPanel — manual green/blue-screen removal for a video clip. A
 * live per-frame color-distance filter (see utils/chromaKey.ts): pick the
 * exact backdrop color with the eyedropper (or the color swatch), then
 * dial in Tolerance / Edge Feather / Edge Thin — the same trio After
 * Effects' Color Key gives you. Unlike the AI "Remove Background" tool
 * (BackgroundRemovalPanel.tsx) this needs no processing pass or re-encode —
 * it's evaluated live, same as color grading.
 */
import { useState } from "react";
import { ChromaKeySettings, DEFAULT_CHROMA_KEY } from "../../utils/chromaKey";
import Slider from "../ui/Slider";
import SectionLabel from "../ui/SectionLabel";
import { FieldRow, FieldValue, FieldHint } from "../ui/Field";
import { Pipette, Power } from "@/utils/icons";

interface Props {
  chromaKey: ChromaKeySettings | undefined;
  onChange: (ck: ChromaKeySettings) => void;
}

// Chrome/Edge only — https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper.
// Not in TS's default DOM lib yet, so this is typed by hand rather than `any`.
interface EyeDropperResult { sRGBHex: string }
interface EyeDropperCtor { new (): { open: () => Promise<EyeDropperResult> } }

export default function ChromaKeyPanel({ chromaKey, onChange }: Props) {
  const ck = chromaKey ?? DEFAULT_CHROMA_KEY;
  const set = (patch: Partial<ChromaKeySettings>) => onChange({ ...ck, ...patch });
  const [pickerError, setPickerError] = useState(false);

  const eyeDropperCtor = typeof window !== "undefined"
    ? (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper
    : undefined;

  const pickColor = async () => {
    if (!eyeDropperCtor) { setPickerError(true); return; }
    setPickerError(false);
    try {
      const result = await new eyeDropperCtor().open();
      set({ color: result.sRGBHex });
    } catch {
      // user cancelled (Escape / click away) — not an error
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <SectionLabel
        inset={false}
        className="mb-0"
        icon={<Pipette size={11} />}
        right={
          <button
            onClick={() => set({ enabled: !ck.enabled })}
            className={`flex items-center gap-1 text-mini font-semibold transition-colors ${
              ck.enabled ? "text-success" : "text-ink-faint hover:text-ink-secondary"
            }`}
          >
            <Power size={11} /> {ck.enabled ? "On" : "Off"}
          </button>
        }
      >
        Chroma Key
      </SectionLabel>

      {ck.enabled && (
        <>
          <FieldRow label="Key color" labelWidth={74}>
            <button
              onClick={pickColor}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-signal/40 bg-signal/10 text-ink-primary text-mini font-semibold hover:bg-signal/15 transition-colors"
              title="Pick the exact backdrop color from anywhere on screen"
            >
              <Pipette size={12} /> Pick color
            </button>
            <input
              type="color"
              value={ck.color}
              onChange={(e) => set({ color: e.target.value })}
              title="Choose from a color swatch"
              className="w-8 h-8 rounded-lg bg-studio-void border border-studio-border cursor-pointer flex-shrink-0"
            />
          </FieldRow>
          {pickerError && (
            <FieldHint className="text-warning">Eyedropper isn't supported in this browser — use the swatch instead.</FieldHint>
          )}

          <FieldRow label="Tolerance" labelWidth={74}>
            <Slider value={ck.tolerance} min={0} max={1} onChange={(v) => set({ tolerance: v })} />
            <FieldValue className="min-w-[30px]">{Math.round(ck.tolerance * 100)}</FieldValue>
          </FieldRow>
          <FieldRow label="Edge Feather" labelWidth={74}>
            <Slider value={ck.edgeFeather} min={0.01} max={1} onChange={(v) => set({ edgeFeather: v })} />
            <FieldValue className="min-w-[30px]">{Math.round(ck.edgeFeather * 100)}</FieldValue>
          </FieldRow>
          <FieldRow label="Edge Thin" labelWidth={74}>
            <Slider value={ck.edgeThin} min={-1} max={1} onChange={(v) => set({ edgeThin: v })} />
            <FieldValue className="min-w-[30px]">{Math.round(ck.edgeThin * 100)}</FieldValue>
          </FieldRow>
          <FieldHint>Pick the backdrop color, raise Tolerance until it's fully keyed out, then use Edge Feather to soften a hard edge or Edge Thin to shrink/grow it.</FieldHint>
        </>
      )}
    </div>
  );
}
