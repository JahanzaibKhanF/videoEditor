import { cn } from "@/utils/cn";

/**
 * SectionLabel — the uppercase caption that heads a group inside a panel.
 * The single source of truth for that element: before this, the same visual
 * label was written five different ways (10px / 10.5px / 11px, ink-muted vs
 * ink-secondary, tracking-[.7px] vs tracking-wide) across MediaPanel,
 * PropertiesPanel, TextEditor, ColorAdjustPanel, ClipEffectsPanel, TimeLine
 * and the two picker panels.
 *
 * `inset` (default) adds the panel edge padding used when the label heads a
 * full-bleed list; pass `inset={false}` for labels that sit inside an
 * already-padded card and only need bottom margin.
 */
export default function SectionLabel({
  children,
  className,
  right,
  icon,
  inset = true,
}: {
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
  icon?: React.ReactNode;
  inset?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between",
        inset ? "px-3 pt-3 pb-1.5" : "mb-2",
        className
      )}
    >
      <span className="flex items-center gap-1.5 text-3xs font-bold uppercase tracking-[0.7px] text-ink-muted">
        {icon}
        {children}
      </span>
      {right}
    </div>
  );
}
