"use client";

/**
 * TemplatesPanel — CapCut-style template browser.
 *
 * Flow:
 *  1. Browse templates (built-in defaults + anything published from /settings)
 *  2. Click template → opens slot picker modal (one file input per video slot)
 *  3. User assigns videos → "Apply Template" applies it
 *  4. Template mode activates: timeline locked, only text editable on canvas,
 *     layers panel hidden, duration fixed by template
 *
 * Template mode rules (like CapCut):
 *  - Only text content can be edited (click text on canvas)
 *  - Video slots shown above timeline — click to re-pick
 *  - No manual layer reordering / adding
 *  - Duration fixed = sum of slot durations
 *  - Aspect ratio locked to template's ratio
 *  - "Exit template" button clears everything
 *
 * Template source: TEMPLATES (built-in, always available, works offline) is
 * merged with whatever /api/templates returns (admin-authored, from Neon).
 * Both flow through the exact same `Template` shape via templateInterpreter,
 * so there's no special-casing between "built-in" and "admin-created" here.
 */
import { useState, useRef, useEffect } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { TEMPLATES, Template, templateDuration } from "../../utils/templates";
import { buildTemplatesFromRecords, TemplateRecord } from "../../utils/templateInterpreter";
import { v4 as uuidv4 } from "uuid";
import { LayoutTemplate, Check, Plus, Sparkles, Film, ImageIcon, X, Maximize2 } from "@/utils/icons";
import { hasSpeedRamp, totalSourceConsumed } from "../../utils/speedRamp";

const CATEGORIES = ["all", "title", "lower-third", "social", "minimal"] as const;
const catColors: Record<string, string> = {
  title: "#8B5CFF", "lower-third": "#4C8CFF", social: "#FFB648", minimal: "#33D8A0", text: "#8B5CFF",
};

