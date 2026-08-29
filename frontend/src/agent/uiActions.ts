/**
 * Maps the agent's `action` frames onto the frontend's ONE reveal code path
 * (docs/ARCHITECTURE.md § Agentic UI pattern — "one code path for 'show
 * section X', whether the trigger is a click or the agent").
 *
 * This file does NOT re-implement reveal logic — it validates the payload
 * and calls `revealSection` from content/activeSectionStore.ts, the same
 * function the manual click-through uses (via `toggleSection`).
 */

import { SECTIONS, type SectionId } from "../content/sections";
import { revealSection } from "../content/activeSectionStore";
import type { ServerFrame } from "./transport";

const KNOWN_SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));

/**
 * Act on one stream frame. Everything past `type` is untrusted (it crossed
 * a network boundary), so it is all re-validated here. Returns the section
 * it revealed, or null when the frame is not a valid `reveal_section`
 * action — in which case it is silently ignored, per the stream contract's
 * "ignore unknown" rule.
 */
export function applyAgentAction(frame: ServerFrame): SectionId | null {
  if (frame.type !== "action") return null;
  if ((frame as { name?: unknown }).name !== "reveal_section") return null;

  const args = (frame as { args?: unknown }).args;
  const sectionId =
    args && typeof args === "object"
      ? (args as { sectionId?: unknown }).sectionId
      : undefined;

  if (typeof sectionId !== "string" || !KNOWN_SECTION_IDS.has(sectionId)) {
    return null;
  }

  revealSection(sectionId as SectionId);
  return sectionId as SectionId;
}
