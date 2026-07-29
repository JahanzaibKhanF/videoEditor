"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../context/useAppContext";
import { useIsMobile } from "../hooks/useIsMobile";
import Header from "./sections/Header";
import MediaPanel from "./sections/MediaPanel";
import Screen from "./screen/Screen";
import PlayerControls from "./screen/PlayerControls";
import PreviewScale from "./screen/PreviewScale";
import RenderButton from "./ui/RenderButton";
import PropertiesPanel from "./sections/PropertiesPanel";
import TimeLine from "./timeline/TimeLine";
import VideoOutputModal from "./output/VideoOutputModal";
import RenderingLoader from "./ui/RenderingLoader";
import Importing from "./ui/Importing";
import CompostionSettingsModal from "./options/CompostionSettingsModal";
import IconSidebar from "./sections/IconSidebar";
import MediaRelinkBanner from "./sections/MediaRelinkBanner";
import AssetsSection from "./sections/AssetsSection";
import TextEditor from "./sections/TextEditor";
import { Template } from "../utils/templates";
import { Film, Type, ImageIcon, SlidersHorizontal, Clock, Sparkles, Shuffle, LayoutTemplate, Layers2, History } from "@/utils/icons";

const MIN_LEFT = 220, MIN_RIGHT = 230, MIN_TL = 140, MAX_TL = 340;

// ── Mobile bottom-bar tab definitions ────────────────────────────────────
// IMPORTANT: every one of these that isn't "text"/"assets"/"properties"/
// "timeline" routes through MediaPanel's own activeTab prop (setActiveTab
// below) — MediaPanel already handles all of media/text/effects/
// transitions/layers/templates/recent internally (see its `activeTab ===`
// branches), the SAME routing IconSidebar drives on desktop. Previously
// this list only had media/text/assets/properties/timeline, and nothing on
// mobile ever called setActiveTab at all (IconSidebar, the only thing that
// does, never renders on mobile) — so Effects, Transitions, Layers,
// Templates, and Recent Projects were 100% unreachable on a phone, not
// just cramped or unstyled. That's the actual bug behind "can't add
// effects on mobile."
const MOBILE_TABS = [
  { key: "media",       label: "Media",    Icon: Film,              activeTab: "media" },
  { key: "text",        label: "Text",     Icon: Type,              activeTab: null },
  { key: "effects",     label: "Effects",  Icon: Sparkles,          activeTab: "effects" },
  { key: "transitions", label: "Trans.",   Icon: Shuffle,           activeTab: "transitions" },
  { key: "templates",   label: "Templates",Icon: LayoutTemplate,    activeTab: "templates" },
  { key: "layers",      label: "Layers",   Icon: Layers2,           activeTab: "layers" },
  { key: "recentproj",  label: "Recent",   Icon: History,           activeTab: "recent" },
  { key: "assets",      label: "Assets",   Icon: ImageIcon,         activeTab: null },
  { key: "properties",  label: "Edit",     Icon: SlidersHorizontal, activeTab: null },
  { key: "timeline",    label: "Timeline", Icon: Clock,             activeTab: null },
] as const;
type MobileTab = typeof MOBILE_TABS[number]["key"];

