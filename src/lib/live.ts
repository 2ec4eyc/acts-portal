// Replacement for Firestore's onSnapshot: runs a fetch now, then every `intervalMs` while the tab
// is visible, when the tab regains focus, and right after any save (refreshAll). Like onSnapshot,
// it only calls onData when the data actually changed, so pages don't re-render (or reset forms)
// on every refresh. Returns an unsubscribe function, so pages keep their `useEffect` shape.

const active = new Set<() => void>();

export function live<T>(
  fetcher: () => Promise<T>,
  onData: (data: T) => void,
  onError?: (error: unknown) => void,
  intervalMs = 30_000,
): () => void {
  let stopped = false;
  let running = false;
  let queued = false;
  let last: string | undefined;
  const run = async () => {
    if (stopped) return;
    if (running) { queued = true; return; }
    running = true;
    try {
      const data = await fetcher();
      const json = JSON.stringify(data);
      if (!stopped && json !== last) {
        last = json;
        onData(data);
      }
    } catch (error) {
      if (!stopped) (onError ?? console.error)(error);
    } finally {
      running = false;
      if (queued && !stopped) { queued = false; void run(); }
    }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') void run(); };
  const timer = setInterval(() => { if (document.visibilityState === 'visible') void run(); }, intervalMs);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  active.add(run);
  void run();
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    active.delete(run);
  };
}

/** Re-runs every active live query now (call after a save). */
export function refreshAll() {
  active.forEach((run) => void run());
}
