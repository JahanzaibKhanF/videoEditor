# AI Video Editor capability increment — 2026-11-19

## Outcome and verification boundary

The highest-value native integration in this increment is **color-screen removal
on an existing video/image**, using the editor's existing `chromaKey` properties,
Canvas compositor and WebCodecs exporter. It does not generate replacement media.
Automatic subject/background segmentation remains unavailable through AI, explicitly
listed in the model contract and the panel. No Qwen inference was run, no paid API
or dependency was added, and the experimental drawing compiler was preserved.

A real imported H.264/AAC video was edited through the actual AI panel, then
previewed, undone/redone and exported. Only the model response transport was
stubbed. Media import, schema validation, state/history, timeline, decoded video
frames, color keying, animation and WebCodecs encoding all ran normally. This
verifies execution of validated plans, **not Qwen's ability to infer those plans**.

## Source audit and capability gaps

| Capability | Existing manual implementation | AI before this increment | Current status / limits |
| --- | --- | --- | --- |
| Timeline targeting | Context tracks selected video, image, text, blur, shape and brush; audio is linked by clipId | IDs and partial properties; audio windows/linkage and some source info lost before model call | Improved: labels, selected IDs, timeline/source ranges, playhead, source grouping, linked audio IDs, effects and media availability. Invalid selected IDs filtered. No independent audio-selection state exists; reference Audio N or its selected video. |
| Chroma key, video/image | ChromaKeyPanel writes native settings; compositeFrame applies RGB-distance matte and edge thinning per frame | Not in AI fields | **New integration. Existing video path verified end to end.** Image fields share the existing renderer but were not separately tested with an imported image this increment. Six-digit RGB color and bounded complete settings required. |
| Trim | Manual timeline handles source span; native AI adapter already supports sourceStart/sourceEnd | Already connected | Normal-speed clips without clip effects only; tested on real video. Does not automatically shorten composition duration. |
| Split | splitLayer manual helper; existing AI native adapter supports split and linked audio | Already connected | Retained and unit-tested. Normal-speed/no clip effects restriction remains. Right-half ID is assigned by editor; model cannot invent it for later steps. No new live-video split test this increment. |
| Video mute / linked audio | Shared native clip/audio fields and export mixer | Already connected, context incomplete | **Verified through preview state/history and exported absence of source tone.** |
| Audio volume, mute, placement | AudioDetails linked to video; timeline controls and mixer | Already connected | Retained, with audio times and clipId now visible to model. Non-muted source-offset alignment and arbitrary volume levels not re-benchmarked here. |
| X/Y, rotation, scale, native keyframes | Native layers, compute animation, shared compositor | Already connected | Existing-video X animation verified: 80px at 1s. Other transforms retain earlier unit/geometry coverage; no new exhaustive video transform matrix. |
| Color correction / filters | colorAdjustments for brightness, contrast, saturation, temperature | Already connected | Retained, included in registry/help. Not a generic arbitrary filter-name API. Unit-validated, not a new real-video grading benchmark. |
| Animation and transitions | Existing preset and keyframe rendering | Already connected | Retained. Not every preset/transition was reverified here. |
| Stacked clip effects | ClipEffectsPanel creates shake, wiggle, colorBurst, particles, gradientOverlay; compositeFrame renders them | Not connected | Manual-only, explicitly listed unavailable to AI. Existing effect ranges are supplied in scene context so cutting restrictions can be respected. |
| Automatic subject cutout | BackgroundRemovalPanel → removeClipBackground → per-frame IMG.LY segmentation → transparent WebM | No execution action | **Still unavailable through AI.** Real video-frame implementation exists; device/model processing and transparent output were not verified in this increment. See audio issue below. |
| Speed / ramps | Native speed/time-mapping utilities and manual controls | Not in AI update schema | Manual-only; safe source/audio/keyframe retiming not integrated here. |
| Automatic captions | CaptionsPanel → generateCaptions, creates native text per recognized phrase | Not connected | Manual-only; existing text can be edited. AI has metadata, not audio or transcription. |
| Enhancement | EnhancePanel → enhanceClipVideo processing/replacement | Not connected | Manual-only; not exposed without processing/lifecycle verification. |
| Generated drawings | Existing native shapes/brushes plus compact compiler | Connected experimentally | Preserved. Qwen recognition/anatomy failures from previous report remain unresolved. |
| Generate/import video or audio | Import uses File objects and local media handling | Not supported | Unavailable; AI cannot create/import files or pretend it has viewed/heard their contents. |

