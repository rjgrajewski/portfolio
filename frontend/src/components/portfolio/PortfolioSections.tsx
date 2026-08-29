import { useEffect, useRef, type ComponentType } from "react";
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
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLDivElement>>>({});

  // Whatever opens a section — a click here today, `reveal_section` from
  // the agent in Phase 3 — should land in view inside this zone's own
  // scroll container, without moving the page (docs/ROADMAP.md § Phase 3:
  // reveal and the spoken answer must land together, so this has to be
  // quick). `scrollIntoView` naturally scrolls only the nearest scrollable
  // ancestor: the content zone at `lg:` (see styles/index.css
  // `.app-layout`), or the whole page below that breakpoint, where there
  // is no bounded zone to speak of.
  useEffect(() => {
    if (!activeSectionId) return;
    const target = sectionRefs.current[activeSectionId];
    if (!target) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeSectionId]);

  return (
    <div id="portfolio" className="py-8">
      <Container>
        {SECTIONS_IN_ORDER.map((section) => {
          const Content = SECTION_CONTENT[section.id];
          return (
            <div
              key={section.id}
              ref={(el) => {
                sectionRefs.current[section.id] = el ?? undefined;
              }}
            >
              <SectionShell
                id={section.id}
                title={section.title}
                isOpen={activeSectionId === section.id}
                onToggle={() => toggleSection(section.id)}
              >
                <Content />
              </SectionShell>
            </div>
          );
        })}
      </Container>
    </div>
  );
}
