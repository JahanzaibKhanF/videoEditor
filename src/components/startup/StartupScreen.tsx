"use client";

/**
 * StartupScreen — single unified "Create" screen (CapCut/Adobe Express style):
 * a big "+ New composition" tile and every template's real cover image sit
 * together in ONE grid, visible immediately — no tab click needed to see
 * templates, and no separate "Blank" tab. Clicking "+" moves to a second
 * step (aspect ratio), clicking a template applies it directly.
 *
 * "Recent" (resuming a previously saved project) is a genuinely different
 * list — existing work vs. starting new — so it stays behind its own small
 * tab, shown only when signed in.
 */
import { useEffect, useState } from "react";
import { AspectRatio } from "../../types/types";
import { TEMPLATES, Template } from "../../utils/templates";
import { useAuth } from "../../context/useAuthContext";
import {
  Plus, Film, Clapperboard, Square, RectangleVertical, RectangleHorizontal,
  Camera, Music2, AtSign, ArrowLeft, Check, Sparkles, Clock, RefreshCw,
} from "@/utils/icons";

const RATIOS: {
  key: AspectRatio; label: string; sub: string;
  icon: React.ReactNode; w: number; h: number; featured?: boolean;
}[] = [
  { key: "original",   label: "Original",   sub: "Matches your video — adapts automatically", icon: <Camera size={20} />, w: 44, h: 30, featured: true },
  { key: "16:9",       label: "16:9",       sub: "YouTube, landscape",  icon: <RectangleHorizontal size={20} />, w: 44, h: 25 },
  { key: "9:16",       label: "9:16",       sub: "Reels / Shorts",     icon: <RectangleVertical size={20} />,   w: 25, h: 44 },
  { key: "1:1",        label: "1:1",        sub: "Square",              icon: <Square size={20} />,              w: 36, h: 36 },
  { key: "4:5",        label: "4:5",        sub: "Instagram portrait",  icon: <RectangleVertical size={20} />,   w: 29, h: 36 },
  { key: "3:4",        label: "3:4",        sub: "Camera native",       icon: <RectangleVertical size={20} />,   w: 27, h: 36 },
  { key: "ytshorts",   label: "YT Shorts",  sub: "YouTube Shorts",      icon: <Clapperboard size={20} />,       w: 25, h: 44 },
  { key: "instareels", label: "Reels",      sub: "Instagram Reels",     icon: <Camera size={20} />,              w: 25, h: 44 },
  { key: "tiktok",     label: "TikTok",     sub: "TikTok",               icon: <Music2 size={20} />,             w: 25, h: 44 },
  { key: "xfeeds",     label: "X Feeds",    sub: "Twitter / X",         icon: <AtSign size={20} />,              w: 44, h: 33 },
];

const CAT_COLORS: Record<string, string> = {
  title: "#8B5CFF", "lower-third": "#4C8CFF",
  social: "#FFB648", minimal: "#33D8A0", text: "#8B5CFF",
};

interface RecentProject {
  id: string;
  name: string;
  aspect_ratio: string;
  thumbnail_url: string | null;
  updated_at: string;
}

interface Props {
  onStart: (aspectRatio: AspectRatio, template?: Template) => void;
  onResumeProject: (projectId: string) => void;
  resuming: boolean;
  resumeError: string | null;
}

type Tab = "create" | "recent";
type CreateStep = "grid" | "ratio";

