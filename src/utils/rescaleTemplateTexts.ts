/**
 * Rescales template text positions/sizes to match actual canvas dimensions.
 * Called after template is applied and video is loaded (real canvas size known).
 */
import { TextDetails, BlurDetails } from "../types/types";

export function rescaleTexts(
  texts: TextDetails[],
  fromW: number, fromH: number,
  toW: number, toH: number
): TextDetails[] {
  if (fromW === toW && fromH === toH) return texts;
  const sx = toW / fromW;
  const sy = toH / fromH;
  return texts.map(t => ({
    ...t,
    textX: Math.round(t.textX * sx),
    textY: Math.round(t.textY * sy),
    width: Math.round(t.width * sx),
    height: Math.round(t.height * sy),
    fontSize: Math.round(t.fontSize * Math.min(sx, sy)),
  }));
}

export function rescaleBlurs(
  blurs: BlurDetails[],
  fromW: number, fromH: number,
  toW: number, toH: number
): BlurDetails[] {
  if (fromW === toW && fromH === toH) return blurs;
  const sx = toW / fromW;
  const sy = toH / fromH;
  return blurs.map(b => ({
    ...b,
    x: Math.round(b.x * sx),
    y: Math.round(b.y * sy),
    width: Math.round(b.width * sx),
    height: Math.round(b.height * sy),
  }));
}
