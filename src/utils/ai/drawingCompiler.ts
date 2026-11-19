import type { EditorPlan } from './editorPlan';

const numbers = { type: 'array', items: { type: 'number' } };
// Numeric min/max are not enforced for floats by every local decoder. A small
// normalized grid guarantees valid generated contour coordinates; the compiler
// still accepts arbitrary in-range precision from callers.
const pointCoordinate = { type: 'number', enum: Array.from({length:21},(_,i)=>i/20) };
/** Keep decoder repetition unbounded: enforce sizes in the compiler instead of
 * expanding a huge llama.cpp grammar. No subject-specific primitives or routing. */
const commonPart = {
  n: { type: 'string' }, b: { ...numbers, minItems:4 }, parent: { type: 'string' }, a: { type: 'number' },
  m: { type: 'array', minItems:2, items: { ...numbers, minItems:5 } },
};
const paintColor = { type:'string', pattern:'^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|transparent)$' };
const paint = { c: paintColor, stroke: paintColor, sw: { type: 'number' } };
const partSchema = (g: string[], properties: Record<string, unknown>, required: string[]) => ({
  type: 'object', additionalProperties: false, required: ['n','g','b',...required],
  properties: { n: commonPart.n, g: { type: 'string', enum:g }, parent: commonPart.parent, b: commonPart.b,
    ...properties, a: commonPart.a, m: commonPart.m },
});
export const DRAWING_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['mode', 'version', 'summary', 'parts'],
  properties: {
    mode: { type:'string', enum:['draw'] }, version: { type:'integer', enum:[1] }, summary: { type: 'string' }, duration: { type: 'number', minimum:.1, maximum:10 },
    parts: { type: 'array', items: { anyOf: [
      partSchema(['group'], {}, []),
      partSchema(['ellipse','rect','triangle'], paint, ['c']),
      partSchema(['path'], { ...paint, p: { type:'array', minItems:3, items: { type:'array', minItems:2, items:pointCoordinate } }, closed:{type:'boolean'}, smooth:{type:'boolean'} }, ['c','p','closed']),
    ] } },
  },
};
export const DRAWING_INSTRUCTIONS = `COMPACT DRAWINGS (different units from native operations): {"mode":"draw","version":1,"summary":"brief outcome","parts":[...],"duration":5}.
Each part has n (unique name), g (group|ellipse|rect|triangle|path), b=[centerX,centerY,width,height], c=hex fill (transparent for outlines). Coordinates span a centered square 0..1; +X right, +Y DOWN. Establish the large silhouette FIRST, then smaller contrasting features ON TOP. Later parts cover earlier ones. Similar width/height gives a round shape; small height makes it flat.
parent names an EARLIER part. Decide parent BEFORE coordinates: with parent, b center is an OFFSET, normally near ZERO, NOT .5; negative Y is above, negative X left. Width/height remain square units, not parent fractions. For example offset [-.1,0] is left of parent center. Without parent, [.5,.5] is canvas center. group is an invisible shared pivot; children inherit its rotation and scale. No emoji or labels as drawings.
a=base degrees. Prefer ellipse/rect/triangle (triangle points up). For irregular contours, path REQUIRES p:[[x,y],...] and closed:true/false; p uses local box coordinates 0..1 on a .05 grid, never negative. smooth:true rounds curves. stroke=hex and sw=square-unit width; an open path needs stroke.
Motion m:[[seconds,dx,dy,degrees,scale],...] starts [0,0,0,0,1]. Offsets use square units, rotation degrees, scale 1 unchanged. Rotation requests MUST change the degrees column. Animate only requested parts; OMIT m on static parts. Keep all parts on canvas. At most 24 parts, 32 path points, 8 motion keys, duration .1..10s. Check silhouette, feature placement, paint order and actual movement before replying.`;

