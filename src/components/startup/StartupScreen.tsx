"use client";

import { useState } from "react";
import { IoLogoTiktok, IoPlayOutline, IoSquareOutline } from "react-icons/io5";
import { MdCropSquare } from "react-icons/md";
import { FaXTwitter } from "react-icons/fa6";
import { IoLogoInstagram, IoLogoYoutube } from "react-icons/io";
import { RiBracketsFill } from "react-icons/ri";
import { AspectRatio } from "../../types/types";
import { TEMPLATES, Template } from "../../utils/templates";

const RATIOS: {
  key: AspectRatio; label: string; sub: string;
  icon: React.ReactNode; w: number; h: number;
}[] = [
  { key: "16:9",       label: "16:9",      sub: "YouTube",         icon: <IoPlayOutline />,                                      w: 44, h: 25 },
  { key: "9:16",       label: "9:16",      sub: "Reels/Shorts",    icon: <IoPlayOutline style={{ transform: "rotate(90deg)" }} />, w: 25, h: 44 },
  { key: "1:1",        label: "1:1",       sub: "Square",          icon: <IoSquareOutline />,                                    w: 36, h: 36 },
  { key: "4:5",        label: "4:5",       sub: "IG Portrait",     icon: <MdCropSquare />,                                       w: 29, h: 36 },
  { key: "3:4",        label: "3:4",       sub: "Camera",          icon: <MdCropSquare />,                                       w: 27, h: 36 },
  { key: "original",   label: "Original",  sub: "Keep source",     icon: <RiBracketsFill />,                                     w: 40, h: 30 },
  { key: "ytshorts",   label: "YT Shorts", sub: "YouTube Shorts",  icon: <IoLogoYoutube />,                                      w: 25, h: 44 },
  { key: "instareels", label: "Reels",     sub: "IG Reels",        icon: <IoLogoInstagram />,                                    w: 25, h: 44 },
  { key: "tiktok",     label: "TikTok",    sub: "TikTok",          icon: <IoLogoTiktok />,                                       w: 25, h: 44 },
  { key: "xfeeds",     label: "X Feeds",   sub: "Twitter/X",       icon: <FaXTwitter />,                                         w: 44, h: 33 },
];

const CAT_COLORS: Record<string, string> = {
  title: "#6366F1", "lower-third": "#3B82F6",
  social: "#FF6A3D", minimal: "#8B5CF6", text: "#10B981",
};

interface Props {
  onStart: (aspectRatio: AspectRatio, template?: Template) => void;
}