Audited source paths: `src/components/panels/BackgroundRemovalPanel.tsx`,
`src/utils/backgroundRemoval.ts`, `src/utils/bgRemovedStore.ts`,
`src/components/editors/ChromaKeyPanel.tsx`, `src/utils/chromaKey.ts`,
`src/utils/compositeFrame.ts`, `src/utils/webCodecsRender.ts`,
`src/components/panels/ClipEffectsPanel.tsx`,
`src/components/panels/CaptionsPanel.tsx`, `src/components/panels/EnhancePanel.tsx`,
`src/context/useAppContext.tsx`, `src/utils/ai/editorPlan.ts`,
`src/utils/ai/editorProtocol.ts`, `src/utils/addClipToTimeline.ts` and media/timeline controls.

### Background removal is video processing, but not yet a safe AI action

`removeClipBackground` seeks the existing clip from its source start to end,
captures each frame as a PNG, runs `removeBackground`, writes raw RGBA pixels to
an output canvas, and adds frames to a WebM output at deterministic timestamps
(default 12fps). This is real per-frame video segmentation, not just still-image
removal. The manual panel applies the processed source to the **same clip ID**,
resets source time to zero, records an asset ID and persists/uploads the result.

However, the processor adds **only a video track** to the result. The panel swaps
`clip.src`, while `webCodecsRender`'s audio mixer resolves linked audio through
that current clip source. The code therefore needs an original-audio preservation
path before an AI wrapper can safely promise a subject cutout that retains sound.
Transparent codec support, segmentation quality, cancellation, cache cleanup and
history-safe resource lifetimes also require actual processing tests. No claim
is made that the existing manual pipeline works on this device; source inspection
alone establishes the frame-processing design, not successful output.

Color keying is intentionally separate: it removes a specified screen color from
existing decoded frames. It must not silently substitute for automatic subject
segmentation of arbitrary backgrounds.

## Implementation

- `EDIT_ACTIONS` in editorPlan is the action registry: title, supported layers,
  arguments and semantics. Constrained operation schemas are generated from this
  registry; `applyPlan` enforces the same action/layer eligibility. Property
  schemas and their documentation remain in `FIELD_SCHEMAS`.
- `editorCapabilityRegistry()` exposes actions, field schemas and explicit
  unavailable capabilities. No second mutation implementation was introduced.
- `executeEditorPlan()` delegates to the existing atomic `applyPlan` and rejects
  empty or unchanged results. AiDirectorPanel commits once through the unchanged
  `applyAiDocument`; existing conflict detection, undo/redo and validation remain.
- Added the native `chromaKey` field to video and image schemas. Bounds match
  manual controls; color must be six-digit RGB; complete settings are required.
  The source URL, native renderer, manual controls and export code are unchanged.
- Scene context includes source and timeline windows separately, playhead,
  anonymous source grouping, existing effects, clip/audio relationships and
  generic layer labels. Source URLs, Files and filesystem names stay out of the
  model context. A collapsible timeline list lets users refer to those labels.
- Media-specific instructions/registry are included when media exists. Empty-
  scene text retains the compact instruction path (under 5,000 characters in the
  existing test); there is no keyword-based subject/prompt routing.
- Multi-step requests use ordered existing operations in one validated plan.
  Instructions require clarification for ambiguous targets and an empty plan
  with a specific explanation if any required step is unavailable. Explicit
  unsupported/unchanged results appear as alerts, not success notices.
- This is structural validation, not semantic verification: if a model omits a
  requested step but returns some other valid change, the application cannot yet
  prove that the whole natural-language request was fulfilled. No claim that
  unsupported requests are perfectly recognized by Qwen is made.

## Actual verification

