import { SECTIONS_IN_ORDER } from "../../content/sections";
import { toggleSection } from "../../content/activeSectionStore";
import { useActiveSection } from "../../hooks/useActiveSection";
import { Container } from "../ui/Container";
import { SectionShell } from "./SectionShell";
import { SectionModal } from "./SectionModal";

/**
 * The manual click-through — a complete, real alternative to the agent
 * (docs/ARCHITECTURE.md § Product shape), not a fallback afterthought.
 *
 * One reveal state (`activeSectionStore`), one presentation: a modal card
 * over the hero (`SectionModal`). The list here is headers only. A tap and
 * the agent's `reveal_section` write the same store.
 */
export function PortfolioSections() {
  const activeSectionId = useActiveSection();

  return (
    <div id="portfolio" className="py-8">
      <Container>
        {SECTIONS_IN_ORDER.map((section) => (
          <SectionShell
            key={section.id}
            id={section.id}
            title={section.title}
            isOpen={activeSectionId === section.id}
            onToggle={() => toggleSection(section.id)}
          />
        ))}
      </Container>

      <SectionModal />
    </div>
  );
}
