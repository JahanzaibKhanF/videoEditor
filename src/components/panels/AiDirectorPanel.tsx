"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Play, Square, Loader2, Undo2, RefreshCw } from "lucide-react";
import { useAppDetailsContext, useEngineControls } from "../../context/useAppContext";
import { applyPlan, executeEditorPlan, sceneForModel, sameEditorDocument, type EditorDocument, type EditorPlan } from "../../utils/ai/editorPlan";
import { LocalDirector, type LocalProgress } from "../../utils/ai/localDirector";
import { PanelShell, PanelHeader, PanelBody } from "../ui/Panel";

const EXAMPLES = [
  "Draw a simple blue outline and animate it rising and returning over 3 seconds.",
  "Add a bold title saying Hello world with a fade in.",
  "Mute the selected video and give it a fade-in animation.",
  "Use the pen to draw a blue zigzag",
];
const control = "w-full rounded-lg border border-studio-border bg-studio-raised px-3 py-2 text-xs text-ink-primary focus:outline-none focus:border-signal disabled:opacity-50";

export default function AiDirectorPanel() {
  const app = useAppDetailsContext();
  const engine = useEngineControls();
  const engineRef = useRef(engine); engineRef.current = engine;
  const doc: EditorDocument = {
    clips: app.clipsDetails, texts: app.textsDetails, images: app.imagesDetails, blurs: app.blursDetails,
    shapes: app.shapesDetails, brushes: app.brushesDetails, audio: app.audioDetails,
    effects: app.clipEffects, layerOrder: app.layerOrder, totalTime: app.totalTime,
  };
  const scene = sceneForModel(doc);
  const selectedIds = [app.selectedClipId, app.selectedImageID, app.selectedTextId, app.selectedBlurId, app.selectedShapeId, app.selectedBrushId].filter((id): id is string => !!id);
  const timelineLayers = Object.values(scene).flat();
  const current = useRef({ doc, canvas: app.containerDimenions, activeTemplate: app.activeTemplate });
  current.current = { doc, canvas: app.containerDimenions, activeTemplate: app.activeTemplate };
  const [models, setModels] = useState<{ name: string; size: number }[]>([]);
  const [model, setModel] = useState("");
  const [modelError, setModelError] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelRefresh, setModelRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoadingModels(true); setModelError("");
    fetch("/api/ai/director", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json() as { models: { name: string; size: number }[] };
      if (controller.signal.aborted) return;
      setModels(data.models);
      setModel(previous => data.models.some(m => m.name === previous) ? previous : data.models.find(m => m.name === "qwen2.5:7b")?.name ?? data.models[0]?.name ?? "");
      if (!data.models.length) setModelError("No local models found. Install one with ollama pull qwen2.5:7b, then refresh this list.");
    }).catch(error => { if (!controller.signal.aborted) { setModels([]); setModel(""); setModelError(error.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoadingModels(false); });
    return () => controller.abort();
  }, [modelRefresh]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<"generating" | null>(null);
  const director = useRef<LocalDirector | null>(null);
  const [progress, setProgress] = useState<LocalProgress>({ label: "Preparing your creative assistant…" });
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [autoApply, setAutoApply] = useState(true);
  const [result, setResult] = useState<{ plan: EditorPlan; before: typeof current.current; applied: boolean } | null>(null);
  const [playRequest, setPlayRequest] = useState(0);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => { request.current?.abort(); director.current?.dispose(); }, []);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (!playRequest) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => { engineRef.current.seekTo(0); engineRef.current.play(); });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [playRequest]);

  const commit = (plan: EditorPlan, before: typeof current.current) => {
    const latest = current.current;
    if (latest.activeTemplate) throw new Error("Finish placing your template's media before applying AI edits.");
    if (!sameEditorDocument(before.doc, latest.doc) || before.canvas.width !== latest.canvas.width || before.canvas.height !== latest.canvas.height) {
      throw new Error("Your scene changed while AI was working. Nothing was applied. Generate again using the current scene.");
    }
    const next = executeEditorPlan(latest.doc, plan, latest.canvas);
    engineRef.current.pause();
    app.applyAiDocument(next);
    setResult({ plan, before, applied: true });
    setNotice(`Applied ${plan.operations.length} edits. Every layer is editable; Undo restores your scene.`);
    setPlayRequest(n => n + 1);
  };

  const generate = async () => {
    if (request.current || !prompt.trim() || !model) return;
    const before = current.current;
    const controller = new AbortController(); request.current = controller;
    setBusy("generating"); setError(null); setNotice(""); setResult(null);
    setProgress({ label: "Preparing your creative assistant…" });
    try {
      director.current ??= new LocalDirector();
      const plan = await director.current.generate({
        model, prompt, scene: sceneForModel(before.doc), canvas: before.canvas, totalTime: before.doc.totalTime, playhead: app.currentTime,
        selectedIds,
      }, controller.signal, setProgress, plan => { applyPlan(before.doc, plan, before.canvas); });
      if (controller.signal.aborted) return;
      executeEditorPlan(before.doc, plan, before.canvas); // Validate and reject unchanged/unsupported plans before committing.
      if (autoApply) { setProgress({ label: "Applying validated edits…" }); commit(plan, before); }
      else { setResult({ plan, before, applied: false }); setNotice("Validated proposal — not applied. Apply it to preview."); }
    } catch (err) {
      setError(controller.signal.aborted ? "Generation stopped. Your project was not changed." : (err as Error).message);
    } finally { request.current = null; setBusy(null); }
  };

  return (
    <PanelShell>
      <PanelHeader icon={<Sparkles size={14} />} title="AI Director" subtitle="Describe it. Edit it. Play it." />
      <PanelBody padded gap>
        <p className="text-xs leading-relaxed text-ink-secondary">Edit the video, images, text and audio already on your timeline, or create editable titles and drawings.</p>
        <p className="text-[11px] leading-relaxed text-ink-muted">Supports trimming, splitting, color correction, motion, mute and green/blue-screen removal. Automatic subject cutout is currently available in the manual BG Remove panel.</p>
        <p className="text-[11px] leading-relaxed text-ink-muted">Uses your computer’s local assistant. No account, API key or per-use charges.</p>
        <details className="text-[11px] text-ink-secondary">
          <summary className="cursor-pointer">Timeline · {timelineLayers.length} layers · {selectedIds.length ? "selection included" : "no layer selected"}</summary>
          <ul className="mt-2 space-y-1">
            {timelineLayers.slice(0, 50).map(row => <li key={String(row.id)}>{String(row.label)} · {Number(row.timelineStart ?? 0).toFixed(1)}–{Number(row.timelineEnd ?? 0).toFixed(1)}s{selectedIds.includes(String(row.id)) ? " · selected" : ""}</li>)}
          </ul>
          {timelineLayers.length > 50 && <p>Showing the first 50 layers.</p>}
          <p className="mt-1">Use these labels to refer to a layer. Linked audio is included with its video; the assistant cannot see or hear media content.</p>
        </details>
        <div className="space-y-2">
          <label htmlFor="ai-prompt" className="text-xs font-semibold text-ink-primary">What would you like to make?</label>
          <div className="relative">
            <textarea id="ai-prompt" className={`${control} min-h-[160px] resize-y pb-12`} maxLength={4000} value={prompt} disabled={!!busy} onChange={e => setPrompt(e.target.value)} placeholder="Describe your drawing, title or edit…" />
            <div className="absolute bottom-3 right-2 left-2 flex justify-end items-center gap-1">
              <label htmlFor="ai-model" className="sr-only">Local model</label>
              <select id="ai-model" className="min-w-0 max-w-[calc(100%-2rem)] rounded-md border border-studio-border bg-studio-raised px-2 py-1 text-[10px] text-ink-secondary focus:outline-none focus:border-signal disabled:opacity-50" value={model} disabled={!!busy || loadingModels || !models.length} onChange={event => setModel(event.target.value)}>
                {!models.length && <option value="">{loadingModels ? "Finding models…" : "No models available"}</option>}
                {models.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
              <button type="button" aria-label="Refresh installed models" title="Refresh models" disabled={!!busy || loadingModels} onClick={() => setModelRefresh(n => n + 1)} className="shrink-0 rounded-md border border-studio-border bg-studio-raised p-1.5 text-ink-secondary hover:text-ink-primary disabled:opacity-50"><RefreshCw size={12} className={loadingModels ? "animate-spin" : ""} /></button>
            </div>
          </div>
          {modelError && <p role="alert" className="text-xs text-danger">{modelError}</p>}
          <div className="flex flex-wrap gap-1.5">
            {["Moving sketch", "Animated title", "Mute & fade", "Pen sketch"].map((label, i) => <button type="button" disabled={!!busy} key={label} onClick={() => setPrompt(EXAMPLES[i])} className="text-[10px] rounded-full border border-studio-border px-2 py-1 text-ink-secondary hover:border-signal disabled:opacity-50">{label}</button>)}
          </div>
          <label className="flex gap-2 items-center text-xs text-ink-secondary"><input type="checkbox" checked={autoApply} disabled={!!busy} onChange={e => setAutoApply(e.target.checked)} />Apply and play automatically</label>
          {app.activeTemplate && <p className="text-xs text-ink-muted">Finish placing your template’s media to use AI edits.</p>}
          {busy === "generating" ? <button type="button" className={`${control} flex justify-center items-center gap-2`} onClick={() => request.current?.abort()}><Square size={13} />Cancel · {elapsed}s</button> :
            <button type="button" onClick={generate} disabled={!!busy || !model || !prompt.trim() || !!app.activeTemplate} className="w-full rounded-lg bg-signal py-2.5 text-xs font-bold text-white disabled:opacity-40 flex justify-center items-center gap-2"><Sparkles size={14} />Create</button>}
          {busy === "generating" && <div role="status" aria-live="polite" className="space-y-2 text-xs text-ink-secondary">
            <p className="flex items-center gap-2"><Loader2 size={13} className="animate-spin shrink-0" />{progress.label}</p>
            <p className="text-[10px] text-ink-muted">Up to 3 minutes total, including checks. Cancel stops this request.</p>

            {progress.percent !== undefined && <progress className="w-full h-1.5 accent-signal" value={progress.percent} max={100} aria-label="Preparing creative tools" />}
          </div>}
        </div>
        {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger break-words">{error}</p>}
        {!!notice && <p role="status" className="text-xs text-ink-secondary">{notice}</p>}
        {result && <div className="space-y-3 rounded-xl border border-studio-border p-3">
          <p className="text-xs leading-relaxed text-ink-primary">{result.applied ? result.plan.summary : "Proposed edits have not been applied yet."}</p>
          {!!result.plan.operations.length && <div className="flex gap-2">
            {!result.applied ? <button type="button" className={control} onClick={() => { try { commit(result.plan, result.before); } catch (err) { setError((err as Error).message); } }}>Apply & play</button> : <>
              <button type="button" className={`${control} flex gap-1 items-center justify-center`} onClick={() => setPlayRequest(n => n + 1)}><Play size={12} />Replay</button>
              <button type="button" className={`${control} flex gap-1 items-center justify-center`} onClick={() => { engineRef.current.pause(); app.undo(); setResult(null); setNotice("Undid the latest edit."); }}><Undo2 size={12} />Undo</button>
            </>}
          </div>}
        </div>}
        <p className="text-[11px] leading-relaxed text-ink-muted">Review AI results before keeping them. Drawings are experimental and can be inaccurate. Older devices can take several minutes. For photos, video or sound, import your media first. Everything you create stays editable.</p>
      </PanelBody>
    </PanelShell>
  );
}
