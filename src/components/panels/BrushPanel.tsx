"use client";

/**
 * BrushPanel — the "Brush" sidebar tab: color + stroke width for the next
 * stroke, a "Draw on canvas" toggle that arms InteractionOverlay's freehand
 * capture mode (see isDrawingBrush in context), and the list of strokes
 * already drawn. Same split as ShapesPanel — this is the tool/library
 * surface; a stroke's keyframes/animation live in PropertiesPanel once
 * selected.
 */
import { useAppDetailsContext } from "../../context/useAppContext";
import { PanelShell, PanelHeader, PanelBody } from "../ui/Panel";
import EmptyState from "../ui/EmptyState";
import SectionLabel from "../ui/SectionLabel";
import Slider from "../ui/Slider";
import { FieldRow, FieldValue, FieldHint } from "../ui/Field";
import { PenTool, Pencil, X } from "@/utils/icons";

const SWATCHES = ["#FF4D6D", "#F97316", "#FACC15", "#22C55E", "#3B82F6", "#8B5CFF", "#FFFFFF", "#111827"];

export default function BrushPanel() {
  const {
    brushesDetails, setBrushesDetails, selectedBrushId, setSelectedBrushId,
    isDrawingBrush, setIsDrawingBrush, brushDraft, setBrushDraft, activeTemplate,
    setSelectedImageID, setSelectedTextId, setSelectedBlurId, setSelectedClipId, setSelectedShapeId,
  } = useAppDetailsContext();

  const select = (id: string) => {
    setSelectedBrushId(id);
    setSelectedImageID(null); setSelectedTextId(null); setSelectedBlurId(null);
    setSelectedClipId(null); setSelectedShapeId(null);
  };

  const removeBrush = (id: string) => {
    setBrushesDetails(prev => prev.filter(b => b.id !== id));
    if (selectedBrushId === id) setSelectedBrushId(null);
  };

  return (
    <PanelShell>
      <PanelHeader
        icon={<PenTool size={13} />}
        title="Brush"
        subtitle={`${brushesDetails.length} stroke${brushesDetails.length !== 1 ? "s" : ""}`}
      />
      <PanelBody padded gap>
        <div>
          <SectionLabel inset={false}>Color</SectionLabel>
          <div className="flex items-center gap-1.5 flex-wrap">
            {SWATCHES.map((c) => (
              <button key={c} onClick={() => setBrushDraft(d => ({ ...d, color: c }))}
                className="w-6 h-6 rounded-full flex-shrink-0 transition-transform"
                style={{ background: c, border: brushDraft.color === c ? "2px solid #8B5CFF" : "1.5px solid rgba(255,255,255,.25)", transform: brushDraft.color === c ? "scale(1.15)" : "none" }} />
            ))}
            <input type="color" value={brushDraft.color} onChange={(e) => setBrushDraft(d => ({ ...d, color: e.target.value }))}
              className="w-6 h-6 rounded-full bg-transparent border-none cursor-pointer flex-shrink-0" />
          </div>
        </div>

        <FieldRow label="Size" labelWidth={40}>
          <Slider value={brushDraft.strokeWidth} min={1} max={60} onChange={(v) => setBrushDraft(d => ({ ...d, strokeWidth: v }))} />
          <FieldValue className="min-w-[30px]">{Math.round(brushDraft.strokeWidth)}px</FieldValue>
        </FieldRow>

        <button
          disabled={!!activeTemplate}
          onClick={() => setIsDrawingBrush((v) => !v)}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12.5px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            isDrawingBrush ? "bg-warning/15 text-warning border border-warning/40" : "bg-signal/15 text-signal border border-signal/40 hover:bg-signal/20"
          }`}
        >
          <Pencil size={14} /> {isDrawingBrush ? "Drawing… click canvas to draw" : "Draw on canvas"}
        </button>
        {isDrawingBrush && <FieldHint>Click and drag on the preview to draw one stroke — it commits on release.</FieldHint>}

        {brushesDetails.length === 0 ? (
          <EmptyState compact icon={<PenTool size={18} strokeWidth={1.7} />} title="No strokes yet" hint="Tap Draw, then drag on the canvas." />
        ) : (
          <div>
            <SectionLabel inset={false}>On canvas</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {brushesDetails.map((b) => {
                const selected = selectedBrushId === b.id;
                return (
                  <div key={b.id}
                    onClick={() => select(b.id)}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors ${
                      selected ? "border-signal bg-signal/10" : "border-studio-border hover:bg-studio-hover"
                    }`}>
                    <span className="w-6 h-6 rounded-full flex-shrink-0 border border-white/15" style={{ background: b.color }} />
                    <span className="flex-1 min-w-0 text-[12px] font-semibold text-ink-primary truncate">
                      Stroke · {b.strokeWidth}px
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); removeBrush(b.id); }}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-ink-faint hover:text-danger hover:bg-danger/10 flex-shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PanelBody>
    </PanelShell>
  );
}