export default function StartupScreen({ onStart, onResumeProject, resuming, resumeError }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("create");
  const [step, setStep] = useState<CreateStep>("grid");
  const [selAspect, setSelAspect] = useState<AspectRatio | null>(null);
  const [closing, setClosing] = useState(false);

  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "recent" || !user) return;
    setLoadingRecent(true);
    setRecentError(null);
    fetch("/api/projects")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load your projects.");
        setRecentProjects(data.projects ?? []);
      })
      .catch((err) => setRecentError((err as Error).message))
      .finally(() => setLoadingRecent(false));
  }, [tab, user]);

  const goBlank = (ratio: AspectRatio) => {
    setClosing(true);
    setTimeout(() => onStart(ratio), 250);
  };

  const goTemplate = (tpl: Template) => {
    setClosing(true);
    setTimeout(() => onStart(tpl.aspectRatio, tpl), 250);
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setStep("grid");
    setSelAspect(null);
  };

  return (
    <div className={`startup-overlay${closing ? " closing" : ""}`}>
      <div className="
        relative w-[96vw] max-w-[900px]
        max-h-[92dvh] overflow-y-auto scrollbar-thin
        rounded-[18px] sm:rounded-[22px]
        p-5 sm:p-8 md:p-10
        bg-white/5 border border-white/10
        shadow-[0_40px_80px_rgba(0,0,0,.65),inset_0_1px_0_rgba(255,255,255,.08)]"
        style={{ backdropFilter: "blur(24px)" }}>

        {/* ── Logo row ─────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#8B5CFF 0%,#A47CFF 40%,#8B5CFF 100%)", boxShadow: "0 4px 16px rgba(139,92,255,.5)" }}>
              <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                <rect x="2" y="5" width="18" height="12" rx="2.5" stroke="white" strokeWidth="1.6" />
                <path d="M9 8.5l5 2.5-5 2.5V8.5z" fill="white" />
              </svg>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-extrabold"
                style={{ background: "linear-gradient(135deg,#8B5CFF,#A47CFF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                ClipFlow
              </div>
              <div className="text-[10px] sm:text-[11.5px]" style={{ color: "rgba(255,255,255,.35)", marginTop: 1 }}>
                Professional Video Editor
              </div>
            </div>
          </div>

          {/* "Recent" is the only real tab — Create (blank + templates together) is the default screen */}
          {user && (
            <div className="flex gap-1.5 p-1 rounded-xl" style={{ background: "rgba(255,255,255,.06)" }}>
              {([
                { key: "create", label: "Create" },
                { key: "recent", label: "Recent" },
              ] as const).map(t => (
                <button key={t.key} onClick={() => switchTab(t.key)}
                  className="px-4 sm:px-5 py-1.5 rounded-lg text-xs sm:text-[12.5px] font-bold transition-all"
                  style={{
                    background: tab === t.key ? "linear-gradient(135deg,#8B5CFF,#A47CFF)" : "transparent",
                    color: tab === t.key ? "white" : "rgba(255,255,255,.5)",
                    boxShadow: tab === t.key ? "0 2px 10px rgba(139,92,255,.4)" : "none",
                    border: "none", fontFamily: "inherit", cursor: "pointer",
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── CREATE — step 1: unified grid, "+" tile + every template together ── */}
        {tab === "create" && step === "grid" && (
          <>
            <p className="text-sm sm:text-base font-bold text-white mb-1">Start creating</p>
            <p className="text-[11px] sm:text-xs mb-5" style={{ color: "rgba(255,255,255,.4)" }}>
              Start blank, or pick a template — everything's editable after.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Big "+" tile — first in the same grid as templates, not a separate tab */}
              <button
                onClick={() => setStep("ratio")}
                className="group relative rounded-2xl overflow-hidden text-left transition-all aspect-video border-2 border-dashed flex flex-col items-center justify-center gap-2"
                style={{ borderColor: "rgba(139,92,255,.45)", background: "rgba(139,92,255,.08)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,255,.15)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,255,.08)"; }}
              >
                <div className="w-11 h-11 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,#8B5CFF,#A47CFF)", boxShadow: "0 4px 20px rgba(139,92,255,.5)" }}>
                  <Plus size={20} color="white" strokeWidth={2.5} />
                </div>
                <span className="text-[12.5px] font-bold text-white">New composition</span>
              </button>

              {TEMPLATES.map(tpl => {
                const color = CAT_COLORS[tpl.category] ?? "#8B5CFF";
                return (
                  <button key={tpl.id} onClick={() => goTemplate(tpl)}
                    className="group relative rounded-2xl overflow-hidden text-left transition-all aspect-video"
                    style={{ border: "1.5px solid rgba(255,255,255,.1)" }}
                  >
                    {tpl.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tpl.coverImage} alt={tpl.name}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#1a1a2e,#16213e)" }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

                    <span className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm"
                      style={{ background: `${color}35`, color: "white", border: `1px solid ${color}60` }}>
                      {tpl.aspectRatio}
                    </span>
                    {!tpl.needsVideo && (
                      <span className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm bg-success/30 text-white border border-success/50">
                        <Sparkles size={9} /> No video
                      </span>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <div className="text-[13px] font-bold text-white leading-tight drop-shadow mb-0.5">{tpl.name}</div>
                      <div className="text-[10px] leading-snug line-clamp-2" style={{ color: "rgba(255,255,255,.65)" }}>
                        {tpl.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── CREATE — step 2: choose aspect ratio (only reached via the "+" tile) ── */}
        {tab === "create" && step === "ratio" && (
          <>
            <button
              onClick={() => setStep("grid")}
              className="flex items-center gap-1.5 text-[11.5px] font-semibold mb-4 transition-colors"
              style={{ color: "rgba(255,255,255,.5)" }}
            >
              <ArrowLeft size={13} /> Back
            </button>
            <p className="text-sm sm:text-base font-bold text-white mb-1">Choose an aspect ratio</p>
            <p className="text-[11px] sm:text-xs mb-5" style={{ color: "rgba(255,255,255,.4)" }}>
              This is locked in for the project — pick "Original" if you'd rather it adapt to whatever video you add.
            </p>

            {/* Featured "Original" option, set apart from the fixed ratios */}
            {RATIOS.filter(r => r.featured).map(r => {
              const active = selAspect === r.key;
              return (
                <button key={r.key} onClick={() => setSelAspect(r.key)}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl mb-3 text-left transition-all touch-manipulation"
                  style={{
                    border: `1.5px solid ${active ? "rgba(139,92,255,.8)" : "rgba(255,255,255,.12)"}`,
                    background: active ? "rgba(139,92,255,.16)" : "rgba(255,255,255,.04)",
                    boxShadow: active ? "0 0 0 3px rgba(139,92,255,.2)" : "none",
                  }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: active ? "rgba(139,92,255,.25)" : "rgba(255,255,255,.06)", color: active ? "#A47CFF" : "rgba(255,255,255,.5)" }}>
                    {r.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-white">{r.label} — from your video</div>
                    <div className="text-[10.5px] leading-tight mt-0.5" style={{ color: "rgba(255,255,255,.4)" }}>{r.sub}</div>
                  </div>
                  {active && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#8B5CFF" }}>
                      <Check size={11} color="white" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}

            <p className="text-[10px] font-bold uppercase tracking-wide mb-2.5" style={{ color: "rgba(255,255,255,.3)" }}>
              Or pick a fixed ratio
            </p>
            <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-2.5 mb-6 sm:mb-8">
              {RATIOS.filter(r => !r.featured).map(r => {
                const active = selAspect === r.key;
                return (
                  <button key={r.key} onClick={() => setSelAspect(r.key)}
                    className="flex flex-col items-center gap-1.5 sm:gap-2 py-2.5 px-1 sm:py-3 sm:px-1.5 rounded-xl transition-all touch-manipulation"
                    style={{
                      border: `1.5px solid ${active ? "rgba(139,92,255,.8)" : "rgba(255,255,255,.1)"}`,
                      background: active ? "rgba(139,92,255,.18)" : "rgba(255,255,255,.03)",
                      boxShadow: active ? "0 0 0 3px rgba(139,92,255,.2)" : "none",
                    }}>
                    <div className="flex items-center justify-center rounded-[4px] flex-shrink-0"
                      style={{
                        width: r.w * 0.75, height: r.h * 0.75,
                        border: `1.5px solid ${active ? "rgba(139,92,255,.8)" : "rgba(255,255,255,.2)"}`,
                        background: active ? "rgba(139,92,255,.25)" : "rgba(255,255,255,.06)",
                        color: active ? "white" : "rgba(255,255,255,.45)",
                      }}>
                      {r.icon}
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] sm:text-[11.5px] font-bold leading-tight"
                        style={{ color: active ? "white" : "rgba(255,255,255,.7)" }}>
                        {r.label}
                      </div>
                      <div className="text-[8.5px] sm:text-[9px] leading-tight mt-0.5 hidden xs:block"
                        style={{ color: "rgba(255,255,255,.3)" }}>
                        {r.sub}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── RECENT — resume a previously saved project ──── */}
        {tab === "recent" && (
          <>
            <p className="text-sm sm:text-base font-bold text-white mb-1">Your projects</p>
            <p className="text-[11px] sm:text-xs mb-5" style={{ color: "rgba(255,255,255,.4)" }}>
              Media stays on your device — you'll be asked to relink your media folder to resume playback.
            </p>

            {resumeError && (
              <div className="mb-4 px-3.5 py-2.5 rounded-xl text-[12px]" style={{ background: "rgba(255,79,112,.1)", border: "1px solid rgba(255,79,112,.3)", color: "#FF8FA3" }}>
                {resumeError}
              </div>
            )}

            {loadingRecent ? (
              <div className="flex items-center justify-center py-14">
                <RefreshCw size={20} className="animate-spin" style={{ color: "rgba(255,255,255,.3)" }} />
              </div>
            ) : recentError ? (
              <div className="text-[12px] py-10 text-center" style={{ color: "rgba(255,255,255,.4)" }}>{recentError}</div>
            ) : recentProjects.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <Clock size={26} style={{ color: "rgba(255,255,255,.2)" }} />
                <p className="text-[12.5px]" style={{ color: "rgba(255,255,255,.4)" }}>No saved projects yet.</p>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,.25)" }}>Projects save automatically while you edit, once you're signed in.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-2">
                {recentProjects.map(p => (
                  <button key={p.id}
                    onClick={() => onResumeProject(p.id)}
                    disabled={resuming}
                    className="group relative rounded-2xl overflow-hidden text-left transition-all aspect-video disabled:opacity-50 disabled:cursor-wait"
                    style={{ border: "1.5px solid rgba(255,255,255,.1)" }}>
                    {p.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnail_url} alt={p.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#1a1a2e,#16213e)" }}>
                        <Film size={20} style={{ color: "rgba(255,255,255,.2)" }} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                    <span className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm" style={{ background: "rgba(139,92,255,.35)", color: "white", border: "1px solid rgba(139,92,255,.6)" }}>
                      {p.aspect_ratio}
                    </span>
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <div className="text-[13px] font-bold text-white leading-tight drop-shadow mb-0.5 truncate">{p.name}</div>
                      <div className="text-[10px]" style={{ color: "rgba(255,255,255,.55)" }}>
                        {new Date(p.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Footer — only shown on the ratio-selection step ── */}
        {tab === "create" && step === "ratio" && (
          <div className="flex items-center justify-between gap-4 pt-4 sm:pt-5 border-t border-white/10">
            <p className="text-[10px] sm:text-[12px] flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,.4)" }}>
              {selAspect
                ? <>Format: <strong style={{ color: "rgba(255,255,255,.75)" }}>{selAspect}</strong></>
                : "Pick an aspect ratio to continue"}
            </p>
            <button
              onClick={() => selAspect && goBlank(selAspect)}
              disabled={!selAspect}
              className="flex items-center gap-2 px-5 sm:px-7 py-2.5 sm:py-3 rounded-xl font-bold text-[13px] sm:text-sm text-white flex-shrink-0 touch-manipulation transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg,#8B5CFF 0%,#A47CFF 40%,#8B5CFF 100%)",
                border: "none", fontFamily: "inherit", cursor: selAspect ? "pointer" : "not-allowed",
                boxShadow: selAspect ? "0 4px 16px rgba(139,92,255,.5)" : "none",
              }}>
              <Film size={14} />
              Create Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
