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
import { ClipDetails, TextDetails, ImageDetails, BlurDetails, LayerOrder } from "../types/types";
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
  imageEls: Record<string, HTMLImageElement | null>;
  layerOrder: LayerOrder[];
  /** Given a clip's src, return the <video>/<canvas>/ImageBitmap-like drawable currently seeked to the right frame. */
  getVideoDrawable: (src: string) => CanvasImageSource | null | undefined;
}

export function compositeFrame(input: CompositeFrameInput) {
  const { ctx, width: w, height: h, t, fps, clips, texts, images, blurs, imageEls, layerOrder, getVideoDrawable } = input;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const defaultOrder = ["video", "audio", "image", "text", "blur"];
  const drawOrder = layerOrder.length > 0
    ? [...layerOrder].sort((a, b) => a.zIndex - b.zIndex).map(l => l.type)
    : defaultOrder;

  const clipsSorted = [...clips].sort((a, b) => (a.startPosition ?? 0) - (b.startPosition ?? 0));

  for (const layerType of drawOrder) {
    if (layerType === "video" || layerType === "audio") {
      const activeClips = clipsSorted.filter(c =>
        t >= (c.startPosition ?? 0) && t <= (c.endPosition ?? Infinity)
      ).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

      for (const clip of activeClips) {
        const vid = getVideoDrawable(clip.src);
        if (!vid) continue;
        const cw = (clip.width ?? w) * (clip.scale ?? 1);
        const ch = (clip.height ?? h) * (clip.scale ?? 1);
        ctx.save();
        ctx.filter = buildCanvasFilterString(clip.colorAdjustments);
        try { ctx.drawImage(vid, clip.x ?? 0, clip.y ?? 0, cw, ch); } catch {}
        ctx.filter = "none";
        const ci = clipsSorted.findIndex(c => c.id === clip.id);
        if (ci >= 0 && ci < clipsSorted.length - 1 && clip.transition && clip.transition !== "none") {
          const trans = computeTransition(clip.transition, t, clip.endPosition ?? 0, fps);
          if (trans) {
            const nextClip = clipsSorted[ci + 1];
            const nextVid = getVideoDrawable(nextClip?.src ?? "");
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
    } else if (layerType === "image") {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (t < img.startTime || t > img.endTime) continue;
        const el = imageEls[img.id];
        if (!el) continue;
        const anim = computeAnimState(img.animation, t, img.startTime, img.endTime, fps, img.imageX, img.imageY, w, h, 100);
        if (!anim.visible) continue;
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
    } else if (layerType === "text") {
      for (const text of texts) {
        if (t < text.startTime || t > text.endTime) continue;
        const anim = computeAnimState(text.animation, t, text.startTime, text.endTime, fps, text.textX, text.textY, w, h, text.fontSize);
        if (!anim.visible) continue;
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
    } else if (layerType === "blur") {
      for (const blur of blurs) {
        if (t < blur.startTime || t > blur.endTime) continue;
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
    }
  }
}

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const lines = wrapTextLines(ctx, text, maxW);
  let ly = y;
  for (const line of lines) {
    if (line) ctx.fillText(line, x, ly);
    ly += lineH;
  }
}

function applyTransition(
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
      ctx.fillStyle = "#000"; ctx.globalAlpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
      ctx.fillRect(0, 0, w, h); break;
    case "dipToWhite":
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
      ctx.translate(-w / 2, -h / 2); ctx.globalAlpha = 1 - progress * 0.5; drawNext(); break;
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
