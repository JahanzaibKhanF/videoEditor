"use client";

/**
 * TemplateBuilderModal — visual, form-driven template authoring for the
 * admin panel. Replaces the old "paste raw JSON into a textarea" editor.
 *
 * Everything edits a single in-memory `TemplateJson` document (the exact
 * shape `buildTemplateFromRecord` consumes), so there's no separate model
 * to keep in sync — the live preview, the forms, and the optional advanced
 * JSON view are all views of the same object.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, Plus, Trash2, Copy, ChevronUp, ChevronDown, Play, Pause, Upload,
  Code2, Type, Film, Sparkles, AlertOctagon,
} from "@/utils/icons";
import { v4 as uuidv4 } from "uuid";
import { TemplateJson, TemplateJsonText, TemplateJsonKeyframeTrack } from "../../utils/templateInterpreter";
import { TemplateVideoSlot } from "../../utils/templates";
import { KeyframeTrack } from "../../types/types";
import KeyframeEditor from "../editors/KeyframeEditor";
import { SPEED_PRESETS } from "../../utils/speedRamp";
import { aspectRatioDimensions, ASPECT_RATIO_OPTIONS } from "../../utils/aspectRatios";
import {
  TEMPLATE_CATEGORIES, TEMPLATE_ANIMATIONS, TEMPLATE_TRANSITIONS, SPEED_PRESET_OPTIONS,
  DEFAULT_TEXT_LAYER, DEFAULT_VIDEO_SLOT, emptyTemplateJson, templateJsonDuration,
  validateTemplateJson, speedPresetKey,
} from "../../utils/templateSchema";
import { adminApi } from "../../utils/adminApi";
import { generateTemplateAnimationKeyframes } from "../../utils/templateAnimationRecipes";
import TemplatePreviewStage from "./TemplatePreviewStage";

export interface AdminTemplate {
  id: string;
  name: string;
  cover_image: string | null;
  template_json: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const FONT_CHOICES = ["Arial", "Georgia", "Garamond", "Times New Roman", "Trebuchet MS", "Verdana", "Courier New", "Impact", "Brush Script MT"];

function arr<T>(v: unknown, fallback: T[] = []): T[] {
  return Array.isArray(v) ? (v as T[]) : fallback;
}

// ── small controlled inputs ───────────────────────────────────────────────
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10.5px] font-semibold text-ink-secondary block mb-1">{label}</span>
      {children}
    </label>
  );
}
const inputCls =
  "w-full bg-studio-void border border-studio-border rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink-primary placeholder:text-ink-faint outline-none focus:border-signal transition-colors";

function NumberField({ value, onChange, step = 0.01, min, max }: {
  value: number | undefined; onChange: (n: number) => void; step?: number; min?: number; max?: number;
}) {
  return (
    <input type="number" className={inputCls} value={value ?? 0} step={step} min={min} max={max}
      onChange={(e) => onChange(Number(e.target.value))} />
  );
}

export function TemplateBuilderModal({
  template, onClose, onSaved,
}: {
  template: AdminTemplate | null;
  onClose: () => void;
  onSaved: (t: AdminTemplate) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [coverImage, setCoverImage] = useState(template?.cover_image ?? "");
  const [sortOrder, setSortOrder] = useState(template?.sort_order ?? 0);
  const [json, setJson] = useState<TemplateJson>(
    template ? (template.template_json as TemplateJson) : emptyTemplateJson(),
  );
  const [selectedText, setSelectedText] = useState<number | null>(0);
  const [expandedText, setExpandedText] = useState<number | null>(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const totalDur = templateJsonDuration(json);
  const texts = arr<TemplateJsonText>(json.texts);
  const slots = arr<TemplateVideoSlot>(json.videoSlots);
  const { errors, warnings } = validateTemplateJson(json, name);

  // ── playhead ────────────────────────────────────────────────────────────
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const next = t + dt;
        return next >= totalDur ? 0 : next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, totalDur]);

  // ── mutators ────────────────────────────────────────────────────────────
  const patch = (p: Partial<TemplateJson>) => setJson((j) => ({ ...j, ...p }));

  const patchText = useCallback((i: number, p: Partial<TemplateJsonText>) =>
    setJson((j) => {
      const next = [...(Array.isArray(j.texts) ? j.texts : [])];
      next[i] = { ...next[i], ...p };
      return { ...j, texts: next };
    }), []);

  // Picking an animation generates real, ready-made keyframes for it right
  // away (see templateAnimationRecipes.ts) instead of leaving it as an
  // opaque label — and picking a DIFFERENT one replaces whatever keyframes
  // are there, generated or hand-tuned, with a fresh set for the new
  // animation. Switching to "None" clears them entirely.
  const applyTextAnimation = (i: number, animation: string) => {
    const t = texts[i];
    if (!t) return;
    const startTime = t.startTime ?? 0;
    const endTime = t.endTime ?? totalDur;
    patchText(i, {
      animation,
      keyframes: generateTemplateAnimationKeyframes(animation, { startTime, endTime, totalDur }),
    });
  };
  const addText = () => {
    setJson((j) => ({ ...j, texts: [...arr<TemplateJsonText>(j.texts), { ...DEFAULT_TEXT_LAYER }] }));
    const n = texts.length;
    setSelectedText(n); setExpandedText(n);
  };
  const removeText = (i: number) =>
    setJson((j) => ({ ...j, texts: arr<TemplateJsonText>(j.texts).filter((_, k) => k !== i) }));
  const dupText = (i: number) =>
    setJson((j) => {
      const list = [...arr<TemplateJsonText>(j.texts)];
      list.splice(i + 1, 0, { ...list[i], yFrac: Math.min(0.9, (list[i].yFrac ?? 0) + 0.06) });
      return { ...j, texts: list };
    });
  const moveText = (i: number, dir: -1 | 1) =>
    setJson((j) => {
      const list = [...arr<TemplateJsonText>(j.texts)];
      const t = i + dir;
      if (t < 0 || t >= list.length) return j;
      [list[i], list[t]] = [list[t], list[i]];
      return { ...j, texts: list };
    });

  const patchSlot = (i: number, p: Partial<TemplateVideoSlot>) =>
    setJson((j) => {
      const next = [...arr<TemplateVideoSlot>(j.videoSlots)];
      next[i] = { ...next[i], ...p };
      return { ...j, videoSlots: next };
    });
  const setSlotSpeed = (i: number, key: string) =>
    setJson((j) => {
      const next = [...arr<TemplateVideoSlot>(j.videoSlots)];
      const { speed, ...rest } = next[i];
      next[i] = key === "normal" ? rest : { ...rest, speed: SPEED_PRESETS[key].speed };
      return { ...j, videoSlots: next };
    });
  const addSlot = () =>
    setJson((j) => ({
      ...j,
      videoSlots: [...arr<TemplateVideoSlot>(j.videoSlots), { ...DEFAULT_VIDEO_SLOT, label: `Clip ${slots.length + 1}` }],
    }));
  const removeSlot = (i: number) =>
    setJson((j) => ({ ...j, videoSlots: arr<TemplateVideoSlot>(j.videoSlots).filter((_, k) => k !== i) }));
  const moveSlot = (i: number, dir: -1 | 1) =>
    setJson((j) => {
      const list = [...arr<TemplateVideoSlot>(j.videoSlots)];
      const t = i + dir;
      if (t < 0 || t >= list.length) return j;
      [list[i], list[t]] = [list[t], list[i]];
      return { ...j, videoSlots: list };
    });

  // ── advanced JSON view (two-way) ────────────────────────────────────────
  const openJson = () => {
    setJsonDraft(JSON.stringify(json, null, 2));
    setJsonError(null);
    setShowJson(true);
  };
  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      setJson(parsed);
      setShowJson(false);
      setJsonError(null);
    } catch {
      setJsonError("Not valid JSON — check for a trailing comma or missing quote.");
    }
  };

  // ── cover upload (same server route as before) ──────────────────────────
  const uploadCover = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setSaveError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload-image", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data?.error ?? "Upload failed.");
      setCoverImage(data.url as string);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaveError(null);
    if (errors.length) { setSaveError("Fix the errors below first."); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        coverImage: coverImage.trim() || null,
        sortOrder,
        templateJson: json,
      };
      const data = template
        ? await adminApi(`/api/admin/templates/${template.id}`, { method: "PUT", body: JSON.stringify(body) })
        : await adminApi("/api/admin/templates", { method: "POST", body: JSON.stringify({ ...body, isActive: true }) });
      onSaved(data.template);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-md flex items-center justify-center px-3 py-6 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[1080px] max-h-[92vh] bg-studio-surface border border-studio-border rounded-2xl shadow-pop flex flex-col overflow-hidden animate-rise-in">

        {/* header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-studio-border flex-shrink-0">
          <h2 className="font-display text-[15px] font-semibold text-ink-primary">
            {template ? "Edit template" : "New template"}
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={showJson ? () => setShowJson(false) : openJson}
              className={`flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                showJson ? "border-signal text-signal" : "border-studio-border text-ink-secondary hover:text-ink-primary"
              }`}>
              <Code2 size={12} /> {showJson ? "Back to builder" : "Advanced JSON"}
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-ink-muted hover:bg-studio-hover transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {showJson ? (
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-5">
            <p className="text-[11.5px] text-ink-muted mb-2">
              Full template document. Edit and click Apply to push changes back into the visual builder.
            </p>
            <textarea value={jsonDraft} onChange={(e) => setJsonDraft(e.target.value)} rows={22} spellCheck={false}
              className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[12px] font-mono text-ink-primary outline-none focus:border-signal resize-y" />
            {jsonError && <div className="text-[12px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2 mt-2">{jsonError}</div>}
            <button onClick={applyJson} className="mt-3 bg-signal hover:bg-signal-hover text-studio-void text-[12.5px] font-semibold px-4 py-2 rounded-lg transition-colors">
              Apply to builder
            </button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">

            {/* ── preview column ── */}
            <div className="lg:w-[440px] flex-shrink-0 border-b lg:border-b-0 lg:border-r border-studio-border p-4 flex flex-col items-center gap-3 overflow-y-auto scrollbar-thin bg-studio-void/40">
              <TemplatePreviewStage
                json={json} time={time}
                selectedIndex={selectedText}
                onSelect={(i) => { setSelectedText(i); if (i !== null) setExpandedText(i); }}
                onChangeText={patchText}
              />
              <div className="w-full flex items-center gap-2">
                <button onClick={() => setPlaying((p) => !p)}
                  className="w-8 h-8 rounded-lg bg-signal text-studio-void flex items-center justify-center flex-shrink-0">
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <input type="range" min={0} max={totalDur} step={0.02} value={time}
                  onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)); }}
                  className="flex-1 accent-signal" />
                <span className="text-[10px] font-mono text-ink-faint w-14 text-right">{time.toFixed(1)}/{totalDur.toFixed(1)}s</span>
              </div>
              <p className="text-[10px] text-ink-faint text-center">
                Drag text on the preview to position it · drag the corner handle to resize.
              </p>
            </div>

            {/* ── form column ── */}
            <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin p-4 flex flex-col gap-5">

              {/* details */}
              <section className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Labeled label="Name">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cinematic Title" className={inputCls} />
                  </Labeled>
                  <Labeled label="Category">
                    <select value={(json.category as string) ?? "title"} onChange={(e) => patch({ category: e.target.value as TemplateJson["category"] })} className={inputCls}>
                      {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Labeled>
                  <Labeled label="Aspect ratio">
                    <select value={(json.aspectRatio as string) ?? "16:9"} onChange={(e) => patch({ aspectRatio: e.target.value as TemplateJson["aspectRatio"] })} className={inputCls}>
                      {ASPECT_RATIO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Labeled>
                  <Labeled label="Accent color">
                    <div className="flex items-center gap-2">
                      <input type="color" value={toHex(json.accentColor)} onChange={(e) => patch({ accentColor: e.target.value })}
                        className="w-9 h-8 rounded-md bg-studio-void border border-studio-border cursor-pointer" />
                      <input value={json.accentColor ?? ""} onChange={(e) => patch({ accentColor: e.target.value })} className={inputCls} />
                    </div>
                  </Labeled>
                </div>
                <Labeled label="Description">
                  <input value={json.description ?? ""} onChange={(e) => patch({ description: e.target.value })}
                    placeholder="One line shown on the template card" className={inputCls} />
                </Labeled>

                <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                  <Labeled label="Cover image URL">
                    <input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://…" className={inputCls} />
                  </Labeled>
                  <label className={`flex items-center gap-1.5 h-[34px] px-3 rounded-lg border border-dashed text-[11.5px] font-semibold cursor-pointer transition-colors ${
                    uploading ? "border-studio-borderLight text-ink-faint" : "border-studio-borderLight text-ink-secondary hover:border-signal hover:text-signal"
                  }`}>
                    <input type="file" accept="image/*" disabled={uploading} className="hidden"
                      onChange={(e) => uploadCover(e.target.files?.[0])} />
                    <Upload size={13} /> {uploading ? "Uploading…" : "Upload"}
                  </label>
                </div>
                {coverImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverImage} alt="" className="w-full aspect-video object-cover rounded-lg border border-studio-border" />
                )}
              </section>

              {/* video slots */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink-primary">
                    <Film size={13} /> Video slots <span className="text-ink-faint font-normal">({slots.length})</span>
                  </div>
                  <button onClick={addSlot} className="flex items-center gap-1 text-[11px] font-semibold text-signal hover:text-signal-hover">
                    <Plus size={12} /> Add slot
                  </button>
                </div>
                {slots.length === 0 && (
                  <p className="text-[11px] text-ink-faint mb-2">No slots — this is a text-only template (no video required to apply it).</p>
                )}
                <div className="flex flex-col gap-2">
                  {slots.map((sl, i) => (
                    <div key={i} className="rounded-lg border border-studio-border bg-studio-void/50 p-2.5 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <input value={sl.label ?? ""} onChange={(e) => patchSlot(i, { label: e.target.value })}
                          placeholder={`Clip ${i + 1}`} className={inputCls + " flex-1"} />
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => moveSlot(i, -1)} disabled={i === 0} className="p-1 text-ink-faint hover:text-ink-primary disabled:opacity-30"><ChevronUp size={13} /></button>
                          <button onClick={() => moveSlot(i, 1)} disabled={i === slots.length - 1} className="p-1 text-ink-faint hover:text-ink-primary disabled:opacity-30"><ChevronDown size={13} /></button>
                          <button onClick={() => removeSlot(i)} className="p-1 text-danger/70 hover:text-danger"><Trash2 size={12} /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Labeled label="Duration (s)">
                          <NumberField value={sl.durationSecs} step={0.1} min={0.1} onChange={(n) => patchSlot(i, { durationSecs: n })} />
                        </Labeled>
                        <Labeled label="Speed">
                          <select value={speedPresetKey(sl.speed)} onChange={(e) => setSlotSpeed(i, e.target.value)} className={inputCls}>
                            {SPEED_PRESET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            {speedPresetKey(sl.speed) === "custom" && <option value="custom">Custom (from JSON)</option>}
                          </select>
                        </Labeled>
                        <Labeled label="Transition out">
                          <select value={sl.transition ?? "none"} onChange={(e) => patchSlot(i, { transition: e.target.value })} className={inputCls}>
                            {TEMPLATE_TRANSITIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </Labeled>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* text layers */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink-primary">
                    <Type size={13} /> Text layers <span className="text-ink-faint font-normal">({texts.length})</span>
                  </div>
                  <button onClick={addText} className="flex items-center gap-1 text-[11px] font-semibold text-signal hover:text-signal-hover">
                    <Plus size={12} /> Add text
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {texts.map((t, i) => {
                    const open = expandedText === i;
                    return (
                      <div key={i} className={`rounded-lg border bg-studio-void/50 ${selectedText === i ? "border-signal/60" : "border-studio-border"}`}>
                        <div className="flex items-center gap-2 p-2">
                          <button onClick={() => { setSelectedText(i); setExpandedText(open ? null : i); }}
                            className="flex-1 flex items-center gap-2 text-left min-w-0">
                            <span className="text-[11px] font-mono text-ink-faint">T{i + 1}</span>
                            <span className="text-[12px] text-ink-primary truncate">{t.text || "(empty)"}</span>
                          </button>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button onClick={() => moveText(i, -1)} disabled={i === 0} className="p-1 text-ink-faint hover:text-ink-primary disabled:opacity-30"><ChevronUp size={13} /></button>
                            <button onClick={() => moveText(i, 1)} disabled={i === texts.length - 1} className="p-1 text-ink-faint hover:text-ink-primary disabled:opacity-30"><ChevronDown size={13} /></button>
                            <button onClick={() => dupText(i)} className="p-1 text-ink-faint hover:text-ink-primary"><Copy size={12} /></button>
                            <button onClick={() => removeText(i)} className="p-1 text-danger/70 hover:text-danger"><Trash2 size={12} /></button>
                          </div>
                        </div>
                        {open && (
                          <div className="border-t border-studio-border p-2.5 flex flex-col gap-2.5">
                            <Labeled label="Text">
                              <textarea value={t.text ?? ""} onChange={(e) => patchText(i, { text: e.target.value })} rows={2}
                                className={inputCls + " resize-y"} />
                            </Labeled>
                            <div className="grid grid-cols-3 gap-2">
                              <Labeled label="Font size (px)">
                                <NumberField value={t.fontSize} step={1} min={1} onChange={(n) => patchText(i, { fontSize: n })} />
                              </Labeled>
                              <Labeled label="Font">
                                <select value={t.fontFamily ?? "Arial"} onChange={(e) => patchText(i, { fontFamily: e.target.value })} className={inputCls}>
                                  {FONT_CHOICES.map((f) => <option key={f} value={f}>{f}</option>)}
                                </select>
                              </Labeled>
                              <Labeled label="Animation">
                                <select value={t.animation ?? "none"} onChange={(e) => applyTextAnimation(i, e.target.value)} className={inputCls}>
                                  {TEMPLATE_ANIMATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              </Labeled>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {(["isBold", "isItalic", "isUnderline"] as const).map((k) => (
                                <button key={k} onClick={() => patchText(i, { [k]: !t[k] })}
                                  className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                                    t[k] ? "border-signal bg-signal/15 text-signal" : "border-studio-border text-ink-secondary"
                                  }`}>
                                  {k === "isBold" ? "B" : k === "isItalic" ? "I" : "U"}
                                </button>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Labeled label="Text color">
                                <div className="flex items-center gap-1.5">
                                  <input type="color" value={toHex(t.textColor)} onChange={(e) => patchText(i, { textColor: e.target.value })}
                                    className="w-8 h-8 rounded-md bg-studio-void border border-studio-border cursor-pointer flex-shrink-0" />
                                  <input value={t.textColor ?? ""} onChange={(e) => patchText(i, { textColor: e.target.value })} className={inputCls} />
                                </div>
                              </Labeled>
                              <Labeled label="Background">
                                <div className="flex items-center gap-1.5">
                                  <input type="color" value={toHex(t.backgroundColor)} onChange={(e) => patchText(i, { backgroundColor: e.target.value })}
                                    className="w-8 h-8 rounded-md bg-studio-void border border-studio-border cursor-pointer flex-shrink-0" />
                                  <input value={t.backgroundColor ?? "transparent"} onChange={(e) => patchText(i, { backgroundColor: e.target.value })} className={inputCls} />
                                </div>
                              </Labeled>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Labeled label={`Shadow blur (${t.shadowBlur ?? 0})`}>
                                <input type="range" min={0} max={40} step={1} value={t.shadowBlur ?? 0}
                                  onChange={(e) => patchText(i, { shadowBlur: Number(e.target.value), shadowColor: t.shadowColor && t.shadowColor !== "transparent" ? t.shadowColor : "rgba(0,0,0,0.5)" })}
                                  className="w-full accent-signal" />
                              </Labeled>
                              <Labeled label={`Shadow Y offset (${t.shadowOffsetY ?? 0})`}>
                                <input type="range" min={-10} max={20} step={1} value={t.shadowOffsetY ?? 0}
                                  onChange={(e) => patchText(i, { shadowOffsetY: Number(e.target.value) })} className="w-full accent-signal" />
                              </Labeled>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              <Labeled label="X %"><NumberField value={pct(t.xFrac)} step={1} onChange={(n) => patchText(i, { xFrac: n / 100 })} /></Labeled>
                              <Labeled label="Y %"><NumberField value={pct(t.yFrac)} step={1} onChange={(n) => patchText(i, { yFrac: n / 100 })} /></Labeled>
                              <Labeled label="W %"><NumberField value={pct(t.wFrac)} step={1} onChange={(n) => patchText(i, { wFrac: n / 100 })} /></Labeled>
                              <Labeled label="H %"><NumberField value={pct(t.hFrac)} step={1} onChange={(n) => patchText(i, { hFrac: n / 100 })} /></Labeled>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Labeled label="Start time (s)">
                                <NumberField value={t.startTime ?? 0} step={0.1} min={0} onChange={(n) => patchText(i, { startTime: n })} />
                              </Labeled>
                              <Labeled label="End time (s) — blank = whole template">
                                <input type="number" className={inputCls} value={t.endTime ?? ""} step={0.1} min={0}
                                  onChange={(e) => patchText(i, { endTime: e.target.value === "" ? undefined : Number(e.target.value) })} />
                              </Labeled>
                            </div>

                            <div className="border-t border-studio-border pt-2">
                              <div className="text-[10.5px] font-bold text-ink-secondary mb-1.5">Motion keyframes</div>
                              <TemplateTextKeyframes
                                kf={t.keyframes}
                                totalDur={totalDur}
                                time={time}
                                onSeek={(s) => { setPlaying(false); setTime(s); }}
                                onChange={(kf) => patchText(i, { keyframes: kf })}
                                animation={t.animation}
                                animationLabel={TEMPLATE_ANIMATIONS.find((a) => a.value === t.animation)?.label}
                                onAnimationClear={() => applyTextAnimation(i, "none")}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* footer: validation + actions */}
        <div className="border-t border-studio-border p-4 flex-shrink-0 flex flex-col gap-2.5">
          {(errors.length > 0 || warnings.length > 0) && (
            <div className="max-h-28 overflow-y-auto scrollbar-thin flex flex-col gap-1">
              {errors.map((e, i) => (
                <div key={"e" + i} className="flex items-start gap-1.5 text-[11px] text-danger">
                  <AlertOctagon size={12} className="mt-0.5 flex-shrink-0" /> {e}
                </div>
              ))}
              {warnings.map((w, i) => (
                <div key={"w" + i} className="flex items-start gap-1.5 text-[11px] text-warning">
                  <Sparkles size={12} className="mt-0.5 flex-shrink-0" /> {w}
                </div>
              ))}
            </div>
          )}
          {saveError && <div className="text-[12px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2">{saveError}</div>}
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-ink-faint mr-auto">
              {aspectRatioDimensions((json.aspectRatio as string) ?? "16:9").join("×")} · {slots.length} slot{slots.length !== 1 ? "s" : ""} · {texts.length} text
            </span>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-studio-border text-ink-secondary text-[12.5px] font-semibold hover:bg-studio-hover transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving || uploading || errors.length > 0}
              className="px-5 py-2 rounded-lg bg-signal hover:bg-signal-hover text-studio-void text-[12.5px] font-semibold transition-colors disabled:opacity-40">
              {saving ? "Saving…" : template ? "Save changes" : "Create template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Template keyframes: bridge the fractional TemplateJson shape to the
//    shared KeyframeEditor (which works in seconds + real KeyframeTrack). In
//    template mode the editor shows X/Y as % and keeps their track `value`
//    as a canvas fraction — matches TemplateJsonKeyframeTrack exactly.
function TemplateTextKeyframes({
  kf, totalDur, time, onChange, onSeek, animation, animationLabel, onAnimationClear,
}: {
  kf: TemplateJsonKeyframeTrack[] | undefined;
  totalDur: number;
  time: number;
  onChange: (kf: TemplateJsonKeyframeTrack[] | undefined) => void;
  onSeek: (s: number) => void;
  animation?: string;
  animationLabel?: string;
  onAnimationClear?: () => void;
}) {
  const tracks: KeyframeTrack[] = (kf ?? []).map((tr) => ({
    prop: tr.prop,
    keys: (tr.keys ?? []).map((k) => ({
      id: uuidv4(),
      t: (k.tFrac ?? 0) * totalDur,
      value: k.value ?? 0,
      ease: k.ease,
    })).sort((a, b) => a.t - b.t),
  }));

  const back = (next: KeyframeTrack[] | undefined) => {
    if (!next || next.length === 0) { onChange(undefined); return; }
    onChange(next.map((tr) => ({
      prop: tr.prop,
      keys: tr.keys.map((k) => ({
        tFrac: totalDur > 0 ? Math.max(0, Math.min(1, k.t / totalDur)) : 0,
        value: k.value,
        ease: k.ease,
      })),
    })));
  };

  return (
    <KeyframeEditor
      tracks={tracks}
      onChange={back}
      time={time}
      duration={totalDur}
      onSeek={onSeek}
      mode="template"
      animation={animation}
      animationLabel={animationLabel}
      onAnimationClear={onAnimationClear}
    />
  );
}

// ── helpers ───────────────────────────────────────────────────────────────
function pct(frac: number | undefined): number {
  return Math.round((frac ?? 0) * 100);
}
// <input type="color"> only accepts #rrggbb — best-effort coerce anything else.
function toHex(c: string | undefined): string {
  if (!c) return "#000000";
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("");
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  return "#000000";
}
