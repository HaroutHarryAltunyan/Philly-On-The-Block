// Shared capability checks for the cinematic layer. Everything cinematic is an
// enhancement: ordering never waits on it, and these checks decide whether to
// load it at all.

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function saveData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(connection?.saveData) || /(^|-)2g$/.test(connection?.effectiveType ?? "");
}

export function isLowPower(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency ?? 8) <= 4
  );
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Runs `fn` once the page is idle (after first paint), never blocking input. */
export function whenIdle(fn: () => void): () => void {
  let cancelled = false;
  const run = () => !cancelled && fn();
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout: 1500 });
    return () => {
      cancelled = true;
      w.cancelIdleCallback?.(id);
    };
  }
  const id = window.setTimeout(run, 250);
  return () => {
    cancelled = true;
    window.clearTimeout(id);
  };
}
