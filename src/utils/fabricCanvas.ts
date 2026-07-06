import * as fabric from "fabric";
import {
  BlurDetails,
  ClipDetails,
  ImageDetails,
  TextDetails,
} from "../types/types";

export const fabricCanvas = ({
  canvasInstance,
  canvasEl,

  imagesDetails,
  textsDetails,
  blursDetails,
  setBlursDetails,
  setShowAnimationOptionsFor,
  currentTime,
  setSelectedImageID,
  setSelectedTextId,
  setSelectedBlurId,
  setImagesDetails,
  setTextsDetails,
  imageRefs,
  setIsCanvasActive,
  previewScale,
  clipsDetails,
  setClipsDetails,
}: {
  canvasInstance: fabric.Canvas | null;
  canvasEl: React.RefObject<HTMLCanvasElement>;

  imagesDetails: Array<ImageDetails>;
  textsDetails: Array<TextDetails>;
  blursDetails: Array<BlurDetails>;
  setBlursDetails: React.Dispatch<React.SetStateAction<Array<BlurDetails>>>;
  setShowAnimationOptionsFor: React.Dispatch<React.SetStateAction<string>>;
  currentTime: number;
  selectedImageID: string | null;
  setSelectedImageID: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedTextId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedTextId: string | null;
  selectedBlurId: string | null;
  setSelectedBlurId: React.Dispatch<React.SetStateAction<string | null>>;
  setImagesDetails: React.Dispatch<React.SetStateAction<Array<ImageDetails>>>;
  setTextsDetails: React.Dispatch<React.SetStateAction<Array<TextDetails>>>;
  imageRefs: Record<number, HTMLImageElement | null>;
  setIsCanvasActive: React.Dispatch<React.SetStateAction<boolean>>;
  previewScale: number | null;
  clipsDetails: Array<ClipDetails>;
  setClipsDetails: React.Dispatch<React.SetStateAction<Array<ClipDetails>>>;
}) => {
  let xLineTop: fabric.Line | null = null;

  let yLineLeft: fabric.Line | null = null;

  const canvas =
    canvasInstance || new fabric.Canvas(canvasEl.current || undefined);

  // Clear the canvas before adding new objects
  canvas.clear();

  clipsDetails.forEach((clip) => {
    const video = new fabric.Rect({
      left: clip.x,
      top: clip.y,
      width: clip.width,
      height: clip.height,
      fill: "transparent",
      cornerColor: " #FF00FF",
      borderColor: " #FF00FF",

      lockRotation: true,
      scaleX: clip.scale,
      scaleY: clip.scale,
      id: clip.id,
    });
    canvas.add(video);
    if (currentTime >= clip.startPosition && currentTime <= clip.endPosition) {
      video.visible = true;
    } else {
      video.visible = false;
    }
    video.on("modified", () => {
      setClipsDetails(
        clipsDetails.map((clip) => {
          if (clip.id === video.get("id")) {
            return {
              ...clip,
              x: video.left,
              y: video.top,
              scale: video.scaleX,
            };
          }
          return clip;
        })
      );
    });
  });
  // Adding multiple images
  imagesDetails.forEach((detail, index) => {
    const imgElement = imageRefs[index];
    if (imgElement && detail.animation === "none") {
      const img = new fabric.FabricImage(imgElement, {
        left: detail.imageX,
        top: detail.imageY,
        opacity: detail.opacity,
        cornerColor: " #007AFF",
        borderColor: " #007AFF",
        scaleX: detail.scaleX,
        scaleY: detail.scaleY,
      });
      canvas.add(img);

      img.set("id", detail.id);
      if (currentTime >= detail.startTime && currentTime <= detail.endTime) {
        img.visible = true;
      } else {
        img.visible = false;
      }

      img.on("selected", () => {
        setSelectedImageID(img.get("id"));
        setSelectedBlurId(null);
        setSelectedTextId(null);
        setShowAnimationOptionsFor("image");
        setIsCanvasActive(false);
      });
      img.on("deselected", () => {
        setIsCanvasActive(false);
      });
      img.on("modified", () => {
        const id = img.get("id");
        setSelectedImageID(id);

        const prevDetail = imagesDetails.find((detail) => detail.id === id);
        if (prevDetail) {
          setImagesDetails([
            ...imagesDetails.filter((detail) => detail.id !== id),
            {
              ...prevDetail,
              imageX: img.left,
              imageY: img.top,
              opacity: img.opacity,
              scaleX: img.scaleX,
              scaleY: img.scaleY,
              width: img.width * img.scaleX,
              height: img.height * img.scaleY,
            },
          ]);
        }
      });
    }
  });

  // Adding multiple text objects
  textsDetails.forEach((detail) => {
    const fabricText = new fabric.Textbox(detail.text, {
      cornerColor: " #00FFFF",
      borderColor: " #00FFFF",
      top: detail.textY,
      left: detail.textX,
      fontSize: detail.fontSize,
      lineHeight: detail.lineHeight,

      width: detail.width,
      height: detail.height,
      fontFamily: detail.fontFamily,
      fill: detail.textColor,
      backgroundColor: detail.backgroundColor,
      shadow: new fabric.Shadow({
        color: detail.shadowColor,
        blur: detail.shadowBlur,
        offsetX: detail.shadowOffsetX,
        offsetY: detail.shadowOffsetY,
      }),
      fontStyle: detail.isItalic ? "italic" : "normal",
      fontWeight: detail.isBold ? "bold" : "normal",
      underline: detail.isUnderline,
      opacity: detail.opacity,
    });
    fabricText.set("id", detail.id);
    canvas.add(fabricText);
    if (
      currentTime >= detail.startTime &&
      currentTime <= detail.endTime &&
      detail.animation === "none"
    ) {
      fabricText.visible = true;
    } else {
      fabricText.visible = false;
    }

    fabricText.on("selected", () => {
      setSelectedTextId(fabricText.get("id"));
      setSelectedImageID(null);
      setSelectedBlurId(null);
      setShowAnimationOptionsFor("text");
      setIsCanvasActive(true);
    });
    fabricText.on("deselected", () => {
      setIsCanvasActive(false);
    });
    fabricText.on("modified", () => {
      const id = fabricText.get("id");
      const prevDetail = textsDetails.find((detail) => detail.id === id);
      if (prevDetail) {
        const updatedDetail = {
          ...prevDetail,
          text: fabricText.text || "",
          textX: fabricText.left,
          textY: fabricText.top,
          width: fabricText.width,
          heigth: fabricText.height,

          fontSize: fabricText.fontSize * fabricText.scaleX,
          lineHeight: fabricText.lineHeight,
          opacity: fabricText.opacity,
        };
        setTextsDetails((prevDetails) =>
          prevDetails.map((detail) =>
            detail.id === fabricText.get("id") ? updatedDetail : detail
          )
        );
      }
    });
  });
  blursDetails.forEach((detail) => {
    if (currentTime >= detail.startTime && currentTime <= detail.endTime) {
      // Note this rect is for blur
      const rect = new fabric.Rect({
        left: detail.x,
        top: detail.y,
        width: detail.width,
        height: detail.height,
        fill: "transparent",
        cornerColor: " #B96BFF",
        borderColor: " #B96BFF",
      });
      rect.set("id", detail.id);
      canvas.add(rect);

      if (currentTime >= detail.startTime && currentTime <= detail.endTime) {
        rect.visible = true;
      } else {
        rect.visible = false;
      }

      rect.on("selected", () => {
        setSelectedBlurId(rect.get("id"));

        setIsCanvasActive(false);
      });
      rect.on("deselected", () => {
        setIsCanvasActive(false);
      });
      rect.on("modified", () => {
        const id = rect.get("id");
        const prevDetail = blursDetails.find((detail) => detail.id === id);
        if (prevDetail) {
          const updatedDetail = {
            ...prevDetail,
            x: rect.left || 0,
            y: rect.top || 0,
            width: (rect.width || 0) * (rect.scaleX || 1),
            height: (rect.height || 0) * (rect.scaleY || 1),
          };
          setBlursDetails((prevDetails) =>
            prevDetails.map((detail) =>
              detail.id === rect.get("id") ? updatedDetail : detail
            )
          );
        }
      });
    }
  });
  canvas.getObjects().forEach((obj) => {
    obj.borderScaleFactor = 1 / (previewScale || 1); // prevent divide by 0
    obj.cornerSize = 12 / (previewScale || 1); // keeps corner size (resize handles) stable
  });
  canvas.requestRenderAll();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Delete") {
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        const id = activeObject.get("id");
        switch (activeObject.type) {
          case "image":
            setImagesDetails((prevDetails) =>
              prevDetails.filter((detail) => detail.id !== id)
            );
            break;
          case "textbox":
            setTextsDetails((prevDetails) =>
              prevDetails.filter((detail) => detail.id !== id)
            );
            break;
          case "rect":
            setBlursDetails((prevDetails) =>
              prevDetails.filter((detail) => detail.id !== id)
            );
            break;
        }
        canvas.remove(activeObject);
      }
    }
  });
  // for saving text even clickoutside canvas
  document.addEventListener("mousedown", (event) => {
    const activeObject = canvas.getActiveObject();

    if (
      activeObject instanceof fabric.Textbox &&
      activeObject.isEditing &&
      canvas.wrapperEl &&
      !canvas.wrapperEl.contains(event.target as Node)
    ) {
      activeObject.exitEditing();
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
  });
  // add guidlines on canvas when moving objects
  canvas.on("object:moving", (e) => {
    const obj = e.target;
    if (!obj) return;

    const canvasWidth = canvas.getWidth();
    const canvasHeight = canvas.getHeight();

    const left = obj.left ?? 0;
    const top = obj.top ?? 0;
    const width = (obj.width ?? 0) * (obj.scaleX ?? 1);
    const height = (obj.height ?? 0) * (obj.scaleY ?? 1);

    const centerX = left + width / 2;
    const centerY = top + height / 2;

    // clear old lines
    [xLineTop, yLineLeft].forEach((line) => {
      if (line) canvas.remove(line);
    });
    xLineTop = yLineLeft = null;

    const threshold = 3; // small tolerance in px

    // vertical guideline if object's centerX ≈ canvas centerX
    if (Math.abs(centerX - canvasWidth / 2) <= threshold) {
      xLineTop = new fabric.Line(
        [canvasWidth / 2, 0, canvasWidth / 2, canvasHeight],
        {
          stroke: "#FF00FF",
          strokeWidth: 4,
          selectable: false,
          evented: false,
        }
      );
      canvas.add(xLineTop);
    }

    // horizontal guideline if object's centerY ≈ canvas centerY
    if (Math.abs(centerY - canvasHeight / 2) <= threshold) {
      yLineLeft = new fabric.Line(
        [0, canvasHeight / 2, canvasWidth, canvasHeight / 2],
        {
          stroke: "#FF00FF",
          strokeWidth: 4,
          selectable: false,
          evented: false,
        }
      );
      canvas.add(yLineLeft);
    }

    canvas.requestRenderAll();
  });

  // clear on mouse up
  canvas.on("mouse:up", () => {
    [xLineTop, yLineLeft].forEach((line) => {
      if (line) canvas.remove(line);
    });
    xLineTop = yLineLeft = null;
    canvas.requestRenderAll();
  });

  return canvas; // Return the canvas instance for reuse
};

export default fabricCanvas;
