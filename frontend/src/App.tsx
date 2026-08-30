import { Header } from "./components/layout/Header";
import { Intro } from "./components/layout/Intro";
import { PortfolioSections } from "./components/portfolio/PortfolioSections";
import { Footer } from "./components/layout/Footer";
import { AgentOverlay } from "./components/agent/AgentOverlay";

/**
 * Single-column portfolio (docs/ARCHITECTURE.md § Product shape, rewritten).
 * The whole screen belongs to the portfolio; the agent is present through
 * `AgentOverlay` — a fixed visualization + a hidden transcript + the AI-mode
 * frame — not through a docked chat column. Section reveal is unchanged: it
 * runs through `revealSection` / `activeSectionStore`, one code path,
 * desktop accordion or mobile takeover.
 */
export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <Intro />
      <PortfolioSections />
      <Footer />
      <AgentOverlay />
    </div>
  );
}
