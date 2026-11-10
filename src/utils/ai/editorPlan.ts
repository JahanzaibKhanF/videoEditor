import type { AudioDetails, BlurDetails, BrushDetails, ClipDetails, ClipEffectDetails, ImageDetails, LayerOrder, ShapeDetails, TextDetails } from "../../types/types";

export interface EditorDocument {
  clips: ClipDetails[]; texts: TextDetails[]; images: ImageDetails[]; blurs: BlurDetails[];
  shapes: ShapeDetails[]; brushes: BrushDetails[]; audio: AudioDetails[];
  effects: ClipEffectDetails[]; layerOrder: LayerOrder[]; totalTime: number;
}

type Schema = {
  anyOf?: Schema[];
  type?: string; enum?: readonly unknown[]; properties?: Record<string, Schema>; required?: string[];
  additionalProperties?: boolean; items?: Schema; minItems?: number; maxItems?: number;
  minimum?: number; maximum?: number; maxLength?: number; minLength?: number; pattern?: string;
};
const num = (minimum: number, maximum: number): Schema => ({ type: "number", minimum, maximum });
const str = (maxLength = 200): Schema => ({ type: "string", maxLength });
const choice = (...values: string[]): Schema => ({ type: "string", enum: values });
const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: "object", properties, required, additionalProperties: false });
const list = (items: Schema, maxItems: number, minItems = 0): Schema => ({ type: "array", items, maxItems, minItems });
const bool: Schema = { type: "boolean" };
const color: Schema = { type: "string", pattern: "^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|transparent)$" };
const time = num(0, 3600);
const position = num(-16384, 16384);
const size = num(1, 8192);
export const AI_ANIMATIONS = ["none", "slideIn", "slideInRight", "slideUp", "slideDown", "fadeIn", "fadeOut", "zoomIn", "rotateIn", "pulse", "bounceIn", "wiggle", "typewriter", "drawIn"];
export const AI_TRANSITIONS = ["none", "crossDissolve", "dipToBlack", "dipToWhite", "filmDissolve", "wipeLeftToRight", "wipeTopToBottom", "slideIn", "push", "zoom", "morphCut", "fadeIn", "slideUp", "slideRight", "flipIn", "blurIn", "scaleIn"];
const keyframes = list(obj({
  prop: choice("x", "y", "scale", "scaleX", "scaleY", "rotation", "opacity", "blur", "curve"),
  keys: list(obj({ t: time, value: num(-16384, 16384), ease: choice("linear", "smooth", "easeIn", "easeOut", "easeInOut", "hold") }, ["t", "value"]), 64, 1),
}, ["prop", "keys"]), 9);
const common: Record<string, Schema> = {
  width: size, height: size, rotation: num(-3600, 3600), opacity: num(0, 1),
  startTime: time, endTime: time, zIndex: num(-10000, 10000),
  animation: choice(...AI_ANIMATIONS), keyframes,
};
const xy = { x: position, y: position };
const grading = obj({ brightness: num(0, 3), contrast: num(0, 3), saturation: num(0, 3), temperature: num(-100, 100) }, ["brightness", "contrast", "saturation", "temperature"]);
export const FIELD_SCHEMAS: Record<string, Record<string, Schema>> = {
  shape: { ...common, ...xy, kind: choice("rectangle", "ellipse", "polygon"), fill: color, stroke: color, strokeWidth: num(0, 100), sides: { type: "integer", minimum: 3, maximum: 12 } },
  brush: { ...common, ...xy, smooth: bool, closed: bool, fill: color, points: list(obj({ x: num(0, 1), y: num(0, 1) }, ["x", "y"]), 256, 2), color, strokeWidth: num(1, 100) },
  text: { ...common, text: str(2000), textX: position, textY: position, fontSize: num(8, 600), lineHeight: num(0.5, 4),
    fontFamily: choice("Inter", "Arial", "Space Grotesk", "Anton", "Bebas Neue", "Oswald", "Permanent Marker", "Caveat", "Archivo Black", "Righteous", "Bangers"),
    textColor: color, backgroundColor: color, isBold: bool, isItalic: bool, isUnderline: bool,
    shadowColor: color, shadowBlur: num(0, 100), shadowOffsetX: num(-100, 100), shadowOffsetY: num(-100, 100),
    fillMode: choice("solid", "gradient"), gradientColorStart: color, gradientColorEnd: color, gradientAngle: num(-360, 360), strokeColor: color, strokeWidth: num(0, 100), curve: num(-100, 100) },
  image: { ...common, imageX: position, imageY: position, scaleX: num(0.01, 20), scaleY: num(0.01, 20), colorAdjustments: grading },
  blur: { ...xy, width: size, height: size, startTime: time, endTime: time, blurAmount: num(0, 100), zIndex: common.zIndex, keyframes },
  video: { ...xy, width: size, height: size, scale: num(0.01, 20), rotation: common.rotation, zIndex: common.zIndex,
    muted: bool, animation: common.animation, transition: choice(...AI_TRANSITIONS), keyframes, colorAdjustments: grading },
  audio: { volume: num(0, 1), muted: bool },
};
export const PLAN_SCHEMA: Schema = obj({
  version: { type: "integer", enum: [1] }, summary: str(500),
  operations: list({ anyOf: Object.entries(FIELD_SCHEMAS).map(([layer, fields]) => obj({
    action: choice("add", "update", "delete", "split", "trim", "move"),
    layer: choice(layer), targetId: str(100), values: obj(fields),
    at: time, sourceStart: time, sourceEnd: time,
  }, ["action", "layer"])) }, 80),
}, ["version", "summary", "operations"]);

