"use client";

/**
 * RecentProjectsPanel — the in-editor equivalent of StartupScreen's Recent
 * tab. Added because once a project auto-resumes from the URL on refresh
 * (see ClipFlowApp.tsx), there's no path back to a "pick a different
 * project" screen from inside the editor at all — this closes that gap
 * without needing a literal "go home" button.
 *
 * Switching projects forces a full page navigation (not client-side state
 * swapping) — the editor's whole state tree is built around hydrating once
 * per mount (see EditorWithSetup in ClipFlowApp.tsx), so the simplest
 * correct way to move to a different project is a fresh load of it,
 * exactly like opening a bookmarked link.
 */
import { useEffect, useState, MouseEvent } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { useAuth } from "../../context/useAuthContext";
import { deleteBgRemovedForProject } from "../../utils/bgRemovedStore";
import { Clock, Trash2, RefreshCw, FolderOpen, LogIn } from "@/utils/icons";

interface RecentProject {
  id: string;
  name: string;
  aspect_ratio: string;
  updated_at: string;
  thumbnail_url?: string | null;
}

export default function RecentProjectsPanel() {
  const { resumedProjectId } = useAppDetailsContext();
  const { user, promptLogin } = useAuth();
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetch("/api/projects")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load your projects.");
        if (!cancelled) setProjects(data.projects ?? []);
      })
      .catch((err) => { if (!cancelled) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const switchToProject = (id: string) => {
    if (id === resumedProjectId) return; // already open
    // Full navigation on purpose — see the file-level comment above.
    window.location.href = `/?project=${id}`;
  };

  const deleteProject = async (e: MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this project? This can't be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not delete that project.");
      }
      void deleteBgRemovedForProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      // Deleted the project we're currently sitting in — nothing left to
      // show here, so go back to a clean start instead of a dead editor.
      if (id === resumedProjectId) window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-studio-surface">
      <div className="px-3 py-3 border-b border-studio-border flex-shrink-0">
        <div className="text-[13px] font-bold text-ink-primary flex items-center gap-1.5">
          <Clock size={13} className="text-signal" /> Recent Projects
        </div>
        <div className="text-[10.5px] text-ink-secondary mt-0.5">
          Switch to another project, or delete one
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2 flex flex-col gap-1.5">
        {!user ? (
          <div className="flex flex-col items-center gap-2.5 text-center py-8 px-3">
            <div className="w-10 h-10 rounded-full bg-studio-hover flex items-center justify-center text-ink-faint">
              <LogIn size={16} />
            </div>
            <p className="text-[11.5px] text-ink-secondary">Sign in to save projects and see them here.</p>
            <button
              onClick={() => promptLogin()}
              className="text-[11.5px] font-bold text-signal hover:underline"
            >
              Sign in
            </button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-10 text-ink-faint">
            <RefreshCw size={16} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="text-[11px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-2.5 py-2 m-1">
            {error}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-[11.5px] text-ink-faint italic text-center py-8 px-3">
            No other saved projects yet.
          </div>
        ) : (
          projects.map((p) => {
            const isCurrent = p.id === resumedProjectId;
            return (
              <button
                key={p.id}
                onClick={() => switchToProject(p.id)}
                disabled={isCurrent}
                className={`group flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors ${
                  isCurrent ? "bg-signal/10 cursor-default" : "hover:bg-studio-hover cursor-pointer"
                }`}
              >
                <div className="w-10 h-10 rounded-md bg-studio-void border border-studio-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {p.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <FolderOpen size={15} className="text-ink-faint" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] font-semibold truncate ${isCurrent ? "text-signal" : "text-ink-primary"}`}>
                    {p.name || "Untitled project"} {isCurrent && <span className="text-[9.5px] font-bold text-signal/70">(current)</span>}
                  </div>
                  <div className="text-[10px] text-ink-faint">
                    {p.aspect_ratio} · {new Date(p.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteProject(e, p.id)}
                  disabled={deletingId === p.id}
                  title="Delete project"
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-ink-faint hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-60"
                >
                  {deletingId === p.id ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
