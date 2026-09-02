"use client";

import { forwardRef } from "react";
import { cn } from "@/utils/cn";
import { Loader2 } from "@/utils/icons";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-[#07070C] border-transparent bg-gradient-to-br from-signal to-signal-hover shadow-[0_2px_16px_rgba(139,92,255,.4)] hover:opacity-90 active:scale-[.97]",
  secondary:
    "text-ink-secondary border-studio-border bg-studio-raised hover:bg-studio-hover hover:text-ink-primary hover:border-studio-borderLight active:scale-[.97]",
  ghost:
    "text-ink-muted border-transparent bg-transparent hover:bg-studio-hover hover:text-ink-primary active:scale-[.97]",
  danger:
    "text-danger border-danger/30 bg-danger/10 hover:bg-danger/20 active:scale-[.97]",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[11.5px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-[12.5px] gap-2 rounded-xl",
};

/**
 * Button — the one button primitive. Replaces the ad-hoc button styling
 * scattered across Header, MediaPanel (addGradBtn), PropertiesPanel, etc.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-semibold border cursor-pointer font-[inherit]",
        "transition-[background,border-color,opacity,transform] duration-100 whitespace-nowrap",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
        SIZES[size],
        VARIANTS[variant],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 size={size === "sm" ? 13 : 15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

export default Button;
