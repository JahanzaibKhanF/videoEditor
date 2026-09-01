/**
 * videoCodecSelect — the ONE place that decides which WebCodecs video codec
 * config to use, and the ONE place that asks the browser whether it's
 * actually supported.
 *
 * This exists because of a real bug: the export pipeline used to hardcode
 * `avc1.42001f` (H.264 Baseline, level 3.1) everywhere — both in the
 * "is WebCodecs supported at all" probe (tested against a fixed 1280×720
 * sample) AND in the actual encoder configuration. Level 3.1 caps out at a
 * 921,600-pixel coded area (~1280×720). A 1080×1080 project (1,166,400
 * pixels) is well within what real hardware encoders support, but that
 * hardcoded level string made VideoEncoder.configure() reject it outright.
 *
 * Fix: actually query VideoEncoder.isConfigSupported() for the PROJECT'S
 * REAL width/height — not a fixed sample — trying AVC levels from low to
 * high (lower levels are more broadly hardware-accelerated where they DO
 * fit, so prefer the lowest level that actually covers the resolution),
 * and falling back to VP9 if no AVC level works. If nothing is supported,
 * return null so the caller can fall back to the FFmpeg pipeline — this is
 * the "real check" rather than a guess, and it's used for BOTH the
 *"should we even attempt WebCodecs" decision and the actual encoder setup,
 * so those two can never disagree with each other again.
 */

export interface PickedVideoConfig {
  codec: string;
  muxerCodec: "avc" | "vp9";
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
  /**
   * "prefer-software" (see the crash-fix note above pickVideoEncoderConfig)
   * — carried through from whichever config actually passed
   * isConfigSupported, so the real encoder configure() call in
   * encodeWorker.ts always matches exactly what was verified. Optional
   * only because older cached callers/tests may not set it.
   */
  hardwareAcceleration?: "no-preference" | "prefer-hardware" | "prefer-software";
}

// AVC (H.264) level_idc values in hex, ascending — Baseline profile (0x42).
// Roughly: 3.0/3.1 ≈ 720p ceiling, 3.2/4.0/4.1 ≈ 1080p–1440p ceiling,
// 4.2/5.0 ≈ higher, 5.1/5.2 ≈ 4K. Actual ceilings are enforced by the
// browser via isConfigSupported, not assumed here — this list is just the
// order candidates are tried in.
const AVC_LEVELS = ["1e", "1f", "20", "28", "29", "2a", "32", "33", "34"];

function estimateBitrate(width: number, height: number): number {
  // ~0.06 bits/pixel/frame at a nominal 30fps-equivalent quality target,
  // clamped to a sane range so tiny or huge projects both get something
  // reasonable rather than a pathological bitrate.
  return Math.round(Math.min(20_000_000, Math.max(2_500_000, width * height * 6)));
}

export async function pickVideoEncoderConfig(
  width: number, height: number, fps: number,
): Promise<PickedVideoConfig | null> {
  if (typeof VideoEncoder === "undefined") return null;
  const bitrate = estimateBitrate(width, height);

  // CRASH FIX: on some platforms — Linux Chrome in particular, this has
  // been the case for the entire lifetime of this app's exports, not
  // something that regressed — a GPU-accelerated VideoEncoder can pass
  // `isConfigSupported` (the check genuinely reports it CAN encode this
  // config) and then bring down the browser's entire media/GPU process the
  // moment it's actually handed a real frame to encode. That failure
  // happens below the level any JS try/catch, worker error listener, or
  // encoder `error` callback can observe — there's no exception to catch,
  // the process is just gone — which is exactly why every export failure
  // on an affected machine has looked identical ("Encode worker crashed.",
  // reported via the bare `Worker.onerror`) no matter what varies about the
  // project: the crash isn't happening in any code this app controls.
  //
  // `hardwareAcceleration: "prefer-software"` is a real, standard
  // WebCodecs hint (part of the spec — not a workaround hack) that steers
  // the browser toward its software encoder instead. Software encoding is
  // slower, but it runs as regular code in the same sandboxed process
  // instead of talking to (often poorly-supported-on-Linux) native
  // GPU/VAAPI encoder drivers, so it doesn't have this failure mode.
  // Checked and used FIRST, falling through to "no-preference" (the
  // previous, hardware-eligible behavior) only if software specifically
  // isn't available for this config — this keeps hardware's speed
  // advantage on every platform where software isn't the only stable
  // option, while making the common Linux crash avoidable without the
  // person needing to know any of this.
  const hwPrefs: Array<"prefer-software" | "no-preference"> = ["prefer-software", "no-preference"];

  for (const hardwareAcceleration of hwPrefs) {
    for (const level of AVC_LEVELS) {
      const codec = `avc1.4200${level}`;
      try {
        const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps, hardwareAcceleration });
        if (support.supported) {
          return { codec, muxerCodec: "avc", width, height, bitrate, framerate: fps, hardwareAcceleration };
        }
      } catch {
        // Some browsers throw instead of returning {supported:false} for a
        // malformed/unsupported codec string — treat the same as unsupported.
      }
    }
  }

  // No AVC level worked for this resolution (unusual) — try VP9, which
  // doesn't have the same fixed level/resolution table. Same
  // software-first order and same reasoning as above.
  for (const hardwareAcceleration of hwPrefs) {
    try {
      const codec = "vp09.00.10.08";
      const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps, hardwareAcceleration });
      if (support.supported) return { codec, muxerCodec: "vp9", width, height, bitrate, framerate: fps, hardwareAcceleration };
    } catch {
      // fall through
    }
  }

  return null;
}

export async function isAudioEncodingSupported(sampleRate: number, numberOfChannels: number): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2", sampleRate, numberOfChannels, bitrate: 128_000,
    });
    return !!support.supported;
  } catch {
    return false;
  }
}