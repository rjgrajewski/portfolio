import { useEffect, useRef } from "react";
import { SECTIONS_IN_ORDER, type SectionId } from "../../content/sections";
import { toggleSection } from "../../content/activeSectionStore";
import { useActiveSection } from "../../hooks/useActiveSection";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { Container } from "../ui/Container";
import { SectionShell } from "./SectionShell";
import { SECTION_CONTENT } from "./sectionContent";
import { MobileSectionOverlay } from "./MobileSectionOverlay";

/**
 * The manual click-through — a complete, real alternative to the agent
 * (docs/ARCHITECTURE.md § Product shape), not a fallback afterthought.
 *
 * One reveal state, two presentations of it (docs/ROADMAP.md § Phase 3):
 *   - desktop (>= lg): the section expands in place, in this list.
 *   - mobile: this list stays a plain list of headers; the open section is
 *     rendered full-screen by `MobileSectionOverlay`.
 * Both read the same `activeSectionStore` that the agent's `reveal_section`
 * drives — the breakpoint only picks the presentation, it is not a second
 * source of truth, and there is no mobile-specific reveal code path.
 */
export function PortfolioSections() {
  const activeSectionId = useActiveSection();
  const isDesktop = useIsDesktop();
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLDivElement>>>({});

  // Desktop only: bring the just-opened section into view inside the content
  // zone's own scroll container, without moving the page or the agent zone
  // (docs/DECISIONS.md § Desktop two-zone layout). On mobile the full-screen
  // overlay is the "bring into view" — scrolling the list behind it would be
  // pointless and janky.
  useEffect(() => {
    if (!isDesktop || !activeSectionId) return;
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
  }, [activeSectionId, isDesktop]);

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
                isOpen={isDesktop && activeSectionId === section.id}
                onToggle={() => toggleSection(section.id)}
              >
                <Content />
              </SectionShell>
            </div>
          );
        })}
      </Container>

      <MobileSectionOverlay />
    </div>
  );
}
