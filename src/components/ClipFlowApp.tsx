"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppContextProvider, EngineControlsProvider } from "@/context/useAppContext";
import { useAppDetailsContext } from "@/context/useAppContext";
import { AuthProvider, useAuth } from "@/context/useAuthContext";
import AuthScreen from "@/components/auth/AuthScreen";
import Editor from "@/components/Editor";
import StartupScreen from "@/components/startup/StartupScreen";
import { AspectRatio } from "@/types/types";
import { Template } from "@/utils/templates";
import { restoreProjectMedia } from "@/utils/restoreProjectMedia";

interface ResumeData {
  id: string;
  aspectRatio: AspectRatio;
  projectJson: Record<string, any>;
}

function EditorWithSetup({
  initialAspect, template, resumeData,
}: { initialAspect: AspectRatio; template?: Template; resumeData?: ResumeData }) {
  const {
    setSelectedAspectRatio, setTextsDetails, setBlursDetails,
    setClipsDetails, setImagesDetails, setAudioDetails, setLayerOrder,
    setTotalTime, setVideos, setResumedProjectId, setMissingMediaNames, setClipEffects,
  } = useAppDetailsContext();

  useEffect(() => { setSelectedAspectRatio(initialAspect); }, [initialAspect]);

  useEffect(() => {
    if (!template) return;
    const w = 1280, h = 720, dur = 10;
    const texts = template.buildTexts(w, h, dur);
    const blurs = template.buildBlurs(w, h, dur);
    if (texts.length > 0) setTextsDetails(texts);
    if (blurs.length > 0) setBlursDetails(blurs);
  }, [template]);

  // Hydrate editor state from a resumed (previously saved) project — runs
  // once. No local folder is matched yet at this point, so every clip/image
  // comes back with an empty src and gets listed in missingMediaNames;
  // MediaRelinkBanner (mounted inside Editor) picks up the retry the moment
  // the user links or reconnects their media folder.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!resumeData || hydrated.current) return;
    hydrated.current = true;

    const json = resumeData.projectJson ?? {};
    const savedClips = Array.isArray(json.clips) ? json.clips : [];
    const savedImages = Array.isArray(json.images) ? json.images : [];
    const result = restoreProjectMedia(savedClips, savedImages, new Map());

    setClipsDetails(result.clips);
    setImagesDetails(result.images);
    setVideos(result.videos);
    setTextsDetails(Array.isArray(json.texts) ? json.texts : []);
    setBlursDetails(Array.isArray(json.blurs) ? json.blurs : []);
    setAudioDetails(Array.isArray(json.audio) ? json.audio : []);
    setClipEffects(Array.isArray(json.clipEffects) ? json.clipEffects : []);
    setLayerOrder(Array.isArray(json.layerOrder) ? json.layerOrder : []);
    setTotalTime(typeof json.totalTime === "number" ? json.totalTime : 0);
    setMissingMediaNames(result.missingNames);
    setResumedProjectId(resumeData.id);
  }, [resumeData]);

  return <Editor pendingTemplate={template} />;
}

function ClipFlowAppInner() {
  const { loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [initialAspect, setInitialAspect] = useState<AspectRatio | null>(null);
  const [template, setTemplate] = useState<Template | undefined>(undefined);
  const [resumeData, setResumeData] = useState<ResumeData | undefined>(undefined);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

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

  const handleResumeProject = async (projectId: string) => {
    setResuming(true);
    setResumeError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load that project.");
      const project = data.project;
      setResumeData({
        id: project.id,
        aspectRatio: project.aspect_ratio,
        projectJson: project.project_json ?? {},
      });
      setInitialAspect(project.aspect_ratio as AspectRatio);
      // Keep the URL in sync with whichever project is actually open, so
      // refreshing the page (or bookmarking/sharing the link) reopens the
      // SAME project instead of bouncing back to the startup screen —
      // replace, not push, so this doesn't pollute browser history on
      // every resume.
      if (searchParams.get("project") !== projectId) {
        router.replace(`/?project=${projectId}`, { scroll: false });
      }
    } catch (err) {
      setResumeError((err as Error).message);
      setResuming(false);
    }
  };

  // Auto-resume from ?project=<id> in the URL on first load — this is the
  // other half of the URL-sync above: without it, the URL would update but
  // a fresh page load (refresh, bookmark, shared link) would still just
  // show the startup screen since nothing reads the param back.
  const autoResumeAttempted = useRef(false);
  useEffect(() => {
    if (autoResumeAttempted.current) return;
    if (loading) return; // wait until we know whether someone's signed in
    const projectId = searchParams.get("project");
    if (!projectId) return;
    autoResumeAttempted.current = true;
    handleResumeProject(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

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
        <>
          <StartupScreen
            onStart={(aspect, tpl) => {
              setResumeData(undefined);
              setResumeError(null);
              setTemplate(tpl);
              setInitialAspect(tpl ? tpl.aspectRatio : aspect);
              if (searchParams.get("project")) router.replace("/", { scroll: false });
            }}
            onResumeProject={handleResumeProject}
            resuming={resuming}
            resumeError={resumeError}
          />
        </>
      ) : (
        <AppContextProvider>
          <EngineControlsProvider>
            <EditorWithSetup initialAspect={initialAspect} template={template} resumeData={resumeData} />
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
