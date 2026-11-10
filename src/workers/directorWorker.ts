import { env, pipeline, TextStreamer, InterruptableStoppingCriteria, type TextGenerationPipeline } from "@huggingface/transformers";
import { browserMessages, extractJsonObject, type BrowserInput } from "../utils/ai/browserPlan";

// Reuse the app's isolated WASM runtime. No GPU requirement, server or API key.
// Quantized 0.5B model; downloads are cached by Transformers.js in this browser.
env.allowLocalModels = false;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
const MODEL = "onnx-community/Qwen2.5-0.5B-Instruct";
let generator: Promise<TextGenerationPipeline> | null = null;
let activeId = 0;
const post = (message: Record<string, unknown>) => self.postMessage({ id: activeId, ...message });

self.onmessage = async (event: MessageEvent<{ id: number; input: BrowserInput }>) => {
  activeId = event.data.id;
  try {
    const messages = browserMessages(event.data.input);
    if (!generator) {
      post({ type: "progress", label: "Preparing your creative assistant… First use needs a download." });
      // q8 includes quantized embeddings: ~512 MB vs ~786 MB for this model's q4 export.
      generator = pipeline("text-generation", MODEL, {
        dtype: "q8", device: "wasm",
        progress_callback: (info: { status: string; file?: string; progress?: number }) => {
          if (info.status === "progress" && info.file?.endsWith(".onnx") && typeof info.progress === "number") {
            post({ type: "progress", label: `Downloading creative tools… ${Math.floor(info.progress)}%`, percent: Math.floor(info.progress) });
          }
        },
      });
    }
    const model = await generator;
    post({ type: "generating", label: "Bringing your idea to life…" });
    let tokens = 0;
    const ids: bigint[] = [];
    let complete = "";
    const stopping = new InterruptableStoppingCriteria();
    const output = await model(messages, {
      max_new_tokens: 384, do_sample: false, stopping_criteria: [stopping],
      streamer: new TextStreamer(model.tokenizer, { skip_prompt: true, callback_function: () => {}, token_callback_function: (chunk) => {
        tokens++;
        ids.push(...chunk);
        const text = model.tokenizer.decode(ids, { skip_special_tokens: true }).trim();
        // Stop at a complete JSON object before trailing prose or repetition.
        try {
          const candidate = extractJsonObject(text);
          if (candidate) { complete = candidate; stopping.interrupt(); }
        } catch {}

        if (tokens % 12 === 0) post({ type: "progress", label: "Creating your edits…", tokens });
      } }),
    });
    const generated = (output[0] as { generated_text: string | { role: string; content: string }[] }).generated_text;
    const text = typeof generated === "string" ? generated : generated[generated.length - 1]?.content;
    post({ type: "result", text: complete || text });
  } catch (error) {
    generator = null;
    console.error("Browser director:", error);
    post({ type: "error", message: "Your creative assistant couldn’t finish. Check your connection and try again, or close other tabs to free up memory." });
  }
};
