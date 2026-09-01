/**
 * compositeFrame — draws one fully-composited frame (video + text + images +
 * blur + transitions + animations) to a given canvas context.
 *
 * This is the single source of truth for "what does frame at time t look
 * like", extracted out of CompositorCanvas so it can be reused exactly as-is
 * by the WebCodecs export pipeline (webCodecsRender.ts) — the export path
 * calls this same function once per output frame against seeked <video>
 * elements, instead of re-implementing compositing a second time. Any
 * future fix to how transitions/text/blur render only has to happen here,
 * not in two places that could drift apart.
 */
import { ClipDetails, TextDetails, ImageDetails, BlurDetails, LayerOrder, ClipEffectDetails } from "../types/types";
import { computeAnimState, computeTransition } from "./AnimationEngine";
import { wrapTextLines } from "./measureText";
import { buildCanvasFilterString } from "./colorAdjustments";

export interface CompositeFrameInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  t: number;
  fps: number;
  clips: ClipDetails[];
  texts: TextDetails[];
  images: ImageDetails[];
  blurs: BlurDetails[];
  clipEffects?: ClipEffectDetails[];
  imageEls: Record<string, HTMLImageElement | null>;
  layerOrder: LayerOrder[];
  /**
   * Given a clip's id (NOT its src — two clips can share the same source
   * file, e.g. one duplicated/blurred as the other's background, and each
   * needs its own independently-seeked drawable), return the
   * <video>/<canvas>/ImageBitmap-like drawable currently seeked to the
   * right frame for that specific clip.
   */
  getVideoDrawable: (clipId: string) => CanvasImageSource | null | undefined;
}

export function compositeFrame(input: CompositeFrameInput) {
  const { ctx, width: w, height: h, t, fps, clips, texts, images, blurs, clipEffects = [], imageEls, layerOrder, getVideoDrawable } = input;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const defaultOrder = ["video", "audio", "image", "text", "blur"];
  const drawOrder = layerOrder.length > 0
    ? [...layerOrder].sort((a, b) => a.zIndex - b.zIndex).map(l => l.type)
    : defaultOrder;

  const clipsSorted = [...clips].sort((a, b) => (a.startPosition ?? 0) - (b.startPosition ?? 0));

  // UNIFIED Z-STACK: video clips, images, text, and blur regions used to
  // each draw as their own separate block (every image always fully above
  // every video clip, every text always above every image, blur always on
  // top of literally everything, only swappable as whole blocks via
  // `layerOrder`). That meant an image could never sit BETWEEN two video
  // tracks, a blur region could never blur just the video underneath it
  // while leaving an image above untouched, etc. They now share one zIndex
  // numeric space (see moveClipToTrack in VideoClipsRangeSlider.tsx,
  // moveImageStack in ImagesRangeSlider.tsx, moveTextStack in
  // TextRangeSlider.tsx, and moveBlurStack in BlurRangeSlider.tsx — all
  // four write into it), and are merged into a single draw pass here, so
  // any layer's zIndex can land it anywhere in the full stack, not just at
  // the front or back of its own type.
  //
  // Note for blur specifically: blur genuinely needs to be drawn in true
  // z-order (not just always-last) because it samples whatever's already
  // been painted to the canvas so far (see drawBlurRegion below) — where it
  // sits in the merged order determines what it actually blurs.
  type MergedLayer =
    | { kind: "video"; z: number; clip: ClipDetails }
    | { kind: "image"; z: number; image: ImageDetails }
    | { kind: "text"; z: number; text: TextDetails }
    | { kind: "blur"; z: number; blur: BlurDetails };

  const activeClips: MergedLayer[] = clipsSorted
    .filter(c => t >= (c.startPosition ?? 0) && t <= (c.endPosition ?? Infinity))
    .map(clip => ({ kind: "video" as const, z: clip.zIndex ?? 0, clip }));
  const imageLayers: MergedLayer[] = images
    .filter(img => t >= img.startTime && t <= img.endTime)
    .map(image => ({ kind: "image" as const, z: image.zIndex ?? 0, image }));
  const textLayers: MergedLayer[] = texts
    .filter(text => t >= text.startTime && t <= text.endTime)
    .map(text => ({ kind: "text" as const, z: text.zIndex ?? 0, text }));
  const blurLayers: MergedLayer[] = blurs
    .filter(blur => t >= blur.startTime && t <= blur.endTime)
    .map(blur => ({ kind: "blur" as const, z: blur.zIndex ?? 0, blur }));

  // HIGHEST zIndex drawn first (furthest back), LOWEST zIndex drawn last
  // (frontmost) — matches "higher in the track/layer list = drawn on top".
  const merged = [...activeClips, ...imageLayers, ...textLayers, ...blurLayers]
    .sort((a, b) => b.z - a.z);

  let mergedDrawn = false;
  for (const layerType of drawOrder) {
    if (layerType === "video" || layerType === "image" || layerType === "text" || layerType === "blur") {
      // Only actually draw once — whichever of these four comes first in
      // drawOrder triggers the single merged pass; the rest are no-ops so
      // nothing draws twice.
      if (mergedDrawn) continue;
      mergedDrawn = true;

      for (const layer of merged) {
        if (layer.kind === "video") drawVideoClip(ctx, layer.clip, clipsSorted, t, fps, w, h, clipEffects, getVideoDrawable);
        else if (layer.kind === "image") drawImageLayer(ctx, layer.image, t, fps, w, h, imageEls);
        else if (layer.kind === "text") drawTextLayer(ctx, layer.text, t, fps, w, h);
        else drawBlurRegion(ctx, layer.blur);
      }
    }
  }
}

