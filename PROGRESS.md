# ClipFlow Rebuild — Progress Tracker
(Keep this file updated at the end of every session. If a session gets cut off, resume from here.)

## Session — color filters & manual grading, expanded fonts, Sparkle animation
Big feature addition, all wired through to both render engines (not preview-only).

**Color grading — filters + manual sliders, applied everywhere:**
- New shared `ColorAdjustments` type (`brightness`/`contrast`/`saturation`/
  `temperature`) added to both `ClipDetails` and `ImageDetails`.
- `utils/colorAdjustments.ts` is the single source of truth for turning those
  numbers into an actual filter: `buildCanvasFilterString()` for the canvas path
  (live preview + WebCodecs export, since both already share `compositeFrame.ts`),
  and `ffmpegColorFilterString()` for the FFmpeg fallback path (`eq` +
  `colortemperature` filters, added into the per-clip and per-image filter_complex
  chains in `clientRender.ts`). Same adjustment values produce matching-intent
  output regardless of which engine actually renders the export.
- 8 curated filter presets (None/Vivid/Warm/Cool/Cinematic/Vintage/Noir/Fade) in
  `utils/filterPresets.ts` — reuses the *exact same* `motion_presets` DB table,
  admin CRUD routes, and "built-in + DB merge" pattern as animations/transitions
  (extended the table's `kind` CHECK constraint to add `'filter'` — note this only
  affects a fresh `db/schema.sql` run, doesn't retroactively alter an
  already-existing table if one existed).
- New `components/color/ColorAdjustPanel.tsx` — filter preset swatches + 4 sliders
  (brightness/contrast/saturation/temperature), shared between the selected-clip
  and selected-image cards in `PropertiesPanel.tsx`, so both get identical grading
  controls.
- `/settings` → Motion Presets now has a third "Filter" tab alongside Animations/
  Transitions, with its own admin editor (sliders instead of an engine-key
  dropdown, since a filter genuinely is just parameter values, not a reference to
  code).

**Sparkle animation** — real engine math (twinkling opacity/scale pulse, continuous
for the whole visible duration), same pattern as Shake/Wiggle from last session.
Added to `AnimationEngine.ts`, the full animation library, and curated presets.

**Expanded fonts — real display/cinematic/TikTok-style fonts, not just named:**
added Anton, Bebas Neue, Oswald, Permanent Marker, Caveat, Archivo Black,
Righteous, and Bangers via Google Fonts (loaded in `app/layout.tsx` alongside the
existing UI chrome fonts), on top of the 10 web-safe fonts already available. The
font dropdown in `TextEditor.tsx` now also previews each option in its own actual
font face instead of showing plain text for all of them.

Build verified clean: `tsc --noEmit`, full `npm run build`, all routes.

**Still open:**
- Temperature is a CSS/FFmpeg approximation (hue-rotate + a touch of sepia for
  warm), not true white-balance correction — stated plainly in the code comments,
  not hidden. Good enough for a stylistic push, not color-accurate grading.
- Same as always: nothing in this session has been seen rendering in a real
  browser. Color filters are exactly the kind of thing that can look subtly wrong
  (temperature direction backwards, a filter reading too strong/weak) in ways only
  an actual screen reveals.
- No live Neon DB — filter presets, like the animation/transition presets before
  them, are exercised via the built-in defaults only until that's connected.

## Session — text/template bugs fixed, template-overwrite safety, shake/wiggle animations, light/dark theme
**Bugs fixed:**
1. **Text chip too long on timeline** — new text defaulted to `endTime: totalTime`
   (spanning the entire project), not a short clip-like duration. Now defaults to
   5 seconds (or the project length if shorter).
2. **Template video didn't auto-add to timeline** — traced to a real gap: picking a
   video-needing template from the *startup screen* went through a completely
   different, much cruder path than picking one from the in-editor Templates panel.
   That path opened a plain native `<input type="file">` accepting only ONE file,
   and on selection just added it to the media library — never placed it on the
   timeline, never handled templates with more than one video slot, and never even
   set `activeTemplate`. Fixed by routing that path through the exact same,
   already-correct `TemplatesPanel` slot-picker/apply flow instead of duplicating
   (badly) a simpler version of it — `TemplatesPanel` now accepts an
   `initialTemplate` prop and auto-opens its slot picker once when it arrives via
   the startup screen.

**New: template-overwrite confirmation.** Clicking a template while in normal
editing mode (not already in template mode) with existing clips/text/images now
shows a confirmation — "Replace with template" (clears current work, applies the
template) or "Keep my work" (cancels, changes nothing) — instead of silently wiping
manual work. Already being in template mode, or starting from an empty project,
skips the prompt since there's nothing to lose.

**New animations — Shake and Wiggle**, real engine math (continuous sine/cosine
oscillation for the whole visible duration, not just an intro effect), added to
`AnimationEngine.ts`, the full animation library, and the curated Motion Presets.
Two new templates use them: "Wiggle Caption" (9:16, TikTok-energy) and
"Slow-Motion Montage" (16:9, a real 4-clip multi-slot template — "sometimes need 4
clips for slow motion" — using varied fonts across templates: Georgia, Garamond,
Trebuchet MS, Brush Script MT, on top of the existing 10 web-safe font family
options already available in the text editor).

**New: light/dark theme toggle.** Converted the neutral `studio`/`ink` color tokens
in `tailwind.config.cjs` to resolve through CSS variables (`rgb(var(--x) /
<alpha-value>)`, required for opacity modifiers like `bg-studio-raised/50` to keep
working), defined both palettes in `globals.css` (`:root` = dark default, `.light`
override), and added a toggle button in the header (`hooks/useTheme.ts`, persists
to localStorage, includes an inline anti-flash script in `layout.tsx` so the saved
theme applies before first paint). Also migrated the player-controls-bar CSS block,
which used hardcoded hex instead of Tailwind classes, to the same variables.
**Scope, stated plainly**: this flips every component using `bg-studio-*`/
`text-ink-*` Tailwind classes — the large majority of the app — for free, with zero
per-component edits. Accent colors (violet/amber/danger/success/warning)
deliberately stay identical across both themes. A few surfaces that were always
intentionally fixed-dark regardless of theme (the startup screen's aurora
background, the export/render modals, admin `/settings`) still are — that's a
deliberate, common pattern (many pro creative tools keep certain chrome fixed), not
an oversight, and would be the next thing to extend if it turns out to matter.

Build verified clean: `tsc --noEmit`, full `npm run build`, all 15 routes.

**Still open:** same as always — nothing above has been seen rendered in a real
browser yet, and there's no live Neon DB. The light/dark toggle in particular is
the kind of change that's easy to get subtly wrong in ways only a real screen shows
(contrast issues, a component that still looks dark-only, etc.) — worth a dedicated
look once it's actually visible.

## Session — three more real bugs from real testing
1. **Second image import corrupted the first image** — root-caused: `imageRefs`
   was keyed by the local `forEach` loop's `index`, which starts at 0 for every
   SEPARATE import action (not just within one multi-select). Importing an image,
   then importing another one later, meant the second image's ref silently
   overwrote the first image's ref at the same key, while `imagesDetails` kept
   growing correctly — so the first image's data entry ended up pointing at the
   second image's pixels. Fixed by keying `imageRefs` (and the matching lookup in
   `compositeFrame.ts`) by each image's own stable `id` instead of array position —
   this class of collision is now structurally impossible. Also fixed the same
   root issue for initial on-screen placement (`imageX`/`imageY` used the same
   per-batch-resetting index).
2. **Seekbar kept advancing during a buffering freeze** — `CanvasEngine.ts`'s
   playback clock advanced on wall-clock time regardless of whether a video could
   actually supply a frame, so during a stall the seekbar kept sliding forward
   while the picture stayed frozen, instead of pausing like Premiere/After Effects
   do while waiting. Now gated on the same real buffering-event tracking added
   last session — the clock (and therefore the seekbar) freezes exactly while
   `onBufferingChange` reports true, and resumes cleanly once data is available
   again (no time-jump on resume, since the wall-clock reference point is still
   kept fresh even while paused).
3. **Transition frames ignored the incoming clip's own scale/position** — the
   actual bug behind "the slide/wipe transition frame shrinks": `applyTransition`'s
   `drawNext()` always drew the incoming clip stretched to fill the entire canvas
   (`0,0,w,h`), regardless of that clip's own configured x/y/width/height/scale.
   If clips in a project use different scales (very common with multi-clip/trimmed
   timelines), the incoming clip would render at the wrong size throughout the
   whole transition and visibly snap to its real size the instant the cut
   completed. Now the next clip's real geometry is threaded through and used for
   the actual content draw, while the wipe/slide sweep boundary itself correctly
   stays canvas-wide (that part was never wrong). This fix applies to both the
   live preview and WebCodecs export since both go through the same
   `compositeFrame.ts`.

Build verified clean: `tsc --noEmit`, full `npm run build`, all 15 routes.

**Still open:** everything from the last several sessions' "still open" notes remains
true — no live Neon DB, and every fix above needs to actually be watched happening
in a browser to be considered confirmed rather than well-reasoned.

