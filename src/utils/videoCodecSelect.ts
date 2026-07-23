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

  for (const level of AVC_LEVELS) {
    const codec = `avc1.4200${level}`;
    try {
      const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps });
      if (support.supported) {
        return { codec, muxerCodec: "avc", width, height, bitrate, framerate: fps };
      }
    } catch {
      // Some browsers throw instead of returning {supported:false} for a
      // malformed/unsupported codec string — treat the same as unsupported.
    }
  }

  // No AVC level worked for this resolution (unusual) — try VP9, which
  // doesn't have the same fixed level/resolution table.
  try {
    const codec = "vp09.00.10.08";
    const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps });
    if (support.supported) return { codec, muxerCodec: "vp9", width, height, bitrate, framerate: fps };
  } catch {
    // fall through to null
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