// Draws one text layer. Extracted out of the old dedicated "text" block —
// see the merged draw pass above.
function drawTextLayer(ctx: CanvasRenderingContext2D, text: TextDetails, t: number, fps: number, w: number, h: number) {
  const anim = computeAnimState(text.animation, t, text.startTime, text.endTime, fps, text.textX, text.textY, w, h, text.fontSize);
  if (!anim.visible) return;
  const tw2 = text.width ?? 200, th2 = text.height ?? text.fontSize * 1.4;
  ctx.save();
  if (anim.blur > 0) ctx.filter = `blur(${anim.blur}px)`;
  ctx.globalAlpha = Math.max(0, Math.min(1, anim.opacity * (text.opacity ?? 1)));
  ctx.translate(anim.tx + tw2 / 2, anim.ty + th2 / 2);
  ctx.rotate((anim.rotation * Math.PI) / 180);
  ctx.scale(anim.scale * anim.scaleX, anim.scale * anim.scaleY);
  ctx.font = `${text.isItalic ? "italic" : "normal"} ${text.isBold ? "bold" : "normal"} ${text.fontSize}px "${text.fontFamily ?? "Arial"}", sans-serif`;
  ctx.textBaseline = "top";
  if (text.backgroundColor && text.backgroundColor !== "transparent") {
    ctx.fillStyle = text.backgroundColor; ctx.fillRect(-tw2 / 2, -th2 / 2, tw2, th2);
  }
  if (text.shadowColor && text.shadowColor !== "transparent") {
    ctx.shadowColor = text.shadowColor; ctx.shadowBlur = text.shadowBlur ?? 0;
    ctx.shadowOffsetX = text.shadowOffsetX ?? 0; ctx.shadowOffsetY = text.shadowOffsetY ?? 0;
  }
  ctx.fillStyle = text.textColor ?? "#fff";
  drawWrappedText(ctx, text.text, -tw2 / 2, -th2 / 2, tw2, text.fontSize * (text.lineHeight ?? 1.2));
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.filter = "none";
  ctx.restore();
}

