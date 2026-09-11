"use client";

/**
 * ShapesPanel — the "Shapes" sidebar tab: quick-add rectangle / ellipse /
 * triangle / a full-canvas "Solid" preset, plus the list of shapes already
 * on the canvas. Fill/stroke/border-width/sides and keyframes/animation for
 * an individual shape are edited in PropertiesPanel once it's selected —
 * same split every other layer type already uses (this panel is the
 * library/add surface, PropertiesPanel is the selected-object inspector),
 * so there's one source of truth for a shape's live properties instead of
 * two panels racing to update the same object.
 */
import { v4 as uuidv4 } from "uuid";
import { useAppDetailsContext } from "../../context/useAppContext";
import { ShapeDetails, ShapeKind } from "../../types/types";
import { frontmostZ } from "../../utils/zStack";
import { PanelShell, PanelHeader, PanelBody } from "../ui/Panel";
import EmptyState from "../ui/EmptyState";
import SectionLabel from "../ui/SectionLabel";
import { Shapes as ShapesIcon, Square, Circle, Triangle, X } from "@/utils/icons";

const PRESETS: { kind: ShapeKind; label: string; icon: React.ReactNode; sides?: number }[] = [
  { kind: "rectangle", label: "Rectangle", icon: <Square size={16} /> },
  { kind: "ellipse", label: "Ellipse", icon: <Circle size={16} /> },
  { kind: "polygon", label: "Triangle", icon: <Triangle size={16} />, sides: 3 },
];

export default function ShapesPanel() {
  const {
    shapesDetails, setShapesDetails, selectedShapeId, setSelectedShapeId,
    clipsDetails, imagesDetails, textsDetails, blursDetails, brushesDetails,
    containerDimenions, totalTime, setTotalTime, activeTemplate,
    setSelectedImageID, setSelectedTextId, setSelectedBlurId, setSelectedClipId, setSelectedBrushId,
  } = useAppDetailsContext();

  const cw = containerDimenions.width || 1280, ch = containerDimenions.height || 720;

  const zAll = () => [
    ...clipsDetails.map(c => c.zIndex ?? 0), ...imagesDetails.map(i => i.zIndex ?? 0),
    ...textsDetails.map(t => t.zIndex ?? 0), ...blursDetails.map(b => b.zIndex ?? 0),
    ...shapesDetails.map(s => s.zIndex ?? 0), ...brushesDetails.map(b => b.zIndex ?? 0),
  ];

  const select = (id: string) => {
    setSelectedShapeId(id);
    setSelectedImageID(null); setSelectedTextId(null); setSelectedBlurId(null);
    setSelectedClipId(null); setSelectedBrushId(null);
  };

  const addShape = (kind: ShapeKind, sides?: number) => {
    const w = Math.round(cw * 0.3), h = Math.round(kind === "polygon" ? cw * 0.3 : ch * 0.2);
    const endTime = totalTime > 0 ? totalTime : 5;
    const shape: ShapeDetails = {
      id: uuidv4(), kind, x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), width: w, height: h,
      fill: "#8B5CFF", stroke: "transparent", strokeWidth: 0, sides,
      opacity: 1, startTime: 0, endTime, animation: "none", zIndex: frontmostZ(zAll()),
    };
    setShapesDetails(prev => [...prev, shape]);
    setTotalTime(prev => Math.max(prev, endTime));
    select(shape.id);
  };

  const addSolid = () => {
    const endTime = totalTime > 0 ? totalTime : 5;
    const shape: ShapeDetails = {
      id: uuidv4(), kind: "rectangle", x: 0, y: 0, width: cw, height: ch,
      fill: "#111827", stroke: "transparent", strokeWidth: 0,
      opacity: 1, startTime: 0, endTime, animation: "none", zIndex: frontmostZ(zAll()),
    };
    setShapesDetails(prev => [...prev, shape]);
    setTotalTime(prev => Math.max(prev, endTime));
    select(shape.id);
  };

  const removeShape = (id: string) => {
    setShapesDetails(prev => prev.filter(s => s.id !== id));
    if (selectedShapeId === id) setSelectedShapeId(null);
  };

  return (
    <PanelShell>
      <PanelHeader
        icon={<ShapesIcon size={13} />}
        title="Shapes"
        subtitle={`${shapesDetails.length} shape${shapesDetails.length !== 1 ? "s" : ""}`}
      />
      <PanelBody padded gap>
        <div>
          <SectionLabel inset={false}>Add</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} disabled={!!activeTemplate}
                onClick={() => addShape(p.kind, p.sides)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-studio-border bg-studio-raised text-ink-secondary text-[12px] font-semibold hover:bg-signal/10 hover:border-signal/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {p.icon} {p.label}
              </button>
            ))}
            <button disabled={!!activeTemplate} onClick={addSolid}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-studio-border bg-studio-raised text-ink-secondary text-[12px] font-semibold hover:bg-signal/10 hover:border-signal/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <span className="w-4 h-4 rounded-sm bg-ink-primary flex-shrink-0" /> Solid
            </button>
          </div>
        </div>

        {shapesDetails.length === 0 ? (
          <EmptyState compact icon={<ShapesIcon size={18} strokeWidth={1.7} />} title="No shapes yet" hint="Tap a preset above to add one." />
        ) : (
          <div>
            <SectionLabel inset={false}>On canvas</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {shapesDetails.map((s) => {
                const selected = selectedShapeId === s.id;
                return (
                  <div key={s.id}
                    onClick={() => select(s.id)}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors ${
                      selected ? "border-signal bg-signal/10" : "border-studio-border hover:bg-studio-hover"
                    }`}>
                    <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: s.fill && s.fill !== "transparent" ? s.fill : "transparent", border: `1.5px solid ${s.stroke && s.stroke !== "transparent" ? s.stroke : "rgba(255,255,255,.25)"}` }} />
                    <span className="flex-1 min-w-0 text-[12px] font-semibold text-ink-primary capitalize truncate">
                      {s.kind === "polygon" ? `${s.sides ?? 3}-sided` : s.kind}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); removeShape(s.id); }}
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
