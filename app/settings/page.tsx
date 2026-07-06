"use client";

import { useEffect, useState, FormEvent } from "react";

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
  "videoSlots": [{ "label": "Main clip", "durationSecs": 10 }],
  "texts": [
    { "text": "YOUR TITLE HERE", "xFrac": 0.1, "yFrac": 0.35, "wFrac": 0.8, "hFrac": 0.15, "fontSize": 100, "isBold": true, "textColor": "white", "animation": "fadeIn" }
  ],
  "blurs": []
}`;

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
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminTemplate | "new" | null>(null);

  // A GET against an admin-gated route with no credentials tells us
  // whether we already have a valid admin cookie from a previous visit.
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

  if (checkingAuth) {
    return (
      <div className="min-h-[100dvh] bg-studio-void flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-studio-border border-t-signal animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-[100dvh] bg-studio-void flex items-center justify-center px-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-[340px] bg-studio-surface border border-studio-border rounded-2xl shadow-panel p-7"
        >
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

  return (
    <div className="min-h-[100dvh] bg-studio-void">
      <div className="max-w-[1000px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-xl font-bold text-ink-primary">Template Manager</h1>
            <p className="text-[12.5px] text-ink-muted mt-0.5">
              {templates.length} template{templates.length !== 1 ? "s" : ""} · changes appear in the app's Templates tab immediately
            </p>
          </div>
          <button
            onClick={() => setEditing("new")}
            className="bg-signal hover:bg-signal-hover text-studio-void text-[13px] font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            + Add template
          </button>
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
            <p className="text-ink-faint text-[12px] mt-1">Click "Add template" to create your first one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <div
                key={t.id}
                className="bg-studio-surface border border-studio-border rounded-xl overflow-hidden hover:border-signal/40 transition-colors"
              >
                <div className="aspect-video bg-studio-raised flex items-center justify-center overflow-hidden">
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
                      className="flex-1 text-[12px] font-semibold py-1.5 rounded-lg border border-studio-border text-ink-secondary hover:border-signal hover:text-signal transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(t)}
                      className="flex-1 text-[12px] font-semibold py-1.5 rounded-lg border border-studio-border text-ink-secondary hover:bg-studio-hover transition-colors"
                    >
                      {t.is_active ? "Hide" : "Show"}
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-[12px] font-semibold py-1.5 px-2.5 rounded-lg border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
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

  const cloudinaryConfigured =
    !!process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && !!process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  // Uploads the selected file straight from the browser to Cloudinary's
  // unsigned upload endpoint — no server round-trip, no API secret ever
  // touches the client. Cloudinary returns a permanent secure_url, which
  // is what actually gets saved to Neon (via the normal Save button below),
  // not the raw file itself.
  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);

    if (!cloudinaryConfigured) {
      setUploadError(
        "Cloudinary isn't configured — set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env.local."
      );
      return;
    }
    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      return;
    }

    setUploading(true);
    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset as string);
      formData.append("folder", "clipflow/templates");

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Cloudinary upload failed.");
      }
      if (!data.secure_url) {
        throw new Error("Cloudinary didn't return an image URL.");
      }

      setCoverImage(data.secure_url as string);
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
      className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[560px] max-h-[88vh] overflow-y-auto scrollbar-thin bg-studio-surface border border-studio-border rounded-2xl shadow-panel p-6">
        <h2 className="font-display text-lg font-semibold text-ink-primary mb-5">
          {template ? "Edit template" : "New template"}
        </h2>

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

            {!cloudinaryConfigured && (
              <div className="text-[11px] text-warning bg-warning/10 border border-warning/25 rounded-lg px-3 py-2 mb-2">
                Cloudinary isn't configured yet — add NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and
                NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET to .env.local to enable uploads. You can
                still paste a direct image URL below in the meantime.
              </div>
            )}

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
              {uploading ? "Uploading…" : "Click to upload an image"}
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
          </div>

          <div>
            <label className="text-[11.5px] font-semibold text-ink-secondary block mb-1.5">
              Template config (JSON)
            </label>
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
