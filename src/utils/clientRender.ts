import { fetchFile } from "@ffmpeg/util";
import { v4 as uuidv4 } from "uuid";
import { getFFmpeg, subscribeEngineLogs } from "./ffmpegEngine";
import { saveRecentVideo } from "./recentVideosStore";
import {
  AudioDetails, BlurDetails, ClipDetails,
  ImageDetails, RenderJob, TextDetails, TransitionFrame,
} from "../types/types";

/**
 * clientRender — 100% in-browser replacement for the old `sendToServer`.
 *
 * Same call signature & `onJobUpdate` progress-callback contract as before, so
 * RenderButton.tsx / RenderingLoader.tsx needed almost no changes — only the
 * transport changed (FFmpeg WASM instead of an HTTP upload + SSE stream).
 *
 * High level pipeline built with a single ffmpeg `-filter_complex` graph:
 *   1. Each video clip is trimmed to its in/out points, scaled+positioned
 *      into the output canvas, and concatenated (with an optional 0.5s
 *      cross-dissolve when clip.transition !== "none").
 *   2. Per-clip audio is mixed in, honoring per-clip volume/mute (AudioDetails).
 *   3. Image overlays are composited on top with time-windowed `enable`.
 *   4. Text overlays are drawn with `drawtext`, time-windowed.
 *   5. Blur regions are blurred-and-composited back, time-windowed.
 *   6. Encoded to H.264/AAC mp4.
 */

const TRANSITION_DURATION = 0.5;

// FFmpeg's `xfade` filter only accepts a fixed, specific set of transition
// names (see https://ffmpeg.org/ffmpeg-filters.html#xfade) — none of which
// match this app's internal camelCase transition keys (see
// transitionOtionsConstants.ts). Passing an unmapped key straight through
// (e.g. "wipeLeftToRight", "dipToBlack") makes FFmpeg reject the filter,
// so every transition except one coincidentally named "fade" would fail
// silently or break the export. This maps every internal key to the
// closest valid xfade name.
const FFMPEG_XFADE_MAP: Record<string, string> = {
  crossDissolve: "fade",
  dipToBlack: "fadeblack",
  dipToWhite: "fadewhite",
  filmDissolve: "dissolve",
  wipeLeftToRight: "wiperight",
  wipeTopToBottom: "wipedown",
  slideIn: "slideleft",
  push: "coverleft",
  zoom: "zoomin",
  morphCut: "fade",
  fadeIn: "fade",
  slideUp: "slideup",
  slideRight: "slideright",
  flipIn: "distance",
  blurIn: "hblur",
  scaleIn: "zoomin",
};
const FS_OUTPUT = "output.mp4";
const FS_FONT = "Roboto.ttf";

/**
 * Font for drawtext. We fetch and write this into ffmpeg's virtual FS once
 * per render. Without `fontfile=`, ffmpeg's WASM build has no system font
 * path and silently crashes with "No font filename provided".
 * Roboto is MIT-licensed and served directly by Google Fonts CDN.
 */
const FONT_URL = "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf";

/**
 * canPassThrough — true when the timeline is a single unmodified clip that
 * can be served directly as-is without running FFmpeg at all.
 *
 * Conditions (ALL must hold):
 *  - exactly 1 clip
 *  - no text, blur, or image overlays
 *  - no transitions
 *  - clip covers its full source duration (no in/out trim)
 *  - output dimensions match the source (no crop/resize)
 */
function canPassThrough(
  clips: ClipDetails[],
  texts: TextDetails[],
  blurs: BlurDetails[],
  images: ImageDetails[],
  containerDimensions: { width: number; height: number },
  primaryDimensions: { width: number; height: number },
): boolean {
  if (clips.length !== 1) return false;
  if (texts.length > 0 || blurs.length > 0 || images.length > 0) return false;
  const clip = clips[0];
  if (clip.transition && clip.transition !== "none") return false;
  const start = clip.startTime ?? 0;
  const end = clip.endTime ?? clip.duration ?? 0;
  const full = clip.duration ?? 0;
  if (start > 0.05 || Math.abs(end - full) > 0.05) return false;
  const srcW = primaryDimensions.width;
  const srcH = primaryDimensions.height;
  if (srcW && srcH && (Math.abs(containerDimensions.width - srcW) > 4 || Math.abs(containerDimensions.height - srcH) > 4)) return false;
  return true;
}

// Job cancellation now lives in a shared registry (renderJobRegistry.ts) so
// both this FFmpeg pipeline and webCodecsRender.ts share one cancel button.
import { registerJob, isJobCancelled, unregisterJob } from "./renderJobRegistry";
export { cancelRenderJob } from "./renderJobRegistry";

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

