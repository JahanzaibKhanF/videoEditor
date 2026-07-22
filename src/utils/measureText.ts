/**
 * Shared text-wrapping logic — single source of truth used by BOTH
 * CompositorCanvas's actual glyph drawing AND the text bounding-box sizing
 * in InteractionOverlay/TextEditor. Before this existed, the box size was
 * a fixed value set once when a text layer was created and never
 * recalculated as content/font size changed, while the actual wrapped
 * line count was computed fresh on every canvas draw — the two could
 * drift apart, which is what caused the selection/edit box to not fully
 * cover longer or larger text. Wrapping the line-break algorithm here
 * once means both places can never disagree about how many lines a given
 * piece of text takes up.
 */

export function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine === "") { lines.push(""); continue; }
    let cur = "";
    for (const word of rawLine.split(" ")) {
      const test = cur ? cur + " " + word : word;
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines.length > 0 ? lines : [""];
}

let measureCanvas: HTMLCanvasElement | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null; // SSR guard
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  return measureCanvas.getContext("2d");
}

/**
 * Returns the pixel height needed to fully contain `text` once wrapped to
 * `maxW`, using the exact same font string CompositorCanvas draws with.
 * Includes a little vertical padding so the selection box doesn't hug
 * text glyphs pixel-tight (matches the built-in leading most fonts have).
 */
export function measureWrappedTextHeight(
  text: string,
  fontSize: number,
  fontFamily: string,
  lineHeight: number,
  maxW: number,
  isBold?: boolean,
  isItalic?: boolean,
): number {
  const ctx = getMeasureCtx();
  const lineH = fontSize * (lineHeight || 1.2);
  if (!ctx || maxW <= 0) return Math.max(lineH, fontSize * 1.4);

  ctx.font = `${isItalic ? "italic" : "normal"} ${isBold ? "bold" : "normal"} ${fontSize}px "${fontFamily ?? "Arial"}", sans-serif`;
  const lines = wrapTextLines(ctx, text || " ", maxW);
  return Math.max(lineH, lines.length * lineH) + fontSize * 0.3;
}
