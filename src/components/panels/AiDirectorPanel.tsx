"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Play, Square, Loader2, Undo2 } from "lucide-react";
import { useAppDetailsContext, useEngineControls } from "../../context/useAppContext";
import { applyPlan, sceneForModel, type EditorDocument, type EditorPlan } from "../../utils/ai/editorPlan";
import { BrowserDirector, type DirectorProgress } from "../../utils/ai/browserDirector";
import { PanelShell, PanelHeader, PanelBody } from "../ui/Panel";

const EXAMPLES = [
  "Create an orange cartoon cat from shapes and animate it running across the canvas for 5 seconds.",
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
  const current = useRef({ doc, canvas: app.containerDimenions, activeTemplate: app.activeTemplate });
  current.current = { doc, canvas: app.containerDimenions, activeTemplate: app.activeTemplate };
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<"generating" | null>(null);
  const director = useRef<BrowserDirector | null>(null);
  const [progress, setProgress] = useState<DirectorProgress>({ label: "Preparing your creative assistant…" });
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
    if (Object.keys(before.doc).some(k => before.doc[k as keyof EditorDocument] !== latest.doc[k as keyof EditorDocument]) || before.canvas.width !== latest.canvas.width || before.canvas.height !== latest.canvas.height) {
      throw new Error("Your scene changed while AI was working. Nothing was applied. Generate again using the current scene.");
    }
    const next = applyPlan(latest.doc, plan, latest.canvas);
    engineRef.current.pause();
    app.applyAiDocument(next);
    setResult({ plan, before, applied: true });
    setNotice(`Applied ${plan.operations.length} edits. Every layer is editable; Undo restores your scene.`);
    setPlayRequest(n => n + 1);
  };

  const generate = async () => {
    if (request.current || !prompt.trim()) return;
    const before = current.current;
    const controller = new AbortController(); request.current = controller;
    setBusy("generating"); setError(null); setNotice(""); setResult(null);
    setProgress({ label: "Preparing your creative assistant…" });
    try {
      director.current ??= new BrowserDirector();
      const plan = await director.current.generate({
        prompt, scene: sceneForModel(before.doc), canvas: before.canvas, totalTime: before.doc.totalTime,
        selectedIds: [app.selectedClipId, app.selectedImageID, app.selectedTextId, app.selectedBlurId, app.selectedShapeId, app.selectedBrushId].filter((id): id is string => !!id),
      }, controller.signal, setProgress);
      if (controller.signal.aborted) return;
      applyPlan(before.doc, plan, before.canvas); // Validate the whole result before touching state.
      if (!plan.operations.length) { setResult({ plan, before, applied: false }); setNotice("No changes were made."); }
      else if (autoApply) commit(plan, before);
      else { setResult({ plan, before, applied: false }); setNotice("Edits are ready. Apply them when you want to preview."); }
    } catch (err) {
      setError(controller.signal.aborted ? "Generation stopped. Your project was not changed." : (err as Error).message);
    } finally { request.current = null; setBusy(null); }
  };

  return (
    <PanelShell>
      <PanelHeader icon={<Sparkles size={14} />} title="AI Director" subtitle="Describe it. Edit it. Play it." />
      <PanelBody padded gap>
        <p className="text-xs leading-relaxed text-ink-secondary">Create editable drawings, titles and motion, or change the media already on your timeline.</p>
        <p className="text-[11px] leading-relaxed text-ink-muted">Works privately on your device. First use downloads about 500 MB of creative tools; later visits can reuse them.</p>
        <div className="space-y-2">
          <label htmlFor="ai-prompt" className="text-xs font-semibold text-ink-primary">What would you like to make?</label>
          <textarea id="ai-prompt" className={`${control} min-h-[130px] resize-y`} maxLength={4000} value={prompt} disabled={!!busy} onChange={e => setPrompt(e.target.value)} placeholder="Create a cat and make it run…" />
          <div className="flex flex-wrap gap-1.5">
            {["Running cat", "Animated title", "Mute & fade", "Pen sketch"].map((label, i) => <button type="button" disabled={!!busy} key={label} onClick={() => setPrompt(EXAMPLES[i])} className="text-[10px] rounded-full border border-studio-border px-2 py-1 text-ink-secondary hover:border-signal disabled:opacity-50">{label}</button>)}
          </div>
          <label className="flex gap-2 items-center text-xs text-ink-secondary"><input type="checkbox" checked={autoApply} disabled={!!busy} onChange={e => setAutoApply(e.target.checked)} />Apply and play automatically</label>
          {app.activeTemplate && <p className="text-xs text-ink-muted">Finish placing your template’s media to use AI edits.</p>}
          {busy === "generating" ? <button type="button" className={`${control} flex justify-center items-center gap-2`} onClick={() => request.current?.abort()}><Square size={13} />Cancel · {elapsed}s</button> :
            <button type="button" onClick={generate} disabled={!!busy || !prompt.trim() || !!app.activeTemplate} className="w-full rounded-lg bg-signal py-2.5 text-xs font-bold text-white disabled:opacity-40 flex justify-center items-center gap-2"><Sparkles size={14} />Create</button>}
          {busy === "generating" && <div role="status" aria-live="polite" className="space-y-2 text-xs text-ink-secondary">
            <p className="flex items-center gap-2"><Loader2 size={13} className="animate-spin shrink-0" />{progress.label}</p>
            {progress.percent !== undefined && <progress className="w-full h-1.5 accent-signal" value={progress.percent} max={100} aria-label="Preparing creative tools" />}
          </div>}
        </div>
        {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger break-words">{error}</p>}
        {!!notice && <p role="status" className="text-xs text-ink-secondary">{notice}</p>}
        {result && <div className="space-y-3 rounded-xl border border-studio-border p-3">
          <p className="text-xs leading-relaxed text-ink-primary">{result.plan.summary}</p>
          {!!result.plan.operations.length && <div className="flex gap-2">
            {!result.applied ? <button type="button" className={control} onClick={() => { try { commit(result.plan, result.before); } catch (err) { setError((err as Error).message); } }}>Apply & play</button> : <>
              <button type="button" className={`${control} flex gap-1 items-center justify-center`} onClick={() => setPlayRequest(n => n + 1)}><Play size={12} />Replay</button>
              <button type="button" className={`${control} flex gap-1 items-center justify-center`} onClick={() => { engineRef.current.pause(); app.undo(); setResult(null); setNotice("Undid the latest edit."); }}><Undo2 size={12} />Undo</button>
            </>}
          </div>}
        </div>}
        <p className="text-[11px] leading-relaxed text-ink-muted">Best for titles, simple drawings and motion. For photos, video or sound, import your media first. Everything you create stays editable.</p>
      </PanelBody>
    </PanelShell>
  );
}
