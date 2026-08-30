import { useSyncExternalStore } from "react";

/**
 * `true` at >= 1024px — the same breakpoint as Tailwind's `lg:`.
 *
 * The mobile section reveal is a full-screen takeover (a separately-rendered
 * overlay), the desktop one is an in-place accordion — different component
 * trees, chosen from the same `activeSectionStore` state, not a second
 * source of truth. The agent dock also uses it to decide whether an
 * expanded transcript may cover the screen.
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
