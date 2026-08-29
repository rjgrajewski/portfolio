import { Header } from "./components/layout/Header";
import { Hero } from "./components/layout/Hero";
import { Footer } from "./components/layout/Footer";
import { PortfolioSections } from "./components/portfolio/PortfolioSections";

// Phase 1 (docs/ROADMAP.md § Phase 1): the manual portfolio + CV download —
// a complete, real alternative for recruiters who never touch the AI.
// The agent panel (Phase 2/4) lands inside the AgentEntryTeaser's slot in
// Hero.tsx; nothing here changes shape when that happens.
export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <PortfolioSections />
      </main>
      <Footer />
    </div>
  );
}
