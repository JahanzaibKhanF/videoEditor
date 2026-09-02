"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import Header from "../chrome/Header";
import MediaRelinkBanner from "../chrome/MediaRelinkBanner";
import Screen from "../preview/Screen";
import PlayerControls from "../preview/PlayerControls";
import PreviewScale from "../preview/PreviewScale";
import TimeLine from "../timeline/TimeLine";
import Sheet from "../ui/Sheet";
import MobileToolRail, { MOBILE_TOOLS, type MobileTool } from "./mobile/MobileToolRail";
import MobileToolSheet from "./mobile/MobileToolSheet";
import { Maximize2 } from "@/utils/icons";
import type { Template } from "../../utils/templates";

/**
 * EditorMobile — a purpose-built touch editor. The preview and a mini
 * timeline are always on screen; every tool opens as a bottom sheet that
 * hosts the exact same panel component the desktop uses, so no editing
 * logic is duplicated. All state comes from the shared AppContext.
 */
export default function EditorMobile({ pendingTemplate }: { pendingTemplate?: Template }) {
  const {
    selectedClipId, selectedTextId, selectedImageID, selectedBlurId, videos,
  } = useAppDetailsContext();

  const [activeTool, setActiveTool] = useState<MobileTool | null>(null);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const templateTriggered = useRef(false);

  const hasSelection = !!(selectedClipId || selectedTextId || selectedImageID || selectedBlurId);
  const prevSelection = useRef(hasSelection);

  // A template that needs footage → jump straight to the Templates sheet
  // (the multi-slot picker wires the video onto the timeline correctly).
  useEffect(() => {
    if (!pendingTemplate || templateTriggered.current) return;
    templateTriggered.current = true;
    if (pendingTemplate.needsVideo && videos.length === 0) {
      setActiveTool(MOBILE_TOOLS.find((t) => t.key === "templates") ?? null);
    }
  }, [pendingTemplate, videos.length]);

  // Selecting something on the canvas (not from inside a sheet) opens the
  // Edit sheet, matching how desktop reveals the properties panel.
  useEffect(() => {
    if (hasSelection && !prevSelection.current && !activeTool && !timelineExpanded) {
      setActiveTool(MOBILE_TOOLS.find((t) => t.key === "edit") ?? null);
    }
    prevSelection.current = hasSelection;
  }, [hasSelection, activeTool, timelineExpanded]);

  return (
    <div className="w-screen flex flex-col bg-studio-base overflow-hidden select-none" style={{ height: "100dvh" }}>
      <Header />
      <MediaRelinkBanner />

      {/* ── Preview + transport ─────────────────────────────────────── */}
      <div className="flex flex-col bg-studio-void flex-shrink-0" style={{ height: "42dvh", minHeight: 190 }}>
        <div className="flex-1 min-h-0 overflow-hidden">
          <Screen />
        </div>
        <div className="flex items-center justify-between px-3 gap-2 flex-shrink-0 border-t border-white/5" style={{ height: 46 }}>
          <PlayerControls />
          <PreviewScale />
        </div>
      </div>

      {/* ── Mini timeline (always visible) ──────────────────────────── */}
      <div className="flex-1 min-h-0 bg-studio-surface border-t border-studio-border relative">
        <TimeLine compact />
        <button
          onClick={() => setTimelineExpanded(true)}
          aria-label="Expand timeline"
          className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-lg bg-studio-raised/90 backdrop-blur-sm border border-studio-border text-ink-muted active:scale-90 transition-transform"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      {/* ── Bottom tool rail ───────────────────────────────────────── */}
      <MobileToolRail
        activeKey={activeTool?.key ?? null}
        onPick={(tool) => setActiveTool((cur) => (cur?.key === tool.key ? null : tool))}
      />

      {/* ── Sheets ─────────────────────────────────────────────────── */}
      <MobileToolSheet
        view={activeTool?.view ?? null}
        onClose={() => setActiveTool(null)}
        pendingTemplate={pendingTemplate}
      />
      <Sheet open={timelineExpanded} onClose={() => setTimelineExpanded(false)} title="Timeline" height={0.8}>
        <TimeLine />
      </Sheet>
    </div>
  );
}
