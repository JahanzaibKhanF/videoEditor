"use client";

/**
 * InteractionOverlay — transparent interaction layer over CompositorCanvas
 * (select / drag / resize + inline text editing). Plain React + pointer
 * events, no canvas-interaction library — the same approach Figma / Canva
 * use: real DOM chrome, pixels drawn separately underneath.
 *
 * Coordinate system: the root fills the SAME width×height pixel box the
 * compositor draws into; the parent (Screen.tsx) applies
 * `transform: scale(previewScale)` to the whole box, so every number here
 * is in native/unscaled data-space pixels.
 *
 * Hit-testing (the important bit): the root does its OWN front-to-back
 * hit-test on every pointerdown, using each layer's real VISUAL bounds
 * (for text: the tight glyph box, not the wide wrap box). The topmost
 * layer actually under the pointer is selected — so a small text on top of
 * a full-frame video always wins the click, and a click in the empty part
 * of a text's wrap box falls through to whatever is behind it. The per-
 * layer boxes are display-only (`pointerEvents:none`); only the resize
 * handles and the edit textarea take pointer events.
 *
 * Text resize has two modes, like Canva:
 *   • selected, not editing → corner handles SCALE the text (font grows)
 *   • editing (caret active) → side handles change the WRAP WIDTH only,
 *     height auto-fits the content
 * Video / image corners scale uniformly; blur is a free-form region.
 *
 * Live position/size during a drag stays in local state (`liveRect`) and
 * is only committed to shared context on pointer-up.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { measureWrappedTextHeight, measureTextBlock } from "../../utils/measureText";
import { computeAnimState } from "../../utils/AnimationEngine";
import { evalKeyframes, evalTrack, applyKfOverride, upsertKey, makeTrack, upsertTrack } from "../../utils/keyframes";
import { KeyframeTrack, KfProp } from "../../types/types";

interface Props {
  width: number;
  height: number;
}

type Kind = "clip" | "image" | "text" | "blur";
type HandleDir = "nw" | "ne" | "sw" | "se" | "w" | "e" | "n" | "s";
type ResizeMode = "scale" | "free" | "width";

interface Rect { x: number; y: number; w: number; h: number; }

interface DragState {
  kind: Kind;
  id: string;
  mode: "move" | "resize";
  resizeMode: ResizeMode;
  handle?: HandleDir;
  startPointerX: number;
  startPointerY: number;
  startRect: Rect;      // visual rect at drag-start (what the box shows)
  startBaseRect: Rect;  // resting rect — what un-keyframed commits write
}

const ACCENT: Record<Kind, string> = {
  clip: "#FFB648",
  image: "#4C8CFF",
  text: "#8B5CFF",
  blur: "#33D8A0",
};

const MIN_SIZE = 16;
const SNAP_THRESHOLD = 8;
const clampPos = (n: number) => (Number.isFinite(n) && n > 0.02 ? n : 1);
const rectHit = (r: Rect, px: number, py: number, pad = 0) =>
  px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad;

export default function InteractionOverlay({ width, height }: Props) {
  const {
    currentTime, fps,
    textsDetails, setTextsDetails,
    imagesDetails, setImagesDetails,
    blursDetails, setBlursDetails,
    clipsDetails, setClipsDetails,
    selectedImageID, setSelectedImageID,
    selectedTextId, setSelectedTextId,
    selectedBlurId, setSelectedBlurId,
    selectedClipId, setSelectedClipId,
  } = useAppDetailsContext();

  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const [liveRect, setLiveRect] = useState<{ id: string; rect: Rect } | null>(null);
  const liveRectRef = useRef(liveRect);
  useEffect(() => { liveRectRef.current = liveRect; }, [liveRect]);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const didDragRef = useRef(false);
  // Set on pointerdown when an already-selected text is tapped; if the
  // pointer goes up without a drag, that tap opens edit mode.
  const pendingTextEditRef = useRef<string | null>(null);

  const selectNone = useCallback(() => {
    setSelectedImageID(null);
    setSelectedTextId(null);
    setSelectedBlurId(null);
    setSelectedClipId(null);
    setEditingTextId(null);
  }, [setSelectedImageID, setSelectedTextId, setSelectedBlurId, setSelectedClipId]);

  const selectOnly = useCallback((kind: Kind, id: string) => {
    setSelectedImageID(kind === "image" ? id : null);
    setSelectedTextId(kind === "text" ? id : null);
    setSelectedBlurId(kind === "blur" ? id : null);
    setSelectedClipId(kind === "clip" ? id : null);
    if (kind !== "text") setEditingTextId(null);
  }, [setSelectedImageID, setSelectedTextId, setSelectedBlurId, setSelectedClipId]);

  // ── Animated transform for a layer at the current playhead ───────────────
  const animOf = (
    animation: string | undefined, baseX: number, baseY: number,
    startTime: number, endTime: number, fontSize: number, keyframes?: KeyframeTrack[],
  ) => applyKfOverride(
    computeAnimState(animation ?? "none", currentTime, startTime, endTime, fps || 30, baseX, baseY, width, height, fontSize),
    evalKeyframes(keyframes, currentTime),
  );

  // Generic centred-scale rect (used for image / clip).
  const scaledRect = (
    animation: string | undefined, baseX: number, baseY: number,
    baseW: number, baseH: number, startTime: number, endTime: number, kf?: KeyframeTrack[],
  ): Rect => {
    const a = animOf(animation, baseX, baseY, startTime, endTime, 100, kf);
    const sw = a.scale * a.scaleX, sh = a.scale * a.scaleY;
    const w = baseW * sw, h = baseH * sh;
    const cx = a.tx + baseW / 2, cy = a.ty + baseH / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  };

  const getClipRect = (c: typeof clipsDetails[number]): Rect => {
    if (liveRect?.id === c.id) return liveRect.rect;
    const kf = evalKeyframes(c.keyframes, currentTime);
    const s = (c.scale ?? 1) * (kf.scale ?? 1);
    return { x: (c.x ?? 0) + (kf.x ?? 0), y: (c.y ?? 0) + (kf.y ?? 0), w: (c.width ?? width) * s, h: (c.height ?? height) * s };
  };
  const getImageRect = (i: typeof imagesDetails[number]): Rect => {
    if (liveRect?.id === i.id) return liveRect.rect;
    return scaledRect(i.animation, i.imageX, i.imageY, i.width * i.scaleX, i.height * i.scaleY, i.startTime, i.endTime, i.keyframes);
  };
  const getBlurRect = (b: typeof blursDetails[number]): Rect => {
    if (liveRect?.id === b.id) return liveRect.rect;
    const kf = evalKeyframes(b.keyframes, currentTime);
    return { x: b.x + (kf.x ?? 0), y: b.y + (kf.y ?? 0), w: b.width, h: b.height };
  };

  // Text: the box the user sees. When NOT editing (and no background fill)
  // it hugs the actual glyphs; while editing it shows the full wrap width so
  // the wrap boundary is visible + resizable. Text is left/top-aligned in
  // its box, scaled about the FULL box centre by the compositor.
  const getTextRect = (t: typeof textsDetails[number], forceFull = false): Rect => {
    if (liveRect?.id === t.id) return liveRect.rect;
    const a = animOf(t.animation, t.textX, t.textY, t.startTime, t.endTime, t.fontSize, t.keyframes);
    const fullW = t.width, fullH = t.height;
    const editing = forceFull || editingTextId === t.id;
    const hasBg = !!t.backgroundColor && t.backgroundColor !== "transparent";
    let cw = fullW, ch = fullH;
    if (!editing && !hasBg) {
      const b = measureTextBlock(t.text, t.fontSize, t.fontFamily, t.lineHeight, t.width, t.isBold, t.isItalic);
      cw = b.width; ch = b.height;
    }
    const sx = a.scale * a.scaleX, sy = a.scale * a.scaleY;
    const fcx = a.tx + fullW / 2, fcy = a.ty + fullH / 2;
    // box-local (0,0) → canvas, scaling about the full-box centre
    return { x: fcx - (fullW / 2) * sx, y: fcy - (fullH / 2) * sy, w: cw * sx, h: ch * sy };
  };

  // Resting rect — un-keyframed commits write deltas onto this.
  const baseRectOf = (kind: Kind, id: string): Rect => {
    if (kind === "text") { const t = textsDetails.find(x => x.id === id); return t ? { x: t.textX, y: t.textY, w: t.width, h: t.height } : { x: 0, y: 0, w: 0, h: 0 }; }
    if (kind === "image") { const i = imagesDetails.find(x => x.id === id); return i ? { x: i.imageX, y: i.imageY, w: i.width * i.scaleX, h: i.height * i.scaleY } : { x: 0, y: 0, w: 0, h: 0 }; }
    if (kind === "blur") { const b = blursDetails.find(x => x.id === id); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : { x: 0, y: 0, w: 0, h: 0 }; }
    const c = clipsDetails.find(x => x.id === id);
    return c ? { x: c.x ?? 0, y: c.y ?? 0, w: (c.width ?? width) * (c.scale ?? 1), h: (c.height ?? height) * (c.scale ?? 1) } : { x: 0, y: 0, w: 0, h: 0 };
  };

  // ── Motion path (After Effects–style dotted trail through the position
  //    keyframes of the selected layer) ───────────────────────────────────
  const layerKeyframes = (kind: Kind, id: string): KeyframeTrack[] | undefined => {
    if (kind === "text") return textsDetails.find(x => x.id === id)?.keyframes;
    if (kind === "image") return imagesDetails.find(x => x.id === id)?.keyframes;
    if (kind === "blur") return blursDetails.find(x => x.id === id)?.keyframes;
    return clipsDetails.find(x => x.id === id)?.keyframes;
  };
  // Path anchor = the layer's centre with NO keyframe offset applied.
  const pathBaseCentre = (kind: Kind, id: string): { x: number; y: number } | null => {
    if (kind === "text") { const t = textsDetails.find(x => x.id === id); return t ? { x: t.textX + t.width / 2, y: t.textY + t.height / 2 } : null; }
    if (kind === "image") { const i = imagesDetails.find(x => x.id === id); return i ? { x: i.imageX + (i.width * i.scaleX) / 2, y: i.imageY + (i.height * i.scaleY) / 2 } : null; }
    if (kind === "blur") { const b = blursDetails.find(x => x.id === id); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; }
    const c = clipsDetails.find(x => x.id === id);
    return c ? { x: (c.x ?? 0) + ((c.width ?? width) * (c.scale ?? 1)) / 2, y: (c.y ?? 0) + ((c.height ?? height) * (c.scale ?? 1)) / 2 } : null;
  };
  const motionPath = (kind: Kind, id: string) => {
    const kfs = layerKeyframes(kind, id);
    const xT = kfs?.find(t => t.prop === "x");
    const yT = kfs?.find(t => t.prop === "y");
    if (!xT && !yT) return null;
    const times = Array.from(new Set([...(xT?.keys ?? []), ...(yT?.keys ?? [])].map(k => Math.round(k.t * 1000) / 1000))).sort((a, b) => a - b);
    if (times.length < 2) return null;
    const base = pathBaseCentre(kind, id);
    if (!base) return null;
    const at = (t: number) => ({
      x: base.x + (xT ? (evalTrack(xT, t) ?? 0) : 0),
      y: base.y + (yT ? (evalTrack(yT, t) ?? 0) : 0),
    });
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < times.length - 1; i++) {
      const t0 = times[i], t1 = times[i + 1];
      const steps = 14;
      for (let s = (i === 0 ? 0 : 1); s <= steps; s++) pts.push(at(t0 + (t1 - t0) * (s / steps)));
    }
    return {
      d: "M " + pts.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L "),
      keys: times.map(at),
      now: at(currentTime),
    };
  };

  // ── Commit a finished drag/resize into shared state ──────────────────────
  const kfActive = (tracks: KeyframeTrack[] | undefined, prop: KfProp) =>
    !!tracks?.some(tr => tr.prop === prop && tr.keys.length > 0);
  const writeKf = (tracks: KeyframeTrack[] | undefined, prop: KfProp, value: number): KeyframeTrack[] => {
    const tr = tracks?.find(t => t.prop === prop) ?? makeTrack(prop, currentTime, value);
    return upsertTrack(tracks, upsertKey(tr, currentTime, value));
  };

  const commit = useCallback((drag: DragState, base: Rect, anim: Rect) => {
    const { kind, id, mode, resizeMode } = drag;
    switch (kind) {
      case "clip":
        setClipsDetails(prev => prev.map(c => {
          if (c.id !== id) return c;
          const baseW = c.width ?? width, baseH = c.height ?? height;
          let kfs = c.keyframes; const next = { ...c };
          if (kfActive(c.keyframes, "x")) kfs = writeKf(kfs, "x", anim.x - (c.x ?? 0)); else next.x = base.x;
          if (kfActive(c.keyframes, "y")) kfs = writeKf(kfs, "y", anim.y - (c.y ?? 0)); else next.y = base.y;
          if (mode === "resize") {
            if (kfActive(c.keyframes, "scale")) kfs = writeKf(kfs, "scale", clampPos((anim.w / baseW) / (c.scale ?? 1)));
            else next.scale = Math.max(0.05, Math.min(base.w / baseW, base.h / baseH) || (c.scale ?? 1));
          }
          return { ...next, keyframes: kfs };
        }));
        break;
      case "image":
        setImagesDetails(prev => prev.map(i => {
          if (i.id !== id) return i;
          let kfs = i.keyframes; const next = { ...i };
          if (kfActive(i.keyframes, "x")) kfs = writeKf(kfs, "x", anim.x - i.imageX); else next.imageX = base.x;
          if (kfActive(i.keyframes, "y")) kfs = writeKf(kfs, "y", anim.y - i.imageY); else next.imageY = base.y;
          if (mode === "resize") {
            if (kfActive(i.keyframes, "scale")) {
              const baseSc = Math.min(i.scaleX, i.scaleY) || 1;
              kfs = writeKf(kfs, "scale", clampPos(Math.min(anim.w / i.width, anim.h / i.height) / baseSc));
            } else { next.scaleX = base.w / i.width; next.scaleY = base.h / i.height; }
          }
          return { ...next, keyframes: kfs };
        }));
        break;
      case "blur":
        setBlursDetails(prev => prev.map(b => {
          if (b.id !== id) return b;
          let kfs = b.keyframes; const next = { ...b };
          if (kfActive(b.keyframes, "x")) kfs = writeKf(kfs, "x", anim.x - b.x); else next.x = base.x;
          if (kfActive(b.keyframes, "y")) kfs = writeKf(kfs, "y", anim.y - b.y); else next.y = base.y;
          if (mode === "resize") { next.width = Math.max(MIN_SIZE, base.w); next.height = Math.max(MIN_SIZE, base.h); }
          return { ...next, keyframes: kfs };
        }));
        break;
      case "text":
        setTextsDetails(prev => prev.map(t => {
          if (t.id !== id) return t;
          let kfs = t.keyframes; const next = { ...t };
          const remeasure = (w: number, fs: number) =>
            measureWrappedTextHeight(t.text, fs, t.fontFamily, t.lineHeight, w, t.isBold, t.isItalic);

          if (mode === "move") {
            if (kfActive(t.keyframes, "x")) kfs = writeKf(kfs, "x", anim.x - t.textX); else next.textX = base.x;
            if (kfActive(t.keyframes, "y")) kfs = writeKf(kfs, "y", anim.y - t.textY); else next.textY = base.y;
          } else if (resizeMode === "width") {
            // Edit mode — change wrap width only; height auto-fits.
            const w = Math.max(24, base.w);
            next.width = w;
            next.textX = base.x;
            next.height = remeasure(w, t.fontSize);
          } else {
            // Select mode — uniform scale of the whole text block. The ratio
            // is (new visual width / start visual width).
            const r = Math.max(0.05, (anim.w || 1) / Math.max(1, drag.startRect.w));
            if (kfActive(t.keyframes, "scale")) {
              // Scale is keyframed → resizing on the canvas writes a SCALE
              // keyframe at the playhead (multiplier vs. the resting size),
              // exactly like clips/images. Base font size stays put.
              const startScale = evalKeyframes(t.keyframes, currentTime).scale ?? 1;
              kfs = writeKf(kfs, "scale", clampPos(startScale * r));
              if (kfActive(t.keyframes, "x")) kfs = writeKf(kfs, "x", anim.x - t.textX);
              if (kfActive(t.keyframes, "y")) kfs = writeKf(kfs, "y", anim.y - t.textY);
            } else {
              // Not keyframed → bake into font size + wrap width; top-left
              // follows the resized box.
              const fs = Math.min(1200, Math.max(4, Math.round(t.fontSize * r)));
              const w = Math.max(24, Math.round(t.width * r));
              next.fontSize = fs;
              next.width = w;
              next.textX = anim.x;
              next.textY = anim.y;
              next.height = remeasure(w, fs);
            }
          }
          return { ...next, keyframes: kfs };
        }));
        break;
    }
  }, [width, height, currentTime, setClipsDetails, setImagesDetails, setTextsDetails, setBlursDetails]);

  // ── Front-to-back layer list for hit-testing (frontmost first) ───────────
  // Same convention as compositeFrame / layerStack: LOWER zIndex = frontmost.
  interface HitLayer { kind: Kind; id: string; rect: Rect; z: number; order: number; }
  const buildHitLayers = (): HitLayer[] => {
    const out: HitLayer[] = [];
    let order = 0;
    clipsDetails.filter(c => currentTime >= c.startPosition && currentTime <= c.endPosition)
      .forEach(c => out.push({ kind: "clip", id: c.id, rect: getClipRect(c), z: c.zIndex ?? 0, order: order++ }));
    imagesDetails.filter(i => currentTime >= i.startTime && currentTime <= i.endTime)
      .forEach(i => out.push({ kind: "image", id: i.id, rect: getImageRect(i), z: i.zIndex ?? 0, order: order++ }));
    textsDetails.filter(t => currentTime >= t.startTime && currentTime <= t.endTime)
      .forEach(t => out.push({ kind: "text", id: t.id, rect: getTextRect(t), z: t.zIndex ?? 0, order: order++ }));
    blursDetails.filter(b => currentTime >= b.startTime && currentTime <= b.endTime)
      .forEach(b => out.push({ kind: "blur", id: b.id, rect: getBlurRect(b), z: b.zIndex ?? 0, order: order++ }));
    // frontmost first: ascending z; tie-break so later-added / overlay-ish
    // kinds (blur, text) sit above clips/images, matching the draw order.
    const kindRank: Record<Kind, number> = { clip: 0, image: 1, text: 2, blur: 3 };
    return out.sort((a, b) => a.z - b.z || kindRank[b.kind] - kindRank[a.kind] || b.order - a.order);
  };

  const pointerToData = (clientX: number, clientY: number): { x: number; y: number } => {
    const el = rootRef.current!;
    const r = el.getBoundingClientRect();
    const scale = r.width / width || 1;
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  };

  const hitTest = (px: number, py: number): HitLayer | null => {
    for (const l of buildHitLayers()) if (rectHit(l.rect, px, py)) return l;
    return null;
  };

  // ── Begin a drag (called from the root hit-test or a handle) ─────────────
  const beginDrag = (
    kind: Kind, id: string, mode: "move" | "resize", resizeMode: ResizeMode,
    handle: HandleDir | undefined, rect: Rect, clientX: number, clientY: number, pointerId?: number,
  ) => {
    didDragRef.current = false;
    if (pointerId !== undefined && rootRef.current) {
      try { rootRef.current.setPointerCapture(pointerId); } catch { /* noop */ }
    }
    dragRef.current = {
      kind, id, mode, resizeMode, handle,
      startPointerX: clientX, startPointerY: clientY,
      startRect: rect, startBaseRect: baseRectOf(kind, id),
    };
    setLiveRect({ id, rect });
    selectOnly(kind, id);
  };

  const rectForHandles = (l: HitLayer): Rect => {
    if (l.kind === "text") {
      const t = textsDetails.find(x => x.id === l.id)!;
      return getTextRect(t, editingTextId === l.id);
    }
    return l.rect;
  };

  // ── Root pointer / dblclick ─────────────────────────────────────────────
  const onRootPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const { x, y } = pointerToData(e.clientX, e.clientY);
    const hit = hitTest(x, y);
    if (!hit) { selectNone(); return; }

    const editing = hit.kind === "text" && editingTextId === hit.id;
    if (editing) return; // clicks inside the editing textarea are its own

    const isSelected =
      (hit.kind === "text" && selectedTextId === hit.id) ||
      (hit.kind === "image" && selectedImageID === hit.id) ||
      (hit.kind === "blur" && selectedBlurId === hit.id) ||
      (hit.kind === "clip" && selectedClipId === hit.id);

    // Tapping an already-selected text a second time enters edit mode
    // (works on touch, where dblclick is unreliable). A drag cancels it.
    if (hit.kind === "text" && isSelected) {
      beginDrag("text", hit.id, "move", "scale", undefined, rectForHandles(hit), e.clientX, e.clientY, e.pointerId);
      pendingTextEditRef.current = hit.id;
      return;
    }
    pendingTextEditRef.current = null;
    beginDrag(hit.kind, hit.id, "move",
      hit.kind === "blur" ? "free" : "scale", undefined,
      rectForHandles(hit), e.clientX, e.clientY, e.pointerId);
  };

  const onRootDoubleClick = (e: React.MouseEvent) => {
    const { x, y } = pointerToData(e.clientX, e.clientY);
    const hit = hitTest(x, y);
    if (hit?.kind === "text") enterTextEdit(hit.id);
  };

  const enterTextEdit = (id: string) => {
    const t = textsDetails.find(d => d.id === id);
    if (!t) return;
    setEditingTextId(id);
    selectOnly("text", id);
    const neededH = measureWrappedTextHeight(t.text, t.fontSize, t.fontFamily, t.lineHeight, t.width, t.isBold, t.isItalic);
    if (neededH > t.height) setTextsDetails(prev => prev.map(d => d.id === id ? { ...d, height: neededH } : d));
  };

  // ── Drag move / up ─────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const el = rootRef.current;
      const scale = el ? el.getBoundingClientRect().width / width : 1;
      const dx = (e.clientX - drag.startPointerX) / (scale || 1);
      const dy = (e.clientY - drag.startPointerY) / (scale || 1);
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        didDragRef.current = true;
        pendingTextEditRef.current = null;
      }

      const sr = drag.startRect;
      let next: Rect = { ...sr };

      if (drag.mode === "move") {
        next.x = sr.x + dx;
        next.y = sr.y + dy;
        const cx = next.x + next.w / 2, cy = next.y + next.h / 2;
        const snapX = Math.abs(cx - width / 2) < SNAP_THRESHOLD;
        const snapY = Math.abs(cy - height / 2) < SNAP_THRESHOLD;
        if (snapX) next.x = width / 2 - next.w / 2;
        if (snapY) next.y = height / 2 - next.h / 2;
        setGuides({ x: snapX, y: snapY });
      } else {
        const h = drag.handle;
        if (drag.resizeMode === "width") {
          if (h === "e") next.w = Math.max(MIN_SIZE, sr.w + dx);
          else if (h === "w") { next.w = Math.max(MIN_SIZE, sr.w - dx); next.x = sr.x + sr.w - next.w; }
        } else if (drag.resizeMode === "scale") {
          // Uniform. Drive the ratio off whichever axis moved further in its
          // outward direction so every corner grows when dragged away.
          const sx = h === "se" || h === "ne" ? 1 : -1;
          const sy = h === "se" || h === "sw" ? 1 : -1;
          const drive = Math.abs(sx * dx) > Math.abs(sy * dy) ? sx * dx : sy * dy;
          const ratio = sr.w !== 0 ? Math.max(0.05, 1 + drive / sr.w) : 1;
          const nw = Math.max(MIN_SIZE, sr.w * ratio);
          const nh = Math.max(MIN_SIZE, sr.h * (nw / sr.w));
          next.w = nw; next.h = nh;
          if (h === "sw" || h === "nw") next.x = sr.x + sr.w - nw;
          if (h === "ne" || h === "nw") next.y = sr.y + sr.h - nh;
        } else { // free
          if (h?.includes("e")) next.w = Math.max(MIN_SIZE, sr.w + dx);
          if (h?.includes("s")) next.h = Math.max(MIN_SIZE, sr.h + dy);
          if (h?.includes("w")) { next.w = Math.max(MIN_SIZE, sr.w - dx); next.x = sr.x + sr.w - next.w; }
          if (h?.includes("n")) { next.h = Math.max(MIN_SIZE, sr.h - dy); next.y = sr.y + sr.h - next.h; }
        }
      }
      setLiveRect({ id: drag.id, rect: next });
    };

    const onUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      const finalRect = liveRectRef.current;
      if (finalRect && finalRect.id === drag.id) {
        const sr = drag.startRect, br = drag.startBaseRect, fr = finalRect.rect;
        commit(drag,
          { x: br.x + (fr.x - sr.x), y: br.y + (fr.y - sr.y), w: br.w + (fr.w - sr.w), h: br.h + (fr.h - sr.h) },
          fr);
      }
      // A tap (no drag) on an already-selected text opens edit mode.
      if (!didDragRef.current && pendingTextEditRef.current) {
        enterTextEdit(pendingTextEditRef.current);
      }
      pendingTextEditRef.current = null;
      dragRef.current = null;
      setLiveRect(null);
      setGuides({ x: false, y: false });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, commit]);

  // ── Keyboard delete ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingTextId) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (selectedTextId) { setTextsDetails(prev => prev.filter(d => d.id !== selectedTextId)); setSelectedTextId(null); }
      else if (selectedImageID) { setImagesDetails(prev => prev.filter(d => d.id !== selectedImageID)); setSelectedImageID(null); }
      else if (selectedBlurId) { setBlursDetails(prev => prev.filter(d => d.id !== selectedBlurId)); setSelectedBlurId(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingTextId, selectedTextId, selectedImageID, selectedBlurId, setTextsDetails, setImagesDetails, setBlursDetails, setSelectedTextId, setSelectedImageID, setSelectedBlurId]);

  // ── Chrome ─────────────────────────────────────────────────────────────
  const HANDLE_HIT = 38;
  const handleDot = (color: string, w = 11, h = 11): React.CSSProperties => ({
    width: w, height: h, borderRadius: 2.5,
    background: "#fff", border: `1.5px solid ${color}`,
    boxShadow: "0 1px 3px rgba(0,0,0,.35)", pointerEvents: "none",
  });

  const renderHandles = (
    kind: Kind, id: string, rect: Rect, color: string, mode: ResizeMode,
  ) => {
    const half = HANDLE_HIT / 2;
    const defs: { dir: HandleDir; pos: React.CSSProperties; cursor: string }[] =
      mode === "width"
        ? [
            { dir: "w", pos: { left: -half, top: `calc(50% - ${half}px)` }, cursor: "ew-resize" },
            { dir: "e", pos: { right: -half, top: `calc(50% - ${half}px)` }, cursor: "ew-resize" },
          ]
        : [
            { dir: "nw", pos: { left: -half, top: -half }, cursor: "nwse-resize" },
            { dir: "ne", pos: { right: -half, top: -half }, cursor: "nesw-resize" },
            { dir: "sw", pos: { left: -half, bottom: -half }, cursor: "nesw-resize" },
            { dir: "se", pos: { right: -half, bottom: -half }, cursor: "nwse-resize" },
          ];
    return defs.map(({ dir, pos, cursor }) => (
      <div key={dir}
        onPointerDown={(e) => {
          e.stopPropagation();
          beginDrag(kind, id, "resize", mode, dir, rect, e.clientX, e.clientY, e.pointerId);
        }}
        style={{
          position: "absolute", width: HANDLE_HIT, height: HANDLE_HIT,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor, touchAction: "none", pointerEvents: "auto", zIndex: 3, ...pos,
        }}
      >
        <div style={dir === "w" || dir === "e" ? handleDot(color, 6, 20) : handleDot(color)} />
      </div>
    ));
  };

  const box = (rect: Rect, color: string, opts: { selected: boolean; editing?: boolean; fill?: string }): React.CSSProperties => ({
    position: "absolute",
    left: rect.x, top: rect.y, width: rect.w, height: rect.h,
    boxSizing: "border-box",
    outline: opts.selected ? `1.5px ${opts.editing ? "dashed" : "solid"} ${color}` : "none",
    outlineOffset: 0,
    boxShadow: opts.selected && !opts.editing ? "0 0 0 1px rgba(255,255,255,.35)" : "none",
    background: opts.fill ?? "transparent",
    pointerEvents: "none",
    touchAction: "none",
  });

  // ── Render every layer's chrome, ordered so the SELECTED box is on top ──
  type OverlayItem = { key: string; z: number; sel: boolean; node: React.ReactNode };
  const items: OverlayItem[] = [];

  clipsDetails.filter(c => currentTime >= c.startPosition && currentTime <= c.endPosition).forEach(c => {
    const rect = getClipRect(c);
    const selected = selectedClipId === c.id;
    items.push({
      key: `clip-${c.id}`, z: c.zIndex ?? 0, sel: selected,
      node: (
        <div key={`clip-${c.id}`} style={box(rect, ACCENT.clip, { selected })}>
          {selected && renderHandles("clip", c.id, rect, ACCENT.clip, "scale")}
        </div>
      ),
    });
  });

  imagesDetails.filter(i => currentTime >= i.startTime && currentTime <= i.endTime).forEach(img => {
    const rect = getImageRect(img);
    const selected = selectedImageID === img.id;
    items.push({
      key: `image-${img.id}`, z: img.zIndex ?? 0, sel: selected,
      node: (
        <div key={`image-${img.id}`} style={box(rect, ACCENT.image, { selected })}>
          {selected && renderHandles("image", img.id, rect, ACCENT.image, "scale")}
        </div>
      ),
    });
  });

  blursDetails.filter(b => currentTime >= b.startTime && currentTime <= b.endTime).forEach(b => {
    const rect = getBlurRect(b);
    const selected = selectedBlurId === b.id;
    items.push({
      key: `blur-${b.id}`, z: b.zIndex ?? 0, sel: selected,
      node: (
        <div key={`blur-${b.id}`} style={box(rect, ACCENT.blur, { selected, fill: selected ? `${ACCENT.blur}12` : "transparent" })}>
          {selected && renderHandles("blur", b.id, rect, ACCENT.blur, "free")}
        </div>
      ),
    });
  });

  textsDetails.filter(t => currentTime >= t.startTime && currentTime <= t.endTime).forEach(t => {
    const editing = editingTextId === t.id;
    const selected = selectedTextId === t.id;
    const rect = getTextRect(t, editing);
    items.push({
      key: `text-${t.id}`, z: t.zIndex ?? 0, sel: selected || editing,
      node: (
        <div key={`text-${t.id}`} style={box(rect, ACCENT.text, { selected: selected || editing, editing })}>
          {editing && (
            <textarea
              autoFocus
              value={t.text}
              onChange={(e) => {
                const newText = e.target.value;
                setTextsDetails(prev => prev.map(d => {
                  if (d.id !== t.id) return d;
                  const neededH = measureWrappedTextHeight(newText, d.fontSize, d.fontFamily, d.lineHeight, d.width, d.isBold, d.isItalic);
                  return { ...d, text: newText, height: Math.max(d.height, neededH) };
                }));
              }}
              onBlur={() => setEditingTextId(null)}
              onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); e.stopPropagation(); }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                background: "transparent", border: "none", outline: "none", resize: "none",
                WebkitAppearance: "none", appearance: "none", borderRadius: 0, boxShadow: "none",
                color: "transparent", caretColor: t.textColor && t.textColor !== "transparent" ? t.textColor : "#fff",
                fontFamily: t.fontFamily ?? "Arial", fontSize: t.fontSize, lineHeight: (t.lineHeight ?? 1.2) as number,
                fontStyle: t.isItalic ? "italic" : "normal", fontWeight: t.isBold ? "bold" : "normal",
                padding: 0, margin: 0, overflow: "hidden", pointerEvents: "auto", touchAction: "auto",
              }}
            />
          )}
          {editing && renderHandles("text", t.id, rect, ACCENT.text, "width")}
          {selected && !editing && renderHandles("text", t.id, rect, ACCENT.text, "scale")}
        </div>
      ),
    });
  });

  // Non-selected boxes back-to-front (high z → low z, matching the canvas);
  // the selected / editing box last so its handles are always reachable.
  items.sort((a, b) => (a.sel ? 1 : 0) - (b.sel ? 1 : 0) || b.z - a.z);

  // Motion path for whichever single layer is selected.
  const selKind: Kind | null = selectedTextId ? "text" : selectedImageID ? "image" : selectedClipId ? "clip" : selectedBlurId ? "blur" : null;
  const selId = selectedTextId || selectedImageID || selectedClipId || selectedBlurId || null;
  const mPath = selKind && selId && !editingTextId ? motionPath(selKind, selId) : null;
  // While dragging a position-keyframed layer, a rubber-band line from where
  // the playhead-time keyframe currently sits → where you're dragging it.
  const dragBand = (mPath && liveRect && dragRef.current?.id === selId && dragRef.current.mode === "move")
    ? { from: mPath.now, to: { x: liveRect.rect.x + liveRect.rect.w / 2, y: liveRect.rect.y + liveRect.rect.h / 2 } }
    : null;

  return (
    <div
      ref={rootRef}
      onPointerDown={onRootPointerDown}
      onDoubleClick={onRootDoubleClick}
      style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "auto", touchAction: "none" }}
    >
      {mPath && selKind && (
        <svg
          width={width} height={height} viewBox={`0 0 ${width} ${height}`}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        >
          <path d={mPath.d} fill="none" stroke={ACCENT[selKind]} strokeWidth={1.5}
            strokeDasharray="5 4" strokeLinecap="round" opacity={0.95} />
          {mPath.keys.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3.4} fill="#fff" stroke={ACCENT[selKind]} strokeWidth={1.5} />
          ))}
          {dragBand && (
            <line x1={dragBand.from.x} y1={dragBand.from.y} x2={dragBand.to.x} y2={dragBand.to.y}
              stroke={ACCENT[selKind]} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.8} />
          )}
          <circle cx={(dragBand ? dragBand.to : mPath.now).x} cy={(dragBand ? dragBand.to : mPath.now).y}
            r={4.6} fill={ACCENT[selKind]} stroke="#fff" strokeWidth={1.5} />
        </svg>
      )}
      {items.map(it => it.node)}
      {guides.x && <div style={{ position: "absolute", left: width / 2, top: 0, bottom: 0, width: 1.5, background: "#FFB648", pointerEvents: "none" }} />}
      {guides.y && <div style={{ position: "absolute", top: height / 2, left: 0, right: 0, height: 1.5, background: "#FFB648", pointerEvents: "none" }} />}
    </div>
  );
}
