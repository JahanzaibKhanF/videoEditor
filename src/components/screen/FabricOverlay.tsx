"use client";

/**
 * FabricOverlay — transparent interaction layer (drag/resize handles only).
 *
 * THE FUNDAMENTAL RULE:
 * textsDetails/imagesDetails/blursDetails/clipsDetails must NOT be in the
 * useEffect dependency array. If they are, every keystroke triggers cleanup
 * (canvas.dispose()) → recreation, which either steals focus or leaves a
 * dead canvas.
 *
 * Instead:
 *  - All data is kept in refs (always fresh inside event handlers)
 *  - A separate "structureVersion" counter bumps ONLY when items are
 *    added or removed — that triggers a canvas rebuild
 *  - currentTime changes only update object visibility (no rebuild)
 */

import { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import { useAppDetailsContext } from "../../context/useAppContext";

interface Props {
  width: number;
  height: number;
}

export default function FabricOverlay({ width, height }: Props) {
  const {
    currentTime,
    textsDetails,
    setTextsDetails,
    imagesDetails,
    setImagesDetails,
    blursDetails,
    setBlursDetails,
    clipsDetails,
    setClipsDetails,
    imageRefs,
    setSelectedImageID,
    setSelectedTextId,
    setSelectedBlurId,
    previewScale,
  } = useAppDetailsContext();

  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);

  // Always-fresh data refs — event handlers read these, never stale closures
  const textsRef = useRef(textsDetails);
  const imagesRef = useRef(imagesDetails);
  const blursRef = useRef(blursDetails);
  const clipsRef = useRef(clipsDetails);
  const imageRefsR = useRef(imageRefs);

  useEffect(() => {
    textsRef.current = textsDetails;
  }, [textsDetails]);
  useEffect(() => {
    imagesRef.current = imagesDetails;
  }, [imagesDetails]);
  useEffect(() => {
    blursRef.current = blursDetails;
  }, [blursDetails]);
  useEffect(() => {
    clipsRef.current = clipsDetails;
  }, [clipsDetails]);
  useEffect(() => {
    imageRefsR.current = imageRefs;
  }, [imageRefs]);

  // structureVersion bumps only when items are added or removed
  // (not on property changes like text content, position, color…)
  const [structureVersion, setStructureVersion] = useState(0);

  const prevTextsLen = useRef(textsDetails.length);
  const prevImagesLen = useRef(imagesDetails.length);
  const prevBlursLen = useRef(blursDetails.length);
  const prevClipsLen = useRef(clipsDetails.length);

  useEffect(() => {
    const tChanged = textsDetails.length !== prevTextsLen.current;
    const iChanged = imagesDetails.length !== prevImagesLen.current;
    const bChanged = blursDetails.length !== prevBlursLen.current;
    const cChanged = clipsDetails.length !== prevClipsLen.current;
    prevTextsLen.current = textsDetails.length;
    prevImagesLen.current = imagesDetails.length;
    prevBlursLen.current = blursDetails.length;
    prevClipsLen.current = clipsDetails.length;
    if (tChanged || iChanged || bChanged || cChanged) {
      setStructureVersion((v) => v + 1);
    }
  }, [
    textsDetails.length,
    imagesDetails.length,
    blursDetails.length,
    clipsDetails.length,
  ]);

  // ── Full canvas rebuild — only on size or structure changes ──────────
  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;

    if (fabricRef.current) {
      try {
        fabricRef.current.dispose();
      } catch {}
      fabricRef.current = null;
    }

    const canvas = new fabric.Canvas(el, {
      width,
      height,
      backgroundColor: "transparent",
      selection: true,
      renderOnAddRemove: true,
    });
    fabricRef.current = canvas;

    // ── Video clip handles ──────────────────────────────────────────
    clipsRef.current.forEach((clip) => {
      const rect = new fabric.Rect({
        left: clip.x ?? 0,
        top: clip.y ?? 0,
        width: (clip.width ?? width) * (clip.scale ?? 1),
        height: (clip.height ?? height) * (clip.scale ?? 1),
        fill: "transparent",
        stroke: "rgba(255,0,255,0)",
        cornerColor: "#FF00FF",
        borderColor: "#FF00FF",
        lockRotation: true,
        transparentCorners: false,
        opacity: 0.001,
        visible:
          currentTime >= clip.startPosition && currentTime <= clip.endPosition,
      });
      (rect as any).id = clip.id;
      canvas.add(rect);
      rect.on("modified", () => {
        setClipsDetails((prev) =>
          prev.map((c) =>
            c.id === clip.id
              ? { ...c, x: rect.left, y: rect.top, scale: rect.scaleX }
              : c,
          ),
        );
      });
    });

    // ── Image handles ───────────────────────────────────────────────
    imagesRef.current.forEach((detail, idx) => {
      const imgEl = imageRefsR.current[idx];
      if (!imgEl) return;
      const img = new fabric.FabricImage(imgEl, {
        left: detail.imageX,
        top: detail.imageY,
        scaleX: detail.scaleX,
        scaleY: detail.scaleY,
        opacity: 0.001,
        cornerColor: "#007AFF",
        borderColor: "#007AFF",
        transparentCorners: false,
        visible:
          currentTime >= detail.startTime && currentTime <= detail.endTime,
      });
      (img as any).id = detail.id;
      canvas.add(img);
      img.on("selected", () => {
        setSelectedImageID(detail.id);
        setSelectedBlurId(null);
        setSelectedTextId(null);
      });
      img.on("modified", () => {
        setImagesDetails((prev) =>
          prev.map((d) =>
            d.id === detail.id
              ? {
                  ...d,
                  imageX: img.left,
                  imageY: img.top,
                  scaleX: img.scaleX,
                  scaleY: img.scaleY,
                  opacity: img.opacity,
                  width: img.width * img.scaleX,
                  height: img.height * img.scaleY,
                }
              : d,
          ),
        );
      });
    });

    // ── Text handles ─────────────────────────────────────────────────
    textsRef.current.forEach((detail) => {
      const textbox = new fabric.Textbox(detail.text, {
        left: detail.textX,
        top: detail.textY,
        width: detail.width,
        fontSize: detail.fontSize,
        fontFamily: detail.fontFamily ?? "Arial",
        fill: "rgba(0,0,0,0)", // transparent: CompositorCanvas draws the text
        backgroundColor: "transparent",
        cornerColor: "#00FFFF",
        borderColor: "#00FFFF",
        transparentCorners: false,
        fontStyle: detail.isItalic ? "italic" : "normal",
        fontWeight: detail.isBold ? "bold" : "normal",
        underline: detail.isUnderline,
        opacity: 0.001, // nearly invisible but still hittable
        hasBorders: true,
        hasControls: true,
        visible:
          currentTime >= detail.startTime && currentTime <= detail.endTime,
      });
      (textbox as any).id = detail.id;
      canvas.add(textbox);

      // Double-click: enter edit mode — raise opacity so cursor is visible
      textbox.on("editing:entered", () => {
        textbox.set({
          opacity: 1,
          fill: "rgba(0,0,0,0)",
          hasBorders: false,
          hasControls: false,
        });
        canvas.requestRenderAll();
      });

      // Exit edit mode: go invisible again
      // Do NOT rebuild here — the structureVersion mechanism handles rebuilds,
      // and text content is saved via the "changed" event below
      textbox.on("editing:exited", () => {
        textbox.set({
          opacity: 0.001,
          fill: "rgba(0,0,0,0)",
          hasBorders: true,
          hasControls: true,
        });
        canvas.requestRenderAll();
      });

      textbox.on("selected", () => {
        setSelectedTextId(detail.id);
        setSelectedImageID(null);
        setSelectedBlurId(null);
      });

      // Save text content on every keystroke — NO rebuild triggered
      textbox.on("changed", () => {
        setTextsDetails((prev) =>
          prev.map((d) =>
            d.id === detail.id ? { ...d, text: textbox.text ?? d.text } : d,
          ),
        );
      });

      // Save position/size after drag/resize — NO rebuild triggered
      textbox.on("modified", () => {
        setTextsDetails((prev) =>
          prev.map((d) =>
            d.id === detail.id
              ? {
                  ...d,
                  textX: textbox.left,
                  textY: textbox.top,
                  width: textbox.width * textbox.scaleX,
                  height: textbox.height * textbox.scaleY,
                }
              : d,
          ),
        );
      });
    });

    // ── Blur handles ────────────────────────────────────────────────
    blursRef.current.forEach((blur) => {
      const rect = new fabric.Rect({
        left: blur.x,
        top: blur.y,
        width: blur.width,
        height: blur.height,
        fill: "rgba(0,0,0,0.001)",
        stroke: "rgba(16,185,129,0.6)",
        strokeWidth: 2,
        strokeDashArray: [6, 3],
        cornerColor: "#10B981",
        borderColor: "#10B981",
        lockRotation: true,
        transparentCorners: false,
        visible: currentTime >= blur.startTime && currentTime <= blur.endTime,
      });
      (rect as any).id = blur.id;
      canvas.add(rect);
      rect.on("selected", () => {
        setSelectedBlurId(blur.id);
        setSelectedImageID(null);
        setSelectedTextId(null);
      });
      rect.on("modified", () => {
        setBlursDetails((prev) =>
          prev.map((b) =>
            b.id === blur.id
              ? {
                  ...b,
                  x: rect.left,
                  y: rect.top,
                  width: rect.width * rect.scaleX,
                  height: rect.height * rect.scaleY,
                }
              : b,
          ),
        );
      });
    });

    // ── Canvas-level events ─────────────────────────────────────────
    canvas.on("mouse:down", (e) => {
      if (!e.target) {
        const active = canvas.getActiveObject();
        if (active && (active as fabric.Textbox).isEditing) {
          (active as fabric.Textbox).exitEditing();
        }
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        setSelectedImageID(null);
        setSelectedTextId(null);
        setSelectedBlurId(null);
      }
    });

    const onKey = (e: KeyboardEvent) => {
      const active = canvas.getActiveObject() as fabric.Textbox | null;

      if (e.key === "Escape" && active?.isEditing) {
        active.exitEditing();
        canvas.requestRenderAll();
        return;
      }

      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (
        (e.target as HTMLElement)?.tagName === "INPUT" ||
        (e.target as HTMLElement)?.tagName === "TEXTAREA"
      )
        return;
      if (active?.isEditing) return;

      const id = (active as any)?.id;
      if (!id) return;
      canvas.remove(active!);
      canvas.discardActiveObject();
      // Removing triggers length change → structureVersion bump → rebuild
      setTextsDetails((prev) => prev.filter((d) => d.id !== id));
      setImagesDetails((prev) => prev.filter((d) => d.id !== id));
      setBlursDetails((prev) => prev.filter((d) => d.id !== id));
      setSelectedImageID(null);
      setSelectedTextId(null);
      setSelectedBlurId(null);
    };
    window.addEventListener("keydown", onKey);

    // ── Snapping guides ─────────────────────────────────────────────
    let xLine: fabric.Line | null = null;
    let yLine: fabric.Line | null = null;
    canvas.on("object:moving", (e) => {
      const obj = e.target;
      if (!obj) return;
      const cx = obj.left + (obj.width * obj.scaleX) / 2;
      const cy = obj.top + (obj.height * obj.scaleY) / 2;
      if (Math.abs(cx - width / 2) < 8) {
        obj.left = width / 2 - (obj.width * obj.scaleX) / 2;
        if (!xLine) {
          xLine = new fabric.Line([width / 2, 0, width / 2, height], {
            stroke: "#FF6A3D",
            strokeWidth: 1,
            selectable: false,
            evented: false,
          });
          canvas.add(xLine);
        }
      } else {
        if (xLine) {
          canvas.remove(xLine);
          xLine = null;
        }
      }
      if (Math.abs(cy - height / 2) < 8) {
        obj.top = height / 2 - (obj.height * obj.scaleY) / 2;
        if (!yLine) {
          yLine = new fabric.Line([0, height / 2, width, height / 2], {
            stroke: "#FF6A3D",
            strokeWidth: 1,
            selectable: false,
            evented: false,
          });
          canvas.add(yLine);
        }
      } else {
        if (yLine) {
          canvas.remove(yLine);
          yLine = null;
        }
      }
      canvas.requestRenderAll();
    });
    canvas.on("object:modified", () => {
      if (xLine) {
        canvas.remove(xLine);
        xLine = null;
      }
      if (yLine) {
        canvas.remove(yLine);
        yLine = null;
      }
    });

    return () => {
      window.removeEventListener("keydown", onKey);
      try {
        canvas.dispose();
      } catch {}
      fabricRef.current = null;
    };
    // Only rebuild when canvas SIZE or item COUNT changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, structureVersion, previewScale]);

  // ── Visibility sync — no rebuild, just show/hide objects ─────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach((obj) => {
      const id = (obj as any).id;
      if (!id) return;
      const t = textsRef.current.find((d) => d.id === id);
      const i = imagesRef.current.find((d) => d.id === id);
      const b = blursRef.current.find((d) => d.id === id);
      const c = clipsRef.current.find((d) => d.id === id);
      const item = t || i || b || c;
      if (!item) return;
      const start = (item as any).startTime ?? (item as any).startPosition ?? 0;
      const end =
        (item as any).endTime ?? (item as any).endPosition ?? Infinity;
      obj.visible = currentTime >= start && currentTime <= end;
    });
    canvas.requestRenderAll();
  }, [currentTime]);

  return (
    <canvas
      ref={canvasElRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "auto",
        zIndex: 50,
      }}
    />
  );
}