/** Validates exactly the JSON Schema subset above, including every nested field. */
export function validateSchema(value: unknown, schema: Schema, path = "response"): void {
  if (schema.anyOf) {
    const layer = value && typeof value === "object" ? (value as Record<string, unknown>).layer : undefined;
    const branch = schema.anyOf.find(candidate => candidate.properties?.layer?.enum?.includes(layer));
    if (!branch) throw new Error(`${path}: unsupported layer type`);
    validateSchema(value, branch, path);
    return;
  }
  const fail = (why: string): never => { throw new Error(`${path}: ${why}`); };
  if (schema.enum && !schema.enum.includes(value)) fail("unsupported value");
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("expected an object");
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!Object.hasOwn(record, key)) fail(`missing ${key}`);
    for (const [key, entry] of Object.entries(record)) {
      if (!Object.hasOwn(schema.properties ?? {}, key)) fail(`unsupported field ${key}`);
      validateSchema(entry, schema.properties![key], `${path}.${key}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) fail("expected an array");
    const items = value as unknown[];
    if (items.length < (schema.minItems ?? 0) || items.length > (schema.maxItems ?? Infinity)) fail("too few or too many items");
    items.forEach((entry, i) => validateSchema(entry, schema.items!, `${path}[${i}]`));
  } else if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) fail("expected a finite number");
    const n = value as number;
    if (schema.type === "integer" && !Number.isInteger(n)) fail("expected an integer");
    if (n < (schema.minimum ?? -Infinity) || n > (schema.maximum ?? Infinity)) fail("number outside supported range");
  } else if (schema.type === "string") {
    if (typeof value !== "string") fail("expected text");
    const s = value as string;
    if (s.length > (schema.maxLength ?? Infinity) || s.length < (schema.minLength ?? 0)) fail("text too long or too short");
    if (schema.pattern && !new RegExp(schema.pattern).test(s)) fail("unsupported format");
  } else if (schema.type === "boolean" && typeof value !== "boolean") fail("expected true or false");
}

type Layer = keyof typeof FIELD_SCHEMAS;
type Operation = { action: string; layer: Layer; targetId?: string; values?: Record<string, unknown>; at?: number; sourceStart?: number; sourceEnd?: number };
export interface EditorPlan { version: 1; summary: string; operations: Operation[] }
const collection: Record<string, keyof EditorDocument> = { shape: "shapes", brush: "brushes", text: "texts", image: "images", blur: "blurs", video: "clips", audio: "audio" };
const EASES: Record<string, unknown> = { linear: [0, 0, 1, 1], smooth: [0.33, 0, 0.67, 1], easeIn: [0.42, 0, 1, 1], easeOut: [0, 0, 0.58, 1], easeInOut: [0.42, 0, 0.58, 1], hold: "hold" };

export function parsePlan(raw: string): EditorPlan {
  if (raw.length > 200000) throw new Error("The model response is too large.");
  let plan: unknown;
  try { plan = JSON.parse(raw); } catch { throw new Error("The model did not return valid JSON. Try again or choose another model."); }
  // Small models sometimes repeat the layer discriminator inside its values,
  // or use familiar text-property names. Translate only unambiguous aliases;
  // unknown fields and conflicting values still fail normal strict validation.
  if (plan && typeof plan === "object" && Array.isArray((plan as EditorPlan).operations)) {
    for (const operation of (plan as EditorPlan).operations) {
      if (!operation || operation.layer !== "text" || !operation.values || typeof operation.values !== "object" || Array.isArray(operation.values)) continue;
      const values = operation.values;
      if (values.kind === "text") delete values.kind;
      const aliases: Record<string, string> = { x: "textX", y: "textY", color: "textColor", bold: "isBold", italic: "isItalic", underline: "isUnderline" };
      for (const [alias, canonical] of Object.entries(aliases)) {
        if (!Object.hasOwn(values, alias)) continue;
        if (Object.hasOwn(values, canonical) && values[canonical] !== values[alias]) throw new Error(`Conflicting text properties: ${alias} and ${canonical}.`);
        values[canonical] = values[alias];
        delete values[alias];
      }
      const colors: Record<string, string> = { red: "#FF0000", green: "#008000", blue: "#0000FF", white: "#FFFFFF", black: "#000000", yellow: "#FFFF00", orange: "#FFA500", purple: "#800080", pink: "#FFC0CB" };
      if (typeof values.textColor === "string" && Object.hasOwn(colors, values.textColor.toLowerCase())) values.textColor = colors[values.textColor.toLowerCase()];
    }
  }
  validateSchema(plan, PLAN_SCHEMA);
  return plan as EditorPlan;
}

function normalizeValues(values: Record<string, unknown>, layer: string) {
  validateSchema(values, obj(FIELD_SCHEMAS[layer]), `${layer} properties`);
  const result = { ...values };
  if (Array.isArray(result.keyframes)) {
    const props = new Set<string>();
    result.keyframes = result.keyframes.map((track: { prop: string; keys: { t: number; value: number; ease?: string }[] }) => {
      if (props.has(track.prop)) throw new Error("Duplicate keyframe tracks.");
      props.add(track.prop);
      if (track.prop === "curve" && layer !== "text") throw new Error("Curve keyframes apply only to text.");
      const keys = [...track.keys].sort((a, b) => a.t - b.t);
      keys.forEach((key, i) => {
        if (i && key.t === keys[i - 1].t) throw new Error("Keyframe times must be unique.");
        if (["scale", "scaleX", "scaleY"].includes(track.prop) && (key.value < 0.01 || key.value > 20)) throw new Error("Scale keyframes must be between 0.01 and 20.");
        if (track.prop === "opacity" && (key.value < 0 || key.value > 1)) throw new Error("Opacity keyframes must be between 0 and 1.");
        if (track.prop === "blur" && (key.value < 0 || key.value > 100)) throw new Error("Blur keyframes must be between 0 and 100.");
        if (track.prop === "curve" && Math.abs(key.value) > 100) throw new Error("Curve keyframes must be between -100 and 100.");
      });
      return { prop: track.prop, keys: keys.map(k => ({ ...k, id: crypto.randomUUID(), ease: EASES[k.ease ?? "linear"] })) };
    });
  }
  return result;
}

// Build a new document first: any invalid operation rejects the ENTIRE plan.
// Media URLs, File objects, asset IDs and source filenames never come from the model.
export function applyPlan(doc: EditorDocument, plan: EditorPlan, canvas: { width: number; height: number }): EditorDocument {
  validateSchema(plan, PLAN_SCHEMA);
  const next: EditorDocument = { ...doc, clips: [...doc.clips], texts: [...doc.texts], images: [...doc.images], blurs: [...doc.blurs], shapes: [...doc.shapes], brushes: [...doc.brushes], audio: [...doc.audio], effects: [...doc.effects] };
  let z = Math.min(0, ...[...doc.clips, ...doc.texts, ...doc.images, ...doc.blurs, ...doc.shapes, ...doc.brushes].map(l => l.zIndex ?? 0));
  for (const op of plan.operations) {
    const field = collection[op.layer];
    // Heterogeneous collections are narrowed and validated by the layer schema above.
    const rows = next[field] as unknown as Record<string, any>[];
    const values = normalizeValues(op.values ?? {}, op.layer);
    const index = rows.findIndex(row => row.id === op.targetId);
    if (op.action === "add") {
      if (!["shape", "text", "brush", "blur"].includes(op.layer)) throw new Error("Import media yourself before asking AI to edit it.");
      if (op.targetId || op.at !== undefined || op.sourceStart !== undefined || op.sourceEnd !== undefined) throw new Error("Unsupported fields for add.");
      const base = { id: crypto.randomUUID(), x: canvas.width * 0.4, y: canvas.height * 0.4, width: canvas.width * 0.2, height: canvas.height * 0.2, startTime: 0, endTime: Math.max(5, doc.totalTime), zIndex: --z };
      let added: Record<string, any>;
      if (op.layer === "shape") added = { ...base, kind: "ellipse", fill: "#8B5CFF", opacity: 1, animation: "none", ...values };
      else if (op.layer === "brush") {
        if (!values.points) throw new Error("A brush needs at least two points.");
        added = { ...base, color: "#FFFFFF", strokeWidth: 5, opacity: 1, animation: "none", ...values };
      } else if (op.layer === "blur") added = { ...base, blurAmount: 12, ...values };
      else {
        if (typeof values.text !== "string" || !values.text.trim()) throw new Error("A text layer needs text.");
        const { x, y, ...textBase } = base;
        added = { ...textBase, width: canvas.width * 0.6, textX: canvas.width * 0.2, textY: y, fontSize: 64, lineHeight: 1.2, fontFamily: "Inter", textColor: "#FFFFFF", backgroundColor: "transparent", shadowColor: "transparent", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, isBold: false, isItalic: false, isUnderline: false, opacity: 1, animation: "none", ...values };
      }
      checkWindow(added, op.layer);
      rows.push(added);
    } else {
      if (index === -1) throw new Error(`The ${op.layer} layer no longer exists. Generate again for the current scene.`);
      const original = rows[index];
      if (op.action === "update") {
        if (!Object.keys(values).length || op.at !== undefined || op.sourceStart !== undefined || op.sourceEnd !== undefined) throw new Error("An update needs supported properties only.");
        const updated = { ...original, ...values };
        if (Array.isArray(values.keyframes) && values.keyframes.length) {
          const replacements = new Set(values.keyframes.map(track => track.prop));
          updated.keyframes = [...(original.keyframes ?? []).filter((track: { prop: string }) => !replacements.has(track.prop)), ...values.keyframes];
        }
        checkWindow(updated, op.layer);
        rows[index] = updated;
        if (op.layer === "video" && typeof values.muted === "boolean") next.audio = next.audio.map(a => a.clipId === original.id ? { ...a, muted: values.muted as boolean } : a);
      } else {
        if (Object.keys(values).length) throw new Error("Only add/update accept properties.");
        if (op.action === "delete") {
          if (op.at !== undefined || op.sourceStart !== undefined || op.sourceEnd !== undefined) throw new Error("Unsupported fields for delete.");
          rows.splice(index, 1);
          if (op.layer === "video") { next.audio = next.audio.filter(a => a.clipId !== original.id); next.effects = next.effects.filter(e => e.clipId !== original.id); }
        } else if (op.action === "move") {
          if (op.at === undefined || op.sourceStart !== undefined || op.sourceEnd !== undefined) throw new Error("Move needs a timeline time in at.");
          const start = op.layer === "video" ? "startPosition" : "startTime";
          const end = op.layer === "video" ? "endPosition" : "endTime";
          const delta = op.at - original[start];
          const moved = { ...original, [start]: op.at, [end]: original[end] + delta };
          if (original.keyframes) moved.keyframes = original.keyframes.map((t: any) => ({ ...t, keys: t.keys.map((k: any) => ({ ...k, t: k.t + delta })) }));
          checkWindow(moved, op.layer);
          rows[index] = moved;
          if (op.layer === "video") next.audio = next.audio.flatMap(a => {
            if (a.clipId !== original.id) return [a];
            const startTime = Math.max(0, a.startTime + delta), endTime = a.endTime + delta;
            return endTime > startTime ? [{ ...a, startTime, endTime }] : [];
          });
        } else if (op.action === "split" || op.action === "trim") {
          if (op.layer !== "video") throw new Error("Split and trim operate on video clips.");
          if (original.speed && original.speed !== 1) throw new Error("AI cutting currently requires normal-speed clips. Use the timeline for speed-ramped clips.");
          if (next.effects.some(e => e.clipId === original.id)) throw new Error("Use the timeline to cut clips with effects.");
          const sourceStart = original.startTime ?? 0;
          const sourceEnd = original.endTime ?? original.duration;
          if (op.action === "split") {
            if (op.at === undefined || op.sourceStart !== undefined || op.sourceEnd !== undefined || op.at <= original.startPosition + 0.05 || op.at >= original.endPosition - 0.05) throw new Error("Split time must be inside the clip.");
            const at = op.at;
            const cut = sourceStart + at - original.startPosition;
            if (cut >= sourceEnd) throw new Error("Split time exceeds source media.");
            const rightId = crypto.randomUUID();
            rows.splice(index, 1, { ...original, endPosition: at, endTime: cut, transition: "none" }, { ...original, id: rightId, startPosition: at, startTime: cut });
            next.audio = next.audio.flatMap(a => {
              if (a.clipId !== original.id || a.endTime <= at) return [a];
              if (a.startTime >= at) return [{ ...a, clipId: rightId }];
              return [{ ...a, endTime: at }, { ...a, id: crypto.randomUUID(), clipId: rightId, startTime: at }];
            });
          } else {
            const lo = op.sourceStart, hi = op.sourceEnd;
            if (op.at !== undefined || lo === undefined || hi === undefined || lo < sourceStart || hi > sourceEnd || hi - lo < 0.05) throw new Error("Trim must keep a valid range inside the existing source range.");
            const endPosition = original.startPosition + hi - lo;
            rows[index] = { ...original, startTime: lo, endTime: hi, endPosition };
            next.audio = next.audio.flatMap(a => {
              if (a.clipId !== original.id) return [a];
              const startTime = Math.max(a.startTime, original.startPosition), endTime = Math.min(a.endTime, endPosition);
              return endTime > startTime ? [{ ...a, startTime, endTime }] : [];
            });
          }
        }
      }
    }
  }
  const visuals = [...next.texts, ...next.images, ...next.blurs, ...next.shapes, ...next.brushes];
  if (next.clips.length + visuals.length > 500) throw new Error("This would exceed the AI editor's 500-layer limit.");
  next.totalTime = Math.max(doc.totalTime, ...next.clips.map(c => c.endPosition), ...visuals.map(l => l.endTime), ...next.audio.map(a => a.endTime));
  return next;
}
function checkWindow(row: Record<string, any>, layer: string) {
  if (layer === "brush" && row.closed && row.points?.length < 3) throw new Error("A closed pen path needs at least three points.");
  const start = layer === "video" ? row.startPosition : row.startTime;
  const end = layer === "video" ? row.endPosition : row.endTime;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 3600) throw new Error("Layer timing must have a positive duration within one hour.");
  for (const track of row.keyframes ?? []) for (const key of track.keys) {
    if (key.t < 0 || key.t > 3600) throw new Error("Moving this layer would put keyframes outside the supported timeline.");
  }
}

/** Removes media URLs, Files and cloud metadata; only edit-relevant data goes to the assistant. */
export function sceneForModel(doc: EditorDocument) {
  return Object.fromEntries(Object.entries(collection).map(([layer, field]) => [layer, (doc[field] as { id: string }[]).map(row => {
    const source = row as Record<string, unknown>;
    const keys = ["id", ...Object.keys(FIELD_SCHEMAS[layer]), ...(layer === "video" ? ["name", "startTime", "endTime", "startPosition", "endPosition", "duration", "speed"] : [])];
    return Object.fromEntries(keys.filter(k => source[k] !== undefined).map(k => [k, source[k]]));
  })]));
}