## Session — critical WebCodecs bug fix from a real runtime error, plus 5 more real bugs
Direct response to an actual `Unhandled Runtime Error` the user hit while exporting,
plus several other concrete bug reports from real usage.

**The critical bug — "Video encode failed: resolution exceeds max coded area":**
Root cause confirmed from the actual error text: `VideoEncoder` was hardcoded to
`avc1.42001f` (H.264 Baseline, level 3.1) everywhere, including in the "is WebCodecs
supported" probe — which only ever tested a fixed 1280×720 sample. Level 3.1 caps at
a 921,600-pixel coded area (~1280×720); the user's 1080×1080 project (1,166,400
pixels) is comfortably within normal hardware encoder capability but that hardcoded
level string rejected it outright. **Fixed properly, not patched**: new
`utils/videoCodecSelect.ts` is now the single source of truth — it actually calls
`VideoEncoder.isConfigSupported()` against the PROJECT'S REAL width/height/framerate,
trying AVC levels 3.0 through 5.2 in order and falling back to VP9 if no AVC level
works, returning the exact verified config. This same picked config is used for both
the "should we attempt WebCodecs at all" decision (`renderVideo.ts`) and the actual
`VideoEncoder.configure()` call inside the worker — they can no longer disagree with
each other, which is what caused the bug in the first place. This is also directly
what "do a real check, not a hardcoded guess" meant — implemented literally.

**Other real bugs fixed this session:**
1. **Timeline layers hiding each other** — root-caused: `Layers.tsx` allocated a
   single fixed 36px row height for text/image/blur layer types regardless of how
   many items of that type existed. But `TextRangeSlider`/`ImagesRangeSlider`/
   `BlurRangeSlider` each stack one 28px sub-row per item internally — with 2+ items
   of the same type, the extra sub-rows overflowed the fixed-height wrapper and
   visually overlapped the next row below. Fixed the height formula to account for
   actual item count per type, matching the pattern already correctly used for
   video/audio rows.
2. **Template mode allowed adding new clips/text/images** — when a template is
   active, editing should be restricted to the template's existing elements (per
   the original template-mode design). Audited every "add" entry point in
   `MediaPanel.tsx` and `AssetsSection.tsx` (import button, drop zone, add-text,
   add-blur, Layers-tab toolbar, per-video "add to timeline") — none of them
   checked `activeTemplate` before. All 7 now do.
3. **Text box still not fully covering typed text** — found the actual root cause
   this time: the *default* text creation size was badly mismatched (220px-wide box
   at 100px font size — even a single short word wouldn't fit on one line at that
   ratio), and the box was never measured against its own default text at creation
   time. Fixed the defaults (48px font, width scaled to the composition, minimum
   220px) and now measure the real required height immediately via
   `measureWrappedTextHeight` when a text layer is created, on top of last
   session's fix that keeps height in sync as you type/change font settings.
4. **Video going blank/black during loading/seeking** — added a real loading
   indicator. `CanvasEngine.ts` now attaches `waiting`/`stalled`/`canplay`/
   `playing`/`loadeddata` listeners to every video element (event-driven, not a
   guessed timer or polling loop) and exposes `onBufferingChange`; `Screen.tsx`
   shows a proper spinner overlay ("Loading…") instead of leaving the canvas on
   its black fallback fill while any active clip is buffering or mid-seek — the
   same idea as After Effects' render/cache wait indicator.

Build verified clean: `tsc --noEmit`, full `npm run build`, all 15 routes.

**Still open, and still the single most important thing:** the WebCodecs pipeline
has now had one real bug found and fixed from an actual runtime error — which is
good evidence the approach is sound, but also confirms this code needs real testing,
not just clean compiles, to find what's still wrong. Please export again and report
back whatever happens next, good or bad.

## Session — WebCodecs export engine, resize/text-box bug fixes, animated startup background
Largest single session yet. Direct response to several concrete pieces of feedback.

**Q: is account creation / template / animation / transition creation still available?**
Yes — all of it is real, working code (signup/login routes, `/api/admin/templates`,
`/api/admin/motion-presets`). What's still true, stated plainly every session because
it hasn't changed: none of it can actually persist anything until a live Neon
database is connected (`DATABASE_URL`/`JWT_SECRET`/`ADMIN_PANEL_PASSWORD` in
`.env.local` + Netlify env vars, then `db/schema.sql` run against that database).
Until then, signup/login/template-CRUD/motion-preset-CRUD all fail soft — the code
path is there and correct, there's just nothing behind it yet.

**Real bugs found and fixed:**
1. **Inverted vertical panel resize** — `Editor.tsx`'s shared drag-resize helper had
   `delta = dir === "left" ? startCoord - coord : coord - startCoord`, so dragging
   the timeline-height resizer used the same math as the *right*-edge horizontal
   resizer instead of matching the *left*-edge one. Dragging up shrank the panel,
   dragging down grew it — backwards. Fixed the condition to `dir === "left" || dir
   === "up"`.
2. **Templates grid ignored panel width** — the sidebar template grid was hardcoded
   to `grid-cols-1` regardless of how wide the resizable panel was dragged. Tailwind's
   viewport-based breakpoints (`sm:`, `lg:`) can't solve this since the panel isn't
   the viewport. Added a `ResizeObserver` on the grid's own element and compute
   1/2/3 columns directly from its measured width.
3. **Text bounding box not covering wrapped text** — root cause: `TextDetails.height`
   was set once (by whatever created the text layer) and never recalculated as
   content, font size, or line height changed, while the actual number of wrapped
   lines was computed fresh on every canvas draw in `CompositorCanvas`. The two could
   drift, so the box could be shorter than the text it was supposed to contain — this
   is likely the same underlying gap that made the interaction box look wrong.
   Fixed properly, not patched: extracted the exact word-wrapping algorithm into
   `utils/measureText.ts` (`wrapTextLines` + `measureWrappedTextHeight`), refactored
   `CompositorCanvas`'s `drawWrappedText` to use it (so drawing and measuring can
   never disagree again), and wired height recalculation into both places text
   dimensions change: `InteractionOverlay.tsx`'s on-canvas textarea (recomputes live
   on every keystroke) and `TextEditor.tsx`'s font-size/line-height sidebar controls.
4. **Self-caught regression from the previous session's Fabric.js replacement**:
   clips had silently lost click-to-select, which would have made per-clip
   transitions impossible to apply (`ClipTransitionSelector.tsx` requires
   `selectedClipId`). Fixed — clips are selectable again with real (uniform-scale)
   resize handles.

**Animated startup background:** replaced the flat `#07070C` background with 4
independently-drifting blurred color blobs (violet/red/green/blue, `mix-blend-mode:
screen`, 24–32s organic keyframe loops) plus a slow CSS dust/snow particle layer —
same visual language modern SaaS sites (Linear, Vercel-style "aurora" gradients) use.
Respects `prefers-reduced-motion`.

**FFmpeg.wasm → WebCodecs, with automatic fallback (the big one):**
- `utils/compositeFrame.ts` — extracted CompositorCanvas's entire per-frame drawing
  logic (video/text/image/blur/transitions/animations) into one pure, reusable
  function. This is what made the rest of this tractable: the export pipeline calls
  the *exact same*, already-debugged compositing code frame-by-frame instead of
  reimplementing it, so there's no second copy of transition/text/animation math
  that could drift from the preview.
- `utils/webCodecsRender.ts` — the new export pipeline. Feature-detects support via
  `VideoEncoder.isConfigSupported`; if available, seeks every active clip's
  `<video>` element to the correct local time for each output frame (must happen on
  the main thread — a Worker has no access to real HTMLVideoElements), draws via
  `compositeFrame`, and hands each frame off to a Worker as a transferable
  `VideoFrame` (zero-copy). Audio is mixed separately via `OfflineAudioContext`
  (decodes each clip's audio once, schedules per-track volume/mute/timing, renders
  to one buffer) and sent to the worker in bulk.
- `workers/encodeWorker.ts` — owns `VideoEncoder`/`AudioEncoder`/`mp4-muxer`'s
  `Muxer`, does the actual CPU-heavy H.264 + AAC encoding **off the main thread**,
  so seeking/drawing the next frame doesn't have to wait for the previous frame's
  encode. Confirmed via the production build output that webpack correctly splits
  this into its own chunk (`new Worker(new URL(...))` is natively supported by
  Next.js 14's webpack config, no extra setup needed).
- `utils/renderVideo.ts` — new top-level orchestrator. Tries WebCodecs first; on
  any failure (unsupported browser, encode error, anything) automatically falls
  back to the existing FFmpeg pipeline with a fresh job, so export never just stops
  working. `RenderButton.tsx` now calls this instead of `clientRender` directly.
- `utils/renderJobRegistry.ts` — small shared cancellation registry so the same
  Cancel button works regardless of which engine ended up running.
- **The one fact that matters most for this decision, stated plainly**: WebCodecs is
  currently Chromium-only (Chrome/Edge) — Firefox and Safari don't implement it. This
  is exactly why the FFmpeg fallback stays rather than being deleted; removing it
  would mean zero export capability for a meaningful share of users. This is real
  progressive enhancement, the same pattern professional video-editing web apps use,
  not a half-measure.

Build verified clean end to end: `tsc --noEmit`, full `npm run build` (worker chunk
confirmed present and correctly split), all 15 routes.

**Still open — and this session raises the stakes on this point rather than lowering
it:** the WebCodecs pipeline (frame timing, audio mixing/sync, muxing correctness,
worker message passing) is entirely new, untested code implementing a genuinely
complex spec. It is the single highest-risk piece of work in this entire project.
Reasoned through carefully, typechecks and builds clean, but "produces a valid,
correctly-synced, playable MP4" can only be confirmed by actually exporting a real
project in Chrome and playing the result back. Please test this before anything
else.

## Session — self-review of the Fabric.js replacement caught a real regression
Before calling the previous session's `InteractionOverlay.tsx` (the Fabric.js
replacement) done, went back through it critically rather than shipping the first
version. Found and fixed a real gap:

