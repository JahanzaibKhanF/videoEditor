# AI Director: local Ollama

The active panel uses the `ollama` npm client through `/api/ai/director`, a
localhost-only development route. Ollama must be installed and running on
127.0.0.1:11434. The SDK does not install the service or model weights.
Production requests return 404; hosted inference is not implemented.

The installed-model selector and Refresh control sit inside the bottom-right
of the prompt box. Only installed local models are listed. Models are checked
again before generation; there are no automatic downloads or silent substitutions.
Missing services/models produce setup instructions.

## Shared editor contract

- `src/utils/ai/editorPlan.ts`: native property schemas, annotations, validation,
  scene context and atomic document application.
- `src/utils/ai/editorProtocol.ts`: model instructions, constrained response schema,
  model-chosen schema inspection, JSON extraction and strict response validation.
- `src/utils/ai/localDirector.ts`: streamed requests, cancellation and one bounded
  correction attempt before complete-plan validation.
- `app/api/ai/director/route.ts`: Ollama discovery and streamed inference.
- `docs/AI_EDITOR_SCHEMA.json`: exported native schema with property descriptions.

Instructions distinguish text content from style, repetition and motion. The model
chooses geometry and tools; there are no hardcoded subject drawings. Every exposed
field has a title and semantic description. Schemas describe the AI adapter's
supported properties, not every manual editor feature.

## Streaming and failure handling

The progress display shows connection, generation (received characters), validation
and application stages. Draft summaries are not shown: models can write a success
claim before producing any valid edit. Only a committed result shows its summary;
manual-apply proposals are explicitly marked not applied.
One user request has a 180-second total deadline. At most two inference calls are
allowed across inspection and correction; a correction is skipped if the initial
request has already taken 60 seconds or inspection consumed the second call.
Output-token exhaustion is terminal. Cancellation/timeouts settle even a stalled
transport, and a terminal result is processed without waiting for stream closure.
No partial or invalid response changes the canvas. Model JSON is never executed.

The old browser inference worker/controller, Wllama dependency, WASM assets and
runtime-copy script have been removed. Transformers.js and background-removal
packages remain because captions, enhancement and background removal use them.

## Limitations

Valid JSON does not guarantee good artwork or accurate interpretation. Prior live
llama3.2 tests produced invalid fields; these are rejected. Changing the runtime or
instructions does not establish model quality. Use the selector to compare your
installed models. Qwen2.5:7b is installed at the 2026-11-17 model check.

## Structured generation failure diagnosed on 2026-11-17

Ollama's service logs showed repeated `failed to parse grammar` errors: nested
bounded repetitions in the full schema exceeded llama.cpp's grammar rule budget.
Simple schema probes worked, while the editor's schema did not. Passing that schema
therefore did not reliably constrain the generated field names.

`generationSchema` now derives a decoding-only schema without `maxItems` and
`maxLength` expansions or descriptive metadata. Property names, required keys,
types, enums and operation branches remain constrained. The original annotated
schema is unchanged and still enforces every bound before application. Output
size and generation-token limits also remain in place.

Development console diagnostics now log request starts, schema-lookup responses,
complete responses, validation failures, and raw partial text on interrupted or
failed requests. No response text is available to log if the service fails before
sending any. The visible progress panel shows processing stages rather than draft summaries
or the underlying JSON payload.

Scene-specific decoding also removes existing-layer operations when no matching
layers exist, and constrains targetId to the actual IDs for each layer. Newly
created layers include animation inside their add payload. Animation fields are
ordered after content/style in the generated grammar so they remain available
when the model finishes specifying the content.

Verification on 2026-11-17: 30 regression tests, TypeScript and production build
pass. A real Qwen 2.5 7B request for green bold Welcome text moving horizontally
returned a valid native text layer and x keyframes without correction in about
74 seconds. Replaying that exact response through the editor's UI applied one
edit and rendered green text (6,261 detected green pixels), with no page errors.
This verifies that case, not arbitrary drawing quality or fast CPU inference.

The screenshot's blue-outline prompt was also tried on Gemma 3 1B with the repaired
constraints. Its partial response repeated tiny transparent rectangles instead of a
blue moving outline; the test was stopped. This is a semantic model failure even
though the generated operation keys now follow the contract. Do not describe this
model or arbitrary drawings as fixed.

A subsequent route wiring regression passed the schema-builder function to the SDK
rather than the generated object, causing JSON serialization to omit `format`.
The route now passes the constructed scene-specific `format` object. The integrated
route/client regression serializes the SDK request and requires its schema and
scene-specific operation branches, so this omission cannot pass unnoticed again.

The exact reported prompt for green, bold, underlined “hi buddy how are u doing”
was tested through the real app HTTP endpoint with Qwen 2.5 7B. It completed in
49.7 seconds and returned the correct text, color, bold and underline flags. It
also added unnecessary constant position keyframes, placing the text low in the
canvas; semantic layout quality is still imperfect. The unchanged response was
replayed through the editor and applied with no page errors.

Visual inspection uncovered an independent compositor bug: isUnderline was stored
but never painted. The shared preview/export renderer now paints underlines for
wrapped and curved text using the text fill, transform and shadow. A regression
covers disabled, wrapped and curved underline rendering. 31 tests and TypeScript
checks pass.

## Incremental audit and verification

See [the 2026-11-17 audit](ai-audit/2026-11-17.md) for the capability matrix,
current measurements, actual visual failures, and exact next steps. Brush drawIn
now traces the native path, with editable drawDuration. AI schemas match rendered
per-layer tracks; unselected layers retain layout/style context. Capability lookup
is limited to one round per request; text starts with common controls and exposes
advanced controls on inspection. Development diagnostics include inference metrics.
The latest warm text case completed in 20.4s without correction. The laughing cat
case took 278s and was visually WRONG. These results do not establish arbitrary
drawing reliability or a general 20-second latency guarantee.


## Existing-media capability increment (2026-11-19)

The shared EDIT_ACTIONS registry generates native operation choices and enforces
executor layer eligibility. FIELD_SCHEMAS now exposes chromaKey on existing videos
and images; this reuses manual color-key rendering and WebCodecs export. Scene
context includes source/timeline ranges, playhead, linked audio, existing effects,
anonymous source groups and reference labels. Empty/unchanged plans show an
explanation without committing history. Multi-step native plans remain atomic.

Automatic subject segmentation, stacked clip effects, speed changes, speech
transcription and enhancement remain manual-only. Color keying is not automatic
subject background removal. The model receives metadata, not video pixels/audio.
A real imported-video regression verified trimming, color keying, X animation,
muting, undo/redo and decoded export, using stubbed model transport (zero Qwen
calls). Model interpretation of these new capabilities is not yet benchmarked.

Full capability matrix and evidence: [video-editor audit](ai-audit/2026-11-19-video-editor.md).

## Canvas motion versus timeline scheduling

The model-facing action is `moveOnTimeline` for explicit scheduling only; it maps
to the unchanged native `move` transaction. Spatial travel uses `update` with
X/Y keyframes, preserving timeline start/end and linked audio timing. Instructions
distinguish duration from start time and support combined scheduling plus motion
without prompt-specific routing. See [verification](ai-audit/2026-11-19-motion-lifecycle.md).
