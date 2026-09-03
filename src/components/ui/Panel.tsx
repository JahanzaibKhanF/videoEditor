import { cn } from "@/utils/cn";

/**
 * Panel — the one shell every side-panel / inspector tab is built from.
 *
 * Before this, each tab in MediaPanel / PropertiesPanel / TemplatesPanel /
 * RecentProjectsPanel hand-rolled its own header (`px-3 py-3` here,
 * `px-3.5 py-3.5` there, title at `13px` in one place and `11.5px` in
 * another). Routing them all through <PanelShell>/<PanelHeader>/<PanelBody>
 * means every panel has the exact same frame — the single biggest
 * "this reads as one app" win.
 */

export function PanelShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col h-full bg-studio-surface", className)}>
      {children}
    </div>
  );
}

export function PanelHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2 px-3.5 py-3 border-b border-studio-border flex-shrink-0">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-title font-bold text-ink-primary font-display leading-tight">
          {icon && <span className="text-signal flex-shrink-0 flex">{icon}</span>}
          <span className="truncate">{title}</span>
        </div>
        {subtitle && (
          <div className="text-meta text-ink-muted mt-0.5 leading-snug">{subtitle}</div>
        )}
      </div>
      {action && <div className="flex-shrink-0 flex items-center gap-1.5">{action}</div>}
    </div>
  );
}

export function PanelBody({
  children,
  className,
  padded = false,
  gap = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** apply the standard `p-3` inset used by most scrolling panels */
  padded?: boolean;
  /** stack children in a `flex-col gap-3` column */
  gap?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex-1 min-h-0 overflow-y-auto scrollbar-thin",
        padded && "p-3",
        gap && "flex flex-col gap-3",
        className
      )}
    >
      {children}
    </div>
  );
}