**Clips had silently lost click-to-select entirely.** The first version of
`InteractionOverlay.tsx` rendered clip hit-regions with `selected` hardcoded to
`false` and no resize handles — meaning clicking a clip on the canvas would never
call `setSelectedClipId`. Checked who actually depends on that: both
`PropertiesPanel.tsx` (shows the clip property card) AND, more importantly,
`ClipTransitionSelector.tsx` — which requires `selectedClipId` to apply a
transition to a specific clip and shows "Please select a clip to apply transition"
otherwise. Without a fix, applying a transition to any individual clip via the UI
would have been **entirely impossible** — a severe regression from the old
Fabric-based version, which did support this. Fixed: clips are now selectable
(click sets `selectedClipId`, clears other selections same as every other kind),
and get real resize handles using a new `lockAspect` drag mode — since
`ClipDetails.scale` is a single number rather than independent width/height, corner
resize now computes a uniform scale ratio (driven by whichever axis moved further)
instead of the free-form independent-axis resize used for images/text/blur.

Re-verified after the fix: `tsc --noEmit` clean, full `npm run build` clean (all 15
routes), and a final repo-wide grep confirms zero remaining references to either
`fabric` or `remotion` anywhere in `package.json`/`src`/`app` (the only two hits are
explanatory code comments in `InteractionOverlay.tsx` describing what it replaced,
not actual imports).

**This is the point past which further blind iteration has negative value.** Every
remaining open item — does dragging feel right, does resize math hold up at extreme
zoom, does the transparent-textarea cursor trick actually look right, does the
export bug fix actually produce a working file — requires a real browser and a real
Neon DB, neither of which exist in this sandbox. Continuing to guess at more changes
without that feedback risks the same failure mode as the early sessions (polishing
things that were never broken while missing what actually is).

**Full status for a fresh session picking this up:**
- Aperture v2 visual identity: done (icons, palette, dead-code removal).
- Templates: done (JSON interpreter, admin studio, drag-drop, startup screen).
- Motion Presets: done (curated animations/transitions, JSON-editable in /settings).
- Autosave + Resume + media relink: done (save and load both wired).
- Real bugs fixed from actual evidence (not guessed): the seek race condition
  ("stuck in timeline"), the transition window math, the FFmpeg xfade name mapping,
  the double-quoting export bug, the z-index stacking bug, several CSS
  cascade/dark-mode bugs.
- Fabric.js: fully removed, replaced with a real custom interaction layer.
- Remotion: fully removed (was already-dead stub files).
- NOT done: MediaPanel/AssetsSection/PropertiesPanel got icon/structural passes but
  not a from-scratch redesign; nothing has been visually confirmed in a real browser;
  no live Neon DB has ever been connected to this project during development.

## Session — Fabric.js fully removed, replaced with a real custom interaction layer
Direct response to a repeated, explicit request across several sessions. This one
actually does it, rather than explaining again why it was kept.

**What changed:** `FabricOverlay.tsx` (464 lines, built on the `fabric` npm package)
is deleted. New `InteractionOverlay.tsx` replaces it — plain React + native Pointer
Events, zero canvas-interaction library. This is the same architecture professional
web editors (Figma, Canva) actually use: a canvas/WebGL layer draws pixels, and a
separate layer of real DOM elements handles selection, drag, resize, and text
editing. `fabric` is removed from `package.json` entirely; confirmed zero remaining
references anywhere in the repo before removing it.

**What it replicates from the old Fabric-based version:**
- Select/deselect (click empty space to deselect, click an object to select it,
  clears the other selection state fields the same way the old "selected" handlers did)
- Drag-to-move and corner-handle resize for images, text, and blur regions
- Clips get a draggable/scalable (uniform-scale-only) invisible hit region, matching
  the old near-invisible pass-through behavor
- Center-snap guides (amber lines when within 8px of horizontal/vertical center),
  same threshold and color as before
- Delete/Backspace removes the selected element, same guard against firing while
  typing in an input/textarea
- Inline text editing on double-click — this one's actually a cleaner implementation
  than Fabric's version, not just a port: Fabric faked a text cursor entirely in
  canvas while keeping glyphs transparent; this uses a real `<textarea>` positioned
  exactly over the text box with `color: transparent` + `caretColor: white` — same
  visual trick (you see a blinking cursor, not doubled text, because
  CompositorCanvas draws the real glyphs underneath), but it's a real, accessible,
  standard HTML input instead of a canvas library's internal text-editing engine.

**Deliberate simplifications, stated plainly rather than silently dropped:**
- Only 4 corner resize handles (no edge/side handles). Fabric's default config
  technically exposed 8. Corner-only resize is what most editors ship since it's the
  overwhelmingly common interaction; can be extended if it's actually missed.
- Non-uniform resize (stretching width/height independently) works for
  images/text/blur the same as before; clips remain uniform-scale-only, matching the
  data model (`ClipDetails.scale` is a single number, not separate scaleX/scaleY).
- Rotation isn't implemented (the old Fabric config had `lockRotation: true` on
  clips and blurs and didn't expose it as a real used feature on images/text either
  going by the "modified" handler only reading x/y/scale — so this isn't a
  regression, just confirming rotation was never actually wired end-to-end before).

**Also fixed while touching this code:** the doc comments in `Screen.tsx` and
`CompositorCanvas.tsx` that described the old Fabric-based architecture, and a
spacebar-handling check in `Screen.tsx` that special-cased Fabric's fake
contentEditable trick — no longer needed since real `<textarea>` already gets caught
by the existing `tagName === "TEXTAREA"` check.

Build verified clean (`npm run build`, all 15 routes, + `tsc --noEmit`). Bundle size
for the main editor route dropped with Fabric.js gone (it's a sizeable canvas
library).

**Still open:**
- Zero browser-rendered QA — this is the single highest-risk item in the whole
  project now, specifically for this session: a from-scratch interaction system is
  exactly the kind of thing that can compile perfectly and still feel wrong (drag
  lag, resize math slightly off, the scale-factor calculation in `onMove` behaving
  unexpectedly at extreme zoom levels) in ways no type-checker catches. This needs
  real hands-on testing before anything else in the app does.
- No live Neon DB.

## Session — real FFmpeg export bug fixed (from actual console log) + panel redesign
The user shared an actual browser console log from a real export attempt for the
first time this project — genuinely valuable, traced to a specific line rather than
guessed at.

**Real export bug, root-caused from the log, not speculation:**
`clientRender.ts`'s zoom/grow/expand/bounceIn/blingIn and shrink/collapse text
animation cases built `xExpr`/`yExpr` with **literal single-quote characters baked
into the string itself** (`` `'(${x0}-...)*0.3)'` ``), but the drawtext arg-assembly
step a few dozen lines later *also* unconditionally wraps every x/y expression in
quotes (`` `x='${xExpr}'` ``) — producing `x=''(...)''`: an empty quoted string
immediately followed by a raw, unquoted expression. FFmpeg's filtergraph parser has
no way to recover from that and reports a garbage "No such filter" fragment — exactly
what the user's log showed (`No such filter: '0.6)/0.6)-100)*0.3):y'`). Fixed both
cases to match every other animation case's convention (build the plain expression,
let the assembly step quote it once). Confirmed via grep that this was the only place
in the file with that double-quoting pattern. (The *other* error line in the user's
log, "At least one output file must be specified," is not a bug — it's an
intentional, documented internal probe for audio-track detection that's designed to
always exit non-zero; only its stderr log lines matter, the "failure" is expected.)

**On "still have Fabric.js / mediabunny, why are you copying me":** worth recording
plainly since it came up again — `mediabunny` is a small, legitimate library used in
exactly one file (`getFps.ts`) to read a video's frame rate from its container
metadata client-side; it's not a rendering engine and isn't comparable to
Remotion. Fabric.js remains the interactive canvas library for bounding
boxes/drag/resize, per the earlier engine-architecture discussion. Neither was
touched this session — the concrete, fixable thing was the export bug above.

**Structural redesign of the three panels flagged as "not yet redesigned, only
recolored" across several earlier sessions:**
- `PropertiesPanel.tsx`: every property group (clip/blur/image/text) now has a
  proper card header (icon tile + label) instead of a bare uppercase text label;
  tab bar changed from underline-style to pill-style; every leftover
  `text-[#6B7280] dark:text-[rgba(255,255,255,.45)]`-style arbitrary-value pair
  replaced with the actual `ink-muted`/`ink-faint` tokens.
