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
import { MousePointerClick, VolumeX, Volume2, Film, Droplets, ImageIcon, Shuffle, Wand2, Spline, Shapes as ShapesIcon, PenTool } from "@/utils/icons";
import TextEditor from "../editors/TextEditor";
import KeyframeEditor from "../editors/KeyframeEditor";
import { useAppDetailsContext, useEngineControls } from "../../context/useAppContext";
import { KeyframeTrack, KfProp } from "../../types/types";
import { evalKeyframes, upsertKey, makeTrack, upsertTrack } from "../../utils/keyframes";
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

/** Shared "Motion / Keyframes" card. */
function KfCard({
  tracks, onChange, time, duration, layerStart, onSeek, animation, animationLabel, onAnimationClear,
}: {
  tracks: KeyframeTrack[] | undefined;
  onChange: (t: KeyframeTrack[] | undefined) => void;
  time: number; duration: number; layerStart: number; onSeek: (t: number) => void;
  animation?: string; animationLabel?: string; onAnimationClear?: () => void;
}) {
  return (
    <InspectorCard accent="signal" icon={<Spline size={12} />} title="Motion / Keyframes">
      <KeyframeEditor tracks={tracks} onChange={onChange} time={time} duration={duration} layerStart={layerStart} onSeek={onSeek}
        animation={animation} animationLabel={animationLabel} onAnimationClear={onAnimationClear} />
    </InspectorCard>
  );
}

