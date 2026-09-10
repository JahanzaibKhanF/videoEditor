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

/**
 * Tight bounding box of the actually-rendered text block — the widest
 * wrapped line's real pixel width (never more than `maxW`) and the total
 * wrapped height. Used to shrink-wrap the on-canvas selection box to the
 * glyphs (so a wide wrap box doesn't draw a big empty rectangle around a
 * short line, and clicks in that empty area fall through to layers behind).
 * `wrapWidthKnown` skips re-measuring width when the caller already has it.
 */
export function measureTextBlock(
  text: string,
  fontSize: number,
  fontFamily: string,
  lineHeight: number,
  maxW: number,
  isBold?: boolean,
  isItalic?: boolean,
): { width: number; height: number; lines: number } {
  const ctx = getMeasureCtx();
  const lineH = fontSize * (lineHeight || 1.2);
  if (!ctx || maxW <= 0) {
    return { width: Math.max(1, maxW), height: Math.max(lineH, fontSize * 1.4), lines: 1 };
  }
  ctx.font = `${isItalic ? "italic" : "normal"} ${isBold ? "bold" : "normal"} ${fontSize}px "${fontFamily ?? "Arial"}", sans-serif`;
  const lines = wrapTextLines(ctx, text && text.length ? text : " ", maxW);
  let widest = 0;
  for (const ln of lines) widest = Math.max(widest, ctx.measureText(ln || " ").width);
  // A hair of trailing room so italic overhang / antialiasing isn't clipped
  // by the selection outline, but nothing like the old fixed box slack.
  const pad = Math.max(2, fontSize * 0.08);
  return {
    width: Math.min(maxW, Math.ceil(widest + pad)),
    height: Math.ceil(Math.max(lineH, lines.length * lineH) + fontSize * 0.18),
    lines: lines.length,
  };
}
