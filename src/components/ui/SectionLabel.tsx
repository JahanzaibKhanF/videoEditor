import { cn } from "@/utils/cn";

/**
 * SectionLabel — the uppercase caption used to head groups inside panels.
 * Unifies the `sectionLabel` / "text-[10px] font-bold uppercase tracking…"
 * string that was copy-pasted across MediaPanel, PropertiesPanel, TimeLine.
 */
export default function SectionLabel({
  children,
  className,
  right,
}: {
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between px-3 pt-3 pb-1.5", className)}>
      <span className="text-[10px] font-bold uppercase tracking-[0.7px] text-ink-muted">
        {children}
      </span>
      {right}
    </div>
  );
}
