"use client";

import { useEffect, useState, FormEvent, DragEvent } from "react";
import {
  LayoutTemplate, Plus, Code2, LayoutGrid, GripVertical, Eye, EyeOff,
  Trash2, Pencil, Check, X, Upload, Sparkles, ShieldAlert,
} from "@/utils/icons";
import * as Icons from "@/utils/icons";
import { DEFAULT_TEMPLATE_RECORDS } from "@/utils/templates";
import { DEFAULT_ANIMATION_RECORDS, DEFAULT_TRANSITION_RECORDS, DEFAULT_FILTER_RECORDS } from "@/utils/motionPresets";

interface AdminTemplate {
  id: string;
  name: string;
  cover_image: string | null;
  template_json: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const DEFAULT_TEMPLATE_JSON = `{
  "description": "Bold centered title with subtitle",
  "category": "title",
  "aspectRatio": "16:9",
  "accentColor": "#8B5CFF",
  "videoSlots": [
    { "label": "Main clip", "durationSecs": 10 }
  ],
  "texts": [
    { "text": "YOUR TITLE HERE", "xFrac": 0.1, "yFrac": 0.35, "wFrac": 0.8, "hFrac": 0.15, "fontSize": 100, "isBold": true, "textColor": "white", "animation": "fadeIn" }
  ],
  "blurs": []
}`;

// Shown as a help hint near the JSON editor (not part of the parseable
// default) — documents the optional per-slot speed ramp shape.
const SPEED_RAMP_HINT = `Optional per-slot "speed" — a number (constant speed; 1 = normal, <1 = slow-mo, >1 = fast motion) or a ramp array of { atFraction, speedMultiplier } points (0..1 through that slot's own duration), e.g.:
"videoSlots": [
  { "label": "Slow-mo shot", "durationSecs": 4, "speed": 0.4 },
  { "label": "Ramp to fast", "durationSecs": 3, "speed": [
      { "atFraction": 0,    "speedMultiplier": 0.35 },
      { "atFraction": 0.55, "speedMultiplier": 0.35 },
      { "atFraction": 0.62, "speedMultiplier": 3.2 },
      { "atFraction": 1,    "speedMultiplier": 3.2 }
    ] }
]
Text "animation" also supports "wiggle" and "shake" for continuous motion.`;

async function api(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export default function SettingsPage() {
  const [section, setSection] = useState<"templates" | "motion">("templates");
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminTemplate | "new" | null>(null);
  const [view, setView] = useState<"grid" | "json">("grid");
  const [seeding, setSeeding] = useState(false);

  // Drag-and-drop reorder state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/templates");
        if (res.ok) setAuthed(true);
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, []);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    setListError(null);
    try {
      const data = await api("/api/admin/templates");
      setTemplates(data.templates);
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (authed) loadTemplates();
  }, [authed]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAuthError(null);
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) });
      setAuthed(true);
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template? This can't be undone.")) return;
    try {
      await api(`/api/admin/templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleToggleActive = async (t: AdminTemplate) => {
    try {
      const data = await api(`/api/admin/templates/${t.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !t.is_active }),
      });
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? data.template : x)));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Import the 3 built-in defaults as real, editable DB rows — the fastest
  // way to get a starting point for the drag-drop studio / JSON editor
  // below without hand-typing template JSON from scratch.
  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      for (const [i, rec] of DEFAULT_TEMPLATE_RECORDS.entries()) {
        const data = await api("/api/admin/templates", {
          method: "POST",
          body: JSON.stringify({
            name: rec.name,
            coverImage: rec.cover_image,
            templateJson: rec.template_json,
            isActive: true,
            sortOrder: templates.length + i,
          }),
        });
        setTemplates((prev) => [...prev, data.template]);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  // ── Drag-and-drop reorder (native HTML5 DnD, no extra dependency) ──────
  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const ordered = [...templates].sort((a, b) => a.sort_order - b.sort_order);
    const fromIdx = ordered.findIndex((t) => t.id === dragId);
    const toIdx = ordered.findIndex((t) => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return; }

    const reordered = [...ordered];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    // Optimistic local reorder, then persist new sort_order for each row.
    const withNewOrder = reordered.map((t, i) => ({ ...t, sort_order: i }));
    setTemplates(withNewOrder);
    setDragId(null);
    setDragOverId(null);

    try {
      await Promise.all(
        withNewOrder.map((t, i) =>
          api(`/api/admin/templates/${t.id}`, { method: "PUT", body: JSON.stringify({ sortOrder: i }) })
        )
      );
    } catch (err) {
      alert("Some templates didn't save their new order: " + (err as Error).message);
      loadTemplates();
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-[100dvh] bg-studio-void flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-studio-border border-t-signal animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-[100dvh] bg-studio-void bg-aperture-radial flex items-center justify-center px-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-[360px] bg-studio-surface border border-studio-border rounded-2xl shadow-panel p-7"
        >
          <div className="w-10 h-10 rounded-xl bg-signal/15 border border-signal/30 flex items-center justify-center mb-4">
            <ShieldAlert size={18} className="text-signal" />
          </div>
          <h1 className="font-display text-lg font-semibold text-ink-primary mb-1">Admin access</h1>
          <p className="text-[12.5px] text-ink-muted mb-5">Enter the admin password to continue.</p>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[13.5px] text-ink-primary placeholder:text-ink-faint outline-none focus:border-signal transition-colors mb-3"
          />
          {authError && (
            <div className="text-[12px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2 mb-3">
              {authError}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-signal hover:bg-signal-hover text-studio-void text-[13.5px] font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    );
  }

  const orderedTemplates = [...templates].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="min-h-[100dvh] bg-studio-void bg-aperture-radial">
      <div className="max-w-[1100px] mx-auto px-6 py-8">

        {/* Top-level section switcher — Templates vs Motion Presets are separate admin areas */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-studio-surface border border-studio-border w-fit mb-6">
          {([
            { key: "templates", label: "Templates" },
            { key: "motion", label: "Motion Presets" },
          ] as const).map(s => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={`px-4 py-1.5 rounded-lg text-[12.5px] font-bold transition-colors ${
                section === s.key ? "bg-signal text-studio-void" : "text-ink-secondary hover:text-ink-primary"
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        {section === "motion" ? <MotionPresetsSection /> : (
        <>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-signal/15 border border-signal/30 flex items-center justify-center flex-shrink-0">
              <LayoutTemplate size={16} className="text-signal" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-ink-primary">Template Studio</h1>
              <p className="text-[12.5px] text-ink-muted mt-0.5">
                {templates.length} template{templates.length !== 1 ? "s" : ""} · changes appear in the app's Templates tab immediately
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Grid / JSON view toggle */}
            <div className="flex items-center bg-studio-surface border border-studio-border rounded-lg p-0.5">
              <button
                onClick={() => setView("grid")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                  view === "grid" ? "bg-signal text-studio-void" : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <LayoutGrid size={13} /> Grid
              </button>
              <button
                onClick={() => setView("json")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                  view === "json" ? "bg-signal text-studio-void" : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <Code2 size={13} /> JSON
              </button>
            </div>

            {templates.length === 0 && (
              <button
                onClick={handleSeedDefaults}
                disabled={seeding}
                className="flex items-center gap-1.5 bg-studio-surface border border-studio-border hover:border-signal/40 text-ink-secondary hover:text-signal text-[13px] font-semibold px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <Sparkles size={14} /> {seeding ? "Importing…" : "Import 3 default templates"}
              </button>
            )}

            <button
              onClick={() => setEditing("new")}
              className="flex items-center gap-1.5 bg-signal hover:bg-signal-hover text-studio-void text-[13px] font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              <Plus size={14} /> Add template
            </button>
          </div>
        </div>

        {listError && (
          <div className="text-[12.5px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2 mb-4">
            {listError}
          </div>
        )}

        {loadingTemplates ? (
          <div className="text-ink-muted text-[13px] py-10 text-center">Loading templates…</div>
        ) : templates.length === 0 ? (
          <div className="border border-dashed border-studio-borderLight rounded-xl py-14 text-center">
            <p className="text-ink-secondary text-[13px]">No templates yet.</p>
            <p className="text-ink-faint text-[12px] mt-1">
              Click "Import 3 default templates" for a starting point, or "Add template" to start from scratch.
            </p>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {orderedTemplates.map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={() => setDragId(t.id)}
                onDragOver={(e: DragEvent) => { e.preventDefault(); setDragOverId(t.id); }}
                onDragLeave={() => setDragOverId((cur) => (cur === t.id ? null : cur))}
                onDrop={() => handleDrop(t.id)}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                className={`bg-studio-surface border rounded-xl overflow-hidden transition-all cursor-grab active:cursor-grabbing ${
                  dragOverId === t.id ? "border-signal ring-2 ring-signal/30" : "border-studio-border hover:border-signal/40"
                } ${dragId === t.id ? "opacity-40" : ""}`}
              >
                <div className="relative aspect-video bg-studio-raised flex items-center justify-center overflow-hidden">
                  <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-md bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/70">
                    <GripVertical size={13} />
                  </div>
                  {t.cover_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.cover_image} alt={t.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-ink-faint text-[11px]">No cover image</span>
                  )}
                </div>
                <div className="p-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13.5px] font-semibold text-ink-primary truncate">{t.name}</span>
                    <span
                      className={`text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 ${
                        t.is_active ? "bg-success/15 text-success" : "bg-studio-hover text-ink-faint"
                      }`}
                    >
                      {t.is_active ? "Active" : "Hidden"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => setEditing(t)}
                      className="flex-1 flex items-center justify-center gap-1 text-[12px] font-semibold py-1.5 rounded-lg border border-studio-border text-ink-secondary hover:border-signal hover:text-signal transition-colors"
                    >
                      <Pencil size={11} /> Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(t)}
                      className="flex-1 flex items-center justify-center gap-1 text-[12px] font-semibold py-1.5 rounded-lg border border-studio-border text-ink-secondary hover:bg-studio-hover transition-colors"
                    >
                      {t.is_active ? <EyeOff size={11} /> : <Eye size={11} />} {t.is_active ? "Hide" : "Show"}
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-[12px] font-semibold py-1.5 px-2.5 rounded-lg border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // ── JSON studio view — every active template's raw config, inline-editable ──
          <div className="flex flex-col gap-4">
            {orderedTemplates.map((t) => (
              <JsonCard key={t.id} template={t} onSaved={(saved) => {
                setTemplates((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
              }} />
            ))}
          </div>
        )}
        </>
        )}
      </div>

      {editing && (
        <TemplateEditorModal
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setTemplates((prev) => {
              const exists = prev.some((t) => t.id === saved.id);
              return exists ? prev.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...prev];
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ── JSON studio card — view + inline-edit one template's raw config ───────
function JsonCard({ template, onSaved }: { template: AdminTemplate; onSaved: (t: AdminTemplate) => void }) {
  const [text, setText] = useState(JSON.stringify(template.template_json, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = text !== JSON.stringify(template.template_json, null, 2);

  const save = async () => {
    setError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("Not valid JSON — check for a trailing comma or missing quote.");
      return;
    }
    setSaving(true);
    try {
      const data = await api(`/api/admin/templates/${template.id}`, {
        method: "PUT",
        body: JSON.stringify({ templateJson: parsed }),
      });
      onSaved(data.template);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-studio-surface border border-studio-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-studio-border">
        {template.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={template.cover_image} alt="" className="w-9 h-9 rounded-md object-cover flex-shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-md bg-studio-raised flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ink-primary truncate">{template.name}</div>
          <div className="text-[10.5px] text-ink-faint font-mono truncate">{template.id}</div>
        </div>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-signal hover:bg-signal-hover text-studio-void transition-colors disabled:opacity-50"
          >
            <Check size={12} /> {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      <details className="px-4 py-2 border-b border-studio-border">
        <summary className="text-[11px] text-ink-faint cursor-pointer select-none">Field reference: speed ramps &amp; animations</summary>
        <pre className="text-[10.5px] text-ink-muted font-mono whitespace-pre-wrap mt-1.5 leading-relaxed">{SPEED_RAMP_HINT}</pre>
      </details>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        spellCheck={false}
        className="w-full bg-studio-void px-4 py-3 text-[12px] font-mono text-ink-primary outline-none resize-y"
      />
      {error && (
        <div className="text-[12px] text-danger bg-danger/10 border-t border-danger/25 px-4 py-2">{error}</div>
      )}
    </div>
  );
}

function TemplateEditorModal({
  template,
  onClose,
  onSaved,
}: {
  template: AdminTemplate | null;
  onClose: () => void;
  onSaved: (t: AdminTemplate) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [coverImage, setCoverImage] = useState(template?.cover_image ?? "");
  const [sortOrder, setSortOrder] = useState(template?.sort_order ?? 0);
  const [templateJsonText, setTemplateJsonText] = useState(
    template ? JSON.stringify(template.template_json, null, 2) : DEFAULT_TEMPLATE_JSON
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Uploads go through our own server route now (POST /api/admin/upload-image),
  // which holds the Cloudinary API key/secret and performs a signed upload —
  // nothing Cloudinary-specific needs to be exposed to the browser at all.
  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);

    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/upload-image", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error ?? "Upload failed.");
      }
      if (!data.url) {
        throw new Error("Upload didn't return an image URL.");
      }

      setCoverImage(data.url as string);
    } catch (err) {
      setUploadError((err as Error).message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    let parsedJson: Record<string, unknown>;
    try {
      parsedJson = JSON.parse(templateJsonText);
    } catch {
      setError("Template config isn't valid JSON — check for a trailing comma or missing quote.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        coverImage: coverImage.trim() || null,
        sortOrder,
        templateJson: parsedJson,
      };
      const data = template
        ? await api(`/api/admin/templates/${template.id}`, { method: "PUT", body: JSON.stringify(body) })
        : await api("/api/admin/templates", { method: "POST", body: JSON.stringify({ ...body, isActive: true }) });
      onSaved(data.template);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/65 backdrop-blur-md flex items-center justify-center px-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[560px] max-h-[88vh] overflow-y-auto scrollbar-thin bg-studio-surface border border-studio-border rounded-2xl shadow-pop p-6 animate-rise-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            {template ? "Edit template" : "New template"}
          </h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-ink-muted hover:bg-studio-hover transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cinematic Title"
              className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[13.5px] text-ink-primary placeholder:text-ink-faint outline-none focus:border-signal transition-colors"
            />
          </div>

          <div>
            <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">
              Cover image
            </label>

            <label
              className={`flex items-center justify-center gap-2 w-full border border-dashed rounded-lg py-4 text-[12.5px] font-semibold transition-colors ${
                uploading
                  ? "border-studio-borderLight text-ink-faint cursor-wait"
                  : "border-studio-borderLight text-ink-secondary hover:border-signal hover:text-signal cursor-pointer"
              }`}
            >
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => handleFileSelected(e.target.files?.[0])}
                className="hidden"
              />
              <Upload size={14} /> {uploading ? "Uploading…" : "Click to upload an image"}
            </label>

            {uploadError && (
              <div className="text-[11px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2 mt-2">
                {uploadError}
              </div>
            )}

            <div className="mt-2">
              <label className="text-[10.5px] text-ink-faint block mb-1">
                Or paste an image URL directly
              </label>
              <input
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                placeholder="https://…"
                className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2 text-[12.5px] text-ink-primary placeholder:text-ink-faint outline-none focus:border-signal transition-colors"
              />
            </div>

            {coverImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverImage}
                alt=""
                className="mt-2 w-full aspect-video object-cover rounded-lg border border-studio-border"
              />
            )}
          </div>

          <div>
            <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Sort order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-28 bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[13.5px] text-ink-primary outline-none focus:border-signal transition-colors"
            />
            <p className="text-[10.5px] text-ink-faint mt-1.5">
              Lower numbers appear first. You can also drag cards to reorder from the Grid view.
            </p>
          </div>

          <div>
            <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">
              Template config (JSON)
            </label>
            <details className="mb-1.5">
              <summary className="text-[11px] text-ink-faint cursor-pointer select-none">Field reference: speed ramps &amp; animations</summary>
              <pre className="text-[10.5px] text-ink-muted font-mono whitespace-pre-wrap mt-1 leading-relaxed bg-studio-void border border-studio-border rounded-lg p-2.5">{SPEED_RAMP_HINT}</pre>
            </details>
            <textarea
              value={templateJsonText}
              onChange={(e) => setTemplateJsonText(e.target.value)}
              rows={12}
              spellCheck={false}
              className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[12px] font-mono text-ink-primary outline-none focus:border-signal transition-colors resize-y"
            />
            <p className="text-[10.5px] text-ink-faint mt-1.5">
              Fractional coordinates (0–1) scale to any canvas size. See PROGRESS.md for the full schema.
            </p>
          </div>

          {error && (
            <div className="text-[12px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={handleSave}
              disabled={saving || uploading}
              className="flex-1 bg-signal hover:bg-signal-hover text-studio-void text-[13.5px] font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save template"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-studio-border text-ink-secondary text-[13.5px] font-semibold hover:bg-studio-hover transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Motion Presets section — curated animations + transitions ─────────────
// Same underlying idea as Template Studio (admin-editable JSON, additive to
// a built-in default set) but much simpler data: each preset is just a
// name + which engine key it points to, no cover images or drag-drop
// needed. See src/utils/motionPresets.ts for the full explanation of what
// is and isn't actually JSON-configurable here.
interface AdminMotionPreset {
  id: string;
  kind: "animation" | "transition" | "filter";
  name: string;
  preset_json: {
    engineKey?: string; description?: string; icon?: string;
    brightness?: number; contrast?: number; saturation?: number; temperature?: number;
  };
  is_active: boolean;
  sort_order: number;
}

const ANIMATION_ENGINE_KEYS = [
  "fadeIn", "slideUp", "slideDown", "slideIn", "slideInRight", "zoomIn", "grow", "shrink",
  "rotateIn", "bounceIn", "popInUp", "popInDown", "pulse", "spinIn", "blurIn", "typewriter",
  "flipX", "flipY", "waveIn", "glowIn", "shake", "wiggle", "sparkle",
];
const TRANSITION_ENGINE_KEYS = [
  "crossDissolve", "filmDissolve", "dipToBlack", "dipToWhite", "wipeLeftToRight",
  "wipeTopToBottom", "slideIn", "push", "zoom", "morphCut", "fadeIn", "slideUp",
  "slideRight", "flipIn", "blurIn", "scaleIn",
];
const MOTION_ICON_CHOICES = ["Sparkles", "ArrowUp", "Zap", "ZoomIn", "Activity", "Type", "Blend", "Moon", "ArrowRight", "ArrowLeftRight"];

function MotionPresetsSection() {
  const [kind, setKind] = useState<"animation" | "transition" | "filter">("animation");
  const [presets, setPresets] = useState<AdminMotionPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminMotionPreset | "new" | null>(null);

  const load = () => {
    setLoading(true);
    setListError(null);
    api(`/api/admin/motion-presets?kind=${kind}`)
      .then((data) => setPresets(data.presets))
      .catch((err) => setListError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this preset? This can't be undone.")) return;
    try {
      await api(`/api/admin/motion-presets/${id}`, { method: "DELETE" });
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleToggleActive = async (p: AdminMotionPreset) => {
    try {
      const data = await api(`/api/admin/motion-presets/${p.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !p.is_active }),
      });
      setPresets((prev) => prev.map((x) => (x.id === p.id ? data.preset : x)));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const [importing, setImporting] = useState(false);
  const defaultRecordsForKind = kind === "animation" ? DEFAULT_ANIMATION_RECORDS
    : kind === "transition" ? DEFAULT_TRANSITION_RECORDS
    : DEFAULT_FILTER_RECORDS;
  const existingNames = new Set(presets.map((p) => p.name.trim().toLowerCase()));
  const missingDefaults = defaultRecordsForKind.filter((r) => !existingNames.has(r.name.trim().toLowerCase()));

  const handleImportDefaults = async () => {
    if (missingDefaults.length === 0) return;
    setImporting(true);
    try {
      for (const record of missingDefaults) {
        const saved = await api("/api/admin/motion-presets", {
          method: "POST",
          body: JSON.stringify({
            kind: record.kind, name: record.name,
            presetJson: record.preset_json, isActive: record.is_active ?? true,
            sortOrder: record.sort_order ?? 0,
          }),
        });
        setPresets((prev) => [...prev, saved.preset]);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const ordered = [...presets].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-signal/15 border border-signal/30 flex items-center justify-center flex-shrink-0">
            <Sparkles size={16} className="text-signal" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-ink-primary">Motion Presets</h1>
            <p className="text-[12.5px] text-ink-muted mt-0.5">
              Curated animations &amp; transitions shown in the editor's picker — the math stays built-in, this controls which presets appear.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-studio-surface border border-studio-border rounded-lg p-0.5">
            {(["animation", "transition", "filter"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)}
                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold capitalize transition-colors ${
                  kind === k ? "bg-signal text-studio-void" : "text-ink-secondary hover:text-ink-primary"
                }`}>
                {k}s
              </button>
            ))}
          </div>
          <button
            onClick={handleImportDefaults}
            disabled={importing || missingDefaults.length === 0}
            title={missingDefaults.length === 0 ? "All built-in defaults are already here" : `Import ${missingDefaults.length} built-in ${kind} preset${missingDefaults.length === 1 ? "" : "s"}`}
            className="flex items-center gap-1.5 bg-studio-raised border border-studio-border hover:border-signal/50 text-ink-secondary hover:text-signal text-[13px] font-semibold px-3.5 py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icons.Download size={13} />
            {importing ? "Importing…" : missingDefaults.length > 0 ? `Import defaults (${missingDefaults.length})` : "Defaults imported"}
          </button>
          <button
            onClick={() => setEditing("new")}
            className="flex items-center gap-1.5 bg-signal hover:bg-signal-hover text-studio-void text-[13px] font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            <Plus size={14} /> Add {kind}
          </button>
        </div>
      </div>

      {listError && (
        <div className="text-[12.5px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2 mb-4">{listError}</div>
      )}

      {loading ? (
        <div className="text-ink-muted text-[13px] py-10 text-center">Loading…</div>
      ) : presets.length === 0 ? (
        <div className="border border-dashed border-studio-borderLight rounded-xl py-14 text-center">
          <p className="text-ink-secondary text-[13px]">No {kind} presets yet.</p>
          <p className="text-ink-faint text-[12px] mt-1">Click "Add {kind}" to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ordered.map((p) => {
            const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[p.preset_json.icon ?? "Sparkles"] ?? Icons.Sparkles;
            return (
              <div key={p.id} className="bg-studio-surface border border-studio-border rounded-xl p-4 flex items-start gap-3">
                {p.kind === "filter" ? (
                  <div className="w-10 h-10 rounded-lg flex-shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #FFB648, #8B5CFF)",
                      filter: `brightness(${p.preset_json.brightness ?? 1}) contrast(${p.preset_json.contrast ?? 1}) saturate(${p.preset_json.saturation ?? 1})`,
                    }} />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-signal/10 border border-signal/20 flex items-center justify-center flex-shrink-0 text-signal">
                    <Icon size={17} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[13px] font-semibold text-ink-primary truncate">{p.name}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 ${
                      p.is_active ? "bg-success/15 text-success" : "bg-studio-hover text-ink-faint"
                    }`}>
                      {p.is_active ? "Active" : "Hidden"}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-ink-faint font-mono truncate mb-2">
                    {p.kind === "filter"
                      ? `B${Math.round((p.preset_json.brightness ?? 1) * 100)} C${Math.round((p.preset_json.contrast ?? 1) * 100)} S${Math.round((p.preset_json.saturation ?? 1) * 100)} T${p.preset_json.temperature ?? 0}`
                      : p.preset_json.engineKey}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setEditing(p)}
                      className="flex-1 flex items-center justify-center gap-1 text-[11.5px] font-semibold py-1.5 rounded-lg border border-studio-border text-ink-secondary hover:border-signal hover:text-signal transition-colors">
                      <Pencil size={10} /> Edit
                    </button>
                    <button onClick={() => handleToggleActive(p)}
                      className="flex-1 flex items-center justify-center gap-1 text-[11.5px] font-semibold py-1.5 rounded-lg border border-studio-border text-ink-secondary hover:bg-studio-hover transition-colors">
                      {p.is_active ? <EyeOff size={10} /> : <Eye size={10} />}
                    </button>
                    <button onClick={() => handleDelete(p.id)}
                      className="text-[11.5px] font-semibold py-1.5 px-2 rounded-lg border border-danger/30 text-danger hover:bg-danger/10 transition-colors">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <MotionPresetEditorModal
          kind={kind}
          preset={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setPresets((prev) => {
              const exists = prev.some((p) => p.id === saved.id);
              return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev];
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function MotionPresetEditorModal({
  kind, preset, onClose, onSaved,
}: {
  kind: "animation" | "transition" | "filter";
  preset: AdminMotionPreset | null;
  onClose: () => void;
  onSaved: (p: AdminMotionPreset) => void;
}) {
  const [name, setName] = useState(preset?.name ?? "");
  const [engineKey, setEngineKey] = useState(preset?.preset_json.engineKey ?? (kind === "animation" ? ANIMATION_ENGINE_KEYS[0] : TRANSITION_ENGINE_KEYS[0]));
  const [description, setDescription] = useState(preset?.preset_json.description ?? "");
  const [icon, setIcon] = useState(preset?.preset_json.icon ?? "Sparkles");
  const [sortOrder, setSortOrder] = useState(preset?.sort_order ?? 0);
  const [brightness, setBrightness] = useState(preset?.preset_json.brightness ?? 1);
  const [contrast, setContrast] = useState(preset?.preset_json.contrast ?? 1);
  const [saturation, setSaturation] = useState(preset?.preset_json.saturation ?? 1);
  const [temperature, setTemperature] = useState(preset?.preset_json.temperature ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const engineKeys = kind === "animation" ? ANIMATION_ENGINE_KEYS : TRANSITION_ENGINE_KEYS;

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    try {
      const presetJson = kind === "filter"
        ? { brightness, contrast, saturation, temperature, description: description.trim() }
        : { engineKey, description: description.trim(), icon };
      const body = { name: name.trim(), sortOrder, presetJson };
      const data = preset
        ? await api(`/api/admin/motion-presets/${preset.id}`, { method: "PUT", body: JSON.stringify(body) })
        : await api("/api/admin/motion-presets", { method: "POST", body: JSON.stringify({ ...body, kind, isActive: true }) });
      onSaved(data.preset);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/65 backdrop-blur-md flex items-center justify-center px-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[440px] bg-studio-surface border border-studio-border rounded-2xl shadow-pop p-6 animate-rise-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-semibold text-ink-primary capitalize">
            {preset ? `Edit ${kind}` : `New ${kind}`}
          </h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-ink-muted hover:bg-studio-hover transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fade In"
              className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[13.5px] text-ink-primary placeholder:text-ink-faint outline-none focus:border-signal transition-colors" />
          </div>

          {kind !== "filter" ? (
            <>
              <div>
                <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Engine key</label>
                <select value={engineKey} onChange={(e) => setEngineKey(e.target.value)}
                  className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[13.5px] text-ink-primary outline-none focus:border-signal transition-colors">
                  {engineKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <p className="text-[10.5px] text-ink-faint mt-1.5">Which built-in {kind} math this preset points to.</p>
              </div>

              <div>
                <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Icon</label>
                <select value={icon} onChange={(e) => setIcon(e.target.value)}
                  className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[13.5px] text-ink-primary outline-none focus:border-signal transition-colors">
                  {MOTION_ICON_CHOICES.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Brightness ({brightness.toFixed(2)})</label>
                <input type="range" min={0} max={2} step={0.01} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full accent-signal" />
              </div>
              <div>
                <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Contrast ({contrast.toFixed(2)})</label>
                <input type="range" min={0} max={2} step={0.01} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full accent-signal" />
              </div>
              <div>
                <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Saturation ({saturation.toFixed(2)})</label>
                <input type="range" min={0} max={2} step={0.01} value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} className="w-full accent-signal" />
              </div>
              <div>
                <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Temperature ({temperature})</label>
                <input type="range" min={-100} max={100} step={1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="w-full accent-signal" />
              </div>
            </div>
          )}

          <div>
            <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short helper text"
              className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[13.5px] text-ink-primary placeholder:text-ink-faint outline-none focus:border-signal transition-colors" />
          </div>

          <div>
            <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">Sort order</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-28 bg-studio-void border border-studio-border rounded-lg px-3 py-2.5 text-[13.5px] text-ink-primary outline-none focus:border-signal transition-colors" />
          </div>

          {error && <div className="text-[12px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2">{error}</div>}

          <div className="flex items-center gap-2 mt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-signal hover:bg-signal-hover text-studio-void text-[13.5px] font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50">
              {saving ? "Saving…" : "Save preset"}
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-studio-border text-ink-secondary text-[13.5px] font-semibold hover:bg-studio-hover transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