type Part = { n: string; g: string; b: number[]; c?: string; parent?: string; a?: number; p?: number[][]; closed?: boolean; smooth?: boolean; stroke?: string; sw?: number; m?: number[][] };
type Pose = { x: number; y: number; a: number; s: number };
const fail = (message: string): never => { throw new Error(`Drawing: ${message}`); };
function fields(value: any, allowed: string[], label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) fail(`invalid ${label} fields`);
}
function tuple(value: unknown, length: number, label: string): asserts value is number[] {
  if (!Array.isArray(value) || value.length !== length || value.some(v => typeof v !== 'number' || !Number.isFinite(v))) fail(`${label} needs ${length} finite numbers`);
}
const color = (v: unknown) => typeof v === 'string' && /^(#[0-9a-f]{3}|#[0-9a-f]{6}|transparent)$/i.test(v);
const rad = (degrees: number) => degrees * Math.PI / 180;

/** Lower to the existing atomic plan. Parent motion is baked into native layer
 * keyframes; no new persisted type, renderer or React/history state is needed. */
export function compileDrawing(raw: unknown, canvas: { width: number; height: number }): EditorPlan {
  fields(raw, ['mode', 'version', 'summary', 'duration', 'parts'], 'drawing');
  if ('mode' in (raw as object) && (raw as {mode:unknown}).mode !== 'draw') fail('parts require draw mode');
  if ('version' in (raw as object) && (raw as {version:unknown}).version !== 1) fail('unsupported version');
  const drawing = raw as { summary: string; duration?: number; parts: Part[] };
  const duration = drawing.duration ?? 5;
  if (typeof drawing.summary !== 'string' || drawing.summary.length > 500) fail('summary must be short text');
  if (!Number.isFinite(duration) || duration < .1 || duration > 10) fail('duration must be .1..10 seconds');
  if (!Number.isFinite(canvas.width) || !Number.isFinite(canvas.height) || Math.min(canvas.width, canvas.height) < 1) fail('invalid canvas');
  const parts = drawing.parts, names = new Map<string, number>();
  if (!Array.isArray(parts) || !parts.length || parts.length > 24) fail('use 1..24 parts');
  parts.forEach((part, i) => {
    fields(part, ['n','g','b','c','parent','a','p','closed','smooth','stroke','sw','m'], `part ${i}`);
    if (typeof part.n !== 'string' || !part.n.trim().length || part.n.length > 40 || names.has(part.n)) fail('part names must be unique short strings');
    if (part.parent !== undefined && !names.has(part.parent)) fail(`${part.n} parent must precede child`);
    names.set(part.n,i);
    if (!['group','ellipse','rect','triangle','path'].includes(part.g)) fail(`unsupported primitive at ${part.n}`);
    tuple(part.b, 4, `${part.n} box`);
    if (part.b.some(v => Math.abs(v) > 2) || part.b[2] < .002 || part.b[3] < .002) fail(`invalid box at ${part.n}`);
    if (part.a !== undefined && (!Number.isFinite(part.a) || Math.abs(part.a) > 360)) fail('base angle must be -360..360');
    if ((part.c !== undefined && !color(part.c)) || (part.stroke !== undefined && !color(part.stroke))) fail('use hex colors or transparent');
    if (part.sw !== undefined && (!Number.isFinite(part.sw) || part.sw < .001 || part.sw > .05)) fail('stroke width must be .001..05');
    if ((part.closed !== undefined && typeof part.closed !== 'boolean') || (part.smooth !== undefined && typeof part.smooth !== 'boolean')) fail('closed/smooth must be booleans');
    if (part.g !== 'group' && !color(part.c)) fail(`${part.n} needs c (hex fill or transparent)`);
    if (part.g === 'group' && (part.c !== undefined || part.stroke !== undefined || part.sw !== undefined)) fail('groups are unpainted pivots');
    if (part.g !== 'group' && (!part.c || part.c === 'transparent') && (!part.stroke || part.stroke === 'transparent')) fail(`${part.n} has no visible paint`);
    if (part.g === 'path') {
      if (typeof part.closed !== 'boolean') fail(`${part.n} needs closed:true or closed:false`);
      if (!Array.isArray(part.p) || part.p.length < (part.closed ? 3 : 2) || part.p.length > 32) fail(`${part.n} needs 2..32 path points (3 for closed)`);
      part.p!.forEach(p => { tuple(p,2,'point'); if (p.some(v => v < 0 || v > 1)) fail('path points must be 0..1'); });
      if (new Set(part.p!.map(p => p.join(','))).size < (part.closed ? 3 : 2)) fail('degenerate path');
      if (!part.closed && (!part.stroke || part.stroke === 'transparent')) fail('open path needs a stroke');
      if (part.closed) {
        const area=part.p!.reduce((s,p,j)=>{const q=part.p![(j+1)%part.p!.length];return s+p[0]*q[1]-q[0]*p[1];},0);
        if (Math.abs(area)<.0001) fail('closed path has no area');
        const cross=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        for(let j=0;j<part.p!.length;j++)for(let k=j+2;k<part.p!.length;k++){
          if(j===0 && k===part.p!.length-1)continue;
          const a=part.p![j],b=part.p![(j+1)%part.p!.length],c=part.p![k],d=part.p![(k+1)%part.p!.length];
          if(cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0)fail('closed path crosses itself');
        }
      }
    } else if (part.p !== undefined || part.closed !== undefined || part.smooth !== undefined) fail('path settings need g:path');
    if (part.m !== undefined) {
      if (!Array.isArray(part.m) || part.m.length < 2 || part.m.length > 8) fail('motion needs 2..8 keys');
      part.m.forEach((k,j) => {
        tuple(k,5,'motion key');
        if (k[0]<0 || k[0]>duration || (j>0 && k[0]<=part.m![j-1][0]) || Math.abs(k[1])>2 || Math.abs(k[2])>2 || Math.abs(k[3])>720 || k[4]<.1 || k[4]>4) fail('invalid motion time, offset, angle or scale');
      });
      if (part.m[0].join(',') !== '0,0,0,0,1') fail('motion must start at [0,0,0,0,1]');
      if (part.m.every(k => k.slice(1).join(',') === '0,0,0,1')) fail('omit constant motion');
    }
  });
  if (!parts.some(p => p.g !== 'group')) fail('drawing has no visible parts');
  parts.forEach(part => {
    if (part.g === 'group' && !parts.some(child => child.parent === part.n)) fail(`${part.n} is an empty group`);
  });
  function local(part: Part,t: number): number[] {
    const keys=part.m;
    if (!keys) return [t,0,0,0,1];
    if (t>=keys[keys.length-1][0]) return keys[keys.length-1];
    const right=keys.findIndex(k=>k[0]>=t);
    if (right<=0) return keys[0];
    const a=keys[right-1],b=keys[right],u=(t-a[0])/(b[0]-a[0]);
    return a.map((v,j)=>v+(b[j]-v)*u);
  }
  function pose(i: number,t: number): Pose {
    const part=parts[i],key=local(part,t),p=part.parent===undefined?{x:0,y:0,a:0,s:1}:pose(names.get(part.parent)!,t);
    const x=(part.b[0]+key[1])*p.s,y=(part.b[1]+key[2])*p.s,r=rad(p.a);
    return {x:p.x+x*Math.cos(r)-y*Math.sin(r),y:p.y+x*Math.sin(r)+y*Math.cos(r),a:p.a+(part.a??0)+key[3],s:p.s*key[4]};
  }
  const side=Math.min(canvas.width,canvas.height)*.8,ox=(canvas.width-side)/2,oy=(canvas.height-side)/2;
  const round=(n:number)=>Math.round(n*1e6)/1e6;
  // Sample at least each 15 degrees of accumulated ancestor rotation, then
  // refine until interpolated corners differ by <= .5px from true transforms.
  // Bound expansion by the native 64-key limit; reject rather than degrade silently.
  let times=[...new Set([0,duration,...parts.flatMap(p=>p.m?.map(k=>k[0])??[])])].sort((a,b)=>a-b);
  function turns(i:number,a:number,b:number):number {
    const part=parts[i];
    return Math.abs(local(part,b)[3]-local(part,a)[3])+(part.parent===undefined?0:turns(names.get(part.parent)!,a,b));
  }
  times=times.flatMap((t,j,all)=>{
    if(j===all.length-1)return [t];
    const end=all[j+1],steps=Math.max(1,Math.ceil(Math.max(...parts.map((_,i)=>turns(i,t,end)))/15));
    return Array.from({length:steps},(_,k)=>t+(end-t)*k/steps);
  });
  if(times.length>64)fail('motion needs more than 64 native keys; simplify rotation or duration');
  function corners(i: number,p: Pose) {
    const [,,w,h]=parts[i].b,r=rad(p.a);
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy])=>{
      const x=sx*w*p.s/2,y=sy*h*p.s/2;
      return [(p.x+x*Math.cos(r)-y*Math.sin(r))*side+ox,(p.y+x*Math.sin(r)+y*Math.cos(r))*side+oy];
    });
  }
  for (;;) {
    const extra:number[]=[];
    for(let j=1;j<times.length;j++){
      const a=times[j-1],b=times[j],mid=(a+b)/2;
      if(parts.some((part,i)=>{
        if(part.g==='group')return false;
        const l=pose(i,a),r=pose(i,b),actual=pose(i,mid),linear={x:(l.x+r.x)/2,y:(l.y+r.y)/2,a:(l.a+r.a)/2,s:(l.s+r.s)/2};
        const ca=corners(i,actual),cb=corners(i,linear);
        return Math.abs(r.a-l.a)>15 || ca.some((c,k)=>Math.hypot(c[0]-cb[k][0],c[1]-cb[k][1])>.5);
      })) extra.push(mid);
    }
    if(!extra.length)break;
    if(times.length+extra.length>64)fail('motion needs more than 64 native keys; simplify rotation or duration');
    times=[...times,...extra].sort((a,b)=>a-b);
  }
  if(times.length>64)fail('too many motion times');
  const operations:EditorPlan['operations']=[];
  parts.forEach((part,i)=>{
    if(part.g==='group')return;
    const base=pose(i,0),w=part.b[2]*side*base.s,h=part.b[3]*side*base.s;
    if(w<1 || h<1 || w>8192 || h>8192)fail(`${part.n} size exceeds editor limits`);
    const poses=times.map(t=>pose(i,t));
    // Include midpoints for geometry preflight too. Conservative corner bounds
    // also cover rotated shapes and their stroke; intentional exits aren't in v1.
    [...times,...times.slice(1).map((t,j)=>(t+times[j])/2)].forEach(t=>{
      const p=pose(i,t),pad=part.stroke&&part.stroke!=='transparent'?(part.sw??.006)*side*p.s/2:0;
      if(p.s/base.s<.01 || p.s/base.s>20 || Math.abs(p.a)>3600)fail(`${part.n} exceeds transform limits`);
      if(corners(i,p).some(([x,y])=>x-pad<0 || y-pad<0 || x+pad>canvas.width || y+pad>canvas.height))fail(`${part.n} leaves canvas`);
    });
    const series:[string,number[]][]=[['x',poses.map(p=>(p.x-base.x)*side)],['y',poses.map(p=>(p.y-base.y)*side)],['rotation',poses.map(p=>p.a-base.a)],['scale',poses.map(p=>p.s/base.s)]];
    const keyframes=series.filter(([,vs])=>vs.some(v=>Math.abs(v-vs[0])>1e-6)).map(([prop,vs])=>({prop,keys:times.map((t,j)=>({t:round(t),value:round(vs[j])}))}));
    if(part.g==='ellipse' && Math.abs(w-h)<.001 && keyframes.length===1 && keyframes[0].prop==='rotation' && !parts.some(p=>p.parent===part.n))fail(`${part.n}: rotating an unmarked circle has no visible effect`);
    const values:Record<string,unknown>={x:round(ox+base.x*side-w/2),y:round(oy+base.y*side-h/2),width:round(w),height:round(h),rotation:base.a,startTime:0,endTime:duration};
    if(keyframes.length)values.keyframes=keyframes;
    if(part.g==='path'){
      Object.assign(values,{points:part.p!.map(([x,y])=>({x,y})),closed:part.closed??false,smooth:part.smooth??false,fill:part.c??'transparent',color:part.stroke??'transparent',strokeWidth:Math.max(1,(part.sw??.006)*side*base.s)});
      operations.push({action:'add',layer:'brush',values});
    }else{
      Object.assign(values,{kind:part.g==='rect'?'rectangle':part.g==='triangle'?'polygon':'ellipse',fill:part.c??'transparent',stroke:part.stroke??'transparent',strokeWidth:(part.sw??.006)*side*base.s});
      if(part.g==='triangle')values.sides=3;
      operations.push({action:'add',layer:'shape',values});
    }
  });
  return {version:1,summary:drawing.summary,operations};
}
