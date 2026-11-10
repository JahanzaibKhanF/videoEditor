import { parseBrowserPlan, literalTitlePlan, type BrowserInput } from "./browserPlan";
import type { EditorPlan } from "./editorPlan";

export type DirectorProgress = { label: string; percent?: number };

/** One worker per open panel. Termination cancels downloads AND active inference. */
export class BrowserDirector {
  private worker: Worker | null = null;
  private sequence = 0;
  private cancel: (() => void) | null = null;
  private idle: ReturnType<typeof setTimeout> | undefined;

  dispose() {
    this.cancel?.();
    this.worker?.terminate();
    this.worker = null;
    clearTimeout(this.idle);
  }

  generate(input: BrowserInput, signal: AbortSignal, progress: (value: DirectorProgress) => void): Promise<EditorPlan> {
    if (this.cancel) return Promise.reject(new Error("Please wait for your current edit to finish."));
    if (signal.aborted) return Promise.reject(new DOMException("Stopped", "AbortError"));
    const literal = input.selectedIds.length ? null : literalTitlePlan(input.prompt, input.canvas);
    if (literal) return Promise.resolve(literal);
    clearTimeout(this.idle);
    this.worker ??= new Worker(new URL("../../workers/directorWorker.ts", import.meta.url));
    const worker = this.worker, id = ++this.sequence;
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const finish = (error?: Error, plan?: EditorPlan) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        worker.onmessage = null; worker.onerror = null;
        this.cancel = null;
        if (error) { worker.terminate(); this.worker = null; reject(error); }
        else {
          // Release model memory while the user is editing; disk cache survives.
          this.idle = setTimeout(() => { worker.terminate(); if (this.worker === worker) this.worker = null; }, 120000);
          resolve(plan!);
        }
      };
      const abort = () => finish(new DOMException("Stopped", "AbortError"));
      this.cancel = abort;
      signal.addEventListener("abort", abort, { once: true });
      // A stalled download fails promptly; live download progress resets this.
      const deadline = (ms: number, message: string) => {
        clearTimeout(timer); timer = setTimeout(() => finish(new Error(message)), ms);
      };
      const stalled = "Preparation paused. Check your internet connection and try again.";
      let generating = false;
      deadline(90000, stalled);
      worker.onerror = event => { event.preventDefault(); finish(new Error("Your creative assistant couldn’t start. Refresh the page and try again.")); };
      worker.onmessage = event => {
        const msg = event.data;
        if (msg.id !== id) return;
        if (msg.type === "generating") {
          generating = true;
          deadline(90000, "This idea is taking too long on this device. Try a shorter request with one edit.");
          progress({ label: msg.label });
        } else if (msg.type === "progress") {
          if (!generating) deadline(90000, stalled);
          progress({ label: msg.label, percent: msg.percent });
        } else if (msg.type === "result") {
          try { finish(undefined, parseBrowserPlan(msg.text, input.canvas, input.prompt)); }
          catch (error) {
            console.warn("Director response could not be applied:", error);
            finish(new Error("I couldn’t turn that into an edit. Try one edit at a time: a short title, a simple shape, or a pen sketch."));
          }
        } else if (msg.type === "error") finish(new Error(msg.message));
      };
      worker.postMessage({ id, input });
    });
  }
}
