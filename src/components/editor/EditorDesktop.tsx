"use client";

import { useState } from "react";
import Header from "../chrome/Header";
import MediaPanel from "../panels/MediaPanel";
import Screen from "../preview/Screen";
import PlayerControls from "../preview/PlayerControls";
import PreviewScale from "../preview/PreviewScale";
import PropertiesPanel from "../panels/PropertiesPanel";
import TimeLine from "../timeline/TimeLine";
import IconSidebar from "../chrome/IconSidebar";
import MediaRelinkBanner from "../chrome/MediaRelinkBanner";
import type { Template } from "../../utils/templates";

const MIN_LEFT = 220, MIN_RIGHT = 230, MIN_TL = 140, MAX_TL = 340;

/**
 * EditorDesktop — the multi-panel editor for pointer devices: icon rail +
 * resizable left/right panels around the canvas, resizable timeline docked
 * at the bottom. Extracted verbatim from the old EditorShell desktop branch.
 */
export default function EditorDesktop({
  pendingTemplate,
  activeTab,
  onTabChange,
}: {
  pendingTemplate?: Template;
  activeTab: string;
  onTabChange: (t: string) => void;
}) {
  const [leftW, setLeftW] = useState(260);
  const [rightW, setRightW] = useState(270);
  const [tlH, setTlH] = useState(210);

  // Resizer drag helper — Pointer Events for mouse/touch/stylus
  const makeDrag = (setter: (v: number) => void, min: number, max: number | null, dir: "right" | "left" | "up") =>
    (e: React.PointerEvent) => {
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const startCoord = dir === "up" ? e.clientY : e.clientX;
      const startV = dir === "right" ? leftW : dir === "left" ? rightW : tlH;
      document.body.style.cursor = dir === "up" ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
      const move = (ev: PointerEvent) => {
        const coord = dir === "up" ? ev.clientY : ev.clientX;
        const delta = (dir === "left" || dir === "up") ? startCoord - coord : coord - startCoord;
        let next = Math.max(min, startV + delta);
        if (max !== null) next = Math.min(max, next);
        setter(next);
      };
      const up = (ev: PointerEvent) => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener("pointermove", move as EventListener);
        target.removeEventListener("pointerup", up as EventListener);
      };
      target.addEventListener("pointermove", move as EventListener);
      target.addEventListener("pointerup", up as EventListener);
    };

  return (
    <div className="w-screen h-screen flex flex-col bg-studio-base overflow-hidden select-none">
      <Header />
      <MediaRelinkBanner />

      <div className="flex flex-1 min-h-0">
        <IconSidebar activeTab={activeTab} onTabChange={onTabChange} />

        {/* Left panel */}
        <div style={{ width: leftW, minWidth: MIN_LEFT, maxWidth: "34%" }}
          className="bg-studio-surface overflow-hidden flex-shrink-0">
          <MediaPanel activeTab={activeTab} pendingTemplate={pendingTemplate} />
        </div>

        <div className="resizer-h" onPointerDown={makeDrag(setLeftW, MIN_LEFT, null, "right")} />

        {/* Center: canvas + player bar */}
        <div className="flex-1 min-w-[280px] flex flex-col overflow-hidden bg-studio-void">
          <div className="flex-1 min-h-0 overflow-hidden">
            <Screen />
          </div>
          <div className="player-bar flex items-center justify-between px-4 gap-3 flex-shrink-0" style={{ height: 52 }}>
            <PlayerControls />
            <PreviewScale />
          </div>
        </div>

        <div className="resizer-h" onPointerDown={makeDrag(setRightW, MIN_RIGHT, null, "left")} />

        {/* Right panel */}
        <div style={{ width: rightW, minWidth: MIN_RIGHT, maxWidth: "36%" }}
          className="bg-studio-surface overflow-hidden flex-shrink-0 border-l border-studio-border">
          <PropertiesPanel />
        </div>
      </div>

      <div className="resizer-v" onPointerDown={makeDrag(setTlH, MIN_TL, MAX_TL, "up")} />

      {/* Timeline */}
      <div style={{ height: tlH, minHeight: MIN_TL, maxHeight: MAX_TL }}
        className="bg-studio-surface flex-shrink-0 overflow-hidden border-t border-studio-border">
        <TimeLine />
      </div>
    </div>
  );
}
