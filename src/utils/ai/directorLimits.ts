// One user request, including tool inspection and correction, shares this budget.
export const DIRECTOR_TIMEOUT_MS = 180_000;
export const DIRECTOR_REPAIR_WINDOW_MS = 60_000;
export const DIRECTOR_MAX_CALLS = 2;
export const DIRECTOR_TIMEOUT_MESSAGE = "The assistant reached the 3-minute limit. Your scene was not changed. Try fewer edits or a faster local model.";

/** Settle cancellation even if a transport fails to reject its pending read. */
export function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stopped = () => reject(signal.reason ?? new DOMException("Stopped", "AbortError"));
    signal.addEventListener("abort", stopped, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", stopped));
    if (signal.aborted) stopped();
  });
}