export default function StartupScreen({ onStart }: Props) {
  const [mode, setMode] = useState<"blank" | "template">("blank");
  const [selAspect, setSelAspect] = useState<AspectRatio>("16:9");
  const [selTemplate, setSelTemplate] = useState<Template | null>(null);
  const [closing, setClosing] = useState(false);

  const go = () => {
    setClosing(true);
    setTimeout(() => onStart(
      selTemplate ? selTemplate.aspectRatio : selAspect,
      selTemplate ?? undefined,
    ), 250);
  };

  return (
    <div className={`startup-overlay${closing ? " closing" : ""}`}>
      {/*
        MOBILE-FIRST CARD
        – w-full on phones, max-w-[720px] on larger screens
        – padding scales via responsive classes (p-5 → sm:p-8 → md:p-10)
        – overflowY-auto so tall template lists don't clip on short phones
      */}
      <div className="
        relative w-[96vw] max-w-[720px]
        max-h-[92dvh] overflow-y-auto
        rounded-[18px] sm:rounded-[22px]
        p-5 sm:p-8 md:p-10
        bg-white/5 border border-white/10
        shadow-[0_40px_80px_rgba(0,0,0,.65),inset_0_1px_0_rgba(255,255,255,.08)]"
        style={{ backdropFilter: "blur(24px)" }}>

        {/* ── Logo row ─────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6 sm:mb-8">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#FF6A3D 0%,#FF8259 40%,#FF6A3D 100%)", boxShadow: "0 4px 16px rgba(91,79,232,.5)" }}>
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
              <rect x="2" y="5" width="18" height="12" rx="2.5" stroke="white" strokeWidth="1.6" />
              <path d="M9 8.5l5 2.5-5 2.5V8.5z" fill="white" />
            </svg>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-extrabold"
              style={{ background: "linear-gradient(135deg,#FF6A3D,#FF8259)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              ClipFlow
            </div>
            <div className="text-[10px] sm:text-[11.5px]" style={{ color: "rgba(255,255,255,.35)", marginTop: 1 }}>
              Professional Video Editor
            </div>
          </div>
        </div>

        {/* ── Mode toggle ──────────────────────────────── */}
        <div className="flex gap-1.5 mb-6 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,.06)" }}>
          {(["blank", "template"] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setSelTemplate(null); }}
              className="px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-[13px] font-bold transition-all"
              style={{
                background: mode === m ? "linear-gradient(135deg,#FF6A3D,#FF8259)" : "transparent",
                color: mode === m ? "white" : "rgba(255,255,255,.5)",
                boxShadow: mode === m ? "0 2px 10px rgba(91,79,232,.4)" : "none",
                border: "none", fontFamily: "inherit", cursor: "pointer",
              }}>
              {m === "blank" ? "⬜ Blank" : "✨ Template"}
            </button>
          ))}
        </div>

        {/* ── BLANK MODE ───────────────────────────────── */}
        {mode === "blank" && (
          <>
            <p className="text-sm sm:text-base font-bold text-white mb-1">Choose your canvas</p>
            <p className="text-[11px] sm:text-xs mb-5" style={{ color: "rgba(255,255,255,.4)" }}>
              Select an aspect ratio. You can change it anytime.
            </p>

            {/*
              Responsive grid: 3 cols on phones (cards are touch-friendly 80px+),
              5 cols on sm+ to match the original desktop layout.
            */}
            <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-2.5 mb-6 sm:mb-8">
              {RATIOS.map(r => {
                const active = selAspect === r.key;
                return (
                  <button key={r.key} onClick={() => setSelAspect(r.key)}
                    className="flex flex-col items-center gap-1.5 sm:gap-2 py-2.5 px-1 sm:py-3 sm:px-1.5 rounded-xl transition-all touch-manipulation"
                    style={{
                      border: `1.5px solid ${active ? "rgba(91,79,232,.8)" : "rgba(255,255,255,.1)"}`,
                      background: active ? "rgba(91,79,232,.18)" : "rgba(255,255,255,.03)",
                      boxShadow: active ? "0 0 0 3px rgba(91,79,232,.2)" : "none",
                      cursor: "pointer",
                    }}>
                    {/* Aspect-ratio preview box */}
                    <div className="flex items-center justify-center rounded-[4px] flex-shrink-0 text-[13px]"
                      style={{
                        width: r.w * 0.75, height: r.h * 0.75,
                        border: `1.5px solid ${active ? "rgba(91,79,232,.8)" : "rgba(255,255,255,.2)"}`,
                        background: active ? "rgba(91,79,232,.25)" : "rgba(255,255,255,.06)",
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

        {/* ── TEMPLATE MODE ────────────────────────────── */}
        {mode === "template" && (
          <>
            <p className="text-sm sm:text-base font-bold text-white mb-1">Choose a template</p>
            <p className="text-[11px] sm:text-xs mb-5" style={{ color: "rgba(255,255,255,.4)" }}>
              Auto-applies text, animations & effects. Everything is editable after.
            </p>

            {/*
              Single column on phones (easier to read & tap), 2 cols on sm+.
            */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 mb-6 sm:mb-8">
              {TEMPLATES.map(tpl => {
                const active = selTemplate?.id === tpl.id;
                const color = CAT_COLORS[tpl.category] ?? "#FF6A3D";
                const isVertical = ["9:16","ytshorts","instareels","tiktok"].includes(tpl.aspectRatio);
                const isSquare = tpl.aspectRatio === "1:1";

                return (
                  <button key={tpl.id} onClick={() => setSelTemplate(active ? null : tpl)}
                    className="flex items-start gap-3 p-3 sm:p-3.5 rounded-xl text-left transition-all touch-manipulation w-full"
                    style={{
                      border: `1.5px solid ${active ? color : "rgba(255,255,255,.1)"}`,
                      background: active ? `${color}26` : "rgba(255,255,255,.04)",
                      boxShadow: active ? `0 0 0 3px ${color}33` : "none",
                      cursor: "pointer",
                    }}>
                    {/* Mini aspect-ratio preview */}
                    <div className="flex-shrink-0 flex items-center justify-center rounded-md text-lg"
                      style={{
                        width: isVertical ? 32 : 54, height: isVertical ? 56 : isSquare ? 54 : 30,
                        background: "linear-gradient(135deg,#1a1a2e,#16213e)",
                        border: `1.5px solid ${active ? color : "rgba(255,255,255,.15)"}`,
                      }}>
                      {tpl.emoji}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="text-[12px] sm:text-[13px] font-bold"
                          style={{ color: active ? "white" : "rgba(255,255,255,.85)" }}>
                          {tpl.name}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: `${color}25`, color, border: `1px solid ${color}40` }}>
                          {tpl.aspectRatio}
                        </span>
                        {!tpl.needsVideo && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: "rgba(16,185,129,.15)", color: "#10B981", border: "1px solid rgba(16,185,129,.3)" }}>
                            No video
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-[11px] leading-relaxed"
                        style={{ color: "rgba(255,255,255,.4)" }}>
                        {tpl.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {tpl.buildTexts(100, 100, 10).length > 0 && (
                          <span className="text-[8.5px] px-1.5 py-0.5 rounded-full"
                            style={{ background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.45)" }}>
                            T ×{tpl.buildTexts(100, 100, 10).length}
                          </span>
                        )}
                        {tpl.buildBlurs(100, 100, 10).length > 0 && (
                          <span className="text-[8.5px] px-1.5 py-0.5 rounded-full"
                            style={{ background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.45)" }}>
                            ◎ Blur
                          </span>
                        )}
                        {tpl.buildTexts(100, 100, 10).some(t => t.animation !== "none") && (
                          <span className="text-[8.5px] px-1.5 py-0.5 rounded-full"
                            style={{ background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.45)" }}>
                            ✦ Animated
                          </span>
                        )}
                      </div>
                    </div>

                    {active && (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: color }}>
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── Footer ───────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 pt-4 sm:pt-5 border-t border-white/10">
          <p className="text-[10px] sm:text-[12px] flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,.4)" }}>
            {mode === "template" && selTemplate
              ? <><strong style={{ color: "rgba(255,255,255,.75)" }}>{selTemplate.name}</strong>
                  {selTemplate.needsVideo ? " · Pick a video next" : " · No video needed"}</>
              : <>Format: <strong style={{ color: "rgba(255,255,255,.75)" }}>
                  {mode === "blank" ? selAspect : (selTemplate?.aspectRatio ?? "—")}
                </strong></>
            }
          </p>

          <button onClick={go}
            className="flex items-center gap-2 px-5 sm:px-7 py-2.5 sm:py-3 rounded-xl font-bold text-[13px] sm:text-sm text-white flex-shrink-0 touch-manipulation transition-all"
            style={{
              background: "linear-gradient(135deg,#FF6A3D 0%,#FF8259 40%,#FF6A3D 100%)",
              border: "none", fontFamily: "inherit", cursor: "pointer",
              boxShadow: "0 4px 16px rgba(91,79,232,.5)",
            }}
            onTouchStart={e => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
            onTouchEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; }}>
            <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
              <path d="M4 3l5 3.5-5 3.5V3z" fill="white" />
            </svg>
            {mode === "template" && selTemplate ? "Apply Template" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
