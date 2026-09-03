"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../../context/useAuthContext";
import { LogOut, FolderOpen, CalendarDays, History } from "@/utils/icons";

/**
 * ProfileMenu — the header account control. Replaces the bare avatar + inline
 * "Sign out" link with a click-to-open card: name, email, saved-project
 * count (n / limit), member-since date, and sign out.
 *
 * The panel is `position: fixed` (anchored to the avatar's rect) so it isn't
 * clipped by the header's `overflow: hidden`.
 */
export default function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<{ count: number; limit: number } | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
  }, [open]);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Fetch the project count the first time the menu is opened.
  useEffect(() => {
    if (!open || projects || loadingProjects || !user) return;
    setLoadingProjects(true);
    fetch("/api/projects")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setProjects({ count: (d.projects ?? []).length, limit: d.limit ?? 0 }))
      .catch(() => setProjects(null))
      .finally(() => setLoadingProjects(false));
  }, [open, projects, loadingProjects, user]);

  if (!user) return null;

  const name = user.displayName || user.email.split("@")[0];
  const initial = (user.displayName || user.email)[0]?.toUpperCase() ?? "?";
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.email}
        className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors cursor-pointer flex-shrink-0
          ${open
            ? "bg-signal text-white ring-2 ring-signal/40"
            : "bg-signal/15 border border-signal/30 text-signal hover:bg-signal/25"}`}
      >
        {initial}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="w-64 rounded-xl border border-studio-border bg-studio-raised shadow-pop overflow-hidden z-[120] animate-fade-in"
        >
          {/* Identity */}
          <div className="flex items-center gap-2.5 p-3.5 border-b border-studio-border">
            <div className="w-9 h-9 rounded-full bg-signal/15 border border-signal/30 text-signal flex items-center justify-center text-[13px] font-bold flex-shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-ink-primary truncate">{name}</div>
              <div className="text-[11px] text-ink-muted truncate">{user.email}</div>
            </div>
          </div>

          {/* Stats */}
          <div className="p-2 border-b border-studio-border flex flex-col">
            <div className="flex items-center gap-2.5 px-2 py-1.5 text-[12px]">
              <FolderOpen size={13} className="text-ink-faint flex-shrink-0" />
              <span className="text-ink-secondary flex-1">Projects</span>
              <span className="font-semibold text-ink-primary tabular-nums">
                {loadingProjects || !projects
                  ? "…"
                  : projects.limit
                    ? `${projects.count} / ${projects.limit}`
                    : projects.count}
              </span>
            </div>
            {memberSince && (
              <div className="flex items-center gap-2.5 px-2 py-1.5 text-[12px]">
                <CalendarDays size={13} className="text-ink-faint flex-shrink-0" />
                <span className="text-ink-secondary flex-1">Member since</span>
                <span className="font-semibold text-ink-primary">{memberSince}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <button
            onClick={() => {
              setOpen(false);
              // Opens the Recent-projects panel on the left (same window
              // event the inspector's Change rows use).
              window.dispatchEvent(new CustomEvent("clipflow:open-catalog", { detail: "recent" }));
            }}
            role="menuitem"
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] font-semibold text-ink-secondary hover:bg-studio-hover hover:text-ink-primary transition-colors cursor-pointer border-b border-studio-border"
          >
            <History size={13} />
            Recent projects
          </button>
          <button
            onClick={() => { setOpen(false); logout(); }}
            role="menuitem"
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] font-semibold text-ink-secondary hover:bg-studio-hover hover:text-danger transition-colors cursor-pointer"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      )}
    </>
  );
}
