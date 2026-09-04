"use client";

/**
 * InteractionOverlay — transparent interaction layer (select/drag/resize
 * handles + inline text editing). Replaces the previous Fabric.js-based
 * FabricOverlay with plain React + pointer events — no canvas interaction
 * library at all. This is the same approach most professional web editors
 * (Figma, Canva) actually use: real DOM elements for the interactive
 * chrome, with the actual pixel content drawn separately (here, by
 * CompositorCanvas underneath).
 *
 * Coordinate system: this component's root fills the SAME `width`×`height`
 * pixel box that CompositorCanvas draws into — the parent (Screen.tsx)
 * applies `transform: scale(previewScale)` to that whole box, so every
 * position/size here is in native/unscaled data-space pixels, exactly
 * like the Fabric.js canvas was.
 *
 * THE SAME RULE THAT APPLIED TO THE OLD FABRIC VERSION STILL APPLIES:
 * we do not want a full re-render/rebuild of drag state on every keystroke
 * or every pixel of a drag. Live position/size updates during a drag are
 * kept in local component state (`liveRect`) and only committed to the
 * shared app context on pointer-up — so typing in a text box or dragging
 * a handle doesn't thrash the rest of the app's state on every frame.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { measureWrappedTextHeight } from "../../utils/measureText";
import { computeAnimState } from "../../utils/AnimationEngine";

interface Props {
  width: number;
  height: number;
}

type Kind = "clip" | "image" | "text" | "blur";
type HandleDir = "nw" | "ne" | "sw" | "se";

interface Rect { x: number; y: number; w: number; h: number; }

interface DragState {
  kind: Kind;
  id: string;
  mode: "move" | "resize";
  handle?: HandleDir;
  lockAspect?: boolean;
  startPointerX: number;
  startPointerY: number;
  startRect: Rect;     // animated rect at drag-start (what the box shows)
  startBaseRect: Rect; // resting rect — what actually gets written on commit
}

const ACCENT: Record<Kind, string> = {
  clip: "#FFB648",
  image: "#4C8CFF",
  text: "#8B5CFF",
  blur: "#33D8A0",
};

const MIN_SIZE = 24;
const SNAP_THRESHOLD = 8;

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

  // Live (uncommitted) rect for whatever's currently being dragged/resized —
  // avoids writing to context on every pointermove.
  const [liveRect, setLiveRect] = useState<{ id: string; rect: Rect } | null>(null);
  // Ref mirror of liveRect so the pointerup handler (registered once and
  // never re-bound mid-drag) always reads the latest value instead of a
  // stale closure over `liveRect`.
  const liveRectRef = useRef(liveRect);
  useEffect(() => { liveRectRef.current = liveRect; }, [liveRect]);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const selectNone = useCallback(() => {
    setSelectedImageID(null);
    setSelectedTextId(null);
    setSelectedBlurId(null);
    setSelectedClipId(null);
  }, [setSelectedImageID, setSelectedTextId, setSelectedBlurId, setSelectedClipId]);

  // ── Rect getters per kind — single source of truth for "where is this
  // object right now", checking liveRect first so drags feel instant ──────
  //
  // For text/image the returned rect is the ANIMATED rect at `currentTime`
  // (same computeAnimState the compositor draws with), so the selection box
  // tracks the glyphs/pixels instead of sitting at the static base position
  // — otherwise, the instant a layer has an in-animation (or a whole-
  // duration one like shake/pulse) the purple box and the visible content
  // separate and it reads as "two of the same text".
  const animRect = (
    animation: string | undefined, baseX: number, baseY: number,
    baseW: number, baseH: number, startTime: number, endTime: number, fontSize: number,
  ): Rect => {
    const a = computeAnimState(animation ?? "none", currentTime, startTime, endTime, fps || 30, baseX, baseY, width, height, fontSize);
    const sw = a.scale * a.scaleX, sh = a.scale * a.scaleY;
    const w = baseW * sw, h = baseH * sh;
    const cx = a.tx + baseW / 2, cy = a.ty + baseH / 2; // compositor scales about the box centre
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  };
  const getClipRect = (c: typeof clipsDetails[number]): Rect => {
    if (liveRect?.id === c.id) return liveRect.rect;
    return { x: c.x ?? 0, y: c.y ?? 0, w: (c.width ?? width) * (c.scale ?? 1), h: (c.height ?? height) * (c.scale ?? 1) };
  };
  const getImageRect = (i: typeof imagesDetails[number]): Rect => {
    if (liveRect?.id === i.id) return liveRect.rect;
    return animRect(i.animation, i.imageX, i.imageY, i.width * i.scaleX, i.height * i.scaleY, i.startTime, i.endTime, 100);
  };
  const getTextRect = (t: typeof textsDetails[number]): Rect => {
    if (liveRect?.id === t.id) return liveRect.rect;
    return animRect(t.animation, t.textX, t.textY, t.width, t.height, t.startTime, t.endTime, t.fontSize);
  };
  const getBlurRect = (b: typeof blursDetails[number]): Rect => {
    if (liveRect?.id === b.id) return liveRect.rect;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };

  // Resting (un-animated) rect — the value a finished drag actually writes,
  // so grabbing a layer mid-animation still edits its base position/size.
  const baseRectOf = (kind: Kind, id: string): Rect => {
    if (kind === "text") { const t = textsDetails.find(x => x.id === id); return t ? { x: t.textX, y: t.textY, w: t.width, h: t.height } : { x: 0, y: 0, w: 0, h: 0 }; }
    if (kind === "image") { const i = imagesDetails.find(x => x.id === id); return i ? { x: i.imageX, y: i.imageY, w: i.width * i.scaleX, h: i.height * i.scaleY } : { x: 0, y: 0, w: 0, h: 0 }; }
    if (kind === "blur") { const b = blursDetails.find(x => x.id === id); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : { x: 0, y: 0, w: 0, h: 0 }; }
    const c = clipsDetails.find(x => x.id === id);
    return c ? { x: c.x ?? 0, y: c.y ?? 0, w: (c.width ?? width) * (c.scale ?? 1), h: (c.height ?? height) * (c.scale ?? 1) } : { x: 0, y: 0, w: 0, h: 0 };
  };

  // ── Commit a finished drag/resize back into the real app state ─────────
  const commit = useCallback((kind: Kind, id: string, rect: Rect) => {
    switch (kind) {
      case "clip":
        setClipsDetails(prev => prev.map(c => {
          if (c.id !== id) return c;
          const baseW = c.width ?? width, baseH = c.height ?? height;
          const scale = Math.max(0.05, Math.min(rect.w / baseW, rect.h / baseH) || (c.scale ?? 1));
          return { ...c, x: rect.x, y: rect.y, scale };
        }));
        break;
      case "image":
        setImagesDetails(prev => prev.map(i => {
          if (i.id !== id) return i;
          return { ...i, imageX: rect.x, imageY: rect.y, scaleX: rect.w / i.width, scaleY: rect.h / i.height };
        }));
        break;
      case "text":
        setTextsDetails(prev => prev.map(t => t.id === id ? { ...t, textX: rect.x, textY: rect.y, width: rect.w, height: rect.h } : t));
        break;
      case "blur":
        setBlursDetails(prev => prev.map(b => b.id === id ? { ...b, x: rect.x, y: rect.y, width: rect.w, height: rect.h } : b));
        break;
    }
  }, [width, height, setClipsDetails, setImagesDetails, setTextsDetails, setBlursDetails]);

  // ── Pointer handlers ─────────────────────────────────────────────────
  const beginDrag = (kind: Kind, id: string, mode: "move" | "resize", handle: HandleDir | undefined, rect: Rect, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const lockAspect = kind === "clip"; // clips only support uniform scale (single `scale` field, not independent w/h)
    dragRef.current = { kind, id, mode, handle, lockAspect, startPointerX: e.clientX, startPointerY: e.clientY, startRect: rect, startBaseRect: baseRectOf(kind, id) };
    setLiveRect({ id, rect });

    if (kind === "image") { setSelectedImageID(id); setSelectedTextId(null); setSelectedBlurId(null); setSelectedClipId(null); }
    else if (kind === "text") { setSelectedTextId(id); setSelectedImageID(null); setSelectedBlurId(null); setSelectedClipId(null); }
    else if (kind === "blur") { setSelectedBlurId(id); setSelectedImageID(null); setSelectedTextId(null); setSelectedClipId(null); }
    else if (kind === "clip") { setSelectedClipId(id); setSelectedImageID(null); setSelectedTextId(null); setSelectedBlurId(null); }
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // Pointer coordinates are in screen px; the overlay itself is scaled
      // by the parent's `transform: scale(previewScale)`, so we need to
      // divide the raw pointer delta by that same scale to get data-space
      // pixels. We read it straight off the root element's own bounding
      // box vs. its unscaled width/height, which is robust regardless of
      // how the scale was applied.
      const el = rootRef.current;
      const scale = el ? el.getBoundingClientRect().width / width : 1;
      const dx = (e.clientX - drag.startPointerX) / (scale || 1);
      const dy = (e.clientY - drag.startPointerY) / (scale || 1);

      let next: Rect = { ...drag.startRect };

      if (drag.mode === "move") {
        next.x = drag.startRect.x + dx;
        next.y = drag.startRect.y + dy;

        // Center-snap guides
        const cx = next.x + next.w / 2, cy = next.y + next.h / 2;
        const snapX = Math.abs(cx - width / 2) < SNAP_THRESHOLD;
        const snapY = Math.abs(cy - height / 2) < SNAP_THRESHOLD;
        if (snapX) next.x = width / 2 - next.w / 2;
        if (snapY) next.y = height / 2 - next.h / 2;
        setGuides({ x: snapX, y: snapY });
      } else {
        // Resize from whichever corner was grabbed
        const { handle } = drag;
        const sr = drag.startRect;

        if (drag.lockAspect) {
          // Uniform scale — use whichever axis moved further as the driver,
          // apply the same ratio to both dimensions, anchor the opposite corner.
          const ratio = sr.w !== 0 ? 1 + (Math.abs(dx) > Math.abs(dy) ? dx : dy) / sr.w : 1;
          const newW = Math.max(MIN_SIZE, sr.w * ratio);
          const newH = Math.max(MIN_SIZE, sr.h * (newW / sr.w));
          if (handle === "se") { next.w = newW; next.h = newH; }
          else if (handle === "sw") { next.w = newW; next.h = newH; next.x = sr.x + sr.w - newW; }
          else if (handle === "ne") { next.w = newW; next.h = newH; next.y = sr.y + sr.h - newH; }
          else if (handle === "nw") { next.w = newW; next.h = newH; next.x = sr.x + sr.w - newW; next.y = sr.y + sr.h - newH; }
        } else if (handle === "se") { next.w = Math.max(MIN_SIZE, sr.w + dx); next.h = Math.max(MIN_SIZE, sr.h + dy); }
        else if (handle === "sw") { next.w = Math.max(MIN_SIZE, sr.w - dx); next.h = Math.max(MIN_SIZE, sr.h + dy); next.x = sr.x + sr.w - next.w; }
        else if (handle === "ne") { next.w = Math.max(MIN_SIZE, sr.w + dx); next.h = Math.max(MIN_SIZE, sr.h - dy); next.y = sr.y + sr.h - next.h; }
        else if (handle === "nw") { next.w = Math.max(MIN_SIZE, sr.w - dx); next.h = Math.max(MIN_SIZE, sr.h - dy); next.x = sr.x + sr.w - next.w; next.y = sr.y + sr.h - next.h; }
      }

      setLiveRect({ id: drag.id, rect: next });
    };

    const onUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      const finalRect = liveRectRef.current;
      if (finalRect && finalRect.id === drag.id) {
        // Write the NET drag delta onto the resting rect, not the animated
        // rect the box was showing — so a drag that started mid-animation
        // doesn't bake the animation offset into the layer's base values.
        const sr = drag.startRect, br = drag.startBaseRect, fr = finalRect.rect;
        commit(drag.kind, drag.id, {
          x: br.x + (fr.x - sr.x),
          y: br.y + (fr.y - sr.y),
          w: br.w + (fr.w - sr.w),
          h: br.h + (fr.h - sr.h),
        });
      }
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

  // ── Keyboard delete ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingTextId) return; // let typing through
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

  // ── Resize handles (4 corners) ──────────────────────────────────────
  // Each handle is a small visible dot centered inside a much larger
  // invisible touch target (40x40) — a 10x10 hit area is fine for a mouse
  // cursor but is close to impossible to hit accurately with a finger.
  // This is the standard "expand the tap target without changing the
  // visual size" pattern: the dot still LOOKS the same as before, it's
  // just easier to actually grab on a touchscreen.
  const HANDLE_HIT = 40;
  const renderHandles = (kind: Kind, id: string, rect: Rect, color: string, lockAspect: boolean) => {
    const half = HANDLE_HIT / 2;
    const positions: { dir: HandleDir; style: React.CSSProperties; cursor: string }[] = [
      { dir: "nw", style: { left: -half, top: -half }, cursor: "nwse-resize" },
      { dir: "ne", style: { right: -half, top: -half }, cursor: "nesw-resize" },
      { dir: "sw", style: { left: -half, bottom: -half }, cursor: "nesw-resize" },
      { dir: "se", style: { right: -half, bottom: -half }, cursor: "nwse-resize" },
    ];
    return positions.map(({ dir, style, cursor }) => (
      <div key={dir}
        onPointerDown={(e) => beginDrag(kind, id, "resize", dir, rect, e)}
        style={{
          position: "absolute", width: HANDLE_HIT, height: HANDLE_HIT,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor, touchAction: "none", // prevent the browser's own touch scroll/zoom from fighting the drag
          ...style, zIndex: 2,
        }}
      >
        <div style={{
          width: 12, height: 12, borderRadius: "50%",
          background: color, border: "1.5px solid white", boxShadow: "0 1px 4px rgba(0,0,0,.4)",
          pointerEvents: "none", // the outer 40x40 box owns the actual hit-testing
        }} />
      </div>
    ));
  };

  const boxStyle = (rect: Rect, color: string, selected: boolean, dashed = false): React.CSSProperties => ({
    position: "absolute",
    left: rect.x, top: rect.y, width: rect.w, height: rect.h,
    border: selected
      ? `1.5px ${dashed ? "dashed" : "solid"} ${color}`
      : "1.5px solid transparent",
    boxSizing: "border-box",
    cursor: "move",
    touchAction: "none",
  });

  // ── Build every interaction box, then order them so the DOM stacking
  // matches what's actually drawn on the canvas ────────────────────────────
  // Two rules, in order:
  //   1. The SELECTED object's box is always last (on top) — so once
  //      something is selected (by clicking it OR by selecting its layer in
  //      the timeline) you can always drag/scale it, even when a bigger,
  //      transparent box for another layer sits over it.
  //   2. Otherwise, match compositeFrame.ts's draw order — HIGHEST zIndex
  //      first (furthest back), LOWEST zIndex last (frontmost) — so the box
  //      painted last in the DOM is the one visually in front, and a click
  //      lands on whatever you actually see at that point. Previously the
  //      boxes were in a fixed kind order (clip → image → blur → text), so a
  //      wide transparent text box swallowed every click meant for a
  //      clip/image in front of it, and background layers couldn't be
  //      grabbed at all.
  type OverlayItem = { key: string; z: number; sel: boolean; node: React.ReactNode };
  const items: OverlayItem[] = [];

  clipsDetails
    .filter(c => currentTime >= c.startPosition && currentTime <= c.endPosition)
    .forEach(c => {
      const rect = getClipRect(c);
      const selected = selectedClipId === c.id;
      items.push({
        key: `clip-${c.id}`, z: c.zIndex ?? 0, sel: selected,
        node: (
          <div key={`clip-${c.id}`}
            onPointerDown={(e) => beginDrag("clip", c.id, "move", undefined, rect, e)}
            style={boxStyle(rect, ACCENT.clip, selected)}
          >
            {selected && renderHandles("clip", c.id, rect, ACCENT.clip, true)}
          </div>
        ),
      });
    });

  imagesDetails
    .filter(i => currentTime >= i.startTime && currentTime <= i.endTime)
    .forEach(img => {
      const rect = getImageRect(img);
      const selected = selectedImageID === img.id;
      items.push({
        key: `image-${img.id}`, z: img.zIndex ?? 0, sel: selected,
        node: (
          <div key={`image-${img.id}`}
            onPointerDown={(e) => beginDrag("image", img.id, "move", undefined, rect, e)}
            style={boxStyle(rect, ACCENT.image, selected)}
          >
            {selected && renderHandles("image", img.id, rect, ACCENT.image, false)}
          </div>
        ),
      });
    });

  blursDetails
    .filter(b => currentTime >= b.startTime && currentTime <= b.endTime)
    .forEach(b => {
      const rect = getBlurRect(b);
      const selected = selectedBlurId === b.id;
      items.push({
        key: `blur-${b.id}`, z: b.zIndex ?? 0, sel: selected,
        node: (
          <div key={`blur-${b.id}`}
            onPointerDown={(e) => beginDrag("blur", b.id, "move", undefined, rect, e)}
            style={{ ...boxStyle(rect, ACCENT.blur, selected, true), background: selected ? `${ACCENT.blur}0d` : "transparent" }}
          >
            {selected && renderHandles("blur", b.id, rect, ACCENT.blur, false)}
          </div>
        ),
      });
    });

  textsDetails
    .filter(t => currentTime >= t.startTime && currentTime <= t.endTime)
    .forEach(t => {
      const rect = getTextRect(t);
      const selected = selectedTextId === t.id;
      const editing = editingTextId === t.id;
      items.push({
        key: `text-${t.id}`, z: t.zIndex ?? 0, sel: selected || editing,
        node: (
          <div key={`text-${t.id}`}
            onPointerDown={(e) => { if (!editing) beginDrag("text", t.id, "move", undefined, rect, e); }}
            onClick={(e) => {
              e.stopPropagation();
              if (editing) return;
              // Tapping an ALREADY-selected text box again enters edit
              // mode. This only fires true on a second, separate tap —
              // React hasn't re-rendered with the just-set selection yet
              // during the very tap that selects it — so it naturally
              // reads as "tap once to select, tap again to edit," which
              // works reliably on touch (unlike double-tap/double-click,
              // which mobile browsers can eat as a zoom gesture instead of
              // ever reaching this handler).
              if (selectedTextId === t.id) {
                setEditingTextId(t.id);
                const neededH = measureWrappedTextHeight(t.text, t.fontSize, t.fontFamily, t.lineHeight, t.width, t.isBold, t.isItalic);
                if (neededH > t.height) {
                  setTextsDetails(prev => prev.map(d => d.id === t.id ? { ...d, height: neededH } : d));
                }
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingTextId(t.id);
              setSelectedTextId(t.id);
              const neededH = measureWrappedTextHeight(t.text, t.fontSize, t.fontFamily, t.lineHeight, t.width, t.isBold, t.isItalic);
              if (neededH > t.height) {
                setTextsDetails(prev => prev.map(d => d.id === t.id ? { ...d, height: neededH } : d));
              }
            }}
            style={boxStyle(rect, ACCENT.text, selected)}
          >
            {editing && (
              // Text glyphs stay invisible here (CompositorCanvas draws the
              // real visible text underneath, live, on every keystroke) —
              // only the blinking caret is visible, via `caretColor`. This
              // is the same trick Fabric.js used internally, just done with
              // a real textarea instead of a canvas-drawn fake cursor.
              <textarea
                autoFocus
                value={t.text}
                onChange={(e) => {
                  const newText = e.target.value;
                  setTextsDetails(prev => prev.map(d => {
                    if (d.id !== t.id) return d;
                    // Keep the box tall enough to fully contain the text as
                    // it wraps — recomputed with the exact same wrapping
                    // algorithm CompositorCanvas draws with, so the visible
                    // glyphs and the interaction box can't drift apart.
                    const neededH = measureWrappedTextHeight(newText, d.fontSize, d.fontFamily, d.lineHeight, d.width, d.isBold, d.isItalic);
                    return { ...d, text: newText, height: Math.max(d.height, neededH) };
                  }));
                }}
                onBlur={() => setEditingTextId(null)}
                onKeyDown={(e) => { if (e.key === "Escape") { e.currentTarget.blur(); } e.stopPropagation(); }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  background: "transparent", border: "none", outline: "none", resize: "none",
                  color: "transparent", caretColor: "white",
                  // Match the compositor's line advance (fontSize * lineHeight,
                  // default 1.2) so the caret sits on the same line as the
                  // glyphs it's drawing under.
                  fontFamily: t.fontFamily ?? "Arial", fontSize: t.fontSize, lineHeight: (t.lineHeight ?? 1.2) as number,
                  fontStyle: t.isItalic ? "italic" : "normal", fontWeight: t.isBold ? "bold" : "normal",
                  padding: 0, overflow: "hidden",
                }}
              />
            )}
            {selected && !editing && renderHandles("text", t.id, rect, ACCENT.text, false)}
          </div>
        ),
      });
    });

  // Non-selected boxes first — back-to-front (high z → low z), matching the
  // canvas draw order — then the selected/editing box on top of everything.
  items.sort((a, b) => (a.sel ? 1 : 0) - (b.sel ? 1 : 0) || b.z - a.z);

  return (
    <div
      ref={rootRef}
      onPointerDown={(e) => { if (e.target === rootRef.current) selectNone(); }}
      style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "auto" }}
    >
      {items.map(it => it.node)}

      {/* Snapping guides */}
      {guides.x && <div style={{ position: "absolute", left: width / 2, top: 0, bottom: 0, width: 1.5, background: "#FFB648", pointerEvents: "none" }} />}
      {guides.y && <div style={{ position: "absolute", top: height / 2, left: 0, right: 0, height: 1.5, background: "#FFB648", pointerEvents: "none" }} />}
    </div>
  );
}
