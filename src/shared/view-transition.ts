// A native snapshot must not hold navigation until the browser's multi-second timeout.
// skipTransition still runs the update callback (CSS View Transitions Level 1, section 1.4).
const active = new WeakMap<Document, object>();

// mutate is synchronous so the new snapshot captures the completed DOM.
// .vt-local scopes the animation to the analyzer views (shared/motion.css).
export function withViewTransition(mutate: () => void): void {
  const d = document;
  if (window.matchMedia?.('(prefers-reduced-motion:reduce)').matches ||
      typeof d.startViewTransition !== 'function') {
    mutate();
    return;
  }
  const owner = {};
  active.set(d, owner);
  const root = d.documentElement;
  root.classList.add('vt-local');
  const cleanup = () => {
    if (active.get(d) !== owner) return;
    active.delete(d);
    root.classList.remove('vt-local');
  };
  let updated = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    if (updated) return;
    updated = true;
    clearTimeout(timeout);
    mutate();
  };
  try {
    const transition = d.startViewTransition(update);
    if (!updated) timeout = setTimeout(() => transition.skipTransition(), 500);
    void transition.ready.catch(() => {});
    void transition.finished.catch(() => {}).finally(() => {
      clearTimeout(timeout);
      cleanup();
    });
  } catch {
    clearTimeout(timeout);
    cleanup();
    update();
  }
}
