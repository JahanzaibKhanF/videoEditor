/**
 * enhanceWorker — Advanced-mode AI models for the Enhance feature, off the
 * main thread (same rationale as captionWorker.ts). Two real, ready-made
 * image-to-image restoration models cover Resolution and Denoise:
 *   - Resolution: Xenova/swin2SR-lightweight-x2-64 (clean 2x super-resolution)
 *   - Denoise:    Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr (trained on
 *     realistically degraded/noisy images, so it doubles as a real AI
 *     denoiser — enhanceClipVideo.ts downsamples its 4x output back to the
 *     source size when only denoising, not upscaling, was asked for)
 * There is deliberately no "Advanced Color" model here — see frameEnhance.ts's
 * file comment for why that stays a classical algorithm.
 *
 * Protocol (see enhanceClipVideo.ts for the sending side) — one frame per
 * message, called repeatedly for the length of the clip:
 *   → {type:"process", task:"resolution"|"denoise", frame: ImageBitmap (transferred)}
 *   ← {type:"progress", fraction, label}   (model download, once per task)
 *   ← {type:"result", data: ArrayBuffer (transferred), width, height, channels}
 *   ← {type:"error", message}
 */
import { pipeline, ImageToImagePipeline } from "@huggingface/transformers";

const post: (message: unknown, transfer?: Transferable[]) => void = postMessage as never;

const MODEL_IDS = {
  resolution: "Xenova/swin2SR-lightweight-x2-64",
  denoise: "Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr",
} as const;

type Task = keyof typeof MODEL_IDS;

const pipelines: Partial<Record<Task, Promise<ImageToImagePipeline>>> = {};

interface ProgressLike {
  status: string;
  progress?: number;
}

function getPipeline(task: Task) {
  if (!pipelines[task]) {
    pipelines[task] = pipeline("image-to-image", MODEL_IDS[task], {
      dtype: "fp32",
      progress_callback: (info: ProgressLike) => {
        if (info.status === "progress" && typeof info.progress === "number") {
          post({ type: "progress", fraction: Math.min(0.9, info.progress / 100), label: `Downloading ${task} model… ${Math.round(info.progress)}%` });
        } else if (info.status === "initiate" || info.status === "download") {
          post({ type: "progress", fraction: 0, label: `Preparing ${task} model…` });
        }
      },
    });
  }
  return pipelines[task]!;
}

self.addEventListener("error", (event) => {
  post({ type: "error", message: (event as ErrorEvent).message ?? "Enhance worker crashed." });
});

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: string; task: Task; frame: ImageBitmap };
  if (msg?.type !== "process") return;

  try {
    const { task, frame } = msg;
    const model = await getPipeline(task);

    const canvas = new OffscreenCanvas(frame.width, frame.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(frame, 0, 0);
    frame.close();

    const output = await model(canvas);
    const result = Array.isArray(output) ? output[0] : output;
    const bytes = result.data as Uint8ClampedArray;
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    post(
      { type: "result", data: buffer, width: result.width, height: result.height, channels: result.channels },
      [buffer],
    );
  } catch (err) {
    const raw = (err as Error)?.message ?? "Enhance failed.";
    // A raw "std::bad_alloc" from inside OrtRun() means the WASM engine ran
    // out of memory — surface something a person can actually act on
    // instead of the C++ allocator's own error text.
    const message = /bad_alloc|out of memory/i.test(raw)
      ? "Ran out of memory processing this frame — try Basic mode, or a lower resolution/shorter clip."
      : raw;
    post({ type: "error", message });
  }
};
