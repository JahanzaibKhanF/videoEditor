"use client";

import { useAppDetailsContext } from "../../context/useAppContext";
import { useAuth } from "../../context/useAuthContext";
import { formatVideoSize } from "../../utils/formatVideoSize";
import { formatVideoDuration } from "../../utils/formatVideoDuration";
import RenderButton from "../ui/RenderButton";

export default function Header() {
  const { totalTime, videos, clipsDetails, setIsCompostionSettingsOpen, fps } = useAppDetailsContext();
  const { user, logout, promptLogin } = useAuth();
  const primary = videos.find(v => v.name === clipsDetails[0]?.name);

  return (
    <div className="h-[60px] bg-studio-surface border-b border-studio-border flex items-center px-4 gap-3 flex-shrink-0 z-50">

      {/* Logo */}
      <div className="flex items-center gap-2 mr-1 flex-shrink-0">
        <div className="w-[30px] h-[30px] rounded-[9px] bg-signal flex items-center justify-center shadow-glow">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="#0B0D10" strokeWidth="1.4" />
            <path d="M5.5 5l4 2-4 2V5z" fill="#0B0D10" />
          </svg>
        </div>
        <span className="font-display text-sm font-bold text-ink-primary tracking-tight">
          ClipFlow
        </span>
      </div>

      <div className="w-px h-5 bg-studio-border" />

      {/* File chips */}
      <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
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

      {/* Right actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          disabled={videos.length === 0}
          onClick={() => setIsCompostionSettingsOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-studio-border bg-studio-raised text-ink-secondary hover:bg-studio-hover hover:text-ink-primary text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 6h4M6 4v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          Composition
        </button>

        <RenderButton />

        <div className="w-px h-5 bg-studio-border" />

        {user ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-signal/15 border border-signal/30 text-signal flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {(user.displayName || user.email)[0]?.toUpperCase()}
            </div>
            <button
              onClick={logout}
              title={user.email}
              className="text-[11.5px] font-semibold text-ink-secondary hover:text-ink-primary transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => promptLogin()}
            className="h-8 px-3 rounded-lg flex items-center justify-center border border-studio-border bg-studio-raised text-ink-secondary text-xs font-medium hover:bg-studio-hover hover:text-ink-primary transition-colors cursor-pointer"
          >
            Sign in
          </button>
        )}
      </div>
    </div>
  );
}
