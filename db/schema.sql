-- ClipFlow — Neon Postgres schema
-- Run against your Neon database, e.g.:
--   psql "$DATABASE_URL" -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ── Sessions (JWT is the source of truth for auth; this table lets us
--    revoke sessions server-side and see "recent devices" later) ───────
CREATE TABLE IF NOT EXISTS sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE, -- sha256 of the JWT, so a leaked DB row can't be replayed as a token
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);

-- ── Projects — saved project JSON metadata (timeline/clip/text/blur
--    state). Raw media itself stays on the user's disk via the File
--    System Access API; we only ever store metadata + a handle
--    reference name here, never the media bytes. ─────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'Untitled project',
  aspect_ratio  TEXT NOT NULL DEFAULT '16:9',
  thumbnail_url TEXT,
  project_json  JSONB NOT NULL DEFAULT '{}'::jsonb, -- clipsDetails, textsDetails, blursDetails, imagesDetails, totalTime, etc.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects (user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects (updated_at DESC);

-- ── Recent project history (lightweight, separate from `projects` so
--    we can log every open/render event without bloating the project
--    row itself) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects (id) ON DELETE CASCADE,
  event       TEXT NOT NULL, -- 'opened' | 'rendered' | 'created'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_history_user_id ON project_history (user_id, created_at DESC);

-- ── Local file handles — tracks WHICH local media folder + files a
--    project references, so the File System Access API permission
--    prompt can be re-requested for the right folder on reload.
--    We can't persist a real FileSystemHandle server-side (browser-only
--    object), so this stores the human-readable path/name the browser
--    reported, purely for UX ("relink your Videos/ClipFlow folder"). ──
CREATE TABLE IF NOT EXISTS local_file_handles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id     UUID REFERENCES projects (id) ON DELETE CASCADE,
  handle_name    TEXT NOT NULL,       -- e.g. folder name reported by the File System Access API
  relative_paths JSONB NOT NULL DEFAULT '[]'::jsonb, -- filenames within that folder the project uses
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_local_file_handles_project_id ON local_file_handles (project_id);

-- ── Templates (Phase 3 admin panel writes here) ─────────────────────
CREATE TABLE IF NOT EXISTS templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  cover_image TEXT, -- URL or data URL for the template cover photo
  template_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_active ON templates (is_active, sort_order);

-- ── Motion presets: curated animations + transitions, admin-editable JSON ──
-- One table for both kinds (distinguished by `kind`) rather than two nearly
-- identical tables. Mirrors the `templates` pattern above: built-in presets
-- ship in code (src/utils/motionPresets.ts) as the always-available
-- fallback; anything in this table is additive/overriding, editable from
-- /settings the same way templates are.
CREATE TABLE IF NOT EXISTS motion_presets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('animation','transition')),
  name        TEXT NOT NULL,
  preset_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_motion_presets_active ON motion_presets (kind, is_active, sort_order);
