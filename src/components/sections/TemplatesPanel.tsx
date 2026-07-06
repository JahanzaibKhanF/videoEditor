"use client";

/**
 * TemplatesPanel — CapCut-style template browser.
 *
 * Flow:
 *  1. Browse templates
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
 */
import { useState, useRef } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { TEMPLATES, Template, templateDuration } from "../../utils/templates";
import { v4 as uuidv4 } from "uuid";

const CATEGORIES = ["all", "title", "lower-third", "social", "minimal"] as const;
const catColors: Record<string, string> = {
  title: "#6366F1", "lower-third": "#3B82F6", social: "#FF6A3D", minimal: "#8B5CF6",
};

export default function TemplatesPanel() {
  const {
    setTextsDetails, setBlursDetails, setSelectedAspectRatio,
    setVideos,
    setClipsDetails, setAudioDetails, setPrimaryVideoDimensions, setTotalTime,
    setActiveTemplate, setLayerOrder,
  } = useAppDetailsContext();

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [pendingTpl, setPendingTpl] = useState<Template | null>(null); // slot picker open for this
  const [slotFiles, setSlotFiles] = useState<(File | null)[]>([]);
  const [applying, setApplying] = useState(false);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const filtered = TEMPLATES.filter(t => activeCategory === "all" || t.category === activeCategory);

  // ── Open slot picker for a template ──────────────────────────────────────
  const openTemplate = (tpl: Template) => {
    setPendingTpl(tpl);
    setSlotFiles(tpl.videoSlots.map(() => null));
  };

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
      let position = 0;

      for (let i = 0; i < slotFiles.length; i++) {
        const file = slotFiles[i]!;
        const name = `slot${i}`;
        videoEntries.push({ video: file, name });

        // Get duration from metadata
        const dur = await getVideoDuration(file);
        const clipId = uuidv4();
        const src = URL.createObjectURL(file);

        const clip = {
          id: clipId, name,
          duration: dur,
          startPosition: position,
          endPosition: position + dur,
          startTime: 0, endTime: dur,
          transition: "none",
          src, video: name,
          x: 0, y: 0, scale: 1,
          width: w, height: h,
          zIndex: i,
        };
        clips.push(clip);
        audios.push({
          id: uuidv4(), clipId, name,
          startTime: position, endTime: position + dur,
          volume: 1, muted: false,
        });
        position += dur;

        if (i === 0) setPrimaryVideoDimensions({ width: w, height: h });
      }

      if (videoEntries.length > 0) {
        setVideos(videoEntries);
        setClipsDetails(clips);
        setAudioDetails(audios);
        setTotalTime(position);
      }

      // 6. Activate template mode
      setActiveTemplate({
        templateId: tpl.id,
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
      <div className="px-3 py-3 border-b border-studio-border flex-shrink-0">
        <div className="text-[13px] font-bold text-ink-primary">Templates</div>
        <div className="text-[11px] text-ink-secondary mt-0.5">
          {TEMPLATES.length} templates · select to apply
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 px-2.5 py-2 border-b border-studio-border flex-shrink-0 overflow-x-auto scrollbar-thin">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-bold cursor-pointer border transition-all font-[inherit]
              ${activeCategory === cat
                ? "text-white border-transparent"
                : "bg-transparent text-ink-secondary border-studio-border hover:border-[rgba(91,79,232,.4)] hover:text-signal"}`}
            style={activeCategory === cat
              ? { background: cat === "all" ? "linear-gradient(135deg,#FF6A3D,#FF8259)" : catColors[cat] ?? "#FF6A3D" }
              : {}}>
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2.5 flex flex-col gap-2">
        {filtered.map(tpl => {
          const color = catColors[tpl.category] ?? "#FF6A3D";
          const isVertical = ["9:16","ytshorts","instareels","tiktok"].includes(tpl.aspectRatio);
          const isSquare = tpl.aspectRatio === "1:1";
          const textCount = tpl.buildTexts(100, 100, 10).length;
          const hasAnim = tpl.buildTexts(100, 100, 10).some(t => t.animation !== "none");

          return (
            <button key={tpl.id}
              onClick={() => openTemplate(tpl)}
              className="w-full text-left border border-studio-border rounded-xl p-3 cursor-pointer transition-all flex gap-3 items-start font-[inherit] bg-studio-raised hover:border-signal/40 hover:bg-signal/5 active:scale-[.98]">

              {/* Aspect ratio preview */}
              <div className="flex-shrink-0 flex items-center justify-center rounded-lg border border-studio-border bg-gradient-to-br from-[#1a1a2e] to-[#16213e]"
                style={{ width: isVertical ? 28 : isSquare ? 38 : 52, height: isVertical ? 50 : isSquare ? 38 : 30 }}>
                <span style={{ fontSize: 14 }}>{tpl.emoji}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="text-[12px] font-bold text-ink-primary">{tpl.name}</span>
                  <span className="text-[9px] font-bold px-1.5 py-px rounded-full"
                    style={{ background: `${color}18`, color, border: `1px solid ${color}35` }}>
                    {tpl.aspectRatio}
                  </span>
                  {tpl.videoSlots.length === 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-[rgba(16,185,129,.1)] text-[#10B981] border border-[rgba(16,185,129,.25)]">
                      No video
                    </span>
                  )}
                  {tpl.videoSlots.length > 1 && (
                    <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-[rgba(245,158,11,.1)] text-[#F59E0B] border border-[rgba(245,158,11,.25)]">
                      {tpl.videoSlots.length} clips
                    </span>
                  )}
                </div>
                <p className="text-[10.5px] text-ink-secondary leading-snug mb-1.5">{tpl.description}</p>
                <div className="flex flex-wrap gap-1">
                  {textCount > 0 && <span className="text-[9px] px-1.5 py-px rounded bg-studio-base text-[#555B6E] dark:text-[#6B7280]">T ×{textCount}</span>}
                  {hasAnim && <span className="text-[9px] px-1.5 py-px rounded bg-studio-base text-[#555B6E] dark:text-[#6B7280]">✦ animated</span>}
                  {tpl.buildBlurs(100,100,10).length > 0 && <span className="text-[9px] px-1.5 py-px rounded bg-studio-base text-[#555B6E] dark:text-[#6B7280]">◎ blur</span>}
                </div>
              </div>

              <div className="flex-shrink-0 self-center w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: `${color}18`, border: `1.5px solid ${color}40` }}>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M2 4.5l2 2 3-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Slot Picker Modal ────────────────────────────────────────── */}
      {pendingTpl && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,.6)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onClick={e => { if (e.target === e.currentTarget) setPendingTpl(null); }}
        >
          <div style={{
            width: 460, borderRadius: 20, overflow: "hidden",
            background: "#fff", boxShadow: "0 32px 80px rgba(0,0,0,.4)",
          }} className="dark:bg-[#1a1d27]">

            {/* Modal header */}
            <div style={{
              padding: "18px 22px 14px",
              background: `linear-gradient(135deg, ${catColors[pendingTpl.category] ?? "#FF6A3D"}, #FF8259)`,
            }}>
              <div style={{ fontSize: 22, marginBottom: 2 }}>{pendingTpl.emoji}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "white" }}>{pendingTpl.name}</div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.75)", marginTop: 2 }}>{pendingTpl.description}</div>
            </div>

            <div style={{ padding: "20px 22px 22px" }}>

              {/* Video slots */}
              {pendingTpl.videoSlots.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 10, letterSpacing: ".5px", textTransform: "uppercase" }}>
                    Add Videos ({pendingTpl.videoSlots.length} clip{pendingTpl.videoSlots.length !== 1 ? "s" : ""} needed)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {pendingTpl.videoSlots.map((slot, i) => (
                      <div key={i}
                        onClick={() => pickSlot(i)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "11px 14px", borderRadius: 12, cursor: "pointer",
                          border: `2px solid ${slotFiles[i] ? "#10B981" : "#262B33"}`,
                          background: slotFiles[i] ? "rgba(16,185,129,.05)" : "#FAFAFA",
                          transition: "all .15s",
                        }}
                        className="dark:bg-[rgba(255,255,255,.04)] hover:border-signal"
                      >
                        <div style={{
                          width: 36, height: 28, borderRadius: 7, flexShrink: 0,
                          background: slotFiles[i] ? "#10B981" : "#262B33",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {slotFiles[i]
                            ? <span style={{ fontSize: 14 }}>✓</span>
                            : <span style={{ fontSize: 16 }}>＋</span>
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#0F1117" }}
                            className="dark:text-white">{slot.label}</div>
                          <div style={{ fontSize: 10, color: "#9DA3B4" }}>
                            {slotFiles[i] ? slotFiles[i]!.name.slice(0,28) : `~${slot.durationSecs}s · tap to pick`}
                          </div>
                        </div>
                        <input
                          ref={el => { fileInputRefs.current[i] = el; }}
                          type="file" accept="video/*" style={{ display: "none" }}
                          onChange={e => onSlotFile(i, e.target.files?.[0] ?? null)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pendingTpl.videoSlots.length === 0 && (
                <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 12, background: "rgba(16,185,129,.08)", border: "1.5px solid rgba(16,185,129,.25)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#10B981" }}>✦ Text-only template</div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>No video required — text layers will be added instantly.</div>
                </div>
              )}

              {/* Template info chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
                <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: "#F2F4F7", color: "#555B6E" }}
                  className="dark:bg-[rgba(255,255,255,.08)] dark:text-[rgba(255,255,255,.5)]">
                  {pendingTpl.aspectRatio}
                </span>
                <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: "#F2F4F7", color: "#555B6E" }}
                  className="dark:bg-[rgba(255,255,255,.08)] dark:text-[rgba(255,255,255,.5)]">
                  T ×{pendingTpl.buildTexts(100,100,10).length} text layers
                </span>
                {pendingTpl.buildTexts(100,100,10).some(t => t.animation !== "none") && (
                  <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: "rgba(91,79,232,.1)", color: "#FF6A3D" }}>✦ animated</span>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setPendingTpl(null)}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 11, border: "1.5px solid #262B33",
                    background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#6B7280" }}
                  className="dark:border-[rgba(255,255,255,.12)] dark:text-[rgba(255,255,255,.5)]">
                  Cancel
                </button>
                <button
                  onClick={applyTemplate}
                  disabled={applying || (pendingTpl.videoSlots.length > 0 && slotFiles.some(f => !f))}
                  style={{
                    flex: 2, padding: "11px 0", borderRadius: 11, border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 800, color: "white",
                    background: (applying || (pendingTpl.videoSlots.length > 0 && slotFiles.some(f => !f)))
                      ? "#C5CAD4"
                      : `linear-gradient(135deg, ${catColors[pendingTpl.category] ?? "#FF6A3D"}, #FF8259)`,
                    transition: "all .15s",
                  }}>
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
