"use client";

import Sheet from "../../ui/Sheet";
import MediaPanel from "../../panels/MediaPanel";
import PropertiesPanel from "../../panels/PropertiesPanel";
import AssetsPanel from "../../panels/AssetsPanel";
import type { Template } from "../../../utils/templates";

const TITLES: Record<string, string> = {
  media: "Media", edit: "Edit", text: "Text", effects: "Effects",
  bgremove: "Remove Background", transitions: "Transitions", templates: "Templates",
  layers: "Layers", assets: "Assets & Audio", recent: "Recent Projects",
};

// Views that render through MediaPanel's own activeTab switch — identical
// routing to the desktop IconSidebar.
const MEDIA_VIEWS = new Set([
  "media", "text", "effects", "bgremove", "transitions", "templates", "layers", "recent",
]);

/**
 * MobileToolSheet — hosts the SAME panel component the desktop uses for a
 * given tool, inside a bottom Sheet. No panel logic is duplicated: the
 * panels already read everything from context.
 */
export default function MobileToolSheet({
  view,
  onClose,
  pendingTemplate,
}: {
  view: string | null;
  onClose: () => void;
  pendingTemplate?: Template;
}) {
  const open = view !== null;
  // "edit" is a taller sheet (lots of sliders); pickers are shorter.
  const height = view === "edit" || view === "templates" || view === "layers" ? 0.8 : 0.66;

  return (
    <Sheet open={open} onClose={onClose} title={view ? TITLES[view] ?? "" : ""} height={height}>
      <div className="h-full overflow-hidden">
        {view === "edit" && <PropertiesPanel />}
        {view === "assets" && <AssetsPanel />}
        {view && MEDIA_VIEWS.has(view) && (
          <MediaPanel activeTab={view} pendingTemplate={pendingTemplate} />
        )}
      </div>
    </Sheet>
  );
}
