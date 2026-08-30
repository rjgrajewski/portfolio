import { useSyncExternalStore } from "react";

/**
 * `true` at >= 1024px — the same breakpoint as Tailwind's `lg:`.
 *
 * The agent dock uses this to decide whether an expanded transcript
 * may cover the screen. (Section reveal is a modal on every breakpoint
 * now — this hook no longer forks that presentation.)
 */
const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

// Client-only SPA; if this ever runs without a window, assume desktop so the
// in-place reveal (which needs no overlay) is the safe default.
function getServerSnapshot(): boolean {
  return true;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