- TypeScript: `npx tsc --noEmit` passed.
- Unit tests: **48/48 passed**. Added chroma bounds/schema/action-registry checks,
  complete media context checks, immutable multi-step execution, unsupported/no-op
  feedback and atomic failure tests; prior drawing/pivot tests remain passing.
- Production build passed. Existing ONNX dynamic-require warnings remain.
- Browser: desktop Chrome, actual production build on local port 3003. Model GET
  and POST are stubbed; **zero Ollama/Qwen calls**. This does not enable production
  inference; the existing real AI API remains localhost development-only.
- Source: 2s H.264, 320×180, 30fps, green background/red foreground plus AAC tone.
  The editor follows original source dimensions on import; the harness was
  corrected to observe 320×180 rather than assume empty-project 1280×720.
- Plan: add pink background, trim existing selected clip to source .2–1.7s,
  apply chroma key/mute and animate its X offset 0→120px over 1.5s. Same video ID.
- Preview: 51,200 green pixels before; **zero green** and 51,200 pink pixels after;
  red foreground remains 6,400 pixels. Red centroid moves **159.5→239.5px** at 1s.
- One undo restores original green video and audio/timing transaction; one redo
  restores complete edit. Timeline context confirms source .2–1.7s, timeline
  0–1.5s and matching muted linked audio. Unsupported subject-cutout replay yields
  an alert and **identical canvas measurements**, with no partial edit.
- Actual exported H.264: 320×180, 30fps, 150 frames. Composition remains 5s
  (ffprobe track duration 4.966667s). Decoded frames 0 and 30 preserve the matte,
  red foreground and exact measured 80px movement. At frame 60 only pink remains,
  proving trimmed video visibility ended. Source contains AAC; muted export has
  **no audio stream**, so the original tone is absent. No page errors occurred.
- Frames were visually inspected. No blanket FFmpeg fallback, cross-origin media,
  other-browser or arbitrary-segmentation claim is made.

Early browser attempts encountered chunk 404s from multiple development servers
sharing `.next-dev`. Only verification-owned servers were stopped; the user's
existing dev server on port 3001 was preserved. Final verification used the
separate production build, avoiding shared-cache contention. That environment
failure and the test's initial canvas-size assumption were not AI/compiler bugs.

Evidence is in [artifacts/2026-11-19-video](artifacts/2026-11-19-video/):
[measurements](artifacts/2026-11-19-video/results.json),
[decoded export checks](artifacts/2026-11-19-video/export-measurements.json),
[original frame](artifacts/2026-11-19-video/original.png),
[edited frame](artifacts/2026-11-19-video/edited.png),
[exported MP4](artifacts/2026-11-19-video/edited.mp4).

## Reproduce without inference

Requires the already available Chrome, Playwright, ffmpeg and ffprobe. No new npm
packages are needed. Create the fixture, build/start the app on a free port, then:

```sh
ffmpeg -v error -f lavfi -i 'color=c=0x00ff00:s=320x180:r=30:d=2' -f lavfi -i 'sine=frequency=440:duration=2' -vf 'drawbox=x=120:y=50:w=80:h=80:color=red:t=fill' -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest /tmp/ai-green-screen.mp4
BASE_URL=http://localhost:3003 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/ai-video.browser.mjs
```

## Exact files changed this increment

- `src/utils/ai/editorPlan.ts`
- `src/utils/ai/editorProtocol.ts`
- `src/components/panels/AiDirectorPanel.tsx`
- `tests/ai-editor.test.mjs`
- `tests/ai-video.browser.mjs` (new)
- `docs/AI_EDITOR_SCHEMA.json` (regenerated from native schema)
- `docs/AI_DIRECTOR.md`
- `docs/ai-audit/2026-11-19-video-editor.md` (this report)
- `docs/ai-audit/artifacts/2026-11-19-video/*` (verification evidence)
- `PROGRESS.md`

All earlier saved changes remain. No changes to drawingCompiler, Canvas,
WebCodecs, timeline, manual editing processors or undo/redo implementation.
Safe to keep this bounded integration with the stated experimental/model limits.
The next unimplemented processing integration is automatic subject cutout with
explicit preservation of original audio and a verified transparent-video result.
