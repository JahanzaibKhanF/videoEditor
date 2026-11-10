import type { BrushPoint } from "../types/types";

/** Shared SVG/Canvas path geometry for live drawing, preview and export. */
export function brushPath(points: BrushPoint[], smooth = false, closed = false): string {
  if (points.length < 2) return "";
  const pair = (p: BrushPoint) => `${p.x} ${p.y}`;
  if (!smooth || points.length < 3) return `M ${pair(points[0])} ${points.slice(1).map(p => `L ${pair(p)}`).join(" ")}${closed ? " Z" : ""}`;
  const mid = (a: BrushPoint, b: BrushPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  if (closed) {
    const start = mid(points[points.length - 1], points[0]);
    return `M ${pair(start)} ${points.map((p, i) => `Q ${pair(p)} ${pair(mid(p, points[(i + 1) % points.length]))}`).join(" ")} Z`;
  }
  let path = `M ${pair(points[0])}`;
  for (let i = 1; i < points.length - 1; i++) path += ` Q ${pair(points[i])} ${pair(mid(points[i], points[i + 1]))}`;
  return `${path} L ${pair(points[points.length - 1])}`;
}
