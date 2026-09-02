"use client";

import { useAppDetailsContext } from "../../context/useAppContext";
import { useAuth } from "../../context/useAuthContext";
import { formatVideoSize } from "../../utils/formatVideoSize";
import { formatVideoDuration } from "../../utils/formatVideoDuration";
import RenderButton from "../ui/RenderButton";
import { SlidersHorizontal, Cloud, CloudOff, Loader2, Sun, Moon } from "@/utils/icons";
import { useProjectAutosave } from "../../hooks/useProjectAutosave";
import { useTheme } from "../../hooks/useTheme";

export default function Header() {
  const { totalTime, videos, clipsDetails, setIsCompositionSettingsOpen, fps } = useAppDetailsContext();
  const { user, logout, promptLogin } = useAuth();
  const { status: saveStatus, errorMessage: saveErrorMessage } = useProjectAutosave();
  const { theme, toggleTheme, mounted } = useTheme();
  const primary = videos.find(v => v.name === clipsDetails[0]?.name);

  return (
    <div className="h-[60px] bg-studio-surface border-b border-studio-border flex items-center px-2.5 sm:px-4 gap-2 sm:gap-3 flex-shrink-0 z-50 overflow-hidden">

      {/* Logo */}
      <div className="flex items-center gap-2 mr-0.5 sm:mr-1 flex-shrink-0">
        <div className="w-[30px] h-[30px] rounded-[9px] bg-signal flex items-center justify-center shadow-glow flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="#07070C" strokeWidth="1.4" />
            <path d="M5.5 5l4 2-4 2V5z" fill="#07070C" />
          </svg>
        </div>
        <span className="hidden sm:inline font-display text-sm font-bold text-ink-primary tracking-tight">
          ClipFlow
        </span>
      </div>

      <div className="hidden sm:block w-px h-5 bg-studio-border flex-shrink-0" />

      {/* File chips — hidden on the smallest screens, room is too tight to matter there */}
      <div className="hidden md:flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
        {primary && (
          <span className="flex items-center gap-1.5 bg-signal/10 border border-signal/30 text-signal rounded-full px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
            {primary.video.name.split("/").pop()?.slice(0, 28) ?? ""}
          </span>
        )}
        {primary && (
          <span className="bg-studio-raised border border-studio-border text-ink-secondary rounded-full px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap flex-shrink-0">
            {formatVideoSize(primary.video.size)}
          </span>
        )}
        {fps != null && (
          <span className="bg-studio-raised border border-studio-border text-ink-secondary rounded-full px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap flex-shrink-0">
            {fps.toFixed(2)} fps
          </span>
        )}
        {totalTime > 0 && (
          <span className="bg-studio-raised border border-studio-border text-ink-secondary rounded-full px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap flex-shrink-0">
            {formatVideoDuration(totalTime)}
          </span>
        )}
      </div>
      {/* Spacer takes over the file chips' job of pushing actions to the right when chips are hidden */}
      <div className="flex-1 min-w-0 md:hidden" />

      {/* Right actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {user && (
          <span
            title={
              saveStatus === "error" ? (saveErrorMessage ?? "Couldn't save — check your connection")
              : saveStatus === "saving" ? "Saving…"
              : saveStatus === "saved" ? "All changes saved"
              : "No changes to save yet"
            }
            className={`items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full ${
              saveStatus === "error" ? "flex" : "hidden lg:flex"
            } ${
              saveStatus === "error" ? "text-danger bg-danger/10"
              : saveStatus === "saving" ? "text-ink-muted bg-studio-hover"
              : "text-ink-faint"
            }`}
          >
            {saveStatus === "saving" && <Loader2 size={11} className="animate-spin" />}
            {saveStatus === "saved" && <Cloud size={11} />}
            {saveStatus === "error" && <CloudOff size={11} />}
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Save failed" : ""}
          </span>
        )}

        {mounted && (
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-studio-border bg-studio-raised text-ink-secondary hover:bg-studio-hover hover:text-ink-primary transition-colors cursor-pointer flex-shrink-0"
          >
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        )}

        <button
          disabled={videos.length === 0}
          onClick={() => setIsCompositionSettingsOpen(true)}
          title="Composition settings"
          className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border border-studio-border bg-studio-raised text-ink-secondary hover:bg-studio-hover hover:text-ink-primary text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
        >
          <SlidersHorizontal size={12} strokeWidth={2.2} />
          <span className="hidden sm:inline">Composition</span>
        </button>

        <RenderButton />

        <div className="hidden sm:block w-px h-5 bg-studio-border flex-shrink-0" />

        {user ? (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <div className="w-6 h-6 rounded-full bg-signal/15 border border-signal/30 text-signal flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {(user.displayName || user.email)[0]?.toUpperCase()}
            </div>
            <button
              onClick={logout}
              title={user.email}
              className="hidden sm:inline text-[11.5px] font-semibold text-ink-secondary hover:text-ink-primary transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => promptLogin()}
            className="h-8 px-2.5 sm:px-3 rounded-lg flex items-center justify-center border border-studio-border bg-studio-raised text-ink-secondary text-xs font-medium hover:bg-studio-hover hover:text-ink-primary transition-colors cursor-pointer flex-shrink-0"
          >
            Sign in
          </button>
        )}
      </div>
    </div>
  );
}