export default function TemplatesPanel({ initialTemplate }: { initialTemplate?: Template } = {}) {
  const {
    setTextsDetails, setBlursDetails, setSelectedAspectRatio,
    setVideos,
    setClipsDetails, setAudioDetails, setPrimaryVideoDimensions, setTotalTime,
    setActiveTemplate, setLayerOrder, setClipEffects,
    activeTemplate, clipsDetails, textsDetails, imagesDetails,
  } = useAppDetailsContext();

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [dbTemplates, setDbTemplates] = useState<Template[]>([]);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [pendingTpl, setPendingTpl] = useState<Template | null>(null); // slot picker open for this
  const [confirmReplaceTpl, setConfirmReplaceTpl] = useState<Template | null>(null);
  const [slotFiles, setSlotFiles] = useState<(File | null)[]>([]);
  const [applying, setApplying] = useState(false);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const autoOpenedRef = useRef<string | null>(null);

  // The Templates tab lives inside a resizable side panel (not the full
  // viewport), so Tailwind's viewport-based `sm:`/`lg:` breakpoints can't
  // drive the grid column count — dragging the panel wider needs to add
  // columns immediately, not at some fixed screen width. Track the grid's
  // own rendered width instead.
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridCols, setGridCols] = useState(1);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const compute = (w: number) => setGridCols(w >= 620 ? 3 : w >= 360 ? 2 : 1);
    compute(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) compute(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pull in anything published from the admin panel. Fails silently (falls
  // back to just the built-in templates) if Neon isn't configured yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) return;
        const data = await res.json();
        const records: TemplateRecord[] = Array.isArray(data.templates) ? data.templates : [];
        if (!cancelled) setDbTemplates(buildTemplatesFromRecords(records));
      } catch {
        // offline / no DB configured yet — built-in templates still work
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Merge built-ins with DB templates, DB wins on id collision (lets an
  // admin override a default template's config without changing its id).
  const allTemplates: Template[] = (() => {
    const byId = new Map<string, Template>();
    for (const t of TEMPLATES) byId.set(t.id, t);
    for (const t of dbTemplates) byId.set(t.id, t);
    return Array.from(byId.values());
  })();

  const filtered = allTemplates.filter(t => activeCategory === "all" || t.category === activeCategory);

  // ── Open slot picker for a template ──────────────────────────────────────
  const openTemplate = (tpl: Template) => {
    setPendingTpl(tpl);
    setSlotFiles(tpl.videoSlots.map(() => null));
  };

  const hasExistingWork = clipsDetails.length > 0 || textsDetails.length > 0 || imagesDetails.length > 0;

  // Gate in front of openTemplate — if you're in plain editing mode (no
  // template active) and already have manual work on the canvas, applying
  // a template would silently wipe it (openTemplate → applyTemplate clears
  // clips/texts/blurs before laying down the template's own). Ask first,
  // same as any "this will discard your changes" confirmation. Already
  // being in template mode skips this (switching between templates is
  // expected there), and so does a genuinely empty project.
  const requestOpenTemplate = (tpl: Template) => {
    if (!activeTemplate && hasExistingWork) {
      setConfirmReplaceTpl(tpl);
    } else {
      openTemplate(tpl);
    }
  };

  // A template picked directly from the startup screen's unified grid (one
  // that needs video) arrives here via `initialTemplate` instead of going
  // through a click on a template card — auto-open its slot picker exactly
  // once so the user still gets prompted for video, instead of the video
  // silently never getting wired up (the actual bug this fixes: picking a
  // video-needing template from the startup screen used to just import a
  // single file into the media library without ever placing it on the
  // timeline or opening the proper multi-slot picker).
  useEffect(() => {
    if (!initialTemplate || autoOpenedRef.current === initialTemplate.id) return;
    autoOpenedRef.current = initialTemplate.id;
    if (initialTemplate.needsVideo) openTemplate(initialTemplate);
  }, [initialTemplate]);

  const pickSlot = (idx: number) => {
    fileInputRefs.current[idx]?.click();
  };

  const onSlotFile = (idx: number, file: File | null) => {
    setSlotFiles(prev => { const n = [...prev]; n[idx] = file; return n; });
  };

  // ── Apply the template ────────────────────────────────────────────────────
  const applyTemplate = async () => {
    if (!pendingTpl) return;
    const tpl = pendingTpl;
    const missingVideo = tpl.videoSlots.length > 0 && slotFiles.some(f => !f);
    if (missingVideo) return;

    setApplying(true);

    try {
      // 1. Set aspect ratio
      setSelectedAspectRatio(tpl.aspectRatio);

      // 2. Clear existing state
      setClipsDetails([]);
      setAudioDetails([]);
      setVideos([]);
      setLayerOrder([]);
      setClipEffects([]);

      // 3. Compute canvas dimensions based on aspect ratio
      const AR_MAP: Record<string, [number, number]> = {
        "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [720, 720],
        "4:5": [720, 900], "3:4": [720, 960], "original": [1280, 720],
      };
      const [w, h] = AR_MAP[tpl.aspectRatio] ?? [1280, 720];

      // 4. Build texts/blurs with actual canvas dimensions
      const totalDur = tpl.videoSlots.length > 0
        ? slotFiles.reduce<number>((sum, _f, i) => {
            // Use template slot duration as guide — actual will be loaded from metadata
            return sum + tpl.videoSlots[i].durationSecs;
          }, 0)
        : templateDuration(tpl);

      const texts = tpl.buildTexts(w, h, totalDur);
      const blurs = tpl.buildBlurs(w, h, totalDur);
      setTextsDetails(texts);
      setBlursDetails(blurs);

      // 5. Load video slots as clips
      const videoEntries: { video: File; name: string }[] = [];
      const clips: any[] = [];
      const audios: any[] = [];
      const newClipEffects: import("../../types/types").ClipEffectDetails[] = [];
      let position = 0;

      for (let i = 0; i < slotFiles.length; i++) {
        const file = slotFiles[i]!;
        const name = `slot${i}`;
        videoEntries.push({ video: file, name });

        // Get the full source asset's real duration, then constrain the
        // clip to EXACTLY the slot's required duration (CapCut-style slot
        // constraints) — never the whole asset. If the asset is longer than
        // the slot needs, only the first `durationSecs` seconds are used
        // (the user can pick a different in-point via the dedicated
        // template clip range selector after applying). If the asset is
        // shorter, fall back to whatever's actually available.
        const assetDuration = await getVideoDuration(file);
        const slotDuration = tpl.videoSlots[i]?.durationSecs ?? assetDuration;
        const trimStart = 0;
        const speed = tpl.videoSlots[i]?.speed;
        // Output (on-timeline) duration is always exactly the slot's fixed
        // duration — a speed ramp never changes how long a slot occupies
        // on the timeline, only how much source material it plays through.
        const outputDuration = Math.min(slotDuration, hasSpeedRamp({ speed }) ? slotDuration : assetDuration);

        const clipId = uuidv4();
        const src = URL.createObjectURL(file);

        const clip: any = {
          id: clipId, name,
          duration: outputDuration,
          startPosition: position,
          endPosition: position + outputDuration,
          startTime: trimStart, endTime: trimStart + outputDuration, // placeholder, corrected below for ramped clips
          sourceDuration: assetDuration, // full asset length, needed by the range picker to know how far it can scrub
          transition: "none",
          src, video: name,
          x: 0, y: 0, scale: 1,
          width: w, height: h,
          zIndex: i,
          ...(speed !== undefined ? { speed } : {}),
        };

        if (hasSpeedRamp(clip)) {
          // Now that startPosition/endPosition are set, compute exactly how
          // much source material the ramp consumes across the fixed output
          // window, and clamp it to what the asset actually has.
          const needed = totalSourceConsumed(clip);
          const available = Math.max(0.04, assetDuration - trimStart);
          clip.endTime = trimStart + Math.min(needed, available);
        }

        const usedDuration = outputDuration;
        clips.push(clip);
        audios.push({
          id: uuidv4(), clipId, name,
          startTime: position, endTime: position + usedDuration,
          volume: 1, muted: false,
        });

        const slotEffects = tpl.videoSlots[i]?.effects ?? [];
        for (const eff of slotEffects) {
          newClipEffects.push({
            id: uuidv4(), clipId, type: eff.type,
            startTime: eff.startFraction * usedDuration,
            endTime: eff.endFraction * usedDuration,
            intensity: eff.intensity, color: eff.color, secondaryColor: eff.secondaryColor,
          });
        }

        position += usedDuration;

        if (i === 0) setPrimaryVideoDimensions({ width: w, height: h });
      }

      if (videoEntries.length > 0) {
        setVideos(videoEntries);
        setClipsDetails(clips);
        setAudioDetails(audios);
        setTotalTime(position);
        setClipEffects(newClipEffects);
      }

      // 6. Activate template mode
      setActiveTemplate({
        templateId: tpl.id,
        templateName: tpl.name,
        accentColor: tpl.accentColor,
        coverImage: tpl.coverImage,
        aspectRatio: tpl.aspectRatio,
        slots: tpl.videoSlots.map((sl, i) => ({
          slotIndex: i,
          label: sl.label,
          durationSecs: sl.durationSecs,
          file: slotFiles[i] ?? undefined,
          objectUrl: slotFiles[i] ? URL.createObjectURL(slotFiles[i]!) : undefined,
        })),
      });

      setPendingTpl(null);
      setSlotFiles([]);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-studio-surface">
      {/* Header */}
      <div className="px-3.5 py-3.5 border-b border-studio-border flex-shrink-0 flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <LayoutTemplate size={14} className="text-signal" />
            <span className="text-[13px] font-bold text-ink-primary font-display">Templates</span>
          </div>
          <div className="text-[11px] text-ink-muted mt-0.5">
            {allTemplates.length} template{allTemplates.length !== 1 ? "s" : ""} · select to apply
          </div>
        </div>
        <button
          onClick={() => setBrowseOpen(true)}
          title="Browse full-size grid"
          className="flex-shrink-0 w-7 h-7 rounded-lg border border-studio-border bg-studio-raised hover:border-signal/40 hover:text-signal text-ink-secondary flex items-center justify-center transition-colors"
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 px-3 py-2.5 border-b border-studio-border flex-shrink-0 overflow-x-auto scrollbar-thin">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-bold cursor-pointer border transition-all font-[inherit]
              ${activeCategory === cat
                ? "text-white border-transparent shadow-glow"
                : "bg-transparent text-ink-secondary border-studio-border hover:border-signal/40 hover:text-signal"}`}
            style={activeCategory === cat
              ? { background: cat === "all" ? "linear-gradient(135deg,#8B5CFF,#A47CFF)" : catColors[cat] ?? "#8B5CFF" }
              : {}}>
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Template grid — real cover-image cards, not emoji tiles */}
      <div ref={gridRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2.5 grid gap-2.5 auto-rows-max"
        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
        {filtered.map(tpl => {
          const color = catColors[tpl.category] ?? "#8B5CFF";
          const textCount = tpl.buildTexts(100, 100, 10).length;
          const hasAnim = tpl.buildTexts(100, 100, 10).some(t => t.animation !== "none");

          return (
            <button key={tpl.id}
              onClick={() => requestOpenTemplate(tpl)}
              className="group w-full text-left rounded-xl overflow-hidden border border-studio-border bg-studio-raised hover:border-signal/40 transition-all active:scale-[.98] font-[inherit]">

              {/* Cover image */}
              <div className="relative aspect-video bg-studio-base overflow-hidden">
                {tpl.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tpl.coverImage}
                    alt={tpl.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-studio-raised to-studio-base">
                    <ImageIcon size={22} className="text-ink-faint" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <span className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm"
                  style={{ background: `${color}30`, color: "#fff", border: `1px solid ${color}55` }}>
                  {tpl.aspectRatio}
                </span>
                {tpl.videoSlots.length === 0 && (
                  <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-success/25 text-white border border-success/50 backdrop-blur-sm">
                    No video
                  </span>
                )}
                <div className="absolute bottom-2 left-2.5 right-2.5">
                  <div className="text-[13px] font-bold text-white leading-tight drop-shadow">{tpl.name}</div>
                </div>
              </div>

              {/* Meta row */}
              <div className="px-3 py-2.5">
                <p className="text-[10.5px] text-ink-secondary leading-snug mb-1.5 line-clamp-2">{tpl.description}</p>
                <div className="flex flex-wrap gap-1">
                  {textCount > 0 && (
                    <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-studio-base text-ink-muted">
                      <span className="font-mono">T×{textCount}</span>
                    </span>
                  )}
                  {hasAnim && (
                    <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-signal/10 text-signal">
                      <Sparkles size={9} /> animated
                    </span>
                  )}
                  {tpl.videoSlots.length > 1 && (
                    <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-warning/10 text-warning">
                      <Film size={9} /> {tpl.videoSlots.length} clips
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Full-screen browse overlay — large cover-image grid, CapCut/Adobe-Express style ── */}
      {browseOpen && (
        <div className="fixed inset-0 z-[999] bg-studio-void/97 backdrop-blur-md flex flex-col animate-fade-in">
          <div className="flex items-center justify-between px-6 py-4 border-b border-studio-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <LayoutTemplate size={16} className="text-signal" />
              <span className="text-[15px] font-bold text-ink-primary font-display">Browse templates</span>
              <span className="text-[12px] text-ink-muted">· {allTemplates.length} available</span>
            </div>
            <button
              onClick={() => setBrowseOpen(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-ink-muted hover:bg-studio-hover transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex gap-1.5 px-6 py-3 border-b border-studio-border flex-shrink-0 overflow-x-auto scrollbar-thin">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[11.5px] font-bold cursor-pointer border transition-all font-[inherit]
                  ${activeCategory === cat
                    ? "text-white border-transparent shadow-glow"
                    : "bg-transparent text-ink-secondary border-studio-border hover:border-signal/40 hover:text-signal"}`}
                style={activeCategory === cat
                  ? { background: cat === "all" ? "linear-gradient(135deg,#8B5CFF,#A47CFF)" : catColors[cat] ?? "#8B5CFF" }
                  : {}}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-[1200px] mx-auto">
              {filtered.map(tpl => {
                const color = catColors[tpl.category] ?? "#8B5CFF";
                return (
                  <button key={tpl.id}
                    onClick={() => { setBrowseOpen(false); requestOpenTemplate(tpl); }}
                    className="group relative rounded-2xl overflow-hidden text-left transition-all aspect-video border border-studio-border hover:border-signal/50 hover:-translate-y-0.5"
                  >
                    {tpl.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tpl.coverImage} alt={tpl.name}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-studio-raised to-studio-base flex items-center justify-center">
                        <ImageIcon size={22} className="text-ink-faint" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                    <span className="absolute top-2.5 left-2.5 text-[9.5px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm"
                      style={{ background: `${color}35`, color: "white", border: `1px solid ${color}60` }}>
                      {tpl.aspectRatio}
                    </span>
                    {!tpl.needsVideo && (
                      <span className="absolute top-2.5 right-2.5 flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm bg-success/30 text-white border border-success/50">
                        <Sparkles size={9} /> No video
                      </span>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-3.5">
                      <div className="text-[14px] font-bold text-white leading-tight drop-shadow mb-1">{tpl.name}</div>
                      <div className="text-[11px] leading-snug text-white/70 line-clamp-2">{tpl.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm replacing existing work ─────────────────────────── */}
      {confirmReplaceTpl && (
        <div
          className="fixed inset-0 z-[1001] bg-black/70 backdrop-blur-md flex items-center justify-center px-4 animate-fade-in"
          onClick={e => { if (e.target === e.currentTarget) setConfirmReplaceTpl(null); }}
        >
          <div className="w-full max-w-[400px] rounded-2xl overflow-hidden bg-studio-surface border border-studio-border shadow-pop animate-rise-in p-5">
            <div className="w-10 h-10 rounded-xl bg-warning/15 border border-warning/30 flex items-center justify-center mb-3.5">
              <Sparkles size={18} className="text-warning" />
            </div>
            <div className="text-[15px] font-bold text-ink-primary font-display mb-1.5">Replace your current work?</div>
            <p className="text-[12.5px] text-ink-secondary leading-relaxed mb-5">
              You have clips, text, or images already on the canvas. Applying <strong className="text-ink-primary">{confirmReplaceTpl.name}</strong> will
              clear all of it and start fresh from the template.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { const tpl = confirmReplaceTpl; setConfirmReplaceTpl(null); if (tpl) openTemplate(tpl); }}
                className="w-full py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
                style={{ background: "linear-gradient(135deg, #FF4F70, #FF7A93)" }}>
                Replace with template
              </button>
              <button
                onClick={() => setConfirmReplaceTpl(null)}
                className="w-full py-2.5 rounded-xl border border-studio-border text-ink-secondary text-[13px] font-bold hover:bg-studio-hover transition-colors">
                Keep my work
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Slot Picker Modal ────────────────────────────────────────── */}
      {pendingTpl && (
        <div
          className="fixed inset-0 z-[1000] bg-black/65 backdrop-blur-md flex items-center justify-center px-4 animate-fade-in"
          onClick={e => { if (e.target === e.currentTarget) setPendingTpl(null); }}
        >
          <div className="w-full max-w-[460px] rounded-2xl overflow-hidden bg-studio-surface border border-studio-border shadow-pop animate-rise-in">

            {/* Modal header — cover image backdrop */}
            <div className="relative px-5 pt-5 pb-4 overflow-hidden">
              {pendingTpl.coverImage && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pendingTpl.coverImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-studio-surface" />
                </>
              )}
              {!pendingTpl.coverImage && (
                <div
                  className="absolute inset-0"
                  style={{ background: `linear-gradient(135deg, ${catColors[pendingTpl.category] ?? "#8B5CFF"}, #A47CFF)` }}
                />
              )}
              <button
                onClick={() => setPendingTpl(null)}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-colors"
              >
                <X size={14} />
              </button>
              <div className="relative">
                <div className="text-[16px] font-bold text-white font-display">{pendingTpl.name}</div>
                <div className="text-[11.5px] text-white/80 mt-0.5">{pendingTpl.description}</div>
              </div>
            </div>

            <div className="px-5 pb-5 pt-1">
              {/* Video slots */}
              {pendingTpl.videoSlots.length > 0 && (
                <div className="mb-4">
                  <div className="text-[11px] font-bold text-ink-muted mb-2.5 tracking-wide uppercase">
                    Add videos ({pendingTpl.videoSlots.length} clip{pendingTpl.videoSlots.length !== 1 ? "s" : ""} needed)
                  </div>
                  <div className="flex flex-col gap-2">
                    {pendingTpl.videoSlots.map((slot, i) => (
                      <div key={i}
                        onClick={() => pickSlot(i)}
                        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer border-2 transition-all
                          ${slotFiles[i] ? "border-success/50 bg-success/5" : "border-studio-border bg-studio-base hover:border-signal/50"}`}
                      >
                        <div className={`w-9 h-7 rounded-md flex-shrink-0 flex items-center justify-center
                          ${slotFiles[i] ? "bg-success text-studio-void" : "bg-studio-hover text-ink-muted"}`}>
                          {slotFiles[i] ? <Check size={14} /> : <Plus size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11.5px] font-bold text-ink-primary">{slot.label}</div>
                          <div className="text-[10px] text-ink-faint truncate">
                            {slotFiles[i] ? slotFiles[i]!.name.slice(0, 28) : `~${slot.durationSecs}s · tap to pick`}
                          </div>
                        </div>
                        <input
                          ref={el => { fileInputRefs.current[i] = el; }}
                          type="file" accept="video/*" className="hidden"
                          onChange={e => onSlotFile(i, e.target.files?.[0] ?? null)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pendingTpl.videoSlots.length === 0 && (
                <div className="mb-4 px-3.5 py-3 rounded-xl bg-success/10 border border-success/25">
                  <div className="flex items-center gap-1.5 text-[12px] font-bold text-success">
                    <Sparkles size={12} /> Text-only template
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5">No video required — text layers will be added instantly.</div>
                </div>
              )}

              {/* Template info chips */}
              <div className="flex gap-1.5 flex-wrap mb-4">
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-studio-base text-ink-muted">
                  {pendingTpl.aspectRatio}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-studio-base text-ink-muted">
                  T×{pendingTpl.buildTexts(100, 100, 10).length} text layers
                </span>
                {pendingTpl.buildTexts(100, 100, 10).some(t => t.animation !== "none") && (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-signal/10 text-signal">
                    <Sparkles size={9} /> animated
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button onClick={() => setPendingTpl(null)}
                  className="flex-1 py-2.5 rounded-xl border border-studio-border text-ink-secondary text-[13px] font-bold hover:bg-studio-hover transition-colors">
                  Cancel
                </button>
                <button
                  onClick={applyTemplate}
                  disabled={applying || (pendingTpl.videoSlots.length > 0 && slotFiles.some(f => !f))}
                  className="flex-[2] py-2.5 rounded-xl text-[13px] font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #8B5CFF, #A47CFF)" }}>
                  {applying ? "Applying…" : "Apply Template"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Utility ────────────────────────────────────────────────────────────────
function getVideoDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata"; v.src = url;
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration || 5); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(5); };
  });
}
