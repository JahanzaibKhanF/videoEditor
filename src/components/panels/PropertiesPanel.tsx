"use client";

/**
 * PropertiesPanel — the inspector. ONE scrolling column of the current
 * selection's properties, no tabs.
 *
 * It used to carry an Edit / Animation / Transitions tab bar — which meant
 * two-thirds of the panel was always hidden, and the Transitions tab was a
 * duplicate of the left-panel Transitions catalog. Now: the selection's
 * card (clip / text / image / blur) plus, where it applies, a compact
 * "Animation" / "Transition" row showing the current value with a Change
 * button that opens the matching catalog on the left (via a window event).
 */
import { MousePointerClick, VolumeX, Volume2, Film, Droplets, ImageIcon, Shuffle, Wand2 } from "@/utils/icons";
import TextEditor from "../editors/TextEditor";
import { useAppDetailsContext } from "../../context/useAppContext";
import Slider from "../ui/Slider";
import NumberInput from "../ui/NumberInput";
import EmptyState from "../ui/EmptyState";
import ColorAdjustPanel from "../editors/ColorAdjustPanel";
import { PanelShell, PanelBody } from "../ui/Panel";
import InspectorCard from "../ui/InspectorCard";
import { FieldRow, FieldValue } from "../ui/Field";
import { transitionOptions } from "../../utils/transitionOptionsConstants";
import { animationOptions } from "../../utils/animationOptionsConstants";
import { DEFAULT_TRANSITION_PRESETS, DEFAULT_ANIMATION_PRESETS } from "../../utils/motionPresets";

const transitionName = (key?: string) => {
  if (!key || key === "none") return "None";
  return DEFAULT_TRANSITION_PRESETS.find(p => p.engineKey === key)?.name
    ?? transitionOptions.find(t => t.key === key)?.name
    ?? key;
};
const animationName = (key?: string) => {
  if (!key || key === "none") return "None";
  return DEFAULT_ANIMATION_PRESETS.find(p => p.engineKey === key)?.name
    ?? animationOptions.find(a => a.key === key)?.name
    ?? key;
};

/**
 * Ask the editor shell to switch the left panel to a catalog tab. A window
 * event (same pattern as `clipflow:project-slot-freed`) instead of prop
 * drilling — EditorShell (desktop) and EditorMobile both listen.
 */
export function openCatalog(tab: string) {
  window.dispatchEvent(new CustomEvent("clipflow:open-catalog", { detail: tab }));
}

/** Current-value row + "Change" → opens that catalog on the left panel. */
function ChangeRow({
  icon, kind, value, catalog,
}: {
  icon: React.ReactNode;
  kind: string;
  value: string;
  catalog: string;
}) {
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-studio-raised border border-studio-border">
      <span className="w-6 h-6 rounded-md bg-signal/12 text-signal flex items-center justify-center flex-shrink-0">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-label font-semibold text-ink-primary truncate">{value}</div>
        <div className="text-micro font-bold uppercase tracking-[0.6px] text-ink-faint">{kind}</div>
      </div>
      <button
        onClick={() => openCatalog(catalog)}
        className="flex-shrink-0 text-mini font-bold text-signal border border-signal/35 rounded-lg px-2.5 py-1 hover:bg-signal/12 transition-colors"
      >
        Change
      </button>
    </div>
  );
}

