/**
 * The ONE state transition for "show section X" — docs/ARCHITECTURE.md
 * § Agentic UI pattern: "There is one code path for 'show section X',
 * whether the trigger is a click or the agent."
 *
 * Deliberately a plain module-level store, not React Context: `revealSection`
 * has to be callable from ordinary code that isn't inside the React tree —
 * in Phase 3 that's `frontend/src/agent/uiActions.ts` handling the model's
 * `reveal_section` tool call, which has no component to read context from.
 * A vanilla store (subscribe/notify + `useSyncExternalStore` on the read
 * side) works identically from a click handler or a tool-call handler; a
 * Context provider would only work from inside a mounted component.
 *
 * No router, no URL, no unmount involved anywhere here — this only ever
 * flips one in-memory value and notifies subscribers, which is what keeps
 * "no route changes, state survives every reveal" (docs/ARCHITECTURE.md
 * § Product shape) true by construction rather than by discipline.
 */

import type { SectionId } from "./sections";

type Listener = () => void;

let activeSectionId: SectionId | null = null;
const listeners = new Set<Listener>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

/**
 * Open a section. Idempotent if it's already open. This is the exact
 * function Phase 3's `reveal_section(sectionId)` tool handler will call —
 * always opens, never closes, so the agent can't accidentally collapse the
 * section it's actively talking about.
 */
export function revealSection(sectionId: SectionId): void {
  if (activeSectionId === sectionId) return;
  activeSectionId = sectionId;
  emitChange();
}

export function closeActiveSection(): void {
  if (activeSectionId === null) return;
  activeSectionId = null;
  emitChange();
}

/**
 * Click affordance built on top of `revealSection`/`closeActiveSection`:
 * clicking an already-open section collapses it (standard accordion UX),
 * clicking a different one opens it. The agent doesn't use this — it always
 * wants the section open, never toggled shut — so it calls `revealSection`
 * directly instead.
 */
export function toggleSection(sectionId: SectionId): void {
  if (activeSectionId === sectionId) {
    closeActiveSection();
  } else {
    revealSection(sectionId);
  }
}

export function getActiveSection(): SectionId | null {
  return activeSectionId;
}

export function subscribeActiveSection(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