export default function Editor({ pendingTemplate }: { pendingTemplate?: Template }) {
  const {
    isMediaImporting, isShowProcessedVideo, setIsShowProcessedVideo,
    isCompostionSettingsOpen, videos,
  } = useAppDetailsContext();

  const isMobile = useIsMobile(768);
  const [leftW, setLeftW] = useState(260);
  const [rightW, setRightW] = useState(270);
  const [tlH, setTlH] = useState(210);
  const [activeTab, setActiveTab] = useState("media");
  const [mobileTab, setMobileTab] = useState<MobileTab>("media");
  const templateTriggered = useRef(false);

  // Template video prompt — switches to the Templates tab so the real
  // multi-slot picker (TemplatesPanel) handles picking video(s) and wiring
  // them onto the timeline correctly. This used to open a plain native
  // <input type="file"> that only accepted ONE file and just added it to
  // the media library without ever placing it on the timeline or setting
  // activeTemplate — so a template picked from the startup screen looked
  // like it silently ignored the video entirely for anything beyond a
  // single-slot template, and even then never auto-added to the timeline.
  useEffect(() => {
    if (!pendingTemplate || templateTriggered.current) return;
    templateTriggered.current = true;
    if (pendingTemplate.needsVideo && videos.length === 0) {
      setActiveTab("templates");
      setMobileTab("media");
    }
  }, [pendingTemplate]);

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

  // ── Shared overlay layer (rendered regardless of mobile/desktop) ──────
  const overlays = (
    <>
      {isShowProcessedVideo && <VideoOutputModal setIsShowProcessedVideo={setIsShowProcessedVideo} />}
      <RenderingLoader />
      {isMediaImporting && <Importing />}
      {isCompostionSettingsOpen && <CompostionSettingsModal />}
    </>
  );

  // ── MOBILE LAYOUT ─────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        <div className="w-screen flex flex-col bg-studio-base overflow-hidden select-none"
          style={{ height: "100dvh" }}>
          <Header />
          <MediaRelinkBanner />

          {/*
            Preview: fills ~40% of the available height so the bottom panel
            (bottom-bar + panel content + timeline) always stays reachable
            without the canvas overflowing off-screen.
          */}
          <div className="flex flex-col bg-studio-void flex-shrink-0"
            style={{ height: "40dvh", minHeight: 200 }}>
            <div className="flex-1 min-h-0 overflow-hidden">
              <Screen />
            </div>
            {/* Compact player bar */}
            <div className="flex items-center justify-between px-3 gap-2 flex-shrink-0 bg-black/20"
              style={{ height: 44 }}>
              <PlayerControls />
              <div className="flex items-center gap-2">
                <PreviewScale />
                <RenderButton />
              </div>
            </div>
          </div>

          {/*
            Horizontal-scroll bottom menu track — sits directly above the
            timeline. Each tab is a thumb-optimised 64 px touch target.
            overflow-x-auto + snap lets users swipe between tabs naturally.
          */}
          <div className="flex-shrink-0 bg-studio-surface border-y border-studio-border overflow-x-auto"
            style={{ height: 52, scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
            <div className="flex h-full items-center px-1 gap-0.5" style={{ width: "max-content" }}>
              {MOBILE_TABS.map(tab => {
                const active = mobileTab === tab.key;
                return (
                  <button key={tab.key} onClick={() => { setMobileTab(tab.key); if (tab.activeTab) setActiveTab(tab.activeTab); }}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all flex-shrink-0 touch-manipulation"
                    style={{
                      width: 64, height: 44, scrollSnapAlign: "start",
                      background: active ? "rgba(139,92,255,.12)" : "transparent",
                      color: active ? "#8B5CFF" : "#89859F",
                      border: active ? "1px solid rgba(139,92,255,.3)" : "1px solid transparent",
                    }}>
                    <tab.Icon size={16} strokeWidth={active ? 2.4 : 2} />
                    <span className="text-[9px] font-semibold leading-none">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/*
            Switchable panel — grows to fill remaining space above the timeline.
            Each tab renders its own scrollable content.
          */}
          <div className="flex-1 min-h-0 bg-studio-surface overflow-hidden">
            {["media", "effects", "transitions", "templates", "layers", "recentproj"].includes(mobileTab)
              && <MediaPanel activeTab={activeTab} pendingTemplate={pendingTemplate} />}
            {mobileTab === "text"       && <TextEditor />}
            {mobileTab === "assets"     && <AssetsSection />}
            {mobileTab === "properties" && <PropertiesPanel />}
            {mobileTab === "timeline"   && (
              <div className="h-full overflow-hidden">
                <TimeLine />
              </div>
            )}
          </div>

          {/*
            Persistent mini timeline strip — always visible at the bottom when
            NOT already in "timeline" tab, so the user always has playhead context.
          */}
          {mobileTab !== "timeline" && (
            <div className="flex-shrink-0 bg-studio-surface border-t border-studio-border"
              style={{ height: 80 }}>
              <TimeLine compact />
            </div>
          )}
        </div>
        {overlays}
      </>
    );
  }

  // ── DESKTOP LAYOUT ────────────────────────────────────────────────────
  return (
    <>
      <div className="w-screen h-screen flex flex-col bg-studio-base overflow-hidden select-none">
        <Header />
        <MediaRelinkBanner />

        <div className="flex flex-1 min-h-0">
          <IconSidebar activeTab={activeTab} onTabChange={setActiveTab} />

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
              <div className="flex items-center gap-2.5">
                <PreviewScale />
                <div className="w-px h-3.5 bg-black/10 dark:bg-white/10" />
                <RenderButton />
              </div>
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
      {overlays}
    </>
  );
}

