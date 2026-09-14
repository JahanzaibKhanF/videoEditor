"use client";

/**
 * LandingPage — the public marketing page at "/". The actual editor lives at
 * "/editor" (see app/editor/page.tsx) and never changes its URL as you use
 * tools inside it; this page exists purely so Google has real, indexable
 * content to rank, with a single job: explain the product and get a click
 * into the editor. Every screenshot/clip here is real product output —
 * `public/landing/templates-preview.jpg` is a genuine screenshot of the
 * startup screen, `hero-bg.mp4`/`showreel-park.mp4` are free, commercial-use
 * stock footage (Coverr) downloaded once at build time and served from this
 * app, not hotlinked.
 */
import Link from "next/link";
import { useState } from "react";
import {
  LayoutTemplate, Zap, Pipette, Wand2, Type, Download,
  ArrowRight, Menu, X, Check, Crop, Sparkles,
} from "lucide-react";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#templates", label: "Templates" },
  { href: "#chroma-key", label: "Chroma Key" },
];

const FEATURES = [
  {
    icon: LayoutTemplate, accent: "#8B5CFF",
    title: "Ready-made templates",
    body: "Drop a template in and it's already timed, animated, and styled — captions, speed ramps, beat-synced cuts. Just add your clips.",
  },
  {
    icon: Zap, accent: "#4C8CFF",
    title: "Real keyframe animation",
    body: "Animate position, scale, rotation, opacity, and blur frame-by-frame, or start from a one-click preset and hand-tune it from there.",
  },
  {
    icon: Pipette, accent: "#33D8A0",
    title: "Manual chroma key",
    body: "Pull any green or blue screen with an eyedropper plus tolerance, edge feather, and edge thin — live, with no re-encoding.",
  },
  {
    icon: Wand2, accent: "#FFB648",
    title: "Shapes & brush layers",
    body: "Add vector shapes or freehand drawings that animate, resize, and export exactly like any video, image, or text layer.",
  },
  {
    icon: Type, accent: "#FF4F70",
    title: "Stylized text",
    body: "Gradient fills, outlines, and curved text baked right into the canvas — new.",
  },
  {
    icon: Download, accent: "#A47CFF",
    title: "Fast, local export",
    body: "Hardware-accelerated export via WebCodecs, right in your browser — no upload, no render queue, no waiting on a server.",
  },
];