- `AssetsSection.tsx`: the video list was a literal spreadsheet-style
  `grid-cols-5` text table (File/Size/Type/Actions columns) — replaced with the
  same card-row language used everywhere else in the app (icon tile, name,
  metadata, action buttons). Every section (Videos/Images/Text/Blurs) now has a
  consistent icon+label+count header. Image delete button's stray
  `bg-[#1e1e1e]` (a leftover flagged two sessions ago but not yet fixed here)
  is gone.
- `MediaPanel.tsx`: fixed 5 instances of delete "X" icons rendered as bare
  clickable `<X>` elements with no button wrapper, no real hit target, and
  font-size-based icon sizing (`text-base`/`text-[15px]`, which doesn't
  reliably size an SVG) instead of the `size=` prop — all converted to proper
  `<button>` elements with real hover states and hit areas. Unified two
  remaining verbose light/dark rgba-pair class strings to the actual
  `signal`/`danger` tokens.

Build verified clean (`npm run build`, all 15 routes, + `tsc --noEmit`).

**Still open:**
- Zero browser-rendered QA remains true for every visual change across every
  session — including this one.
- No live Neon DB.
- The export bug fix is reasoned precisely against the actual log the user
  provided, which is much stronger evidence than prior sessions' fixes, but a
  second real export attempt is what actually confirms it.

## Session — playback race condition fix + curated JSON-driven Motion Presets
Direct response to: "video playback stuck in timeline", continued transition
concerns, and a request to make animations/transitions "your own thing" (not
Remotion, already true — see below) with a curated set editable via JSON like
templates.

