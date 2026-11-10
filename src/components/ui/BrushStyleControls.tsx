"use client";

type Style = { smooth?: boolean; closed?: boolean; fill?: string };
export default function BrushStyleControls({ value, onChange, color = "#8B5CFF" }: {
  value: Style; onChange: (patch: Style) => void; color?: string;
}) {
  const filled = !!value.fill && value.fill !== "transparent";
  return <div className="space-y-2 text-xs text-ink-secondary">
    <label className="flex items-center gap-2"><input type="checkbox" checked={!!value.smooth} onChange={e => onChange({ smooth: e.target.checked })} />Smooth curves</label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={!!value.closed} onChange={e => onChange({ closed: e.target.checked })} />Close path</label>
    {value.closed && <div className="flex items-center gap-3">
      <label className="flex items-center gap-2"><input type="checkbox" checked={filled} onChange={e => onChange({ fill: e.target.checked ? color : "transparent" })} />Fill inside</label>
      {filled && <input aria-label="Pen fill color" type="color" value={value.fill} onChange={e => onChange({ fill: e.target.value })} className="w-7 h-7 rounded bg-transparent border-none cursor-pointer" />}
    </div>}
  </div>;
}
