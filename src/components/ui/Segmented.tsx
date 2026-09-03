"use client";

import { cn } from "@/utils/cn";
import type { LucideIcon } from "@/utils/icons";

/**
 * Segmented — the one horizontal tab / segmented-control primitive.
 *
 * Unifies the three different in-panel tab treatments that existed before:
 *  - PropertiesPanel's pill tabs
 *  - TextEditor's underline "Text / Background / Shadow" tabs
 *  - the ad-hoc category chips in TemplatesPanel
 * All of them are now one component with one active-state look
 * (`bg-signal/12 text-signal`), matching the icon rail's accent.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: LucideIcon;
}

export default function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("flex gap-1 p-1 rounded-xl bg-studio-void/60", className)}
    >
      {options.map(({ value: v, label, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg font-bold cursor-pointer",
              "transition-[background,color] duration-100 whitespace-nowrap",
              size === "sm" ? "py-1.5 text-mini" : "py-2 text-2xs",
              active
                ? "bg-signal/12 text-signal"
                : "text-ink-muted hover:bg-studio-hover hover:text-ink-secondary"
            )}
          >
            {Icon && <Icon size={12} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