// Draws one blur region by sampling whatever has already been painted to
// the canvas at that point in the merged draw pass — this is exactly why
// blur needed to join the unified z-stack instead of always running last:
// its result now genuinely depends on what's already underneath it in the
// merged order, not on the full final frame.
function drawBlurRegion(ctx: CanvasRenderingContext2D, blur: BlurDetails) {
  ctx.save();
  ctx.filter = `blur(${blur.blurAmount ?? 10}px)`;
  try {
    const region = ctx.getImageData(blur.x, blur.y, blur.width, blur.height);
    const off = new OffscreenCanvas(blur.width, blur.height);
    const offCtx = off.getContext("2d")!;
    offCtx.putImageData(region, 0, 0);
    ctx.drawImage(off, blur.x, blur.y);
  } catch {
    ctx.fillStyle = "rgba(100,100,120,0.35)";
    ctx.fillRect(blur.x, blur.y, blur.width, blur.height);
  }
  ctx.filter = "none";
  ctx.restore();
}

// Draws one video clip's current frame (+ its shake/wiggle/overlay effects
// and any outgoing transition). Extracted out of the old dedicated "video"
// block so it can be called from the merged video+image draw pass above in
// whatever z-order that pass decides, instead of always running as one big
// block before/after every image.
function drawVideoClip(
  ctx: CanvasRenderingContext2D,
  clip: ClipDetails,
  clipsSorted: ClipDetails[],
  t: number, fps: number, w: number, h: number,
  clipEffects: ClipEffectDetails[],
  getVideoDrawable: (clipId: string) => CanvasImageSource | null | undefined,
) {
  const vid = getVideoDrawable(clip.id);
  if (!vid) return;
  const cw = (clip.width ?? w) * (clip.scale ?? 1);
  const ch = (clip.height ?? h) * (clip.scale ?? 1);
  const cx0 = clip.x ?? 0, cy0 = clip.y ?? 0;
  const localT = t - (clip.startPosition ?? 0);
  const activeFx = clipEffects.filter(fx => fx.clipId === clip.id && localT >= fx.startTime && localT <= fx.endTime);
  const shakeFx = activeFx.filter(f => f.type === "shake");
  const wiggleFx = activeFx.filter(f => f.type === "wiggle");
  const overlayFx = activeFx.filter(f => f.type === "colorBurst" || f.type === "particles" || f.type === "gradientOverlay");

  ctx.save();
  ctx.filter = buildCanvasFilterString(clip.colorAdjustments);

  // shake/wiggle perturb the draw transform itself, around the clip's own
  // center, before the frame is drawn.
  if (shakeFx.length || wiggleFx.length) {
    const centerX = cx0 + cw / 2, centerY = cy0 + ch / 2;
    ctx.translate(centerX, centerY);
    for (const fx of shakeFx) {
      const amp = 3 + fx.intensity * 16;
      const dx = amp * (Math.sin(localT * 37.1) * 0.5 + Math.sin(localT * 71.3) * 0.3 + Math.sin(localT * 131.7) * 0.2);
      const dy = amp * (Math.cos(localT * 43.9) * 0.5 + Math.cos(localT * 89.1) * 0.3 + Math.cos(localT * 151.3) * 0.2);
      ctx.translate(dx, dy);
    }
    for (const fx of wiggleFx) {
      const angle = fx.intensity * 9 * Math.sin(localT * 6.2);
      ctx.rotate((angle * Math.PI) / 180);
    }
    ctx.translate(-centerX, -centerY);
  }

  try { ctx.drawImage(vid, cx0, cy0, cw, ch); } catch {}
  ctx.filter = "none";

  for (const fx of overlayFx) drawClipEffectOverlay(ctx, fx, localT, cx0, cy0, cw, ch);

  const ci = clipsSorted.findIndex(c => c.id === clip.id);
  if (ci >= 0 && ci < clipsSorted.length - 1 && clip.transition && clip.transition !== "none") {
    const trans = computeTransition(clip.transition, t, clip.endPosition ?? 0, fps);
    if (trans) {
      const nextClip = clipsSorted[ci + 1];
      const nextVid = getVideoDrawable(nextClip?.id ?? "");
      const nextRect = nextClip ? {
        x: nextClip.x ?? 0, y: nextClip.y ?? 0,
        w: (nextClip.width ?? w) * (nextClip.scale ?? 1),
        h: (nextClip.height ?? h) * (nextClip.scale ?? 1),
      } : { x: 0, y: 0, w, h };
      applyTransition(ctx, trans.type, trans.progress, w, h, nextVid, nextRect);
    }
  }
  ctx.restore();
}

