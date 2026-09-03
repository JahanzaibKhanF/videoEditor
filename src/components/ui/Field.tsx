import { cn } from "@/utils/cn";

/**
 * Field primitives — the label + control row, and the helper caption,
 * used inside every inspector card.
 *
 * Replaces the copy-pasted `label = "text-[11px] text-ink-muted font-semibold
 * min-w-[52px]"` / `row = "flex items-center gap-2.5"` string pairs that were
 * redefined (with slightly different values every time) in PropertiesPanel,
 * ColorAdjustPanel, ClipEffectsPanel and TextEditor.
 */

export function FieldRow({
  label,
  children,
  align = "center",
  labelWidth = 64,
}: {
  label?: React.ReactNode;
  children: React.ReactNode;
  align?: "center" | "start";
  labelWidth?: number;
}) {
  return (
    <div className={cn("flex gap-2.5", align === "center" ? "items-center" : "items-start")}>
      {label != null && (
        <span
          className="text-meta text-ink-muted font-semibold flex-shrink-0"
          style={{ minWidth: labelWidth }}
        >
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * FieldHint — contextual helper text. Deliberately NOT italic: in a dark UI
 * italic body copy reads as an error / disabled placeholder. One weight,
 * one color, everywhere.
 */
export function FieldHint({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-meta text-ink-faint leading-snug", className)}>{children}</p>
  );
}

/** Monospace value read-out that sits at the end of a slider row. */
export function FieldValue({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-mini text-ink-faint font-mono min-w-[34px] text-right flex-shrink-0",
        className
      )}
    >
      {children}
    </span>
  );
}
