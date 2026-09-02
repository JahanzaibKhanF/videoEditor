/**
 * startNewProject — leave the current editor and go back to the create /
 * project-picker screen (StartupScreen). A full navigation to "/" with no
 * ?project= param is the intended way to reset the editor's hydrate-once
 * state tree (see RecentProjectsPanel's file comment).
 *
 * `hasUnsavedWork` gates a confirm so an accidental click doesn't drop an
 * in-progress project. Signed-in projects autosave (and save again on
 * `beforeunload`), so callers pass false once a save is known good.
 */
export function startNewProject(hasUnsavedWork: boolean) {
  if (hasUnsavedWork) {
    const ok = window.confirm(
      "Start a new project? If this one has changes that haven't saved yet, they'll be lost."
    );
    if (!ok) return;
  }
  window.location.href = "/";
}
