import { DIRECTOR_TIMEOUT_MS, DIRECTOR_MAX_CALLS, DIRECTOR_TIMEOUT_MESSAGE } from "../../../../src/utils/ai/directorLimits";
import { Ollama } from "ollama";
import { responseSchemaForScene, editorMessages, inspectCapabilities, type DirectorInput, type PlanCorrection } from "../../../../src/utils/ai/editorProtocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HOST = "http://127.0.0.1:11434";
function localOnly(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Local AI is available in development only.", { status: 404 });
  const url = new URL(request.url), origin = request.headers.get("origin");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || (origin && origin !== url.origin)) return new Response("Open the editor on localhost to use local AI.", { status: 403 });
}
function isLocal(model: { name: string; [key: string]: unknown }) {
  return !model.remote_host && !model.remote_model && !/(?:-cloud|:cloud)$/.test(model.name);
}
export async function GET(request: Request) {
  const blocked = localOnly(request); if (blocked) return blocked;
  try {
    const client = new Ollama({ host: HOST, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]) }) });
    const { models } = await client.list();
    const supported = await Promise.all(models.filter(m => isLocal({ ...m })).map(async m => {
      const details = await client.show({ model: m.name });
      return details.capabilities.includes("completion") ? { name: m.name, size: m.size } : null;
    }));
    return Response.json({ models: supported.filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return new Response("Couldn’t reach Ollama. Install it from ollama.com, then open it or run ollama serve and refresh the list.", { status: 503 }); }
}

export async function POST(request: Request) {
  const blocked = localOnly(request); if (blocked) return blocked;
  let model = "";
  let format: object;
  let messages: ReturnType<typeof editorMessages>;
  let sceneInput: DirectorInput;
  let isCorrection = false;
  let budgetMs = DIRECTOR_TIMEOUT_MS;
  const requestStarted = performance.now();
  try {
    const raw = await request.text();
    if (raw.length > 100000) return new Response("The scene is too large.", { status: 413 });
    const body = JSON.parse(raw) as { input: DirectorInput; correction?: PlanCorrection; model?: string; timeoutMs?: number };
    if (typeof body.model !== "string" || !body.model || body.model.length > 200) throw new Error("Choose a model.");
    model = body.model;
    sceneInput = body.input;
    isCorrection = !!body.correction;
    if (typeof body.timeoutMs === "number" && Number.isFinite(body.timeoutMs)) budgetMs = Math.max(1, Math.min(DIRECTOR_TIMEOUT_MS, body.timeoutMs));
    messages = editorMessages(body.input, body.correction);
    format = responseSchemaForScene(body.input, !isCorrection);
  } catch { return new Response("The editing request is invalid.", { status: 400 }); }

  const abort = new AbortController();
  const client = new Ollama({ host: HOST, fetch: (input, init) => fetch(input, { ...init, signal: abort.signal }) });
  const stop = () => { abort.abort(); client.abort(); };
  request.signal.addEventListener("abort", stop, { once: true });
  if (request.signal.aborted) stop();
  let timer = setTimeout(stop, 10000);
  try {
    const installed = await client.list();
    if (!installed.models.some(entry => entry.name === model && isLocal({ ...entry }))) {
      request.signal.removeEventListener("abort", stop);
      return new Response("That local model is no longer installed. Refresh the list and choose an installed model. To install Qwen, run ollama pull qwen2.5:7b.", { status: 409 });
    }
  } catch {
    request.signal.removeEventListener("abort", stop);
    return new Response("Couldn’t reach Ollama. Install it from ollama.com, then open it or run ollama serve and try again.", { status: 503 });
  } finally { clearTimeout(timer); }
  try {
    timer = setTimeout(stop, 10000);
    const details = await client.show({ model });
    if (!details.capabilities.includes("completion")) {
      request.signal.removeEventListener("abort", stop);
      return new Response("Choose a text-generation model. This model only supports other tasks.", { status: 409 });
    }
  } catch {
    request.signal.removeEventListener("abort", stop);
    return new Response("Couldn’t read this model’s capabilities. Refresh the models and try again.", { status: 503 });
  } finally { clearTimeout(timer); }
  if (abort.signal.aborted) { request.signal.removeEventListener("abort", stop); return new Response("Request stopped.", { status: 408 }); }

  const encoder = new TextEncoder();
  let finishStream: (() => void) | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const finish = () => {
        if (closed) return;
        closed = true; clearTimeout(timer);
        request.signal.removeEventListener("abort", stop);
        abort.signal.removeEventListener("abort", finish);
        try { controller.close(); } catch { /* Reader already cancelled. */ }
      };
      finishStream = finish;
      const emit = (event: object) => { if (!closed && !abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
      abort.signal.addEventListener("abort", finish, { once: true });
      timer = setTimeout(() => {
        emit({ type: "error", message: DIRECTOR_TIMEOUT_MESSAGE });
        finish(); stop();
      }, Math.max(1, budgetMs - (performance.now() - requestStarted)));
      try {
        for (let turn = 0; turn < (isCorrection ? 1 : DIRECTOR_MAX_CALLS); turn++) {
          emit({ type: "status", label: turn ? "Generating edits after tool lookup (call 2 of 2)…" : isCorrection ? "Correcting invalid edit data (final call)…" : "Ollama is loading or reading your request…" });
          const started = performance.now();
          const response = await client.chat({ model, messages, stream: true, format,
            keep_alive: "10m", options: { temperature: 0, num_ctx: 8192, num_predict: 4096 } });
          let text = "";
          for await (const chunk of response) {
            if (chunk.done) emit({ type: "metrics", model, correction: isCorrection, call: turn + 1,
              promptChars: messages.reduce((sum, m) => sum + m.content.length, 0), schemaChars: JSON.stringify(format).length,
              wallMs: Math.round(performance.now() - started), loadMs: (chunk.load_duration ?? 0) / 1e6,
              promptMs: (chunk.prompt_eval_duration ?? 0) / 1e6, generationMs: (chunk.eval_duration ?? 0) / 1e6,
              inputTokens: chunk.prompt_eval_count, outputTokens: chunk.eval_count, doneReason: chunk.done_reason });
            if (chunk.done && chunk.done_reason === "length") {
              emit({ type: "error", message: "The assistant reached its output limit before finishing. Your scene was not changed. Try fewer edits." });
              return;
            }
            const delta = chunk.message.content;
            if (!delta) continue;
            text += delta;
            if (text.length > 100000) throw new Error("The generated edit was too large. Try fewer changes at once.");
            emit({ type: "delta", text: delta });
          }
          let capabilities: string | null;
          try { capabilities = inspectCapabilities(text); }
          catch {
            // Invalid model JSON is a candidate for the client's bounded repair,
            // not a transport error. Never apply it or surface parser internals.
            emit({ type: "result", text });
            return;
          }
          if (capabilities) {
            if (turn === 1 || isCorrection) throw new Error("The assistant could not finish choosing its tools. Try again.");
            messages.push({ role: "assistant", content: text }, { role: "user", content: `Tool field schemas: ${capabilities}. Return the complete edit for the original request.` });
            format = responseSchemaForScene(sceneInput, false, Object.keys(JSON.parse(capabilities)));
            emit({ type: "reset" });
            continue;
          }
          emit({ type: "result", text });
          return;
        }
      } catch (error) {
        if (!abort.signal.aborted) emit({ type: "error", message: "The local assistant stopped before finishing. Check Ollama and try again. Your scene was not changed." });
      } finally {
        finish(); stop();
      }
    },
    cancel() { finishStream?.(); stop(); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