export default function LandingPage() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden bg-studio-void text-ink-primary scrollbar-thin">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-studio-void/70 border-b border-studio-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14 sm:h-16">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-signal to-signal-hover flex-shrink-0">
              <svg viewBox="0 0 22 22" fill="none" className="w-4 h-4 sm:w-[18px] sm:h-[18px]">
                <rect x="2" y="5" width="18" height="12" rx="2.5" stroke="white" strokeWidth="1.6" />
                <path d="M9 8.5l5 2.5-5 2.5V8.5z" fill="white" />
              </svg>
            </div>
            <span className="font-display font-bold text-[15px] sm:text-[17px] tracking-tight">ClipFlow</span>
          </div>

          <nav className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} className="text-[13px] font-medium text-ink-secondary hover:text-ink-primary transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/editor" className="text-[13px] font-semibold text-ink-secondary hover:text-ink-primary transition-colors px-2">
              Sign in
            </Link>
            <Link
              href="/editor"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold text-white bg-gradient-to-br from-signal to-signal-hover shadow-glow hover:scale-[1.03] active:scale-95 transition-transform"
            >
              Start Editing Free
            </Link>
          </div>

          <button onClick={() => setNavOpen(v => !v)} className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-ink-secondary" aria-label="Menu">
            {navOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {navOpen && (
          <div className="md:hidden border-t border-studio-border px-4 py-3 flex flex-col gap-3 bg-studio-void">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} onClick={() => setNavOpen(false)} className="text-[13.5px] font-medium text-ink-secondary">
                {l.label}
              </a>
            ))}
            <Link href="/editor" className="text-[13.5px] font-semibold text-ink-primary">Sign in</Link>
            <Link href="/editor" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-[13.5px] font-bold text-white bg-gradient-to-br from-signal to-signal-hover">
              Start Editing Free
            </Link>
          </div>
        )}
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <video
          autoPlay muted loop playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-30"
          src="/landing/hero-bg.mp4"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-studio-void/40 via-studio-void/80 to-studio-void" />
        <div className="aurora-field opacity-70" aria-hidden="true">
          <div className="aurora-blob b1" />
          <div className="aurora-blob b2" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-28 pb-16 sm:pb-24 text-center animate-rise-in">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold text-signal-hover bg-signal/10 border border-signal/25 mb-5">
            <Sparkles size={11} /> Runs entirely in your browser
          </div>
          <h1 className="font-display font-extrabold tracking-tight leading-[1.05] text-[34px] sm:text-[52px] md:text-[64px] mb-5">
            Edit video like a studio.<br className="hidden sm:block" /> No install, no upload.
          </h1>
          <p className="text-[14px] sm:text-[17px] text-ink-secondary leading-relaxed max-w-2xl mx-auto mb-8">
            Templates, keyframe animation, chroma key, and instant export — the tools a real editor needs,
            free to start, running client-side right in your browser tab.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/editor"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-[14.5px] font-bold text-white bg-gradient-to-br from-signal to-signal-hover shadow-glow hover:scale-[1.02] active:scale-95 transition-transform w-full sm:w-auto justify-center"
            >
              Start Editing Free <ArrowRight size={15} />
            </Link>
            <a
              href="#templates"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-[14.5px] font-bold text-ink-primary bg-studio-raised border border-studio-border hover:bg-studio-hover transition-colors w-full sm:w-auto justify-center"
            >
              Browse Templates
            </a>
          </div>
          <p className="text-[11.5px] text-ink-faint mt-5">No credit card. No account required to try it.</p>
        </div>
      </section>

      {/* ── Feature tiles ───────────────────────────────────────────────── */}
      <section id="features" className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center max-w-xl mx-auto mb-10 sm:mb-14">
          <h2 className="font-display font-bold text-[24px] sm:text-[32px] tracking-tight mb-3">Everything a video editor needs</h2>
          <p className="text-[13.5px] sm:text-[15px] text-ink-secondary">Built like a desktop NLE, delivered as a web page.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {FEATURES.map(f => (
            <div key={f.title} className="rounded-2xl border border-studio-border bg-studio-surface p-5 sm:p-6 hover:border-studio-borderLight transition-colors">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${f.accent}1A`, color: f.accent }}>
                <f.icon size={18} />
              </div>
              <h3 className="text-[14.5px] font-bold text-ink-primary mb-1.5">{f.title}</h3>
              <p className="text-[12.5px] leading-relaxed text-ink-secondary">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Templates showcase ──────────────────────────────────────────── */}
      <section id="templates" className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="order-2 lg:order-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-signal-hover mb-3">
              <LayoutTemplate size={12} /> Templates
            </div>
            <h2 className="font-display font-bold text-[24px] sm:text-[30px] tracking-tight mb-4 leading-tight">
              Start from a template, not a blank canvas
            </h2>
            <p className="text-[13.5px] sm:text-[14.5px] text-ink-secondary leading-relaxed mb-5">
              Cinematic titles, lower-thirds, beat-synced montages, speed ramps, vertical story captions —
              pick one and every clip slot, caption, and animation is already in place. Swap in your own
              footage and it adapts to fit.
            </p>
            <ul className="space-y-2.5 mb-7">
              {["Every layout works across 16:9, 9:16, 1:1 and more", "Speed ramps and beat-sync baked in, not bolted on", "Text-only templates that need no video at all"].map(t => (
                <li key={t} className="flex items-start gap-2 text-[13px] text-ink-secondary">
                  <Check size={14} className="text-success flex-shrink-0 mt-0.5" /> {t}
                </li>
              ))}
            </ul>
            <Link href="/editor" className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-signal-hover hover:text-signal transition-colors">
              Browse all templates <ArrowRight size={14} />
            </Link>
          </div>
          <div className="order-1 lg:order-2 rounded-2xl overflow-hidden border border-studio-border shadow-pop">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/templates-preview.jpg" alt="ClipFlow template picker showing cinematic, social, and beat-sync templates" className="w-full h-auto block" />
          </div>
        </div>
      </section>

      {/* ── Motion / keyframes ──────────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="rounded-2xl border border-studio-border bg-studio-surface p-8 sm:p-10 flex flex-col items-center justify-center gap-6 min-h-[220px] overflow-hidden">
            <div className="motion-demo-track relative w-full h-16">
              <div className="motion-demo-box absolute top-1/2 -translate-y-1/2 w-12 h-12 rounded-xl bg-gradient-to-br from-signal to-signal-hover shadow-glow" />
            </div>
            <div className="flex items-center gap-2">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-signal/50" />
              ))}
            </div>
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-signal-hover mb-3">
              <Zap size={12} /> Animation
            </div>
            <h2 className="font-display font-bold text-[24px] sm:text-[30px] tracking-tight mb-4 leading-tight">
              Every animation is real keyframe data
            </h2>
            <p className="text-[13.5px] sm:text-[14.5px] text-ink-secondary leading-relaxed mb-5">
              Pick a preset and it's instantly editable, not a locked-in effect — every entrance, exit, and
              transition breaks down into position, scale, rotation, opacity, and blur tracks you can
              hand-tune on the timeline, per layer.
            </p>
            <ul className="space-y-2.5">
              {["One-click presets that stay fully editable", "Independent X/Y scale with free-transform resize", "Undo/redo across every edit in the session"].map(t => (
                <li key={t} className="flex items-start gap-2 text-[13px] text-ink-secondary">
                  <Check size={14} className="text-success flex-shrink-0 mt-0.5" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Chroma key ──────────────────────────────────────────────────── */}
      <section id="chroma-key" className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-signal-hover mb-3">
              <Pipette size={12} /> Chroma Key
            </div>
            <h2 className="font-display font-bold text-[24px] sm:text-[30px] tracking-tight mb-4 leading-tight">
              Pull any background in seconds
            </h2>
            <p className="text-[13.5px] sm:text-[14.5px] text-ink-secondary leading-relaxed mb-5">
              Grab the exact backdrop color with an eyedropper, then dial in tolerance and edge softness —
              live, on video or images, with no re-encoding pass to wait on.
            </p>
            <ul className="space-y-2.5">
              {["Tolerance, edge feather, and edge thin controls", "Works on both video clips and still images", "Instant preview — no processing queue"].map(t => (
                <li key={t} className="flex items-start gap-2 text-[13px] text-ink-secondary">
                  <Check size={14} className="text-success flex-shrink-0 mt-0.5" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-studio-border shadow-pop aspect-video">
            <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" src="/landing/showreel-park.mp4" />
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-studio-void/70 backdrop-blur-sm border border-white/10 text-[10.5px] font-semibold text-white">
              <Pipette size={11} className="text-success" /> Key color picked
            </div>
            <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-studio-void/70 backdrop-blur-sm border border-white/10">
              <span className="text-[10px] font-semibold text-white/70">Tolerance</span>
              <div className="flex-1 h-1 rounded-full bg-white/15 overflow-hidden">
                <div className="h-full w-2/3 bg-success" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stylized text ───────────────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center max-w-xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-signal-hover mb-3">
            <Type size={12} /> New — Stylized Text
          </div>
          <h2 className="font-display font-bold text-[24px] sm:text-[32px] tracking-tight mb-3">Text that isn't just text</h2>
          <p className="text-[13.5px] sm:text-[15px] text-ink-secondary">Gradient fills, outlines, and curved lines — built into the canvas, not a filter on top.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          <div className="rounded-2xl border border-studio-border bg-studio-surface p-8 flex items-center justify-center min-h-[140px]">
            <span
              className="font-display font-extrabold text-[32px] sm:text-[38px] tracking-tight"
              style={{ background: "linear-gradient(135deg,#8B5CFF,#FF4F70)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
            >
              Gradient
            </span>
          </div>
          <div className="rounded-2xl border border-studio-border bg-studio-surface p-8 flex items-center justify-center min-h-[140px]">
            <span
              className="font-display font-extrabold text-[32px] sm:text-[38px] tracking-tight"
              style={{ WebkitTextStroke: "1.5px #8B5CFF", color: "transparent" } as React.CSSProperties}
            >
              Outline
            </span>
          </div>
          <div className="rounded-2xl border border-studio-border bg-studio-surface p-8 flex items-center justify-center min-h-[140px]">
            <svg viewBox="0 0 200 100" className="w-full h-[90px]">
              <path id="curve-path" d="M 15 75 Q 100 5 185 75" fill="none" />
              <text className="font-display" fontSize="22" fontWeight="800" fill="#4C8CFF" letterSpacing="1">
                <textPath href="#curve-path" startOffset="50%" textAnchor="middle">Curved</textPath>
              </text>
            </svg>
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <div className="aurora-field opacity-50" aria-hidden="true">
          <div className="aurora-blob b3" />
          <div className="aurora-blob b4" />
        </div>
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-display font-extrabold text-[26px] sm:text-[36px] tracking-tight mb-4">
            Your next edit starts here
          </h2>
          <p className="text-[13.5px] sm:text-[15px] text-ink-secondary mb-8">
            Free to use, no install, autosaves once you sign in.
          </p>
          <Link
            href="/editor"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-[15px] font-bold text-white bg-gradient-to-br from-signal to-signal-hover shadow-glow hover:scale-[1.02] active:scale-95 transition-transform"
          >
            Start Editing Free <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-studio-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[12.5px] font-bold text-ink-secondary">
            <div className="w-5 h-5 rounded-md flex items-center justify-center bg-gradient-to-br from-signal to-signal-hover flex-shrink-0">
              <svg viewBox="0 0 22 22" fill="none" className="w-3 h-3">
                <rect x="2" y="5" width="18" height="12" rx="2.5" stroke="white" strokeWidth="1.6" />
                <path d="M9 8.5l5 2.5-5 2.5V8.5z" fill="white" />
              </svg>
            </div>
            ClipFlow
          </div>
          <p className="text-[11.5px] text-ink-faint">© {new Date().getFullYear()} ClipFlow. Built for creators.</p>
          <Link href="/editor" className="text-[12.5px] font-semibold text-signal-hover hover:text-signal transition-colors">
            Open the editor →
          </Link>
        </div>
      </footer>

      <style jsx>{`
        .motion-demo-track { }
        .motion-demo-box {
          animation: motion-demo 3.2s cubic-bezier(0.65,0,0.35,1) infinite;
        }
        @keyframes motion-demo {
          0%   { left: 0%;   transform: translateY(-50%) scale(0.85) rotate(0deg);   opacity: 0.6; }
          35%  { left: 42%;  transform: translateY(-50%) scale(1.1)  rotate(8deg);   opacity: 1; }
          65%  { left: 58%;  transform: translateY(-50%) scale(1.1)  rotate(-6deg);  opacity: 1; }
          100% { left: 100%; transform: translateY(-50%) scale(0.85) rotate(0deg);   opacity: 0.6; }
        }
        @media (prefers-reduced-motion: reduce) {
          .motion-demo-box { animation: none; left: 44%; }
        }
      `}</style>
    </div>
  );
}
