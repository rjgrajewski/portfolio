import { PortfolioSections } from "../portfolio/PortfolioSections";
import { Footer } from "./Footer";

/**
 * The portfolio content zone — section list + whichever section is
 * currently open, plus the footer. Scrolls independently of the agent
 * zone at `lg:` (see styles/index.css `.app-layout`); on mobile it's just
 * the next block in normal page flow, same as Phase 1.
 *
 * No reveal logic lives here — `PortfolioSections` still owns that via
 * `content/activeSectionStore.ts`, unchanged. This wrapper only adds the
 * scroll container.
 */
export function ContentZone() {
  return (
    <div className="layout-content">
      <PortfolioSections />
      <Footer />
    </div>
  );
}