export default function PropertiesPanel() {
  const {
    textsDetails, blursDetails, imagesDetails,
    setBlursDetails, setImagesDetails,
    selectedBlurId, selectedImageID, selectedTextId,
    selectedClipId, clipsDetails, setClipsDetails,
    audioDetails, setAudioDetails,
  } = useAppDetailsContext();

  const clip = selectedClipId ? clipsDetails.find(c => c.id === selectedClipId) : undefined;
  const text = selectedTextId ? textsDetails.find(t => t.id === selectedTextId) : undefined;
  const image = selectedImageID ? imagesDetails.find(i => i.id === selectedImageID) : undefined;
  const blur = selectedBlurId ? blursDetails.find(b => b.id === selectedBlurId) : undefined;

  if (!clip && !text && !image && !blur) {
    return (
      <PanelShell>
        <PanelBody className="flex items-center justify-center">
          <EmptyState
            icon={<MousePointerClick size={19} strokeWidth={1.7} />}
            title="Nothing selected"
            hint="Pick a clip, text, image or blur on the canvas or timeline to edit it here."
          />
        </PanelBody>
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <PanelBody padded gap>

        {/* ── Clip ─────────────────────────────────────────────── */}
        {clip && (() => {
          const audio = audioDetails.find(a => a.clipId === selectedClipId);
          const isMuted = audio?.muted ?? false;
          const vol = audio?.volume ?? 1;
          return (
            <>
              <InspectorCard accent="scrub" icon={<Film size={12} />} title={clip.sourceFileName ?? clip.name}>
                <FieldRow label="Audio">
                  <button
                    onClick={() => audio && setAudioDetails(prev => prev.map(a => a.clipId === selectedClipId ? { ...a, muted: !a.muted } : a))}
                    disabled={!audio}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-meta transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      isMuted ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                    }`}
                  >
                    {isMuted ? <><VolumeX size={12} /> Muted</> : <><Volume2 size={12} /> Audio On</>}
                  </button>
                </FieldRow>

                {audio && !isMuted && (
                  <FieldRow label="Volume">
                    <Slider value={vol} min={0} max={1}
                      onChange={v => setAudioDetails(prev => prev.map(a => a.clipId === selectedClipId ? { ...a, volume: v } : a))} />
                    <FieldValue>{Math.round(vol * 100)}%</FieldValue>
                  </FieldRow>
                )}

                <FieldRow label="Scale">
                  <Slider value={clip.scale ?? 1} min={0.1} max={2}
                    onChange={v => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, scale: v } : cl))} />
                  <FieldValue>{((clip.scale ?? 1) * 100).toFixed(0)}%</FieldValue>
                </FieldRow>

                <FieldRow label="Position">
                  <div className="flex items-center gap-1.5">
                    <span className="text-3xs text-ink-faint font-bold">X</span>
                    <NumberInput value={Math.round(clip.x ?? 0)} step={1}
                      onChange={v => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, x: v } : cl))} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-3xs text-ink-faint font-bold">Y</span>
                    <NumberInput value={Math.round(clip.y ?? 0)} step={1}
                      onChange={v => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, y: v } : cl))} />
                  </div>
                </FieldRow>

                <div className="pt-1 border-t border-studio-border">
                  <ColorAdjustPanel
                    adjustments={clip.colorAdjustments}
                    onChange={adj => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, colorAdjustments: adj } : cl))}
                  />
                </div>
              </InspectorCard>

              <ChangeRow
                icon={<Shuffle size={12} />} kind="Transition"
                value={transitionName(clip.transition)}
                catalog="transitions"
              />
            </>
          );
        })()}

        {/* ── Text ─────────────────────────────────────────────── */}
        {text && (
          <>
            <TextEditor />
            <ChangeRow
              icon={<Wand2 size={12} />} kind="Animation"
              value={animationName(text.animation)}
              catalog="animations"
            />
          </>
        )}

        {/* ── Image ────────────────────────────────────────────── */}
        {image && (
          <>
            <InspectorCard accent="signal" icon={<ImageIcon size={12} />} title="Image">
              <FieldRow label="Opacity">
                <Slider value={image.opacity ?? 1} min={0} max={1}
                  onChange={v => setImagesDetails(prev => prev.map(i => i.id === selectedImageID ? { ...i, opacity: v } : i))} />
                <FieldValue>{Math.round((image.opacity ?? 1) * 100)}%</FieldValue>
              </FieldRow>

              <div className="pt-1 border-t border-studio-border">
                <ColorAdjustPanel
                  adjustments={image.colorAdjustments}
                  onChange={adj => setImagesDetails(prev => prev.map(i => i.id === selectedImageID ? { ...i, colorAdjustments: adj } : i))}
                />
              </div>
            </InspectorCard>

            <ChangeRow
              icon={<Wand2 size={12} />} kind="Animation"
              value={animationName(image.animation)}
              catalog="animations"
            />
          </>
        )}

        {/* ── Blur ─────────────────────────────────────────────── */}
        {blur && (
          <InspectorCard accent="success" icon={<Droplets size={12} />} title="Blur Region">
            <FieldRow label="Intensity">
              <Slider value={blur.blurAmount ?? 10} min={0} max={100} step={1}
                onChange={v => setBlursDetails(prev => prev.map(b => b.id === selectedBlurId ? { ...b, blurAmount: v } : b))} />
              <NumberInput value={blur.blurAmount ?? 10} min={0} max={100} step={1}
                onChange={v => setBlursDetails(prev => prev.map(b => b.id === selectedBlurId ? { ...b, blurAmount: v } : b))} />
            </FieldRow>
          </InspectorCard>
        )}

      </PanelBody>
    </PanelShell>
  );
}