// Draws one image overlay. Extracted out of the old dedicated "image" block
// for the same reason as drawVideoClip above — see the merged video+image
// draw pass. Time-range/visibility filtering is already done by the caller.
function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  img: ImageDetails,
  t: number, fps: number, w: number, h: number,
  imageEls: Record<string, HTMLImageElement | null>,
) {
  const el = imageEls[img.id];
  if (!el) return;
  const anim = computeAnimState(img.animation, t, img.startTime, img.endTime, fps, img.imageX, img.imageY, w, h, 100);
  if (!anim.visible) return;
  const dw = img.width * (img.scaleX ?? 1), dh = img.height * (img.scaleY ?? 1);
  ctx.save();
  const colorFilter = buildCanvasFilterString(img.colorAdjustments);
  const blurFilter = anim.blur > 0 ? `blur(${anim.blur}px)` : "";
  const combinedFilter = [colorFilter !== "none" ? colorFilter : "", blurFilter].filter(Boolean).join(" ");
  if (combinedFilter) ctx.filter = combinedFilter;
  ctx.globalAlpha = Math.max(0, Math.min(1, anim.opacity)) * (img.opacity ?? 1);
  ctx.translate(anim.tx + dw / 2, anim.ty + dh / 2);
  ctx.rotate((anim.rotation * Math.PI) / 180);
  ctx.scale(anim.scale * anim.scaleX, anim.scale * anim.scaleY);
  try { ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh); } catch {}
  ctx.filter = "none";
  ctx.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  let h = (hex || "#8B5CFF").replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

/**
 * Draws one overlay-style clip effect (colorBurst / particles /
 * gradientOverlay) on top of an already-drawn clip region. All math is a
 * pure function of `localT` (seconds elapsed since the CLIP itself started,
 * not wall-clock/frame-index) so preview and export produce identical
 * results and looping is automatic — no persisted random seed or animation
 * state needed anywhere.
 */
function drawClipEffectOverlay(
  ctx: CanvasRenderingContext2D,
  fx: ClipEffectDetails,
  localT: number,
  x: number, y: number, cw: number, ch: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, cw, ch);
  ctx.clip();
  const cx = x + cw / 2, cy = y + ch / 2;

  if (fx.type === "colorBurst") {
    const cycle = 0.65;
    const pos = ((localT - fx.startTime) % cycle) / cycle; // 0..1, one pulse per cycle
    const alpha = Math.max(0, 1 - pos) * fx.intensity;
    const radius = pos * Math.max(cw, ch) * 0.85;
    if (alpha > 0.01 && radius > 0) {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, hexToRgba(fx.color, alpha));
      grad.addColorStop(1, hexToRgba(fx.color, 0));
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, cw, ch);
      ctx.globalCompositeOperation = "source-over";
    }
  } else if (fx.type === "particles") {
    const count = Math.round(8 + fx.intensity * 22);
    for (let i = 0; i < count; i++) {
      const seed = i * 97.13;
      const speed = 0.35 + (i % 5) * 0.08;
      const life = ((localT - fx.startTime) * speed + seed) % 1; // 0..1, looping, phase-offset per particle
      const angle = (seed * 12.9898) % (Math.PI * 2);
      const dist = life * Math.max(cw, ch) * 0.42;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist - life * ch * 0.25; // gentle upward drift
      const alpha = Math.sin(life * Math.PI) * fx.intensity; // fades in then out over its life
      const r = 1.5 + (1 - life) * 2.5;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.4, r), 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(fx.color, alpha);
      ctx.fill();
    }
  } else if (fx.type === "gradientOverlay") {
    const sweep = ((localT - fx.startTime) * 0.3) % 1.6 - 0.3; // sweeps across and a bit beyond both edges
    const bandW = cw * 0.55;
    const gx0 = x + sweep * cw - bandW / 2;
    const gx1 = gx0 + bandW;
    const grad = ctx.createLinearGradient(gx0, y, gx1, y + ch);
    grad.addColorStop(0, hexToRgba(fx.color, 0));
    grad.addColorStop(0.5, hexToRgba(fx.color, fx.intensity * 0.55));
    grad.addColorStop(1, hexToRgba(fx.secondaryColor ?? fx.color, 0));
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, cw, ch);
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();
}

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const lines = wrapTextLines(ctx, text, maxW);
  let ly = y;
  for (const line of lines) {
    if (line) ctx.fillText(line, x, ly);
    ly += lineH;
  }
}

