# ClipFlow Rebuild — Progress Tracker
(Keep this file updated at the end of every session. If a session gets cut off, resume from here.)

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
