# Compact drawing prototype

New multi-part drawings can use `parts` instead of native `operations`. The model
chooses `mode:draw` or `mode:edit` before its payload in the same constrained response. The adapter removes edit mode before native validation. JSON is requested without indentation to reduce generation tokens. Text and existing
layer edits retain the native operation parser and application path. No subject
recognition, subject templates, generated JavaScript or new drawing dependency is
used in the compiler.

```json
{
  "mode": "draw",
  "version": 1,
  "summary": "Two marks rotate together",
  "duration": 3,
  "parts": [
    {"n":"pivot","g":"group","b":[0.5,0.5,1,1],"m":[[0,0,0,0,1],[3,0.1,0,90,1]]},
    {"n":"mark","parent":"pivot","g":"rect","b":[0.2,0,0.12,0.06],"c":"#ff0000"},
    {"n":"outline","parent":"pivot","g":"path","b":[-0.2,0,0.1,0.08],"p":[[0,1],[0.5,0],[1,1]],"c":"transparent","closed":false,"stroke":"#0088ff","smooth":true}
  ]
}
```

| Field | Meaning |
| --- | --- |
| `n` | Unique part name, at most 40 characters. Used for parent references. |
| `g` | `group`, `ellipse`, `rect`, `triangle` (pointing up), or `path`. |
| `b` | `[centerX, centerY, width, height]`, measured in a square equal to 80% of the smaller canvas dimension, centered on the canvas. A root center of `[.5,.5]` is the canvas center. |
| `parent` | Name of an earlier part. Child centers become offsets from the parent's center; sizes and offsets still use the original square units, not fractions of parent size. Parent rotation and animated scale are inherited. |
| `c` | Required for visible parts. Fill: hex color or `transparent`. |
| `a` | Base rotation in degrees, default zero. |
| `stroke`, `sw` | Stroke color and width in square units (default `.006`); width `.001..05`. |
| `p` | Path points `[[x,y],...]` inside that part's box, normalized `0..1`. The decoding schema restricts generated points to a `.05` grid; the compiler accepts arbitrary in-range precision. |
| `closed`, `smooth` | Explicit `closed` is required on paths. Close/fill the contour; use the existing quadratic brush smoothing. Open paths need a visible stroke. |
| `m` | Motion keys `[seconds, dx, dy, addedDegrees, scaleMultiplier]`. Starts with `[0,0,0,0,1]`. Offsets are in square units. Interpolation is linear. |
| `duration` | Visible duration `.1..10` seconds, default 5. |

Groups are invisible pivots. Their `b` width/height do not resize children; use
motion scale to scale a hierarchy. Parts are painted in array order, back to
front. Native UUIDs are assigned by the existing application transaction.

## Compilation and checks

`src/utils/ai/drawingCompiler.ts` resolves parent transforms and lowers visible
parts into native shapes and brushes. Animated centers follow their parent's
pivot; rotations are accumulated, and scales multiplied. Shared time samples
preserve authored key times and subdivide rotations, checking interpolation
against transformed corners. Refinement targets at most half a pixel error at
sample midpoints, with at most 15 degrees per interval. The compiler rejects
motion requiring more than 64 keys rather than silently dropping samples. Static
tracks are omitted.

Limits: 24 parts, 32 points per path, 8 authored keys per part, 64 compiled keys
per track. Validation rejects unknown fields, invalid colors/numbers, missing or
forward parents, duplicate names, empty groups, zero-sized/degenerate paths,
proper self-crossings in closed control polygons, invalid/constant motion and
invisible rotation of an isolated unmarked circle. Transformed corner/stroke
bounds are checked at key samples and midpoints. No silent geometry clamping.

The result still passes the native schema, native dry application, scene-conflict
check and single undoable commit. Preview, timeline, WebCodecs and history need
no new layer types. No extra planning inference is introduced. The existing
bounded correction and capability-inspection behavior remains available.

## Prototype limitations

- This is geometry compilation, not visual understanding or a recognizability
  validator. The model must choose correct anatomy, proportions and layering.
- Parents are baked into layer keyframes. After application there is no persistent
  editable group or group selection; subsequent manual edits are independent.
- Only uniform hierarchical scale; no skew, clipping, arbitrary SVG, holes or
  independently positioned custom part pivots. A group can supply a custom pivot.
- All visible parts must stay on canvas. Conservative box bounds can reject a
  rotated ellipse whose painted pixels would fit. Bounds and curve-error checks
  are sampled, not a proof for all continuous times; smoothing self-intersections
  beyond the control polygon are not detected.
- Long/fast complex rotations can exceed the native key budget and be rejected.
- Text and edits to existing layers use a separate native response; mixed compact
  drawing plus native operations in one reply is not part of this prototype.
- Existing FFmpeg fallback limitations are unchanged; WebCodecs shares the tested
  compositor. This does not establish FFmpeg parity.

Opt-in probes: `tests/ai-live.mjs` (real local model),
`tests/ai-parts.browser.mjs` (actual pixels, pivot centroid/orientation and
Canvas/OffscreenCanvas parity), and `tests/ai-export.browser.mjs` (guest editor
undo/redo and WebCodecs download). Live model quality is reported separately from
synthetic geometry regression fixtures.
