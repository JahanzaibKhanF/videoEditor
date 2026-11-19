# Canvas motion and drawing lifecycle — 2026-11-19

## Confirmed code causes and limits of diagnosis

1. The model-facing schema exposed the ambiguous action `move`. Its existing
   executor deliberately moves **timeline start**, including linked audio and
   keyframe timestamps. It does not animate Canvas position. The short system
   instruction mentioned this distinction, but did not explain directional travel
   versus scheduling or duration versus start time. A valid but wrong semantic
   choice therefore passed validation. The user's original response payload was
   not captured here; the exact failed model choice cannot be proven retrospectively.
2. The client and server each allowed 600 seconds. A request could consume two
   model calls for capability inspection and repeat that sequence for correction:
   up to four calls under the client's total deadline. CPU inference can therefore
   account for a 400-second wait without a React loading-state bug.
3. The streamed `summary` field comes before the actual geometry. The UI showed
   its last six words while generation was still running. A model-written
   “Created…” sentence looked like success even though no edit had been validated
   or committed. No evidence that the editor actually committed a partial drawing.
4. The client waited for stream EOF even after a terminal result and relied on
   fetch/read rejecting after abort. A stalled transport could delay completion.
   Server timeout aborted inference without emitting an explicit timeout event.
5. Geometry compilation is synchronous and only starts after receiving the full
   result. It cannot be the work happening while the model is still streaming the
   initial summary. No original request metrics are available to divide the user's
   400 seconds between inference and correction; do not claim a measured breakdown.

## Changes

- Model schema and instructions now expose `moveOnTimeline` for scheduling. The
  decoder maps it into the unchanged native `move` transaction; old native plans
  still parse. Canvas travel uses native update/keyframes, preserving source and
  timeline windows and linked audio. Static placement uses base position fields.
  The model is instructed to distinguish spatial direction, duration, scheduling,
  combined requests and ambiguous intent. No prompt regex or special-case subject.
- A shared 180-second request budget covers connection, inference, inspection and
  correction. The remaining budget is passed to the server; it never increases
  the server's limit. At most two inference calls across both paths. A slow invalid
  first answer (60 seconds or more) is not automatically retried; inspection also
  consumes the correction slot. Token-limit exhaustion is terminal.
- Client abort races settle even if fetch or a read ignores cancellation; the
  reader is cancelled and request state released. Terminal result processing no
  longer waits for EOF. Server timeout emits an explicit error, closes the stream
  and aborts Ollama. Neither timeout nor cancellation applies a partial result.
- UI shows connection/loading, received-character generation progress, validation
  and application stages, plus elapsed time, Cancel and the total limit. Draft
  summaries are hidden. Only a committed result shows its summary; manual-apply
  proposals explicitly say they are not applied.
- Existing drawing compiler, geometry rules, Canvas, timeline, audio handling,
  history and WebCodecs implementations are unchanged. Earlier video capabilities
  and simple text paths remain intact. No new dependencies or paid services.

## Verification

- TypeScript passed; production build passed with existing ONNX warnings.
- **54/54 tests passed**, including prior compiler/pivot/video tests and new
  movement-vs-scheduling, stalled fetch/read, cancellation, client/server deadline,
  terminal-result-without-EOF, retry budget, token exhaustion and progress checks.
- Real imported 4-second H.264/AAC video through actual AI panel/native executor:
  X keyframes at 0 and 3 seconds move the red marker centroid from 99.5 to 219.5px,
  passing 159.5px at 1.5 seconds. Actual playback also moves it. Timeline start/end,
  source range, ID and linked audio remain unchanged. Undo/redo restores the scene.
- UI tests stream a misleading success summary and stall: it is never displayed;
  Cancel and the real 180-second browser timer (accelerated by Playwright clock)
  both restore the Create button and leave identical pixels. Two invalid results
  terminate with an alert and restore the button. No page errors.
- Re-ran real-video chroma key, trim, mute, motion, undo/redo and WebCodecs export.
  Decoded export retains matte/foreground, moves 80px at 1s, ends the trimmed clip
  after 1.5s and has no audio stream for the muted source. No page errors.
- Browser tests stub model transport only, not the native processing or renderer.
  An early final browser attempt hit a test-only selector ambiguity with Next's
  route announcer. Scoped the alert locator; final runs pass.

## Changed files in this increment

- src/utils/ai/directorLimits.ts (new shared budget and abort helper)
- src/utils/ai/localDirector.ts
- app/api/ai/director/route.ts
- src/utils/ai/editorProtocol.ts
- src/utils/ai/editorPlan.ts (action description only)
- src/components/panels/AiDirectorPanel.tsx
- tests/ai-editor.test.mjs
- tests/ai-motion-lifecycle.browser.mjs (new)
- tests/ai-live.mjs (shared-module compatibility, optional document/selection/budget)
- docs/AI_DIRECTOR.md
- docs/ai-audit/2026-11-19-motion-lifecycle.md and evidence directory
- PROGRESS.md

## Remaining limitations

This fixes action ambiguity and bounded processing, not arbitrary drawing quality.
Prompt instructions and schemas cannot guarantee semantic understanding. The
3-minute limit intentionally stops overly slow drawings instead of waiting 400+
seconds; no subject-specific fallback is substituted. Actual model timing and
result of the single bounded movement probe are recorded below. No cat rerun.

## Single live Qwen probe

Prompt: "Move the selected video from left to right over 3 seconds."
Model: qwen2.5:7b. One HTTP request through the actual existing dev route,
selected-video metadata and native validation; client correction disabled.
Elapsed **90.016s**, then the deliberately shorter **90-second
benchmark deadline** cancelled it. No delta, result or completed-call metrics were
received. Output token count is **unavailable**, not a measured zero. The last
status was loading/reading in Ollama; this rules out client compilation/validation
for this probe, but cannot distinguish model loading, grammar setup, queueing or
prompt evaluation without server telemetry. No retry was launched. The saved
error uses the normal app's 3-minute wording; the benchmark override was 90s.
Do not claim a successful live semantic movement result. The actual UI contract
and execution tests above use controlled responses.

Evidence: [motion/lifecycle measurements](artifacts/2026-11-19-motion/results.json),
[live result](artifacts/2026-11-19-motion/qwen.json),
[export checks](artifacts/2026-11-19-motion/video/export-measurements.json).
