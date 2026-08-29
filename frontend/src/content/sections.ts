/**
 * Section registry — id, title, order. Shared by the manual click-through
 * (frontend/src/components/portfolio/) and, from Phase 3 on, the agent's
 * `reveal_section` tool (frontend/src/agent/uiActions.ts, not yet built).
 * See docs/ARCHITECTURE.md § Agentic UI pattern.
 */

export type SectionId =
  | "education"
  | "amazon"
  | "flowjob"
  | "rhymind"
  | "portfolio-itself";

export interface SectionMeta {
  readonly id: SectionId;
  readonly title: string;
  readonly order: number;
}

export const SECTIONS: readonly SectionMeta[] = [
  { id: "education", title: "Education", order: 0 },
  { id: "amazon", title: "Amazon", order: 1 },
  { id: "flowjob", title: "FlowJob", order: 2 },
  { id: "rhymind", title: "Rhymind", order: 3 },
  { id: "portfolio-itself", title: "This Portfolio", order: 4 },
];

export const SECTIONS_IN_ORDER: readonly SectionMeta[] = [...SECTIONS].sort(
  (a, b) => a.order - b.order,
);
