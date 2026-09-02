import { cn } from "@/utils/cn";

/**
 * EmptyState — unified "nothing here yet" block for panels. Replaces the
 * ~6 one-off italic placeholders (MediaPanel emptyMsg, PropertiesPanel
 * "Select an element", Layers "No layers", …).
 */
export default function EmptyState({
  icon,
  title,
  hint,
  className,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-2 text-ink-faint",
        compact ? "py-6 px-4" : "py-12 px-6",
        className
      )}
    >
      {icon && (
        <div className="w-11 h-11 rounded-full bg-studio-hover flex items-center justify-center text-ink-muted">
          {icon}
        </div>
      )}
      <p className="text-[12px] font-semibold text-ink-muted leading-snug">{title}</p>
      {hint && <p className="text-[11px] text-ink-faint leading-snug">{hint}</p>}
    </div>
  );
}
