import { useSyncExternalStore } from "react";

/**
 * Reactive `prefers-reduced-motion: reduce`. The agent visualization uses
 * it to switch from animated states to statically-distinguishable ones
 * (docs/DECISIONS.md) rather than just slowing the animation down.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
