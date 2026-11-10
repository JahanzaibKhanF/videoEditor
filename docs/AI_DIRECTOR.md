# Browser AI Director

Open a composition, choose **AI Director**, describe an edit, and click **Create**.
No connection, model selection, installation, API key, or environment setting is
needed. Literal commands such as `write hello` and `type "Hello world"` add text
immediately without loading AI. Styled or compound requests use the model. First use downloads the creative tools into the browser cache. Subsequent
requests reuse the model while the panel is open; idle memory is released after
two minutes. Cache availability depends on browser storage and eviction.

The implementation uses `onnx-community/Qwen2.5-0.5B-Instruct`, quantized to q8,
through the existing Transformers.js dependency in a dedicated worker. Inference
uses WASM for compatibility with this project's existing ONNX configuration; a
GPU is not required. The model download is about 512 MB (decimal); q8 is smaller
than this model repository's q4 export because its embeddings are quantized too. Downloads come from Hugging Face and the ONNX runtime CDN.
Prompts and media are not sent to a generation server. HTTPS Netlify deployments
use the same browser flow as localhost, without an AI server route.

This is a small language model, not an image/video generation model. It is not
necessarily smaller than the specialized background remover. The first download
and initialization can take time; speed and memory depend on the device.

## Edits and drawings

- Native text, shapes, animation presets and property/keyframe edits.
- Simple repetition commands such as `write hi how are you 50 times` create
  separate editable text copies in rows without waiting for the model. Supports
  1–80 copies when the phrase fits at a readable size.
- Pen/brush sketches using normalized paths, including smooth curves, closed
  contours and optional fills. AI-generated strokes remain editable in Brush
  and Properties, with normal transforms, keyframes and project JSON storage.
  A compact drawing accepts up to six strokes and 32 points per stroke; prompts
  recommend fewer points to keep generation fast. General edits can also add
  or update native brush layers directly.
- Selected imported video/image/audio edits, including mute, transitions,
  timeline movement, and normal-speed video splitting/trimming.
- Cartoon cats use a compact instruction expanded by the editor into 16 shape
  layers and a brush tail. Running motion includes coordinated translation,
  bobbing, and alternating leg rotations. This is a built-in editable drawing
  recipe, not arbitrary image generation. Color, duration and movement can vary.
- Hearts and other simple shapes can include a centered label. Hearts use one smooth, closed, filled
  brush contour; the label is an ordinary text layer. Explicit
  shape and color words in the request override contradictory model guesses.
  Labels are limited to 40 characters and compositions remain fully editable.
- Drawing requests without a preset (for example clouds or leaves) use compact
  pen-path instructions automatically. Labeled drawings can combine brushes and
  text through native edit operations. Model-generated outlines may be imperfect;
  a missing shape preset alone is not a reason to reject a drawing.
- Other complex characters, generated photos, footage and sound are unsupported.

The shared streaming/parser code extracts one complete JSON object, respecting
quoted braces and escaped quotes. Surrounding prose and closing Markdown fences
are ignored; malformed, truncated, ambiguous multiple-object replies and unknown
editing fields remain rejected.

Every generated instruction is independently validated. No generated code, URLs,
or HTML is executed. Invalid output leaves the project unchanged. The entire edit
is one undo step, uses native project JSON, and is rejected if the scene changes
during generation. Turn off **Apply and play automatically** to review first.

The model gets a compact capability guide, canvas size, layer identities and
selected-layer properties. Media URLs, bytes, cloud metadata and long point/track
arrays are excluded. Large contexts are rejected. Responses are limited to 384
new tokens and six direct edits; generation stops as soon as a complete JSON object is produced; recipes expand separately within the editor's
normal validated limits. A small model can misunderstand requests; undo and try
a shorter request if needed.

Cancel terminates the worker, including active inference/downloads. Stalled
preparation and generation each have a 90-second limit (download progress resets
the preparation timeout). Closing the panel releases the worker. A failed or
cancelled request can be retried without reloading the page.

## Verification

- `npm run test:ai`: validated editing, media handling, text aliases, compact
  browser instructions, cat/heart layouts, pen geometry/styles and validation.
- `npx tsc --noEmit` and `npm run build`.
- Browser smoke: create a running cat, add red bold welcome text, replay/undo,
  cancel generation, and retry. Check no localhost:11434 or AI API requests occur.

Model/runtime references:
- https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct
- https://huggingface.co/docs/transformers.js/guides/dtypes
