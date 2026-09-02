"use client";

import { forwardRef } from "react";
import { cn } from "@/utils/cn";

type Variant = "secondary" | "ghost" | "danger" | "active";
type Size = "sm" | "md" | "lg";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  label: string; // required — used as title + aria-label
}

const VARIANTS: Record<Variant, string> = {
  secondary:
    "text-ink-secondary border-studio-border bg-studio-raised hover:bg-studio-hover hover:text-ink-primary",
  ghost:
    "text-ink-muted border-transparent bg-transparent hover:bg-studio-hover hover:text-ink-primary",
  danger:
    "text-ink-faint border-transparent bg-transparent hover:bg-danger/10 hover:text-danger",
  active:
    "text-signal border-signal/30 bg-signal/12",
};

const SIZES: Record<Size, string> = {
  sm: "w-6 h-6 rounded-md",
  md: "w-7 h-7 rounded-lg",
  lg: "w-9 h-9 rounded-xl",
};

/**
 * IconButton — square icon-only button. Replaces ~15 hand-rolled copies
 * (theme toggle, row delete buttons, close buttons, …).
 */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "secondary", size = "md", label, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center border cursor-pointer flex-shrink-0",
        "transition-[background,color,border-color,transform] duration-100 active:scale-90",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
        SIZES[size],
        VARIANTS[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export default IconButton;
