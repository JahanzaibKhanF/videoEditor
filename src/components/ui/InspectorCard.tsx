import { cn } from "@/utils/cn";

/**
 * InspectorCard — the titled, self-scrolling card that wraps one editable
 * thing (a clip, an image, a blur, a text layer) in the right-hand
 * inspector. Extracted from the `panel` / `panelHeader` / `panelBody`
 * string constants that lived only inside PropertiesPanel.
 */
export default function InspectorCard({
  icon,
  accent = "signal",
  title,
  children,
}: {
  icon?: React.ReactNode;
  /** tailwind color token for the icon chip tint */
  accent?: "signal" | "scrub" | "success" | "danger";
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const accentCls: Record<string, string> = {
    signal: "bg-signal/12 text-signal",
    scrub: "bg-scrub/12 text-scrub",
    success: "bg-success/12 text-success",
    danger: "bg-danger/12 text-danger",
  };

  return (
    <div className="bg-studio-raised border border-studio-border rounded-xl overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-studio-border flex-shrink-0">
        {icon && (
          <div
            className={cn(
              "w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0",
              accentCls[accent]
            )}
          >
            {icon}
          </div>
        )}
        <span className="text-2xs font-bold text-ink-primary truncate flex-1">{title}</span>
      </div>
      <div className="p-3.5 flex flex-col gap-3 overflow-y-auto scrollbar-thin max-h-[46vh]">
        {children}
      </div>
    </div>
  );
}
