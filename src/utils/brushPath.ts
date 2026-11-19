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

/** Arc-length reveal of the SAME midpoint-quadratic geometry as brushPath.
 * Curves are sampled only for partial frames; the completed path stays exact.
 * Coordinates here are pixels, so reveal speed accounts for non-square boxes.
 */
export function revealedBrushPath(points: BrushPoint[], smooth: boolean, closed: boolean, progress: number): string {
  if (progress >= 1) return brushPath(points, smooth, closed);
  if (progress <= 0 || points.length < 2) return "";
  const mid = (a: BrushPoint, b: BrushPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const samples: BrushPoint[] = [];
  const quadratic = (a: BrushPoint, b: BrushPoint, c: BrushPoint) => {
    const length = Math.hypot(b.x-a.x,b.y-a.y) + Math.hypot(c.x-b.x,c.y-b.y);
    const steps = Math.max(8, Math.min(128, Math.ceil(length / 3)));
    for (let i=1;i<=steps;i++) {
      const t=i/steps, u=1-t;
      samples.push({x:u*u*a.x+2*u*t*b.x+t*t*c.x,y:u*u*a.y+2*u*t*b.y+t*t*c.y});
    }
  };
  if (!smooth || points.length < 3) {
    samples.push(...points); if (closed) samples.push(points[0]);
  } else if (closed) {
    samples.push(mid(points[points.length-1],points[0]));
    points.forEach((p,i)=>quadratic(samples[samples.length-1],p,mid(p,points[(i+1)%points.length])));
  } else {
    samples.push(points[0]);
    for(let i=1;i<points.length-1;i++) quadratic(samples[samples.length-1],points[i],mid(points[i],points[i+1]));
    samples.push(points[points.length-1]);
  }
  const lengths = samples.slice(1).map((p,i)=>Math.hypot(p.x-samples[i].x,p.y-samples[i].y));
  let remaining = lengths.reduce((a,b)=>a+b,0) * progress;
  const visible = [samples[0]];
  for(let i=0;i<lengths.length;i++) {
    const a=samples[i], b=samples[i+1], length=lengths[i];
    if (remaining >= length) { visible.push(b); remaining-=length; }
    else { const f=length ? remaining/length : 0; visible.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f}); break; }
  }
  return brushPath(visible);
}