export default function PropertiesPanel() {
  const {
    textsDetails, blursDetails, imagesDetails, setTextsDetails,
    setBlursDetails, setImagesDetails,
    shapesDetails, setShapesDetails, selectedShapeId,
    brushesDetails, setBrushesDetails, selectedBrushId,
    selectedBlurId, selectedImageID, selectedTextId,
    selectedClipId, clipsDetails, setClipsDetails,
    audioDetails, setAudioDetails,
    currentTime, totalTime, setCurrentTime,
  } = useAppDetailsContext();
  const { seekTo } = useEngineControls();
  const seek = (t: number) => { setCurrentTime(t); seekTo(t); };

  const clip = selectedClipId ? clipsDetails.find(c => c.id === selectedClipId) : undefined;
  const text = selectedTextId ? textsDetails.find(t => t.id === selectedTextId) : undefined;
  const image = selectedImageID ? imagesDetails.find(i => i.id === selectedImageID) : undefined;
  const blur = selectedBlurId ? blursDetails.find(b => b.id === selectedBlurId) : undefined;
  const shape = selectedShapeId ? shapesDetails.find(s => s.id === selectedShapeId) : undefined;
  const brush = selectedBrushId ? brushesDetails.find(b => b.id === selectedBrushId) : undefined;

  // When a clip property is being keyframed, its normal slider/field edits a
  // keyframe at the current playhead instead of the resting value — so the
  // familiar controls stay in sync with the "Motion / Keyframes" card.
  const clipKfHas = (p: KfProp) => !!clip?.keyframes?.some(t => t.prop === p && t.keys.length > 0);
  const clipKf = clip ? evalKeyframes(clip.keyframes, currentTime) : {};
  const writeClipKf = (p: KfProp, kfValue: number) => {
    setClipsDetails(prev => prev.map(cl => {
      if (cl.id !== selectedClipId) return cl;
      const tr = cl.keyframes?.find(t => t.prop === p)
        ?? makeTrack(p, cl.startPosition ?? 0, p === "scale" ? 1 : 0);
      return { ...cl, keyframes: upsertTrack(cl.keyframes, upsertKey(tr, currentTime, kfValue)) };
    }));
  };

  if (!clip && !text && !image && !blur && !shape && !brush) {
    return (
      <PanelShell>
        <PanelBody className="flex items-center justify-center">
          <EmptyState
            icon={<MousePointerClick size={19} strokeWidth={1.7} />}
            title="Nothing selected"
            hint="Pick a clip, text, image, blur, shape or brush stroke on the canvas or timeline to edit it here."
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

                {(() => {
                  const s = (clip.scale ?? 1) * (clipKf.scale ?? 1);
                  const px = Math.round((clip.x ?? 0) + (clipKf.x ?? 0));
                  const py = Math.round((clip.y ?? 0) + (clipKf.y ?? 0));
                  return (
                    <>
                      <FieldRow label={clipKfHas("scale") ? "Scale ◆" : "Scale"}>
                        <Slider value={s} min={0.1} max={3}
                          onChange={v => clipKfHas("scale")
                            ? writeClipKf("scale", v / (clip.scale ?? 1))
                            : setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, scale: v } : cl))} />
                        <FieldValue>{(s * 100).toFixed(0)}%</FieldValue>
                      </FieldRow>

                      <FieldRow label="Position">
                        <div className="flex items-center gap-1.5">
                          <span className="text-3xs text-ink-faint font-bold">{clipKfHas("x") ? "X◆" : "X"}</span>
                          <NumberInput value={px} step={1}
                            onChange={v => clipKfHas("x")
                              ? writeClipKf("x", v - (clip.x ?? 0))
                              : setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, x: v } : cl))} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-3xs text-ink-faint font-bold">{clipKfHas("y") ? "Y◆" : "Y"}</span>
                          <NumberInput value={py} step={1}
                            onChange={v => clipKfHas("y")
                              ? writeClipKf("y", v - (clip.y ?? 0))
                              : setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, y: v } : cl))} />
                        </div>
                      </FieldRow>
                    </>
                  );
                })()}

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

              <ChangeRow
                icon={<Wand2 size={12} />} kind="Animation"
                value={animationName(clip.animation)}
                catalog="animations"
              />

              <KfCard
                tracks={clip.keyframes}
                onChange={tracks => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, keyframes: tracks } : cl))}
                animation={clip.animation} animationLabel={animationName(clip.animation)}
                onAnimationClear={() => setClipsDetails(prev => prev.map(cl => cl.id === selectedClipId ? { ...cl, animation: "none" } : cl))}
                time={currentTime} duration={totalTime} layerStart={clip.startPosition ?? 0} onSeek={seek}
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
            <KfCard
              tracks={text.keyframes}
              onChange={tracks => setTextsDetails(prev => prev.map(tx => tx.id === selectedTextId ? { ...tx, keyframes: tracks } : tx))}
              animation={text.animation} animationLabel={animationName(text.animation)}
              onAnimationClear={() => setTextsDetails(prev => prev.map(tx => tx.id === selectedTextId ? { ...tx, animation: "none" } : tx))}
              time={currentTime} duration={totalTime} layerStart={text.startTime ?? 0} onSeek={seek}
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
            <KfCard
              tracks={image.keyframes}
              onChange={tracks => setImagesDetails(prev => prev.map(i => i.id === selectedImageID ? { ...i, keyframes: tracks } : i))}
              animation={image.animation} animationLabel={animationName(image.animation)}
              onAnimationClear={() => setImagesDetails(prev => prev.map(i => i.id === selectedImageID ? { ...i, animation: "none" } : i))}
              time={currentTime} duration={totalTime} layerStart={image.startTime ?? 0} onSeek={seek}
            />
          </>
        )}

        {/* ── Blur ─────────────────────────────────────────────── */}
        {blur && (
          <>
            <InspectorCard accent="success" icon={<Droplets size={12} />} title="Blur Region">
              <FieldRow label="Intensity">
                <Slider value={blur.blurAmount ?? 10} min={0} max={100} step={1}
                  onChange={v => setBlursDetails(prev => prev.map(b => b.id === selectedBlurId ? { ...b, blurAmount: v } : b))} />
                <NumberInput value={blur.blurAmount ?? 10} min={0} max={100} step={1}
                  onChange={v => setBlursDetails(prev => prev.map(b => b.id === selectedBlurId ? { ...b, blurAmount: v } : b))} />
              </FieldRow>
            </InspectorCard>
            <KfCard
              tracks={blur.keyframes}
              onChange={tracks => setBlursDetails(prev => prev.map(b => b.id === selectedBlurId ? { ...b, keyframes: tracks } : b))}
              time={currentTime} duration={totalTime} layerStart={blur.startTime ?? 0} onSeek={seek}
            />
          </>
        )}

        {/* ── Shape ────────────────────────────────────────────── */}
        {shape && (
          <>
            <InspectorCard accent="signal" icon={<ShapesIcon size={12} />} title={shape.kind === "polygon" ? `${shape.sides ?? 3}-sided shape` : shape.kind}>
              <FieldRow label="Fill">
                <div className="flex items-center gap-1.5">
                  <input type="color" value={shape.fill && shape.fill !== "transparent" ? shape.fill : "#000000"}
                    onChange={e => setShapesDetails(prev => prev.map(s => s.id === selectedShapeId ? { ...s, fill: e.target.value } : s))}
                    className="w-8 h-8 rounded-md bg-studio-void border border-studio-border cursor-pointer flex-shrink-0" />
                  <button
                    onClick={() => setShapesDetails(prev => prev.map(s => s.id === selectedShapeId
                      ? { ...s, fill: s.fill && s.fill !== "transparent" ? "transparent" : "#8B5CFF" } : s))}
                    className="text-mini font-bold text-ink-faint hover:text-signal transition-colors">
                    {shape.fill && shape.fill !== "transparent" ? "Remove fill" : "Add fill"}
                  </button>
                </div>
              </FieldRow>
              <FieldRow label="Stroke">
                <div className="flex items-center gap-1.5">
                  <input type="color" value={shape.stroke && shape.stroke !== "transparent" ? shape.stroke : "#ffffff"}
                    onChange={e => setShapesDetails(prev => prev.map(s => s.id === selectedShapeId ? { ...s, stroke: e.target.value, strokeWidth: s.strokeWidth || 4 } : s))}
                    className="w-8 h-8 rounded-md bg-studio-void border border-studio-border cursor-pointer flex-shrink-0" />
                  <Slider value={shape.strokeWidth ?? 0} min={0} max={40} step={1}
                    onChange={v => setShapesDetails(prev => prev.map(s => s.id === selectedShapeId ? { ...s, strokeWidth: v, stroke: v > 0 ? (s.stroke && s.stroke !== "transparent" ? s.stroke : "#ffffff") : s.stroke } : s))} />
                  <FieldValue className="min-w-[26px]">{Math.round(shape.strokeWidth ?? 0)}</FieldValue>
                </div>
              </FieldRow>
              {shape.kind === "polygon" && (
                <FieldRow label="Sides">
                  <Slider value={shape.sides ?? 3} min={3} max={12} step={1}
                    onChange={v => setShapesDetails(prev => prev.map(s => s.id === selectedShapeId ? { ...s, sides: Math.round(v) } : s))} />
                  <FieldValue className="min-w-[20px]">{shape.sides ?? 3}</FieldValue>
                </FieldRow>
              )}
              <FieldRow label="Opacity">
                <Slider value={shape.opacity ?? 1} min={0} max={1}
                  onChange={v => setShapesDetails(prev => prev.map(s => s.id === selectedShapeId ? { ...s, opacity: v } : s))} />
                <FieldValue>{Math.round((shape.opacity ?? 1) * 100)}%</FieldValue>
              </FieldRow>
            </InspectorCard>

            <ChangeRow
              icon={<Wand2 size={12} />} kind="Animation"
              value={animationName(shape.animation)}
              catalog="animations"
            />
            <KfCard
              tracks={shape.keyframes}
              onChange={tracks => setShapesDetails(prev => prev.map(s => s.id === selectedShapeId ? { ...s, keyframes: tracks } : s))}
              animation={shape.animation} animationLabel={animationName(shape.animation)}
              onAnimationClear={() => setShapesDetails(prev => prev.map(s => s.id === selectedShapeId ? { ...s, animation: "none" } : s))}
              time={currentTime} duration={totalTime} layerStart={shape.startTime ?? 0} onSeek={seek}
            />
          </>
        )}

        {/* ── Brush ────────────────────────────────────────────── */}
        {brush && (
          <>
            <InspectorCard accent="signal" icon={<PenTool size={12} />} title="Brush Stroke">
              <FieldRow label="Color">
                <input type="color" value={brush.color}
                  onChange={e => setBrushesDetails(prev => prev.map(b => b.id === selectedBrushId ? { ...b, color: e.target.value } : b))}
                  className="w-8 h-8 rounded-md bg-studio-void border border-studio-border cursor-pointer flex-shrink-0" />
              </FieldRow>
              <FieldRow label="Width">
                <Slider value={brush.strokeWidth} min={1} max={60}
                  onChange={v => setBrushesDetails(prev => prev.map(b => b.id === selectedBrushId ? { ...b, strokeWidth: v } : b))} />
                <FieldValue className="min-w-[30px]">{Math.round(brush.strokeWidth)}px</FieldValue>
              </FieldRow>
              <FieldRow label="Opacity">
                <Slider value={brush.opacity ?? 1} min={0} max={1}
                  onChange={v => setBrushesDetails(prev => prev.map(b => b.id === selectedBrushId ? { ...b, opacity: v } : b))} />
                <FieldValue>{Math.round((brush.opacity ?? 1) * 100)}%</FieldValue>
              </FieldRow>
            </InspectorCard>

            <ChangeRow
              icon={<Wand2 size={12} />} kind="Animation"
              value={animationName(brush.animation)}
              catalog="animations"
            />
            <KfCard
              tracks={brush.keyframes}
              onChange={tracks => setBrushesDetails(prev => prev.map(b => b.id === selectedBrushId ? { ...b, keyframes: tracks } : b))}
              animation={brush.animation} animationLabel={animationName(brush.animation)}
              onAnimationClear={() => setBrushesDetails(prev => prev.map(b => b.id === selectedBrushId ? { ...b, animation: "none" } : b))}
              time={currentTime} duration={totalTime} layerStart={brush.startTime ?? 0} onSeek={seek}
            />
          </>
        )}

      </PanelBody>
    </PanelShell>
  );
}
