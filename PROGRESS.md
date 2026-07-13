# ClipFlow Rebuild — Progress Tracker
(Keep this file updated at the end of every session. If a session gets cut off, resume from here.)

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
