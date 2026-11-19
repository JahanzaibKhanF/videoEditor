import { abortable, DIRECTOR_TIMEOUT_MS, DIRECTOR_REPAIR_WINDOW_MS, DIRECTOR_MAX_CALLS, DIRECTOR_TIMEOUT_MESSAGE } from "./directorLimits";
import { parseEditorResponse, type DirectorInput } from "./editorProtocol";
import type { EditorPlan } from "./editorPlan";

export type LocalProgress = { label: string; preview?: string; percent?: number };

// Show the model's own draft summary, not raw JSON or private reasoning.
export function draftSummary(text: string): string {
  const match = /"summary"\s*:\s*"/.exec(text);
  if (!match) return "";
  let value = "";
  for (let i = match.index + match[0].length; i < text.length; i++) {
    const c = text[i];
    if (c === '"') break;
    if (c === "\\") {
      if (++i >= text.length) break;
      if (text[i] === 'u') {
        const code = text.slice(i + 1, i + 5);
        if (!/^[a-f\d]{4}$/i.test(code)) break;
        value += String.fromCharCode(parseInt(code, 16)); i += 4;
      } else value += ({ n: "\n", r: "\r", t: "\t" } as Record<string, string>)[text[i]] ?? text[i];
    } else value += c;
  }
  return value.slice(0, 500);
}

/** A short moving window of assistant output; never render the input as progress. */
export function assistantPreview(response: string, prompt: string): string {
  const summary = draftSummary(response).trim();
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const normalized = normalize(summary);
  if (!normalized || normalize(prompt).includes(normalized)) return "";
  return summary.split(/\s+/).slice(-6).join(" ");
}

export class LocalDirector {
  private active: AbortController | null = null;
  constructor(private readonly timeoutMs = DIRECTOR_TIMEOUT_MS) {}
  dispose() { this.active?.abort(); }

  async generate(input: DirectorInput & { model: string }, signal: AbortSignal, progress: (value: LocalProgress) => void, validate?: (plan: EditorPlan) => void): Promise<EditorPlan> {
    if (this.active) throw new Error("Please wait for the current edit to finish.");
    const controller = new AbortController(); this.active = controller;
    const cancel = () => controller.abort();
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    const started = performance.now();
    let timedOut = false, inferenceCalls = 0;
    const timeoutMs = Math.min(this.timeoutMs, DIRECTOR_TIMEOUT_MS);
    const deadline = setTimeout(() => { timedOut = true; cancel(); }, timeoutMs);
    let lastRawResponse = "", attemptNumber = 0;
    const debug = process.env.NODE_ENV === "development";
    let correction: { response: string; error: string } | undefined;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        attemptNumber = attempt + 1; lastRawResponse = "";
        if (debug) console.info(`[AI Director] Request started · ${input.model} · attempt ${attemptNumber}`);
        progress({ label: attempt ? "Checking and correcting the edit…" : "Connecting to your assistant…", preview: "" });
        inferenceCalls++;
        const response = await abortable(fetch("/api/ai/director", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input, correction, model: input.model, timeoutMs: Math.max(1, timeoutMs - (performance.now() - started)) }), signal: controller.signal }), controller.signal);
        if (!response.ok) throw new Error(await abortable(response.text(), controller.signal));
        if (!response.body) throw new Error("The assistant returned no response.");
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = "", draft = "", result: string | undefined, lastPaint = 0;
        try {
          while (true) {
            const chunk = await abortable(reader.read(), controller.signal);
            buffer += decoder.decode(chunk.value, { stream: !chunk.done });
            const lines = buffer.split("\n"); buffer = lines.pop()!;
            if (chunk.done && buffer.trim()) { lines.push(buffer); buffer = ""; }
            for (const line of lines) {
              if (!line) continue;
              const event = JSON.parse(line);
              if (event.type === "metrics" && debug) console.info("[AI Director] Inference metrics:", event);
              if (event.type === "error") throw new Error(event.message);
              if (event.type === "status") progress({ label: event.label, preview: "" });
              if (event.type === "reset") {
                inferenceCalls++;
                if (debug) console.log("[AI Director] Raw schema lookup response:", draft);
                lastRawResponse = ""; draft = ""; progress({ label: "Creating your edits…", preview: "" }); }
              if (event.type === "delta") {
                draft += event.text; lastRawResponse = draft;
                if (draft.length > 100000) throw new Error("The generated edit is too large.");
                if (Date.now() - lastPaint >= 60) {
                  lastPaint = Date.now();
                  progress({ label: `Generating edit data… ${draft.length.toLocaleString()} characters received. Nothing applied yet.`, preview: "" });
                }
              }
              if (event.type === "result") {
                result = event.text; lastRawResponse = event.text;
                if (process.env.NODE_ENV === "development") {
                  console.groupCollapsed(`[AI Director] ${input.model} · ${attempt ? "correction" : "initial"} response`);
                  console.log("Raw assistant response (before validation):", event.text);
                  console.groupEnd();
                }
              }
            }
            // A result is the terminal protocol event; do not wait for a proxy
            // or transport to close before validating it.
            if (result !== undefined || chunk.done) break;
          }
        } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
        if (result === undefined) throw new Error("The assistant stopped before finishing. Your scene was not changed.");
        if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");
        try {
          progress({ label: "Validating geometry, animation and native edits…", preview: "" });
          const validationStart = performance.now();
          const plan = parseEditorResponse(result, input.canvas); validate?.(plan);
          if (debug) console.info("[AI Director] Plan validation/application ms:", performance.now() - validationStart);
          progress({ label: "Validation complete. Waiting to apply…", preview: "" });
          return plan;
        } catch (error) {
          if (debug) console.warn(`[AI Director] Validation rejected attempt ${attemptNumber}:`, error instanceof Error ? error.message : String(error), "Raw assistant response:", result);
          if (attempt) throw new Error("The assistant could not produce a valid edit after correcting it. Your scene was not changed.");
          if (inferenceCalls >= DIRECTOR_MAX_CALLS || performance.now() - started >= DIRECTOR_REPAIR_WINDOW_MS) {
            throw new Error("The generated edit was invalid. Automatic correction was skipped to avoid another long wait. Your scene was not changed.");
          }
          correction = { response: result.slice(0, 12000), error: (error instanceof Error ? error.message : "Invalid edit").slice(0, 1000) };
        }
      }
      throw new Error("The assistant could not finish the edit.");
    } catch (error) {
      if (debug) console.error(`[AI Director] ${controller.signal.aborted ? "Stopped" : "Failed"} · ${input.model} · attempt ${attemptNumber}`, error instanceof Error ? error.message : String(error),
        "Raw assistant response received so far:", lastRawResponse || "(No assistant text was received.)");
      if (timedOut) throw new Error(DIRECTOR_TIMEOUT_MESSAGE);
      throw error;
    } finally { clearTimeout(deadline); signal.removeEventListener("abort", cancel); this.active = null; }
  }
}
