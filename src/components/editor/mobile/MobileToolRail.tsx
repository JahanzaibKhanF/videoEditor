"use client";

import {
  Film, Type, Sparkles, Scissors, Shuffle, LayoutTemplate,
  Layers2, History, ImageIcon, SlidersHorizontal,
} from "@/utils/icons";

export interface MobileTool {
  key: string;
  label: string;
  Icon: typeof Film;
  /** MediaPanel activeTab this routes to, or a special view. */
  view: string;
  badge?: string;
}

// Mirrors the desktop IconSidebar tab set (+ Assets / Edit which live in
// the right panel on desktop). Each `view` is either a MediaPanel
// activeTab or one of the special keys "assets" / "edit".
export const MOBILE_TOOLS: MobileTool[] = [
  { key: "media",       label: "Media",     Icon: Film,              view: "media" },
  { key: "edit",        label: "Edit",      Icon: SlidersHorizontal, view: "edit" },
  { key: "text",        label: "Text",      Icon: Type,              view: "text" },
  { key: "effects",     label: "Effects",   Icon: Sparkles,          view: "effects" },
  { key: "bgremove",    label: "Remove BG", Icon: Scissors,          view: "bgremove", badge: "AI" },
  { key: "transitions", label: "Transition",Icon: Shuffle,           view: "transitions" },
  { key: "templates",   label: "Templates", Icon: LayoutTemplate,    view: "templates" },
  { key: "layers",      label: "Layers",    Icon: Layers2,           view: "layers" },
  { key: "assets",      label: "Assets",    Icon: ImageIcon,         view: "assets" },
  { key: "recent",      label: "Recent",    Icon: History,           view: "recent" },
];

/**
 * MobileToolRail — the pinned bottom icon rail. Horizontally scrollable;
 * tapping a tool opens its bottom sheet.
 */
export default function MobileToolRail({
  activeKey,
  onPick,
}: {
  activeKey: string | null;
  onPick: (tool: MobileTool) => void;
}) {
  return (
    <div
      className="flex-shrink-0 bg-studio-surface border-t border-studio-border overflow-x-auto no-scrollbar"
      style={{ height: 62, paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-full items-center px-2 gap-1" style={{ width: "max-content" }}>
        {MOBILE_TOOLS.map((tool) => {
          const active = activeKey === tool.key;
          return (
            <button
              key={tool.key}
              onClick={() => onPick(tool)}
              aria-pressed={active}
              className={`relative flex flex-col items-center justify-center gap-1 rounded-xl flex-shrink-0
                transition-[background,color,transform] duration-150 active:scale-90 touch-manipulation
                ${active
                  ? "bg-signal/12 text-signal"
                  : "text-ink-muted hover:text-ink-primary"}`}
              style={{ width: 62, height: 50 }}
            >
              <span className="relative">
                <tool.Icon size={19} strokeWidth={active ? 2.4 : 2} />
                {tool.badge && (
                  <span className="absolute -top-1.5 -right-3 text-[6px] font-black bg-signal text-white rounded-full px-1 leading-tight">
                    {tool.badge}
                  </span>
                )}
              </span>
              <span className="text-[8.5px] font-bold tracking-wide leading-none">{tool.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