export function applyTransition(
  ctx: CanvasRenderingContext2D,
  type: string, progress: number,
  w: number, h: number,
  nextVid: CanvasImageSource | null | undefined,
  nextRect: { x: number; y: number; w: number; h: number },
) {
  // BUG THIS FIXES: drawNext() used to always draw the incoming clip
  // stretched to (0,0,w,h) — the full canvas — ignoring that clip's own
  // configured x/y/width/height/scale entirely. If the incoming clip had
  // been scaled down or repositioned (e.g. a picture-in-picture-style
  // clip, or simply a different zoom level than the outgoing clip), the
  // transition frame would show it stretched to fill the screen and then
  // visibly "snap" to its real size the instant the transition finished.
  // Now it's drawn at its real geometry throughout the whole transition.
  const drawNext = () => {
    if (nextVid) {
      try { ctx.drawImage(nextVid, nextRect.x, nextRect.y, nextRect.w, nextRect.h); } catch {}
    }
  };
  ctx.save();
  switch (type) {
    case "crossDissolve": case "filmDissolve": case "fadeIn":
      ctx.globalAlpha = progress; drawNext(); break;
    case "dipToBlack":
      // Second half: reveal the incoming clip UNDER the fading overlay, or
      // it never appears until the transition window ends (hard cut instead
      // of "fade to black, then fade in B").
      if (progress >= 0.5) drawNext();
      ctx.fillStyle = "#000"; ctx.globalAlpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
      ctx.fillRect(0, 0, w, h); break;
    case "dipToWhite":
      if (progress >= 0.5) drawNext();
      ctx.fillStyle = "#fff"; ctx.globalAlpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
      ctx.fillRect(0, 0, w, h); break;
    case "wipeLeftToRight":
      ctx.beginPath(); ctx.rect(0, 0, w * progress, h); ctx.clip(); drawNext(); break;
    case "wipeTopToBottom":
      ctx.beginPath(); ctx.rect(0, 0, w, h * progress); ctx.clip(); drawNext(); break;
    case "slideIn": ctx.translate(-w * (1 - progress), 0); drawNext(); break;
    case "slideUp": ctx.translate(0, h * (1 - progress)); drawNext(); break;
    case "slideRight": ctx.translate(w * (1 - progress), 0); drawNext(); break;
    case "push": ctx.translate(-w * progress, 0); drawNext(); break;
    case "zoom":
      ctx.translate(w / 2, h / 2); ctx.scale(1 + progress * 0.3, 1 + progress * 0.3);
      // Ramp UP to full opacity as the transition completes (was inverted:
      // it used to start opaque and fade to 50% right at the cut point,
      // producing a visible opacity "pop" back to 100% on the very next
      // frame once the transition window ended).
      ctx.translate(-w / 2, -h / 2); ctx.globalAlpha = 0.5 + progress * 0.5; drawNext(); break;
    case "blurIn":
      ctx.filter = `blur(${(1 - progress) * 10}px)`; ctx.globalAlpha = progress; drawNext(); ctx.filter = "none"; break;
    case "scaleIn":
      ctx.translate(w / 2, h / 2); ctx.scale(progress, progress); ctx.translate(-w / 2, -h / 2); drawNext(); break;
    case "flipIn":
      ctx.translate(w / 2, 0); ctx.scale(Math.abs(Math.cos(progress * Math.PI)), 1);
      ctx.translate(-w / 2, 0); if (progress > 0.5) drawNext(); break;
    default: ctx.globalAlpha = progress; drawNext(); break;
  }
  ctx.restore();
}