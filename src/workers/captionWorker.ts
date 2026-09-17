/**
 * captionWorker — runs Whisper (via @huggingface/transformers, WASM/CPU
 * backend) off the main thread, so transcribing a clip's audio never
 * freezes the editor UI. Model download + inference both happen here;
 * transformers.js caches the downloaded model in the browser's Cache API,
 * so the download is a one-time cost per device.
 *
 * Protocol (see useCaptionGenerator.ts for the sending side):
 *   → {type:"transcribe", audio: ArrayBuffer (transferred, raw Float32 samples @ 16kHz mono)}
 *   ← {type:"progress", fraction, label}
 *   ← {type:"result", chunks: {text, start, end}[]}   (start/end in seconds, relative to the audio given)
 *   ← {type:"error", message}
 */
import { pipeline, AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

const post: (message: unknown, transfer?: Transferable[]) => void = postMessage as never;

const MODEL_ID = "Xenova/whisper-tiny.en";
const WHISPER_SAMPLE_RATE = 16000;

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

interface ProgressLike {
  status: string;
  progress?: number;
}

function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = pipeline("automatic-speech-recognition", MODEL_ID, {
      dtype: "q8",
      progress_callback: (info: ProgressLike) => {
        if (info.status === "progress" && typeof info.progress === "number") {
          post({ type: "progress", fraction: Math.min(0.9, info.progress / 100), label: `Downloading speech model… ${Math.round(info.progress)}%` });
        } else if (info.status === "initiate" || info.status === "download") {
          post({ type: "progress", fraction: 0, label: "Preparing speech model…" });
        }
      },
    });
  }
  return transcriberPromise;
}

// Global safety net — same rationale as encodeWorker.ts: without this, a
// throw outside the try/catch below (e.g. during model init) is a silent,
// undiagnosable worker death instead of a real error reaching the panel.
self.addEventListener("error", (event) => {
  post({ type: "error", message: (event as ErrorEvent).message ?? "Caption worker crashed." });
});

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: string; audio: ArrayBuffer };
  if (msg?.type !== "transcribe") return;

  try {
    const audio = new Float32Array(msg.audio);
    if (audio.length === 0) throw new Error("This clip doesn't have any audio to transcribe.");
    const totalDuration = audio.length / WHISPER_SAMPLE_RATE;

    post({ type: "progress", fraction: 0, label: "Loading speech model…" });
    const transcriber = await getTranscriber();

    post({ type: "progress", fraction: 0.9, label: "Listening…" });
    const output = await transcriber(audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const result = Array.isArray(output) ? output[0] : output;
    const rawChunks = (result?.chunks ?? []) as { text: string; timestamp: [number, number | null] }[];
    const chunks = rawChunks
      .map((c) => ({
        text: String(c.text ?? "").trim(),
        start: c.timestamp?.[0] ?? 0,
        // Whisper sometimes leaves the very last chunk's end timestamp null
        // (it never emitted a closing token) — fall back to the audio's own
        // length rather than leave the caption with an undefined end.
        end: c.timestamp?.[1] ?? totalDuration,
      }))
      .filter((c) => c.text.length > 0);

    post({ type: "progress", fraction: 1, label: "Done" });
    post({ type: "result", chunks });
  } catch (err) {
    post({ type: "error", message: (err as Error)?.message ?? "Transcription failed." });
  }
};