**Real bug found and fixed — the actual "stuck in timeline" cause:**
`CanvasEngine.ts`'s `seekTo()` used a single shared `_isSeeking` boolean to detect
whether a seek was still current. Scrubbing the timeline quickly (calling `seekTo`
again before the previous call's video-seek promises resolved) created a genuine
race: an OLDER seek's completion callback could fire after a NEWER seek had already
started, see `_isSeeking === true` (set by the newer one), wrongly conclude it was
still the current operation, and clear the flag itself. That, in turn, made the
actual newest seek's own completion callback see `_isSeeking === false` and think
*it* had been superseded — so it silently returned without ever drawing the final
frame or resuming playback. Net effect: playback could permanently fail to resume
after scrubbing. Replaced the shared boolean with a monotonically increasing token
per `seekTo()` call — only the call whose token still matches when its promises
resolve is allowed to finalize anything, which makes "is this seek stale" unambiguous
regardless of how many overlap.

**On "change the entire core engine, don't use Remotion":** worth being direct about
this — `AnimationEngine.ts` (canvas math) and `CanvasEngine.ts` (playback) already
are a from-scratch custom system with zero Remotion involvement; that swap happened
in an earlier session (see the very first "Aperture v2" entry in this file and the
in-chat discussion about why FFmpeg.wasm/Fabric.js were kept but Remotion wasn't).
A ground-up rewrite of the whole rendering pipeline was judged too high-risk for the
actual ask, which turned out to really be about (a) real bugs — now found and fixed
above and in the previous transition session — and (b) wanting a curated, own-brand
preset system instead of the old 50-option/16-option raw lists, which is what this
session actually builds:

**New: curated, JSON-editable Motion Presets (animations + transitions).**
- New DB table `motion_presets` (`kind` = 'animation'|'transition', `preset_json`,
  `is_active`, `sort_order`) — same shape/pattern as `templates`.
- `src/utils/motionPresets.ts`: 6 curated animations (Fade In, Slide Up, Pop In, Zoom
  In, Bounce In, Typewriter) and 5 curated transitions (Cross Dissolve, Dip to Black,
  Wipe, Slide, Zoom) as built-in defaults, always available offline.
- New API routes: `/api/admin/motion-presets` (+ `/[id]`) for CRUD, `/api/motion-presets`
  public read (fails soft to built-ins if DB isn't configured).
- **What's actually JSON-configurable vs. not, stated plainly** (documented at the top
  of `motionPresets.ts` too): the real interpolation math per animation
  (`AnimationEngine.ts`'s switch) and the FFmpeg xfade name mapping per transition
  stay in code — reinventing either from arbitrary admin JSON would need a much
  bigger, riskier generic-keyframe engine. What the JSON controls is which curated
  presets appear in the editor's pickers, their name/icon/order, same relationship
  a template's JSON has to the actual FFmpeg render pipeline.
- `AnimationSelection.tsx` and `ClipTransitionSelector.tsx` rebuilt: curated grid
  (built-in + DB-published, merged) is now the default view; the old full
  50-animation/16-transition grid with search is still there, collapsed behind a
  "Browse all…" toggle, so nothing was actually removed — just de-emphasized.
- New `/settings` section: "Motion Presets" alongside "Template Studio" (top-level
  toggle), with its own grid + add/edit/delete UI, same visual language.

Build verified clean (`npm run build`, all 15 routes incl. 5 new ones, + `tsc --noEmit`).

**Still open:**
- No structural layout redesign on MediaPanel / AssetsSection / PropertiesPanel.
- Zero browser-rendered QA — true of everything in this session too, including the
  seek race-condition fix. The reasoning traces the actual failure mode precisely,
  but hasn't been watched happen.
- No live Neon DB — this also means `motion_presets` can't be seeded/tested yet;
  the curated built-ins are what's actually exercised until DB is connected.

## Session — two real transition bugs (found, not guessed) + startup screen merged
Direct response to feedback: "transitions are not working perfectly" + startup screen
should show templates and blank-project together on one screen, no separate tab for
blank.

**Transition bugs — both root-caused via code reading, not speculation:**
1. **Live preview (`AnimationEngine.ts` → `computeTransition`)**: the transition
   window was `clipEndTime ± 0.3s`, straddling the cut point. But
   `CompositorCanvas.tsx` stops drawing a clip the instant `t` passes its
   `endPosition` — so the second half of every transition (the half past
   `clipEndTime`) never actually ran. Every transition's progress capped at 0.5 and
   then hard-cut to the next clip instead of completing. Fixed: window is now
   `clipEndTime - duration` to `clipEndTime` (ends exactly at the cut, never past
   it), so progress reaches a full 0→1 while the clip is still being drawn.
2. **Export (`clientRender.ts`)**: FFmpeg's `xfade` filter only accepts a fixed,
   specific set of transition names (`fade`, `wipeleft`, `slideup`, `zoomin`, etc.
   — see FFmpeg docs). The export pipeline was passing this app's internal camelCase
   transition keys straight through (`wipeLeftToRight`, `dipToBlack`, `scaleIn`, …),
   none of which FFmpeg recognizes — every transition except one coincidentally named
   exactly `"fade"` would make FFmpeg reject the filter. Added `FFMPEG_XFADE_MAP`,
   translating every one of the app's 16 transition keys to a valid xfade name
   (e.g. `dipToBlack→fadeblack`, `wipeLeftToRight→wiperight`, `zoom→zoomin`,
   `blurIn→hblur`), and the export chain now looks the key up instead of passing it
   through raw.

**Startup screen restructured per explicit request:**
- "Blank" is no longer its own tab. The default "Create" screen now shows one unified
  grid: a big dashed "+ New composition" tile as the first item, immediately followed
  by every template's real cover-image card — all visible together, no click needed
  to see templates. Clicking a template still applies it directly; clicking "+" still
  moves to the (now second, not third) step of picking an aspect ratio.
- "Recent" stays as the only other tab, shown only when signed in, since resuming
  existing work is a genuinely different action from starting something new.

Build verified clean (`npm run build` + `tsc --noEmit`).

**Still open:**
- No structural layout redesign on MediaPanel / AssetsSection / PropertiesPanel.
- Zero browser-rendered QA — this is especially true for the transition fixes above:
  the reasoning is sound and traced through the actual code paths, but "should work
  now" on paper is not the same as watching an actual crossfade play at export time.
  This is the single highest-value thing to verify next.
- No live Neon DB to test autosave/resume/admin end-to-end.

## Session — z-index stacking audit
Same philosophy as the previous session (find bugs a type-checker can't catch but a
systematic read of the actual values can): audited every `z-[…]`/`zIndex:` value in
the app to check for stacking collisions between overlays that could plausibly be
visible at the same time.

**Found one real bug:** `Importing.tsx` — the full-screen "importing media, please
wait" blocking overlay — was set to `zIndex: 10`, far below the render-queue badge
(999), error toasts (100), and every real modal (1000+). If the queue badge happened
to be showing while a new import started, it would visually float on top of an
overlay that's supposed to be blocking all interaction underneath it. Raised to 1500,
consistent with the rest of the app's "true modal = 1000+" convention (RenderButton's
modal at 1000, AuthScreen at 2000, the read-only Composition modal at 9000 since it
should always win).

Everything else checked out — DraggableWrapper/VideoOutputModal (1000),
TemplatesPanel's browse overlay (999) and slot-picker (1000), RenderingLoader's queue
badge (999), FabricOverlay/BlurComponent's internal canvas-layer z-indices (50/60,
not page-level, correctly scoped to the canvas only) are all consistently ordered.

Also checked for leftover debug `console.log` calls — the only ones present are
intentionally-prefixed diagnostic logs in the FFmpeg render pipeline
(`ffmpegEngine.ts`, `clientRender.ts`), which are legitimate given how failure-prone
that pipeline can be across browsers; left them in place.

Build verified clean (`npm run build` + `tsc --noEmit`).

**Still open, unchanged from last session:**
- No structural layout redesign on MediaPanel / AssetsSection / PropertiesPanel.
- Zero browser-rendered QA.
- No live Neon DB to test autosave/resume/admin end-to-end.

## Session — found and fixed real light-mode-leftover bugs (not just cosmetics)
This is the most consequential session in terms of actual bugs, not preference/taste
calls. Went looking for a specific, verifiable-without-a-browser class of bug: an
element with both an inline `style={{ background/color/border }}` AND a Tailwind
`dark:bg-[...]`/`dark:border-[...]`/`dark:text-[...]` class targeting the *same*
CSS property. Inline styles always win over any class regardless of `dark:` — so
every one of these was a class that could never possibly apply, full stop, not a
"maybe it doesn't look great" issue.

**Confirmed real (not cosmetic) bugs, now fixed:**
1. **`RenderButton.tsx` export-progress modal** — was an unconditionally *white* card
   (inline `background:"#FFFFFF"`) with a `dark:bg-[#1a1d27]` class that could never
   fire. This is the Export flow, one of the most-used surfaces in the app. Converted
   fully to dark studio tokens, no more `dark:` class games — just the right dark
   colors directly.
2. **`RenderingLoader.tsx` render-queue dropdown** — same bug, same fix.
3. **`Importing.tsx`** and **`Error.tsx`** — no `dark:` class at all, just permanently
   light. Both converted to dark theme.
4. **`VideoOutputModal.tsx`** ("watch exported video" screen) — permanently light
   header bar and buttons, no `dark:` variant present at all. Converted.
5. **`Slider.tsx` track background** — this is the big one: the shared `Slider`
   component (used for volume, opacity, blur intensity, and other numeric controls
   throughout the editor) had its track drawn as `rgba(0,0,0,.1)` (black-on-dark, i.e.
   nearly invisible) with a dead `dark:bg-[rgba(255,255,255,.1)]` class that never
   applied. Every slider track in the app was probably close to invisible. Fixed to
   the correct light-tinted value directly.
6. **`TimeLine.tsx` ruler corner-cell border** — same collision pattern, fixed.
   (Note: the ruler background itself, right next to this bug, uses a CSS custom
   property — `var(--ruler-bg)` set via a `dark:[--ruler-bg:...]` class — which is a
   *different* mechanism that actually works correctly and was left alone; worth
   knowing the difference before "fixing" similar-looking code elsewhere.)
7. Audited every other remaining `dark:bg-[…]`/`dark:border-[…]`/`dark:text-[…]`
   occurrence in the codebase (8 more files) — confirmed those are all pure
   className-vs-className (no colliding inline `style`), which Tailwind resolves
   correctly since `dark` is permanently set on `<html>`. Left alone; they're verbose
   but not broken.

**Also this session:**
- Deleted 3 more confirmed-dead files the same way Remotion's stubs were removed
  last session: `src/utils/fabricCanvas.ts` (a full parallel, unused Fabric.js setup
  module — zero imports anywhere, superseded by `FabricOverlay.tsx`), and
  `src/components/sections/Controls.tsx` / `RecentVideos.tsx` (both zero imports —
  `RecentVideos` was superseded by the "Recent" tab built into `StartupScreen.tsx`
  a couple sessions ago). All three had light-mode-only, never-fixed styling, which is
  presumably *why* they'd been abandoned rather than patched.
- Found and fixed one more previously-undetected legacy purple,
  `rgba(91,79,232,…)`, across 6 files (see prior session note — this pass didn't add
  new instances, just confirming the earlier fix held).
- Build verified clean (`npm run build` + `tsc --noEmit`) after every change.

**Still open:**
- No structural layout redesign on MediaPanel / AssetsSection / PropertiesPanel.
- Zero browser-rendered QA — everything above is inferred from reading the actual CSS
  cascade rules, which is a much stronger form of evidence than the icon/color sweeps
  from earlier sessions, but it's still not the same as looking at it.
- No live Neon DB to test autosave/resume/admin end-to-end.

## Session — legacy color leftovers, found by grepping for actual RGB values
Went looking specifically for colors the earlier hex-literal sweep couldn't have caught
(it only matched `#rrggbb`, not `rgba(r,g,b,a)` with the same numbers spelled out) and
for genuinely dead pastel "light mode" branches sitting next to the real dark styling.

1. **`rgba(91,79,232,…)` — a third, previously-undetected legacy purple** — found in 6
   files (`RenderButton.tsx`, `MediaPanel.tsx`, `TextEditor.tsx`,
   `ClipTransitionSelector.tsx`, `TimeLine.tsx`, `AnimationSelection.tsx`). This was an
   even older purple than the orange-signal generation swept two sessions ago — all
   instances replaced with the current signal violet, `rgba(139,92,255,…)`.
2. **Pastel light-mode icon tiles removed from MediaPanel.tsx** — text/blur layer row
   icons were using literal light-palette hex pairs (`#DBEAFE`/`#FCE7F3`/etc.) with a
   `dark:` override sitting next to them. Confirmed `<html className="dark">` is always
   set (`app/layout.tsx`) and `darkMode: "class"` in the Tailwind config, so those base
   light classes were 100% dead code, never reachable — but dead code that was actively
   confusing to read and inconsistent with the rest of the app's token system. Replaced
   with `bg-signal/10 border-signal/20` / `bg-success/10 border-success/20`, matching
   how every other icon tile in the app is styled.
3. **`TextRangeSlider.tsx` selection color** — the timeline's text-clip block used
   `#DB2777`/`#BE185D` (pink) for its selected state, which had nothing to do with any
   other accent color in the app. Changed to `#A47CFF` fill / `#FFB648` outline — the
   same "brighter signal + amber outline" pattern already used for selection everywhere
   else (FabricOverlay handles, template cards, etc.).
4. Confirmed (but did not act on) 12 files still carrying `dark:` Tailwind variant
   classes — harmless since `dark` is always applied at the root, just unnecessary
   verbosity. Not worth the risk/time to strip given everything else outstanding.
5. Build verified clean (`npm run build` + `tsc --noEmit`).

**Still open:**
- Same three items as last session — no structural layout redesign on MediaPanel /
  AssetsSection / PropertiesPanel beyond icon and color fixes, zero browser-rendered
  QA, and no live Neon DB to test autosave/resume/admin end-to-end.

## Session — Recent Projects (load direction) + final icon/emoji sweep
Closes the last two concretely-open items from the previous session's list.

1. **"Recent projects" load UI — DONE.** Previous session only had the *save* half
   of autosave working; this session wired the *load* half:
   - `StartupScreen.tsx` gained a third tab, "Recent" (only rendered when signed in),
     fetching `GET /api/projects` and rendering a cover-image grid identical in style
     to the Templates tab. Clicking a project calls `onResumeProject(id)`.
   - `ClipFlowApp.tsx`: `handleResumeProject` fetches the full project via
     `GET /api/projects/[id]`, then mounts the editor with a `resumeData` prop.
     `EditorWithSetup` hydrates every context field from `projectJson` (clips, texts,
     images, blurs, audio, layerOrder, totalTime) via `restoreProjectMedia()` — which
     turned out to already exist from an earlier session (it matches saved clip/image
     records against a `Map<filename, File>` and returns whatever couldn't be matched
     as `missingNames`).
   - New `MediaRelinkBanner.tsx` (mounted in both mobile and desktop layouts in
     `Editor.tsx`, right under `Header`): shows when `missingMediaNames.length > 0`,
     lets the user (re)link their local media folder via the existing
     `useLocalMediaFolder` hook, and automatically retries matching whenever that
     folder's file list changes — no per-clip manual relinking needed if names match.
   - Net result: opening a saved project restores layout/timing/text instantly;
     video playback resumes the moment the original folder is relinked.
2. **Full emoji/raw-SVG sweep — DONE.** Ran a systematic scan (not spot-checks) for
   emoji glyphs and inline `<svg>` across every `.ts`/`.tsx` file in `src/` and `app/`.
   Found and fixed real remaining instances beyond the icon files touched in earlier
   sessions: mobile bottom-nav tab icons in `Editor.tsx` (🎬🖼⚙⏱ → lucide `Film`/
   `ImageIcon`/`SlidersHorizontal`/`Clock`), MediaPanel's folder/file/empty-state
   icons, RenderButton's export-status line (✅❌🚫🎬 → `CheckCircle2`/`XCircle`/
   `Ban`/`Film`, restructured since you can't put JSX icons inside a plain string),
   RenderingLoader's cancel button, AudioRangeSlider's and PropertiesPanel's mute
   toggles (🔇🔊 → `VolumeX`/`Volume2`), and a stray leftover `✕` character in
   AuthScreen's guest button text. Remaining hits after the sweep are two emoji
   inside `//` code comments in `DraggableWrapper.tsx` — not rendered UI, left as is.
3. Build verified clean (`npm run build`, all 12 routes, + `tsc --noEmit`) after
   every change in this session.

**What's still open, for real this time:**
- MediaPanel.tsx / AssetsSection.tsx / PropertiesPanel.tsx have had icon-level fixes
  but not a structural layout redesign — still worth a dedicated pass if they still
  look dated once you can actually see them rendered.
- Zero browser-rendered QA — everything above is confirmed by `tsc`/`next build`,
  not by looking at it. This is the single biggest remaining risk: something could
  compile cleanly and still look or behave wrong in ways a type-checker can't catch.
- No live Neon DB — this blocks testing autosave, resume, admin CRUD, and template
  seeding end-to-end. Nothing above can be considered verified-working until that's
  connected and someone actually clicks through it.

## Session — closing remaining phases (autosave, template browse overlay, code review)
Continuation of the "Aperture v2" overhaul, focused on the concrete open items from
earlier sessions rather than further cosmetic passes.

1. **Autosave wiring — DONE, was the last open Phase 2 item.** New
   `src/hooks/useProjectAutosave.ts`: debounced (4s) save of editor state to
   `/api/projects`/`/api/projects/[id]` (POST once, then PUT on every subsequent
   change), plus a best-effort save on `beforeunload`. Only active when signed in,
   matching the existing opt-in auth model. **Scope decision, read before assuming
   this is a full project-load/resume feature**: media files are never uploaded
   (File System Access API reads local disk directly), so only metadata is
   persisted — clip positions/timing/transitions, text/image/blur layers, layer
   order, aspect ratio — plus the *filenames* referenced, so a reopened project
   knows what to ask the user to relink. `src` blob URLs and raw `File` objects are
   stripped before saving (neither survives a reload). A small status pill
   ("Saving…" / "Saved" / "Save failed") now shows in Header.tsx next to the
   sign-out button. **Not done**: an actual "load/resume a saved project" UI (a
   "Recent projects" list using the already-working `GET /api/projects` /
   `GET /api/projects/[id]` routes) — the save direction is complete, the load-back-
   into-the-editor direction is not built yet.
2. **Templates — full-screen browse overlay added.** The sidebar TemplatesPanel is
   necessarily narrow (~280–320px, resizable), so its cards can only get so big no
   matter how they're styled. Added a "Browse full-size grid" expand button
   (Maximize2 icon, top-right of the panel) that opens a full-screen overlay with a
   large 2–4 column cover-image grid — same visual language as the startup screen's
   Templates tab. Selecting a template from either view opens the same slot-picker
   modal as before.
3. **Remotion fully removed** (see previous session entry above for detail) —
   3 dead stub files deleted, dependency removed from package.json, comments
   scrubbed. Confirmed zero remaining references.
4. **FFmpeg color-sanitizer — code-reviewed, not re-tested.** Re-read
   `convertToFFmpegColor`/`finalizeFFmpegColor` in `clientRender.ts` end to end:
   the rgba/#rgb/#rrggbb/#rrggbbaa parsing and the "strip anything unsafe as a
   last resort + log loudly if that ever fires" fallback both look correct on
   inspection. This is NOT the same as confirming it renders correctly — this
   sandbox can build/typecheck but can't run a real browser + FFmpeg.wasm export,
   so the original ask ("retest the rgba() crash against the now-working engine")
   is still only verified by code review, not by an actual export.
5. Build verified clean (`npm run build` + `tsc --noEmit`) after every change.

**Concrete remaining work, roughly in priority order:**
- "Recent projects" load UI (uses existing GET routes, see #1 above).
- Full hand-redesign pass on MediaPanel.tsx / AssetsSection.tsx / PropertiesPanel.tsx
  — these still only have the token-cascade look, not an individually-redesigned one.
- Real browser QA — nothing in this project has been visually confirmed rendering
  correctly yet, only build/type-checked.
- Live Neon DB still not configured — this is what's actually blocking autosave,
  admin CRUD, and template seeding from being testable end-to-end.

## Session — startup flow rebuild + Remotion fully removed
Direct response to feedback that the app still "looked old" — the token/icon swap from
the previous session was real but most-visible-first, and the startup screen (the very
first thing you see) still had the old tiny emoji/icon-row template list. Fixed that,
plus fully removed Remotion (it turned out to be dead stub files, not just an unused
package — see below).

1. **Remotion is now completely gone**, not just flagged as unused. Turns out
   `RemotionTextAnimation.tsx`, `RemotionImageAnimation.tsx`, and `RemotionTransitions.tsx`
   were already dead stubs (`// Dead file - replaced by AnimationEngine.ts`) from a prior
   session — the real animation math lives in `AnimationEngine.ts` (pure canvas, no
   library). Deleted all 3 stub files, removed `"remotion"` from `package.json`, and
   scrubbed leftover comment references. Confirmed zero remaining references anywhere.
2. **StartupScreen.tsx — genuinely rebuilt, not re-skinned.** New two-tab structure:
   - **Blank tab**: a single big dashed "+ New composition" tile → clicking it moves to
     a second step, choosing an aspect ratio. "Original — from your video" is now a
     distinct, featured option (full-width card, own explanation) instead of one tile
     among ten, since it behaves differently: it isn't a fixed ratio, it continuously
     re-derives from whatever video is primary (`Screen.tsx` already recalculates
     container dimensions reactively off `primaryVideoDimensions` — this was true before
     this session too, it just wasn't surfaced as a real choice).
   - **Templates tab**: full photo-grid, 2–3 columns, large cover-image cards with
     gradient-scrim text overlays (matches CapCut/Adobe Express template pickers) —
     replaces the old single-column list of small icon rows entirely.
3. **Aspect ratio is now locked after project creation.** `CompostionSettingsModal.tsx`
   (opened via the Header's "Composition" button) is now read-only — shows aspect
   ratio / resolution / fps as info chips, no interactive ratio grid. Also deleted
   `SelectAspectRatio.tsx`, a dead dropdown component that would have let you change
   ratio mid-edit (it wasn't imported anywhere, but contradicted the new policy and was
   confusing to have sitting in the tree).
4. Build verified clean (`npm run build` + `tsc --noEmit`) after every change in this
   session.

**Still not done / known gaps:**
- TemplatesPanel.tsx (the in-editor sidebar template browser, as opposed to the startup
  screen) already shows real cover images from the previous session, but cards are
  necessarily smaller since it lives in a ~280px-wide sidebar — if this still reads as
  "small" in practice, the fix is widening that panel or making it a modal/overlay
  instead of a permanent sidebar tab, which is a bigger layout change than a card
  redesign and hasn't been done.
- No visual QA in an actual browser yet — this sandbox can build/typecheck but not
  render. `npm run dev` locally or a Netlify preview is the first real look.
- No live Neon DB still — admin CRUD/reorder/seed are all logically wired but untested
  end-to-end.

## Session — "Aperture v2" overhaul (icons, palette, templates, admin studio)
STATUS: Builds clean (`npm run build` + `tsc --noEmit` both pass).

**What actually changed vs. what was left alone — read this before assuming anything
was rebuilt from scratch:**

1. **Icons — fully replaced, not just re-skinned.** All 16 files that imported from
   `react-icons` now import from a single new module, `src/utils/icons.tsx`, which
   re-exports every icon from `lucide-react` (both under the old Fa/Md/Io/... names,
   so existing call sites needed zero JSX changes, and under lucide's native names for
   new code). `react-icons` is fully removed from `package.json`. Two `title=` props on
   raw icon elements were converted to `aria-label` (lucide's SVG props don't include
   `title`, unlike react-icons).
2. **Color identity — replaced, not tweaked.** Every token in `tailwind.config.cjs`
   (studio/ink/signal/scrub/danger/success/warning) got new hex values — cooler, darker
   voids, violet signal accent instead of orange, amber scrub accent instead of cyan —
   plus a new radius/shadow/animation scale (glow rings, rise-in/scan-line keyframes,
   film-grain background texture). Every hardcoded hex literal anywhere in `src/`/`app/`
   that mirrored the old palette was swept and replaced with the new one (20 files).
   Token *names* were kept so the ~45 components consuming them didn't need touching —
   this is what makes the whole app look different without every file being hand-edited.
3. **Templates — restructured, not just re-skinned.** Old 20 hardcoded TS templates are
   gone. New: `src/utils/templateInterpreter.ts` defines a fractional-coordinate JSON
   schema (`TemplateJson`) and `buildTemplateFromRecord()`, which both the 3 new built-in
   templates (`src/utils/templates.ts`) AND any admin-authored DB template run through —
   there is no special-casing between "built-in" and "admin-created" template rendering.
   Covers are real Unsplash photos, not emoji. `TemplatesPanel.tsx` now fetches
   `/api/templates` on mount and merges DB templates with the 3 built-ins (DB wins on id
   collision), rendered as photo cards instead of the old emoji-tile list.
   `ActiveTemplate` (context type) now carries `templateName`/`accentColor`/`coverImage`
   directly, so `TemplateBar.tsx` (shown during template-mode editing) no longer needs to
   re-look-up the static TEMPLATES array — this is what makes DB-only templates behave
   identically to built-in ones everywhere in the app, not just in the browser grid.
4. **Admin `/settings` — extended, not rebuilt from zero.** The existing JSON-textarea
   per-template modal was kept and restyled. New: a Grid/JSON view toggle; a dedicated
   JSON studio view (`JsonCard`) that shows every template's raw config at once,
   independently editable/savable; native HTML5 drag-and-drop reordering on the grid
   cards (persists via the existing `PUT .../sortOrder` field, no new endpoint needed);
   an "Import 3 default templates" action that POSTs `DEFAULT_TEMPLATE_RECORDS` into Neon
   as real, editable rows when the templates table is empty. The old hardcoded white
   modal background (`#fff`/`#FAFAFA`, noted in a prior session as leftover) is gone —
   fully restyled to dark studio tokens.
5. **Canvas (FabricOverlay.tsx) — visually refreshed, architecture untouched
   deliberately.** The ref-based rebuild-avoidance system (structureVersion counter,
   data kept in refs, no rebuild on keystroke) is fragile-by-design and already correct
   per its own header comment — it was NOT touched. What changed: handle/corner colors
   per layer type now match the new palette (text=violet, image=blue, blur=green,
   clip=amber pass-through), corners are circular (9px) instead of square, and the
   center-snap guide lines are amber instead of violet (so they're visible against the
   now-violet selection handles, which was a real contrast bug before this pass).
6. **Player controls / TemplateBar — restyled**, using the new tokens + lucide icons;
   `.player-tbtn-large` had a leftover orange-tinted `box-shadow` (rgba literal, not hex,
   so it survived the earlier hex-only sweep) — fixed to violet.

**What was NOT rebuilt this session (be honest about this if asked):**
- FFmpeg.wasm render engine (`clientRender.ts`) and Fabric.js as the canvas library are
  unchanged — see chat discussion: replacing either isn't a real improvement, client-side
  video export has no better option than FFmpeg.wasm, and Fabric.js is the right tool for
  bounding-box interaction. "Rebuild" was interpreted as re-skinning + re-wiring how
  they're used, not swapping the libraries themselves.
- Most of the ~45 components were NOT individually hand-rewritten — they inherit the new
  look for free via the token-name-stable palette swap (#2 above). If a specific panel
  still looks "off" after this session, it's a candidate for a hand pass, not a sign the
  palette swap didn't reach it.
- `Remotion` is still in `package.json` but (confirmed again this session) isn't on the
  actual render path — `clientRender.ts` drives export. Flag for a future cleanup pass to
  remove it if truly unused, to shrink the bundle.
- Still no live Neon DB per prior sessions — `DATABASE_URL`/`JWT_SECRET`/
  `ADMIN_PANEL_PASSWORD` still need to be set for `/settings` template CRUD, drag-drop
  reorder, and the "Import 3 default templates" button to actually persist anything.
  Until then, `/api/templates` fails soft and the app just shows the 3 built-ins.

## Phase 1 — Next.js scaffold + port + dark studio UI
STATUS: Core scaffold DONE and BUILDS CLEAN (`npm run build` passes).
- Next.js 14 app router, TS, Tailwind — done
- All 45 original components/utils ported into src/ — done
- ClipFlowApp.tsx client wrapper + app/layout.tsx + app/page.tsx — done
- Dark studio design tokens in tailwind.config.cjs (studio/ink/signal/scrub palette,
  Space Grotesk + Inter + JetBrains Mono) — done
- Fixed for this build: 2x bad ref-callback TS errors, 1x strict Blob/BlobPart TS error,
  postcss.config.js + tailwind.config.js renamed to .cjs (package.json has "type":"module")
REMAINING IN PHASE 1:
- [x] Header.tsx — restyled to studio tokens
- [x] IconSidebar.tsx — restyled to studio tokens
- [x] Full-tree palette pass DONE — every component in src/components now uses the studio
      dark tokens (studio-*/ink-*/signal/scrub/danger/success). Verified zero remaining
      references to the old indigo/pink brand colors (#4F46E5/#7C3AED/#EC4899/#5B4FE8),
      zero `useDarkMode` usage, zero stray `bg-white`/`text-black`/`sky-*` utilities.
      Files touched this pass: Header, IconSidebar, MediaPanel, PropertiesPanel,
      TemplatesPanel, TextEditor, TimeLine, Seekbar, TimeLineZoom, FabricOverlay,
      CompositionSettingsModal, StartupScreen, RenderingLoader, NumberInput, Slider,
      RenderButton, ButtonBlackPrimary, Editor (shell), ClipTransitionSelector,
      AudioRangeSlider, TextRangeSlider, VideoOutputModal, AnimationSelection,
      AssetsSection (mobile tray, hand-restyled), EffectsEditor (hand-restyled),
      RecentVideos. `npm run build` passes clean after every file group.
      Semantic per-clip-type badge colors (video/text/blur icon chips in MediaPanel/
      layers list) were preserved deliberately, not mechanically swapped.
- [x] Mobile responsive layout confirmed already built: Editor.tsx has an isMobile branch
      (useIsMobile(768) hook) with a horizontal-scroll bottom tab tray (media/text/assets/
      properties/timeline) and a persistent mini timeline strip — all now correctly colored.
- [x] Canvas viewport (src/components/screen/Screen.tsx) upgraded: checkerboard transparency
      background behind the frame (Photoshop-style, indicates transparent areas), deeper
      layered drop-shadow, and a live zoom-percentage badge (bottom-right, updates with
      scroll-to-zoom / pinch). Timeline ruler track-labels: fixed 2 leftover legacy-color
      instances (#6B7280 variants that didn't match the earlier bulk-replace pattern exactly).
- [ ] StartupScreen: colors done, layout/animation polish pass not done
- [ ] Visual QA pass in an actual browser (this sandbox can build but not render/screenshot —
      Netlify preview or local `npm run dev` is the first real visual check)
PHASE 1 IS FUNCTIONALLY DONE. Recommend moving to Phase 2 next session unless visual QA
turns up issues.

## Phase 2 — Neon DB + custom auth + File System Access API
STATUS: PHASE 2 CORE FEATURE-COMPLETE. Builds clean, 8 API routes registered.
- db/schema.sql — users, sessions, projects, project_history, local_file_handles, templates
- src/lib/db.ts — lazy Neon client (safe for build-time page-data collection w/o DATABASE_URL)
- src/lib/auth.ts — JWT sign/verify + sha256 token hashing for the sessions table
- src/lib/getCurrentUser.ts — shared session-resolution helper for API routes
- app/api/auth/{signup,login,logout,me}/route.ts — bcrypt hashing, httpOnly session cookie,
  generic "incorrect email or password" (no account enumeration)
- app/api/projects/route.ts — GET (list, most-recent-first) + POST (create)
- app/api/projects/[id]/route.ts — GET (load + logs 'opened' to project_history) + PUT
  (save/autosave, partial updates via COALESCE) + DELETE
- src/context/useAuthContext.tsx — client AuthProvider (user/loading/error + signup/login/logout)
- src/components/auth/AuthScreen.tsx — studio-styled login/signup screen
- src/components/ClipFlowApp.tsx — wraps app in AuthProvider; whole editor gated behind
  AuthScreen until a session exists (checks /api/auth/me on load)
- src/hooks/useLocalMediaFolder.ts — File System Access API hook, WIRED INTO MediaPanel media
  tab (toggle button in header opens a "Link folder" / file-browser grid panel; picking a file
  routes through the same ingestFiles() pipeline as the native file picker)
- .env.local.example — DATABASE_URL, JWT_SECRET, ADMIN_PANEL_PASSWORD documented

REMAINING IN PHASE 2 (not blocking — nice-to-haves before Phase 3):
- [x] AUTH IS NOW OPT-IN, NOT A WALL (changed this session per user request): guests can use
      the entire editor with zero account. AuthContext exposes promptLogin(reason?) /
      authModalOpen / closeAuthModal — AuthScreen.tsx is now a dismissible modal (not a
      full-page block) mounted once globally in ClipFlowApp.tsx, and only opens when
      something calls promptLogin(). Header.tsx shows a "Sign in" button for guests / avatar
      + "Sign out" for logged-in users — always visible, never forces anything.
- [ ] Editor doesn't call the new /api/projects routes yet — nothing actually autosaves to
      Neon yet, the routes just exist and build clean. Next step: on first save attempt,
      if (!user) promptLogin("Sign in to save your project") else POST /api/projects.
- [ ] "Recent projects" UI on StartupScreen reading GET /api/projects — not built yet. Should
      follow the same pattern: if guest, show "Sign in to see saved projects" + button calling
      promptLogin() instead of hiding the section entirely.
- [ ] local_file_handles table exists in schema but nothing writes to it yet (would let a
      reloaded project show "relink your X folder" with the right expected name)
- [ ] Actually run db/schema.sql against a real Neon database + set real DATABASE_URL/
      JWT_SECRET in Netlify env vars (can't be done from this sandbox — no DB credentials)
- [ ] First real end-to-end test (signup → login → save project → reload) can only happen
      once DATABASE_URL is real — this sandbox can build but not run a live DB.

## Phase 3 — Hidden /settings admin panel
STATUS: CORE DONE, builds clean. Password-gated CRUD dashboard is fully functional against
the schema; NOT yet wired into the actual editor's Templates tab (TemplatesPanel.tsx still
only shows the hardcoded TEMPLATES array from utils/templates.ts).
- src/lib/adminAuth.ts — separate lightweight admin session (httpOnly cookie, sha256 of
  password+salt, timing-safe compare), independent of user auth. Password comes from
  ADMIN_PANEL_PASSWORD env var, falls back to "open5333" if unset.
- app/api/admin/login/route.ts — checks password, sets admin cookie (12hr expiry)
- app/api/admin/templates/route.ts — GET (list all incl. inactive) + POST (create)
- app/api/admin/templates/[id]/route.ts — PUT (update, partial via COALESCE) + DELETE
- app/api/templates/route.ts — PUBLIC read-only endpoint (active templates only,
  force-dynamic so it queries fresh, not baked in at build time) — this is what the editor's
  Templates tab should eventually fetch from
- app/settings/page.tsx — the hidden route itself. Zero links to it anywhere in the app UI
  (verified via grep). Password screen → dashboard: grid of templates with cover thumbnail,
  active/hidden badge, edit/hide/delete actions, "+ Add template" opens a modal with name,
  cover image URL field (+ live preview), sort order, and a JSON textarea for the template's
  text/blur/videoSlot config (fractional 0–1 coordinates so it scales to any canvas size)

REMAINING IN PHASE 3:
- [ ] BIGGEST REMAINING PIECE: the app's existing template system (utils/templates.ts) is
      100% code-defined — each template's buildTexts()/buildBlurs() are literal TypeScript
      functions, not data. DB templates store template_json (plain data) instead. To make
      admin-created templates actually show up and apply correctly in TemplatesPanel.tsx,
      need an INTERPRETER function like:
        buildTemplateFromRecord(record) → same shape as the existing `Template` interface,
        where buildTexts(w,h,dur) reads record.template_json.texts[] (each with xFrac/yFrac/
        wFrac/hFrac etc, matching the DEFAULT_TEMPLATE_JSON schema shown in the admin editor)
        and multiplies by w/h to get pixel positions — basically a data-driven version of the
        existing `makeText()` helper already in utils/templates.ts.
      Then TemplatesPanel.tsx needs to: fetch('/api/templates') on mount, run each result
      through the interpreter, and concat with the hardcoded TEMPLATES array before filtering/
      rendering — everything else (slot picker, apply logic, category filter) already works
      against the `Template` interface so it should "just work" once the interpreter exists.
- [x] Cover image is now a REAL file upload (not just a URL field): admin panel has a
      drag-friendly file input that uploads directly to Cloudinary's unsigned upload
      endpoint from the browser (no server route needed, no API secret exposed
      client-side), extracts secure_url, and that's what gets saved to Neon. URL field
      kept as a manual-override fallback. Needs NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME +
      NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env.local (documented in .env.local.example,
      with instructions for creating an UNSIGNED upload preset in the Cloudinary dashboard).
      Shows a clear warning banner in the admin UI if these aren't set yet, rather than
      failing silently.
- [ ] Minor leftover color polish from Phase 1 sweep: TemplatesPanel.tsx's slot-picker MODAL
      uses inline style hex codes (background:"#fff", "#FAFAFA") that weren't caught by the
      earlier className-based bulk replace — cosmetic only, modal is functional
- [ ] Test the full admin flow against a real Neon DB once DATABASE_URL is set (untestable
      in this sandbox — no live DB)

## Phase 4 — Engine/FFmpeg fixes
STATUS: VERIFIED ALREADY CORRECT. All 3 requirements were fixed in an earlier engineering
session (pre-Next.js-migration) and survived the Vite→Next.js port intact. Checked each
line-by-line this session rather than assuming — did not just trust the file existed:
- Roboto embedded in FFmpeg virtual FS: src/utils/clientRender.ts fetches
  fonts.gstatic.com/.../Roboto.ttf and writes it via ffmpeg.writeFile(FS_FONT, ...) before
  any render with text (line ~239), and it's actually wired into the drawtext filter via
  `fontfile=${FS_FONT}` (line ~686) — confirmed it's not just loaded-and-unused.
- rgba()→hex sanitizer: convertToFFmpegColor() (line ~112) handles rgba(r,g,b,a), #rgb,
  #rrggbb/#rrggbbaa, AND named colors (with a comma/paren-stripping safeguard as a last
  resort) — outputs clean 0xRRGGBB tokens so FFmpeg's filtergraph parser never sees a
  comma-containing color string.
- Pass-through bypass: canPassThrough() (line ~51) checks single-clip / no-overlays / no-
  transition / full-duration / matching-dimensions, and is actually called (line ~200) to
  skip FFmpeg entirely and serve the source file directly when true — confirmed it's wired
  into the render entry point, not dead code.
NOTHING TO DO HERE unless testing surfaces a real regression — don't re-fix working code.

## Color-bug investigation (user reported rgba() crash on export)
User reported: exporting with a template/text applied crashes with
`fontcolor to value rgba(255` — meaning the raw, unconverted color string
(with a comma inside it) reached FFmpeg's drawtext filter.
INVESTIGATION (this session): traced the EXACT string from the failing
template (`utils/templates.ts` line ~68: `textColor: "rgba(255,255,255,0.75)"`)
through `convertToFFmpegColor()` in an isolated Node test — confirmed it
converts CLEANLY to `["0xffffff", 0.75]`, not a raw rgba string. So the
current source file, as it exists in this project right now, does NOT
reproduce the reported bug for this exact input. Conclusion: whoever/
whatever the user tested was running a DIFFERENT build than what's in this
zip — most likely a stale Netlify deploy, a stale `.next` cache, or an
earlier zip/original pre-migration app — not a live bug in this codebase.
HARDENING ADDED ANYWAY (defense in depth, in case a genuinely new color
format shows up later):
- `finalizeFFmpegColor()` wraps `convertToFFmpegColor()` and forcibly strips
  any stray `(`, `)`, `,`, or space that could ever reach a drawtext arg —
  and console.errors loudly if it ever has to intervene, so a real bug (as
  opposed to a stale build) would be unmistakable in devtools next time.
- Added a `console.log("[clientRender] engine build: color-sanitizer-hardened-2026-07-06")`
  at the top of `clientRender()` — if the user doesn't see this exact line
  in their browser console during a real export, they are conclusively
  running stale/cached code, not this file. Ask them to check for this
  line first if the error recurs, before assuming the source is broken.
NEXT STEP IF THE ERROR RECURS: get the user to (1) hard-refresh / clear
`.next` cache / redeploy from THIS exact zip, (2) confirm the build-marker
log appears in console, (3) if it still crashes with the marker present,
that's a genuinely new bug — get the exact `t.textColor` value at fault
(the console.error added above will now print it directly).

## REAL BUG FOUND AND FIXED (from actual browser console log, 2026-07-06)
User provided real runtime logs. Two genuine, separate bugs found and fixed
by tracing the actual stack trace — not assumptions:

1. **FFmpeg core never loaded at all** — `Error: Cannot find module
   'blob:http://localhost:3000/...'` was thrown at `ffmpeg.load()`, BEFORE
   any filter/color/text logic ever ran. This explains why it happened on
   "just text" — nothing was rendering yet, the engine itself never
   finished loading, so of course animations/templates would fail too
   (not because they're separately broken — the whole engine was dead).
   ROOT CAUSE: `src/utils/ffmpegEngine.ts` was loading the core from
   `@ffmpeg/core@0.12.6/dist/esm` (the ESM build). The ESM build resolves
   its own internal module imports relative to its own script URL; once
   that URL is a `toBlobURL()`-converted `blob:` URL (required to avoid
   needing COOP/COEP headers), there's no meaningful path for a relative
   import to resolve against inside the worker, so it throws exactly this
   "Cannot find module 'blob:...'" error. Verified via web search this is
   a known FFmpeg.wasm+Next.js issue other developers hit and fixed the
   same way (see github.com/ffmpegwasm/ffmpeg.wasm discussion #678).
   FIX: switched `CORE_BASE_URL` to `.../core@0.12.6/dist/umd` — the
   correct single-threaded build for `toBlobURL()` + classic worker
   loading (no SharedArrayBuffer/multi-thread needed here). Confirmed the
   UMD path actually exists at that exact version via web search.
   Also bumped the console.log build marker to
   "Loading WASM core (UMD build, fix 2026-07-06)" so the user can
   confirm in devtools this exact fix is what's running.

2. **React "Cannot update a component while rendering a different
   component" warning** — in `src/components/ui/RenderButton.tsx`,
   `setActiveJobId(update.jobId)` was called INSIDE the updater function
   passed to `setRenderJobs(prev => ...)`. State updater functions must
   be pure (React can invoke them more than once), so calling a second
   component's setState from inside one triggers this exact warning.
   FIX: moved the "is this a new job" check and `setActiveJobId()` call
   to a plain statement before `setRenderJobs(...)`, using the outer
   `renderJobs` closure variable instead of the updater's `prev` param.

STILL UNVERIFIED (this sandbox cannot run a browser): whether the
originally-reported `rgba(255` color-truncation crash still occurs now
that FFmpeg can actually load and run a real render. That code path never
even executed before (FFmpeg died at load, before reaching any drawtext
filter), so it's untested until the user can get a render to actually
start. Ask them to retest now that loading is fixed.
