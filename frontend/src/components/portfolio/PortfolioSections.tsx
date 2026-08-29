import type { ComponentType } from "react";
import { SECTIONS_IN_ORDER, type SectionId } from "../../content/sections";
import { toggleSection } from "../../content/activeSectionStore";
import { useActiveSection } from "../../hooks/useActiveSection";
import { Container } from "../ui/Container";
import { SectionShell } from "./SectionShell";
import { Education } from "./sections/Education";
import { Amazon } from "./sections/Amazon";
import { FlowJob } from "./sections/FlowJob";
import { Rhymind } from "./sections/Rhymind";
import { PortfolioItself } from "./sections/PortfolioItself";

const SECTION_CONTENT: Record<SectionId, ComponentType> = {
  education: Education,
  amazon: Amazon,
  flowjob: FlowJob,
  rhymind: Rhymind,
  "portfolio-itself": PortfolioItself,
};

/**
 * The manual click-through — a complete, real alternative to the agent
 * (docs/ARCHITECTURE.md § Product shape), not a fallback afterthought.
 * Every section here goes through the same `activeSectionStore` that
 * Phase 3's agent will drive via `reveal_section` — no parallel state.
 */
export function PortfolioSections() {
  const activeSectionId = useActiveSection();

  return (
    <div id="portfolio" className="py-8">
      <Container>
        {SECTIONS_IN_ORDER.map((section) => {
          const Content = SECTION_CONTENT[section.id];
          return (
            <SectionShell
              key={section.id}
              id={section.id}
              title={section.title}
              isOpen={activeSectionId === section.id}
              onToggle={() => toggleSection(section.id)}
            >
              <Content />
            </SectionShell>
          );
        })}
      </Container>
    </div>
  );
}
