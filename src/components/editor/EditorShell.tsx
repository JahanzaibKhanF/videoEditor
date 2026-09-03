"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useIsTouch } from "../../hooks/useIsTouch";
import { useBgRemovedRestore } from "../../hooks/useBgRemovedRestore";
import EditorDesktop from "./EditorDesktop";
import EditorMobile from "./EditorMobile";
import VideoOutputModal from "../modals/VideoOutputModal";
import RenderingLoader from "../ui/RenderingLoader";
import Importing from "../ui/Importing";
import CompositionSettingsModal from "../modals/CompositionSettingsModal";
import { Template } from "../../utils/templates";

/**
 * EditorShell — picks the editor surface for the device and mounts the
 * shared modal/overlay layer. The mobile tree is used only on a genuine
 * touch device that is also narrow (a small desktop window keeps the full
 * desktop editor). All editing state lives in AppContext, so both trees
 * drive the same project.
 */
export default function EditorShell({ pendingTemplate }: { pendingTemplate?: Template }) {
  const {
    isMediaImporting, isShowProcessedVideo, setIsShowProcessedVideo,
    isCompositionSettingsOpen, videos,
  } = useAppDetailsContext();

  useBgRemovedRestore();

  const isNarrow = useIsMobile(768);
  const isTouch = useIsTouch();
  const isMobile = isNarrow && isTouch;

  // Desktop tab state — shared between IconSidebar and MediaPanel.
  const [activeTab, setActiveTab] = useState("media");
  const templateTriggered = useRef(false);

  // The inspector's "Change" rows and the timeline's transition-seam badges
  // ask the shell to open a catalog on the left via this window event
  // (same pattern as clipflow:project-slot-freed) rather than prop drilling.
  useEffect(() => {
    if (isMobile) return;
    const fn = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail;
      if (typeof tab === "string") setActiveTab(tab);
    };
    window.addEventListener("clipflow:open-catalog", fn as EventListener);
    return () => window.removeEventListener("clipflow:open-catalog", fn as EventListener);
  }, [isMobile]);

  // A template that needs footage → open the Templates picker so it can
  // wire the chosen video(s) onto the timeline and set activeTemplate.
  useEffect(() => {
    if (!pendingTemplate || templateTriggered.current) return;
    templateTriggered.current = true;
    if (pendingTemplate.needsVideo && videos.length === 0) {
      setActiveTab("templates");
    }
  }, [pendingTemplate, videos.length]);

  return (
    <>
      {isMobile ? (
        <EditorMobile pendingTemplate={pendingTemplate} />
      ) : (
        <EditorDesktop
          pendingTemplate={pendingTemplate}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}

      {/* Shared overlay layer — same on both surfaces */}
      {isShowProcessedVideo && <VideoOutputModal setIsShowProcessedVideo={setIsShowProcessedVideo} />}
      <RenderingLoader />
      {isMediaImporting && <Importing />}
      {isCompositionSettingsOpen && <CompositionSettingsModal />}
    </>
  );
}