/**
 * convertToFFmpegColor — converts any CSS color string to a value safe for
 * FFmpeg's drawtext `fontcolor` / `boxcolor` arguments.
 *
 * THE BUG IT FIXES:
 *   FFmpeg's filter argument parser splits on commas, so passing
 *   `fontcolor=rgba(255, 255, 255, 1)` makes it see FOUR separate tokens
 *   and crashes: "Cannot find color 'rgba(255'".
 *
 * STRATEGY:
 *   • Named CSS colors  → returned as-is      e.g. "white", "black"
 *   • #rrggbb / #rgb    → "0xRRGGBB"          (FFmpeg hex format)
 *   • rgb(r, g, b)      → "0xRRGGBB"
 *   • rgba(r, g, b, a)  → "0xRRGGBB"  +  alpha is returned via
 *                         the second tuple value so callers can pass it
 *                         as a separate `alpha=VALUE` argument instead of
 *                         embedding it inside the color string.
 *
 * @returns [ffmpegColor, alpha01]
 *   ffmpegColor — safe string for fontcolor= / boxcolor=
 *   alpha01     — float 0–1 (1 = fully opaque); caller applies as alpha=
 */
function convertToFFmpegColor(raw: string): [string, number] {
  if (!raw) return ["white", 1];
  const s = raw.trim();

  // ── rgba(r, g, b, a) ───────────────────────────────────────────────
  const rgbaMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    const a = rgbaMatch[4] !== undefined ? Math.min(1, Math.max(0, parseFloat(rgbaMatch[4]))) : 1;
    const hex = `0x${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    return [hex, a];
  }

  // ── #rgb shorthand ──────────────────────────────────────────────────
  const rgb3Match = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (rgb3Match) {
    const [, r, g, b] = rgb3Match;
    return [`0x${r}${r}${g}${g}${b}${b}`.toLowerCase(), 1];
  }

  // ── #rrggbb / #rrggbbaa ─────────────────────────────────────────────
  const rgb6Match = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (rgb6Match) {
    const a = rgb6Match[2] ? parseInt(rgb6Match[2], 16) / 255 : 1;
    return [`0x${rgb6Match[1].toLowerCase()}`, a];
  }

  // ── Named color ─────────────────────────────────────────────────────
  // Safeguard: strip any remaining commas/parens that would break the parser
  const safe = s.replace(/[(),\s]/g, "");
  return [safe || "white", 1];
}

/**
 * finalizeFFmpegColor — last-line-of-defense wrapper around
 * convertToFFmpegColor(). Guarantees the string handed to fontcolor=/
 * boxcolor= can NEVER contain a comma, paren, or space — even if a
 * future color format slips past the parsers above. If it ever has to
 * actually strip something, that means convertToFFmpegColor missed a
 * case, so we log loudly: seeing this warning in the console is the
 * single clearest signal that this exact file/build is running and
 * that there's a genuinely new color-format bug to fix (as opposed to
 * a stale cached build serving old code).
 */
function finalizeFFmpegColor(raw: string): [string, number] {
  const [color, alpha] = convertToFFmpegColor(raw);
  if (/[(),\s]/.test(color)) {
    console.error(
      `[clientRender] convertToFFmpegColor produced an unsafe value "${color}" from input "${raw}". ` +
      `Stripping unsafe characters as a fallback — please report this input so the sanitizer can handle it directly.`
    );
    return [color.replace(/[(),\s]/g, "") || "white", alpha];
  }
  return [color, alpha];
}

/**
 * probeHasAudioTrack — detects whether a file written into ffmpeg's virtual
 * FS actually contains an audio stream. Many exported/recorded videos (e.g.
 * screen recordings, muted captures) have video-only containers; blindly
 * referencing `[idx:a]` in a filtergraph for such a file is exactly what
 * caused: "Stream specifier ':a' ... matches no streams" → Aborted().
 *
 * We run a throwaway `ffmpeg -i <file>` (no output — it always "fails", but
 * FFmpeg prints full stream metadata to stderr/log before failing) and
 * inspect the captured log lines for an "Audio:" stream entry.
 */
async function probeHasAudioTrack(ffmpeg: Awaited<ReturnType<typeof getFFmpeg>>, fsName: string): Promise<boolean> {
  const lines: string[] = [];
  const unsubscribe = subscribeEngineLogs((message) => lines.push(message));
  try {
    await ffmpeg.exec(["-i", fsName]);
  } catch {
    // Expected: `-i` with no output target always exits non-zero. We only care about the log lines it printed first.
  } finally {
    unsubscribe();
  }
  return lines.some(l => /^Stream #\d+:\d+/.test(l.trim()) && l.includes("Audio:"));
}

export async function clientRender(
  videos: { video: File; name: string }[],
  _mediaPath: string,
  _primaryVideoDimensions: { width: number; height: number },
  containerDimensions: { width: number; height: number },
  textsDetails: TextDetails[],
  blursDetails: BlurDetails[],
  imagesDetails: ImageDetails[],
  clipsDetails: ClipDetails[],
  audioDetails: AudioDetails[],
  totalTime: number,
  fps: number | null,
  _transitionsFrames: TransitionFrame[],
  onJobUpdate: (job: Partial<RenderJob> & { jobId: string }) => void,
): Promise<string> {
  console.log("[clientRender] engine build: color-sanitizer-hardened-2026-07-06");
  const jobId = uuidv4();
  const videoName = videos[0]?.video.name ?? "export";
  registerJob(jobId);

  const outW = Math.max(2, Math.round(containerDimensions.width || 1280));
  const outH = Math.max(2, Math.round(containerDimensions.height || 720));
  const outFps = Math.round(fps || 30);

  // ── SMART PASS-THROUGH — zero FFmpeg, instant export ─────────────────
  // If the project is a single unmodified clip with no overlays, no trim,
  // and no aspect-ratio crop, we skip the entire WASM pipeline and hand the
  // original File straight to the download URL. This makes simple exports
  // instant regardless of file size or device speed.
  if (canPassThrough(clipsDetails, textsDetails, blursDetails, imagesDetails, containerDimensions, _primaryVideoDimensions)) {
    const sourceFile = videos.find(v => v.name === clipsDetails[0].name)?.video;
    if (sourceFile) {
      const videoUrl = URL.createObjectURL(sourceFile);
      onJobUpdate({ jobId, processName: "Loading engine…", progress: 0, logs: [], cancelled: false, name: videoName });
      await saveRecentVideo({ name: sourceFile.name, blob: sourceFile, mimeType: sourceFile.type || "video/mp4", thumbnail: null, sizeBytes: sourceFile.size });
      onJobUpdate({ jobId, processName: "Completed", progress: 100, logs: ["Pass-through export (no processing needed)."], videoUrl });
      unregisterJob(jobId);
      return jobId;
    }
  }

  try {
    const ffmpeg = await getFFmpeg();
    if (isJobCancelled(jobId)) throw new Error("cancelled");

    const logs: string[] = [];
    const unsubscribeLogs = subscribeEngineLogs((message) => {
      logs.push(message);
      if (logs.length > 200) logs.shift();
    });
    const progressHandler = ({ progress }: { progress: number }) => {
      if (isJobCancelled(jobId)) return;
      const pct = Math.min(99, Math.max(5, Math.round(progress * 100)));
      onJobUpdate({ jobId, processName: "Rendering…", progress: pct, logs: logs.slice(-20) });
    };
    ffmpeg.on("progress", progressHandler);

    try {
      onJobUpdate({ jobId, processName: "Loading assets…", progress: 2, logs: [] });

      // ── Load font for drawtext — without an explicit fontfile the WASM
      // build has no system font path and crashes: "No font filename provided"
      if (textsDetails.length > 0) {
        onJobUpdate({ jobId, processName: "Loading font…", progress: 3, logs: [] });
        try {
          const fontResp = await fetch(FONT_URL);
          if (!fontResp.ok) throw new Error(`Font fetch HTTP ${fontResp.status}`);
          const fontBuf = await fontResp.arrayBuffer();
          await ffmpeg.writeFile(FS_FONT, new Uint8Array(fontBuf));
          console.log("[clientRender] Font written to virtual FS:", FS_FONT);
        } catch (fontErr) {
          // Non-fatal — export continues but text may not render on every
          // ffmpeg WASM build. Log clearly so it is never silent.
          console.warn("[clientRender] Could not load font file, drawtext may fail:", fontErr);
        }
      }

      const sortedClips = [...clipsDetails].sort((a, b) => (a.startPosition ?? 0) - (b.startPosition ?? 0));
      if (sortedClips.length === 0) throw new Error("No clips to render.");

      // ── Guard against the #1 cause of a silent freeze: building a
      // filter_complex graph that references inputs which were never
      // written to the virtual filesystem (e.g. clip.name doesn't match
      // any entry in `videos`). ffmpeg.exec() will hang/spin instead of
      // erroring cleanly if the graph is malformed, so we validate first. ──
      const missingSources = sortedClips
        .filter(c => !videos.some(v => v.name === c.name))
        .map(c => c.name ?? c.id);
      if (missingSources.length > 0) {
        throw new Error(`Missing source file(s) for clip(s): ${missingSources.join(", ")}. Re-import the original video(s) before exporting.`);
      }
      const zeroDurationClips = sortedClips.filter(c => {
        const start = c.startTime ?? 0;
        const end = c.endTime ?? c.duration ?? 0;
        return end - start <= 0;
      });
      if (zeroDurationClips.length > 0) {
        throw new Error(`Clip "${zeroDurationClips[0].name}" has a zero/negative duration trim — check its in/out points.`);
      }
      if (!containerDimensions.width || !containerDimensions.height) {
        throw new Error("Output dimensions are 0×0 — open Composition Settings and set an aspect ratio before exporting.");
      }

      // ── Write every unique source video into ffmpeg's virtual FS ──────────
      const fileForClip = (clip: ClipDetails) => videos.find(v => v.name === clip.name)?.video;
      const writtenInputs = new Map<string, string>(); // videoName -> ffmpeg input filename
      let inputIdx = 0;
      for (const clip of sortedClips) {
        if (writtenInputs.has(clip.name ?? clip.video)) continue;
        const file = fileForClip(clip);
        if (!file) continue;
        const fsName = `in${inputIdx}.${(file.name.split(".").pop() || "mp4")}`;
        await ffmpeg.writeFile(fsName, await fetchFile(file));
        writtenInputs.set(clip.name ?? clip.video, fsName);
        inputIdx++;
      }
      if (isJobCancelled(jobId)) throw new Error("cancelled");

      // ── Probe each unique source for an actual audio stream ───────────
      // (prevents the "[idx:a] matches no streams" Aborted() crash on
      // video-only sources such as silent screen recordings.)
      onJobUpdate({ jobId, processName: "Checking audio tracks…", progress: 4, logs: [] });
      const inputHasAudio = new Map<string, boolean>(); // fsName -> has audio track
      for (const fsName of writtenInputs.values()) {
        inputHasAudio.set(fsName, await probeHasAudioTrack(ffmpeg, fsName));
      }
      if (isJobCancelled(jobId)) throw new Error("cancelled");

      // ── Write overlay images ───────────────────────────────────────────
      const imageInputNames = new Map<string, string>(); // ImageDetails.id -> fs name
      for (let i = 0; i < imagesDetails.length; i++) {
        const img = imagesDetails[i];
        if (!img.image) continue;
        const ext = img.image.name.split(".").pop() || "png";
        const fsName = `img${i}.${ext}`;
        await ffmpeg.writeFile(fsName, await fetchFile(img.image));
        imageInputNames.set(img.id, fsName);
      }
      if (isJobCancelled(jobId)) throw new Error("cancelled");

      onJobUpdate({ jobId, processName: "Building timeline…", progress: 6, logs: [] });

      // ── Build ffmpeg input args ────────────────────────────────────────
      const inputArgs: string[] = [];
      const inputFsToIndex = new Map<string, number>();
      let argIdx = 0;
      for (const fsName of writtenInputs.values()) {
        inputArgs.push("-i", fsName);
        inputFsToIndex.set(fsName, argIdx++);
      }
      const imageIdToIndex = new Map<string, number>();
      for (const [imgId, fsName] of imageInputNames.entries()) {
        inputArgs.push("-i", fsName);
        imageIdToIndex.set(imgId, argIdx++);
      }

      // ── Build per-clip trim+scale+position video segments ─────────────
      const filterParts: string[] = [];
      const segLabels: string[] = [];
      const audioLabels: string[] = [];

      sortedClips.forEach((clip, i) => {
        const fsName = writtenInputs.get(clip.name ?? clip.video);
        if (fsName === undefined) return;
        const srcIdx = inputFsToIndex.get(fsName)!;
        const start = Math.max(0, clip.startTime ?? 0);
        const end = clip.endTime ?? clip.duration ?? start + 1;
        const dur = Math.max(0.04, end - start);

        const cw = Math.max(2, Math.round(clip.width || outW));
        const ch = Math.max(2, Math.round(clip.height || outH));
        const scale = clip.scale || 1;
        const x = Math.round(clip.x || 0);
        const y = Math.round(clip.y || 0);

        const vLabel = `v${i}`;
        // Trim -> scale to clip's rendered size*scale -> place onto a
        // container-sized canvas at (x,y) -> normalize fps/timestamps.
        filterParts.push(
          `[${srcIdx}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,` +
          `scale=${Math.round(cw * scale)}:${Math.round(ch * scale)},` +
          `setsar=1[${vLabel}_scaled]`
        );
        filterParts.push(
          `color=size=${outW}x${outH}:color=black:duration=${dur}:rate=${outFps}[${vLabel}_bg]`
        );
        filterParts.push(
          `[${vLabel}_bg][${vLabel}_scaled]overlay=${x}:${y}:shortest=1,fps=${outFps}[${vLabel}]`
        );
        segLabels.push(`${vLabel}`);

        // Per-clip audio (honor AudioDetails volume/mute keyed by clipId) —
        // only if this source actually has an audio track at all.
        const audioMeta = audioDetails.find(a => a.clipId === clip.id);
        const muted = clip.muted || audioMeta?.muted;
        if (!muted && inputHasAudio.get(fsName)) {
          const vol = audioMeta?.volume ?? 1;
          const aLabel = `a${i}`;
          filterParts.push(
            `[${srcIdx}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,volume=${vol}[${aLabel}]`
          );
          audioLabels.push(aLabel);
        }
      });
      if (isJobCancelled(jobId)) throw new Error("cancelled");

      // ── Concat video segments (cross-dissolve if clip.transition !== "none") ──
      let vChain: string;
      if (segLabels.length === 1) {
        vChain = segLabels[0];
      } else {
        // Simple sequential xfade chain. Clips with transition !== "none"
        // cross-dissolve into the *next* clip; others hard-cut.
        let cumulative = Math.max(0.04, (sortedClips[0].endTime ?? sortedClips[0].duration ?? 1) - (sortedClips[0].startTime ?? 0));
        let prevLabel = segLabels[0];

        for (let i = 1; i < segLabels.length; i++) {
          const clip = sortedClips[i];
          const dur = Math.max(0.04, (clip.endTime ?? clip.duration ?? 1) - (clip.startTime ?? 0));
          const useTransition = !!(clip.transition && clip.transition !== "none");
          const xfDur = useTransition ? Math.min(TRANSITION_DURATION, dur, cumulative) : 0.001;
          const offset = Math.max(0, cumulative - xfDur);
          const outLabel = `vx${i}`;
          const xfadeType = useTransition ? (FFMPEG_XFADE_MAP[clip.transition!] ?? "fade") : "fade";
          filterParts.push(
            `[${prevLabel}][${segLabels[i]}]xfade=transition=${xfadeType}:duration=${xfDur}:offset=${offset.toFixed(3)}[${outLabel}]`
          );
          prevLabel = outLabel;
          cumulative = offset + dur; // approximate; xfade overlaps the tail
        }
        vChain = prevLabel;
      }

      // ── Mix audio ───────────────────────────────────────────────────
      let aChain: string | null = null;
      if (audioLabels.length > 0) {
        if (audioLabels.length === 1) {
          aChain = audioLabels[0];
        } else {
          filterParts.push(`${audioLabels.map(l => `[${l}]`).join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0[amixed]`);
          aChain = "amixed";
        }
      }

      // ── Overlay images (time-windowed) ─────────────────────────────
      let lastV = vChain;
      imagesDetails.forEach((img, i) => {
        const srcIdx = imageIdToIndex.get(img.id);
        if (srcIdx === undefined) return;
        const w = Math.round((img.width || 100) * (img.scaleX || 1));
        const h = Math.round((img.height || 100) * (img.scaleY || 1));
        const [, imgAlpha] = convertToFFmpegColor("rgba(255,255,255,1)"); // white base
        const opacity = Math.min(1, Math.max(0, (img.opacity ?? 1) * imgAlpha));
        const scaledLabel = `imgscaled${i}`;
        filterParts.push(
          `[${srcIdx}:v]scale=${w}:${h},format=rgba,colorchannelmixer=aa=${opacity}[${scaledLabel}]`
        );
        const outLabel = `vimg${i}`;
        filterParts.push(
          `[${lastV}][${scaledLabel}]overlay=${Math.round(img.imageX)}:${Math.round(img.imageY)}:enable='between(t,${img.startTime},${img.endTime})'[${outLabel}]`
        );
        lastV = outLabel;
      });

      // ── Blur regions (time-windowed) ────────────────────────────────
      blursDetails.forEach((b: BlurDetails, i: number) => {
        const bw = Math.max(2, Math.round(b.width));
        const bh = Math.max(2, Math.round(b.height));
        const bx = Math.round(b.x);
        const by = Math.round(b.y);
        const cropLabel = `blurcrop${i}`;
        const blurLabel = `blurred${i}`;
        const outLabel = `vblur${i}`;
        filterParts.push(`[${lastV}]crop=${bw}:${bh}:${bx}:${by}[${cropLabel}]`);
        filterParts.push(`[${cropLabel}]boxblur=${Math.max(1, Math.round(b.blurAmount || 10))}[${blurLabel}]`);
        filterParts.push(
          `[${lastV}][${blurLabel}]overlay=${bx}:${by}:enable='between(t,${b.startTime},${b.endTime})'[${outLabel}]`
        );
        lastV = outLabel;
      });

      // ── Text overlays — animated via FFmpeg expression strings ─────────
      //
      // WHY THIS APPROACH:
      //   The canvas preview uses AnimationEngine.computeAnimState() which runs
      //   per-frame in JS. For the exported video we replicate the same logic
      //   inside FFmpeg's own expression evaluator (the `t` variable = seconds
      //   since clip start). This means:
      //     • No pre-computed keyframe files needed.
      //     • Animations that rely on spring physics are approximated with
      //       linear/eased interpolations that are visually close enough for
      //       export without needing a full spring solver in FFmpeg expressions.
      //
      // SAFE QUOTING RULE: any dynamic expression passed to drawtext MUST be
      // wrapped in single quotes, e.g. `x='if(lt(t,0.5),0,t*100)'`. Bare
      // numeric strings are fine without quotes. Colons inside expressions
      // must be escaped as `\:` when inside the outer single-quoted block —
      // we handle this by building each argument separately and joining
      // with `:` only at the final step.

      textsDetails.forEach((t: TextDetails, i: number) => {
        const outLabel = `vtext${i}`;
        const st  = t.startTime;
        const et  = t.endTime;
        const dur = Math.max(0.001, et - st);
        const anim = t.animation ?? "none";

        // ── Color: safe hex + separate alpha ───────────────────────────
        const [fgColor, fgAlpha] = finalizeFFmpegColor(t.textColor);
        const [bgColor]          = finalizeFFmpegColor(t.backgroundColor ?? "transparent");
        const baseAlpha          = (t.opacity ?? 1) * fgAlpha;

        // ── Animation expression builder ────────────────────────────────
        // All expressions use `t` (absolute time). We offset to relative
        // time within the overlay via `(t-${st})`. FFmpeg's `between(t,a,b)`
        // already gates rendering; inside that window `t` runs from st→et.
        const rel = `(t-${st})`; // relative seconds inside this overlay

        /**
         * easeOut(rel, dur, from, to) — cubic ease-out mapped to FFmpeg expr.
         * FFmpeg has no built-in easing, so we use: to + (from-to)*(1-t/d)^3
         */
        const easeOut = (from: number, to: number, d = dur) =>
          `(${to}+(${from - to})*pow(1-min(${rel},${d})/${d},3))`;

        /**
         * lerp(from, to, d) — simple linear interpolation
         */
        const lerp = (from: number, to: number, d = dur) =>
          `(${from}+(${to - from})*min(${rel},${d})/${d})`;

        const introD = Math.min(0.6, dur * 0.4);  // intro animation window
        const outroD = Math.min(0.4, dur * 0.3);  // outro animation window
        const outroStart = dur - outroD;

        // Default: static position and full opacity
        let xExpr: string = String(Math.round(t.textX));
        let yExpr: string = String(Math.round(t.textY));
        let alphaExpr: string = String(baseAlpha.toFixed(3));
        let scaleExpr: string | null = null; // null = no scale filter needed

        const x0 = Math.round(t.textX);
        const y0 = Math.round(t.textY);

        // ── Map each AnimationEngine animation to FFmpeg expressions ────
        switch (anim) {
          // ─ Fade ─────────────────────────────────────────────────────
          case "fadeIn":
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          case "fadeOut":
            alphaExpr = `(${baseAlpha}*${lerp(1, 0, dur)})`;
            break;
          case "slowFade":
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, Math.min(1.5, dur))})`;
            break;
          case "flashIn":
          case "flicker":
            // Alternating flash approximated as rapid lerp
            alphaExpr = `(${baseAlpha}*abs(sin(${rel}*PI*3))*${lerp(0.3, 1, introD)})`;
            break;
          case "dotsFade":
            alphaExpr = `(${baseAlpha}*abs(sin(${rel}*PI)))`;
            break;

          // ─ Slide ─────────────────────────────────────────────────────
          case "slideIn":
          case "slideRight":
            xExpr = `${easeOut(x0 - 200, x0, introD)}`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          case "slideInRight":
            xExpr = `${easeOut(x0 + 200, x0, introD)}`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          case "slideInFromLeftFade":
            xExpr = `${easeOut(x0 - 300, x0, introD)}`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          case "slideUp":
          case "revealUp":
          case "staggerIn":
            yExpr = `${easeOut(y0 + 60, y0, introD)}`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          case "slideDown":
          case "slideFromTop":
            yExpr = `${easeOut(y0 - 60, y0, introD)}`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          case "slideFromBottom":
          case "waveIn":
          case "popInUp":
            yExpr = `${easeOut(y0 + 80, y0, introD)}`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          case "popInDown":
            yExpr = `${easeOut(y0 - 30, y0, introD)}`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          case "lightSpeedIn":
            xExpr = `${easeOut(x0 + 600, x0, introD)}`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          case "smoothIn":
            xExpr = `${easeOut(x0 - 50, x0, introD)}`;
            yExpr = `${easeOut(y0 - 20, y0, introD)}`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          case "stackIn":
            yExpr = `${easeOut(y0 - 60, y0, introD)}`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          case "chainReaction":
            yExpr = `${easeOut(y0 - 20, y0, introD)}`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;

          // ─ Outro slides ──────────────────────────────────────────────
          case "fastForwardOut":
            xExpr = `(${x0}+${easeOut(0, 300, outroD)}*max(0,${rel}-${outroStart}))`;
            alphaExpr = `(${baseAlpha}*max(0,${lerp(1, 0, dur)}))`;
            break;
          case "disperse":
            xExpr = `(${x0}+sin(${rel}*2.1)*${lerp(0, 80, dur)})`;
            yExpr = `(${y0}+cos(${rel}*2.1)*${lerp(0, 80, dur)})`;
            alphaExpr = `(${baseAlpha}*${lerp(1, 0, dur)})`;
            break;

          // ─ Zoom / Scale (approximated — drawtext has no native scale;
          //   we adjust fontsize and offset x/y to fake a scale-from-center) ─
          case "zoomIn":
          case "grow":
          case "expand":
          case "bounceIn":
          case "blingIn": {
            // Scale fontsize: fontSize * scale(t)
            // Offset x/y so text stays centred: x - (scaledW - origW) / 2
            const fsSrc = Math.round(t.fontSize);
            const scaleVal = lerp(0.1, 1, introD);
            // NOTE: no literal quote characters here — the drawtext arg
            // builder below (`x='${xExpr}'`) already wraps every x/y
            // expression in single quotes uniformly. Adding them here too
            // produced `x=''(...)''` (an empty quoted string immediately
            // followed by a raw, unquoted expression), which FFmpeg's
            // filtergraph parser can't recover from — this was the actual
            // cause of "No such filter" export failures whenever a
            // zoom/grow/shrink text animation was used.
            xExpr = `(${x0}-(${fsSrc}*${scaleVal}-${fsSrc})*0.3)`;
            yExpr = `(${y0}-(${fsSrc}*${scaleVal}-${fsSrc})*0.3)`;
            scaleExpr = `(${fsSrc}*${scaleVal})`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          }
          case "shrink":
          case "collapse": {
            const fsSrc = Math.round(t.fontSize);
            const scaleVal = lerp(1, 0, dur);
            xExpr = `(${x0}-(${fsSrc}*${scaleVal}-${fsSrc})*0.3)`;
            yExpr = `(${y0}-(${fsSrc}*${scaleVal}-${fsSrc})*0.3)`;
            scaleExpr = `(${fsSrc}*${scaleVal})`;
            alphaExpr = `(${baseAlpha}*${lerp(1, 0, dur)})`;
            break;
          }
          case "targetZoom": {
            const fsSrc = Math.round(t.fontSize);
            const scaleVal = lerp(3, 1, introD);
            scaleExpr = `(${fsSrc}*${scaleVal})`;
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;
          }

          // ─ Blur in/out ───────────────────────────────────────────────
          // drawtext has no blur; approximate by fading from low opacity
          case "blurIn":
          case "glowIn":
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, Math.min(0.8, dur))})`;
            break;

          // ─ Typewriter ────────────────────────────────────────────────
          // Authentic typewriter needs chars; approximate with opacity fade
          case "typewriter":
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, Math.min(1.5, dur))})`;
            break;

          // ─ Pulse / rotation (rotation unsupported in drawtext, fade in) ─
          case "pulse":
            alphaExpr = `(${baseAlpha}*(0.9+0.1*sin(${rel}*PI*2)))`;
            break;
          case "rotateIn":
          case "spinIn":
          case "twirlIn":
          case "jigsawIn":
          case "scaleRotateIn":
          case "flipBounceIn":
          case "loadingSpin":
          case "flipX":
          case "flipY":
          case "foldIn":
          case "maskReveal":
          case "drawIn":
          case "squeezeIn":
          case "mirrorIn":
          case "rewindIn":
          case "stretchOut":
          case "unfoldOut":
          case "explodeOut":
            // Rotation/scaleX unsupported in drawtext: fade as fallback
            alphaExpr = `(${baseAlpha}*${lerp(0, 1, introD)})`;
            break;

          case "none":
          default:
            // Static — no expression needed
            break;
        }

        // ── Build the drawtext argument array ────────────────────────────
        // IMPORTANT: each item here is one colon-delimited argument.
        // Dynamic expressions are already wrapped in single quotes where
        // needed so the FFmpeg tokeniser treats them as single tokens.
        const args: string[] = [
          `fontfile=${FS_FONT}`,
          `text='${escapeDrawtext(t.text)}'`,
          `fontcolor=${fgColor}`,
          `alpha=${alphaExpr.startsWith("(") ? `'${alphaExpr}'` : alphaExpr}`,
          scaleExpr
            ? `fontsize='${scaleExpr}'`
            : `fontsize=${Math.round(t.fontSize)}`,
          `x='${xExpr}'`,
          `y='${yExpr}'`,
          `enable='between(t,${st},${et})'`,
        ];

        if (t.backgroundColor && t.backgroundColor !== "transparent") {
          args.push(`box=1`, `boxcolor=${bgColor}@0.6`, `boxborderw=6`);
        }

        filterParts.push(`[${lastV}]drawtext=${args.join(":")}[${outLabel}]`);
        lastV = outLabel;
      });

      // Always finish on a stable [vfinal] label, whether or not any
      // image/blur/text overlays ran, so the -map below is consistent.
      filterParts.push(`[${lastV}]null[vfinal]`);

      const filterComplex = filterParts.join(";");

      const args = [
        ...inputArgs,
        "-filter_complex", filterComplex,
        "-map", "[vfinal]",
      ];
      if (aChain) args.push("-map", `[${aChain}]`);
      args.push(
        "-r", String(outFps),
        "-c:v", "libx264",
        "-preset", "ultrafast",   // fastest encode — single-threaded WASM benefits more from this than quality presets
        "-tune", "zerolatency",   // reduces buffering/latency in the WASM encoder pipeline
        "-threads", "4",          // hint to the WASM scheduler (may be clamped by the browser)
        "-crf", "26",             // slightly looser quality vs veryfast+23 — still excellent for web
        "-pix_fmt", "yuv420p",
      );
      if (aChain) {
        args.push("-c:a", "aac", "-b:a", "192k");
      } else {
        args.push("-an");
      }
      if (totalTime && totalTime > 0) args.push("-t", String(totalTime));
      args.push("-y", FS_OUTPUT);

      onJobUpdate({ jobId, processName: "Rendering…", progress: 8, logs: [] });

      if (isJobCancelled(jobId)) throw new Error("cancelled");
      await ffmpeg.exec(args);

      if (isJobCancelled(jobId)) throw new Error("cancelled");
      onJobUpdate({ jobId, processName: "Finalizing…", progress: 99, logs: [] });

      const data = await ffmpeg.readFile(FS_OUTPUT);
      const blob = new Blob([data as unknown as BlobPart], { type: "video/mp4" });
      const videoUrl = URL.createObjectURL(blob);

      // Persist into IndexedDB so it survives refresh & shows in Recent Renders.
      await saveRecentVideo({
        name: `exported_${Date.now().toString(16)}.mp4`,
        blob,
        mimeType: "video/mp4",
        thumbnail: null,
        sizeBytes: blob.size,
      });

      // Cleanup virtual FS to free memory for the next render.
      for (const fsName of writtenInputs.values()) {
        try { await ffmpeg.deleteFile(fsName); } catch { /* noop */ }
      }
      for (const fsName of imageInputNames.values()) {
        try { await ffmpeg.deleteFile(fsName); } catch { /* noop */ }
      }
      try { await ffmpeg.deleteFile(FS_OUTPUT); } catch { /* noop */ }
      try { await ffmpeg.deleteFile(FS_FONT); } catch { /* noop */ }

      onJobUpdate({ jobId, processName: "Completed", progress: 100, logs: logs.slice(-20), videoUrl });
    } finally {
      unsubscribeLogs();
      ffmpeg.off("progress", progressHandler);
    }
  } catch (err) {
    const cancelled = isJobCancelled(jobId) || (err instanceof Error && err.message === "cancelled");
    const errorMessage = err instanceof Error ? err.message : String(err);
    // CRITICAL: log every failure loudly. A render that fails silently with
    // nothing in the console is the #1 source of "it just doesn't work" bug
    // reports — never let that happen again.
    if (!cancelled) console.error("[clientRender] Render failed:", err);
    onJobUpdate({
      jobId,
      processName: cancelled ? "Cancelled" : "Failed",
      progress: 0,
      logs: [],
      cancelled,
      error: cancelled ? undefined : errorMessage,
    });
  } finally {
    unregisterJob(jobId);
  }

  return jobId;
}
