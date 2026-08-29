import { useSyncExternalStore } from "react";
import type { SectionId } from "../content/sections";
import {
  getActiveSection,
  subscribeActiveSection,
} from "../content/activeSectionStore";

/** Reactive read of the currently revealed section (or null). */
export function useActiveSection(): SectionId | null {
  return useSyncExternalStore(subscribeActiveSection, getActiveSection);
}
