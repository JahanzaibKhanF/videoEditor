"use client";

import { useEffect, useState } from "react";
import { AppContextProvider, EngineControlsProvider } from "@/context/useAppContext";
import { useAppDetailsContext } from "@/context/useAppContext";
import { AuthProvider, useAuth } from "@/context/useAuthContext";
import AuthScreen from "@/components/auth/AuthScreen";
import Editor from "@/components/Editor";
import StartupScreen from "@/components/startup/StartupScreen";
import { AspectRatio } from "@/types/types";
import { Template } from "@/utils/templates";

function EditorWithSetup({ initialAspect, template }: { initialAspect: AspectRatio; template?: Template }) {
  const { setSelectedAspectRatio, setTextsDetails, setBlursDetails } = useAppDetailsContext();

  useEffect(() => { setSelectedAspectRatio(initialAspect); }, [initialAspect]);

  useEffect(() => {
    if (!template) return;
    const w = 1280, h = 720, dur = 10;
    const texts = template.buildTexts(w, h, dur);
    const blurs = template.buildBlurs(w, h, dur);
    if (texts.length > 0) setTextsDetails(texts);
    if (blurs.length > 0) setBlursDetails(blurs);
  }, [template]);

  return <Editor pendingTemplate={template} />;
}

function ClipFlowAppInner() {
  const { loading } = useAuth();
  const [initialAspect, setInitialAspect] = useState<AspectRatio | null>(null);
  const [template, setTemplate] = useState<Template | undefined>(undefined);

  useEffect(() => {
    const disableZoom = (e: KeyboardEvent | WheelEvent) => {
      if ((e instanceof WheelEvent && e.ctrlKey) ||
          (e instanceof KeyboardEvent && e.ctrlKey && ["+", "-", "=", "0"].includes(e.key)))
        e.preventDefault();
    };
    const disableTouch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    window.addEventListener("wheel", disableZoom, { passive: false });
    window.addEventListener("keydown", disableZoom as EventListener, { passive: false });
    window.addEventListener("touchmove", disableTouch, { passive: false });
    return () => {
      window.removeEventListener("wheel", disableZoom);
      window.removeEventListener("keydown", disableZoom as EventListener);
      window.removeEventListener("touchmove", disableTouch);
    };
  }, []);

  // `loading` here just means "checking whether a session cookie already
  // exists" — it does NOT block guests from using the app. It only avoids
  // a one-frame flash of "Sign in" before we know someone's already
  // logged in.
  if (loading) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-studio-void">
        <div className="w-8 h-8 rounded-full border-2 border-studio-border border-t-signal animate-spin" />
      </div>
    );
  }

  return (
    <div className="select-none">
      {initialAspect === null ? (
        <StartupScreen onStart={(aspect, tpl) => { setTemplate(tpl); setInitialAspect(tpl ? tpl.aspectRatio : aspect); }} />
      ) : (
        <AppContextProvider>
          <EngineControlsProvider>
            <EditorWithSetup initialAspect={initialAspect} template={template} />
          </EngineControlsProvider>
        </AppContextProvider>
      )}
      {/* Mounted once, globally — opens itself via AuthContext.promptLogin() */}
      <AuthScreen />
    </div>
  );
}

export default function ClipFlowApp() {
  return (
    <AuthProvider>
      <ClipFlowAppInner />
    </AuthProvider>
  );
}
