/**
 * audioExtraction — decodes a video clip's own embedded audio track into a
 * mono, 16kHz Float32Array: the exact format Whisper (via
 * @huggingface/transformers) expects when given a raw array directly.
 * Passing a Float32Array skips the library's own resampling path entirely
 * (see its prepareAudios/read_audio — a Float32Array is used as-is), so
 * getting the sample rate right here is on us.
 *
 * Only the clip's own trimmed span (`startTime`..`endTime` into the SOURCE
 * file) is decoded — same range removeClipBackground uses — so a caption
 * generated for a trimmed or split clip lines up with what's actually
 * playing, not the whole original source file.
 */
import { ClipDetails } from "../types/types";

export const WHISPER_SAMPLE_RATE = 16000;

export async function extractClipAudio(clip: ClipDetails): Promise<Float32Array> {
  const res = await fetch(clip.src);
  const arrayBuffer = await res.arrayBuffer();

  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error("This clip doesn't have any audio to transcribe.");
  } finally {
    void audioCtx.close();
  }

  const srcStart = Math.max(0, clip.startTime ?? 0);
  const srcEnd = Math.min(decoded.duration, clip.endTime ?? decoded.duration);
  const span = Math.max(0, srcEnd - srcStart);
  if (span <= 0) return new Float32Array(0);

  // Mix down to mono at the ORIGINAL sample rate first, trimmed to the
  // clip's own span — resampling a shorter buffer afterward is cheaper than
  // resampling the whole source file up front.
  const trimmedLength = Math.round(span * decoded.sampleRate);
  const offset = Math.round(srcStart * decoded.sampleRate);
  const mono = new Float32Array(trimmedLength);
  const channels = decoded.numberOfChannels;
  for (let ch = 0; ch < channels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < trimmedLength; i++) {
      mono[i] += (data[offset + i] ?? 0) / channels;
    }
  }

  if (Math.round(decoded.sampleRate) === WHISPER_SAMPLE_RATE) return mono;

  // Resample to 16kHz via an OfflineAudioContext (browser-native, good
  // quality, no extra dependency).
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil((trimmedLength * WHISPER_SAMPLE_RATE) / decoded.sampleRate),
    WHISPER_SAMPLE_RATE,
  );
  const buffer = offlineCtx.createBuffer(1, trimmedLength, decoded.sampleRate);
  buffer.copyToChannel(mono, 0);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}
