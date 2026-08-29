import { Header } from "./components/layout/Header";
import { Intro } from "./components/layout/Intro";
import { AgentZone } from "./components/layout/AgentZone";
import { ContentZone } from "./components/layout/ContentZone";

// Two-zone desktop layout (docs/ARCHITECTURE.md § Product shape / §
// Frontend), mobile unchanged from Phase 1. The `.app-layout` grid in
// styles/index.css does the actual layout switch at 1024px — this file
// only decides DOM order, which is deliberately the mobile stacking
// order (Header, Intro, AgentZone, ContentZone). At `lg:`,
// grid-template-areas repositions AgentZone to the right and ContentZone
// to the left without touching this order — see DECISIONS.md for why.
export default function App() {
  return (
    <div className="app-layout min-h-screen lg:min-h-0">
      <Header />
      <Intro />
      <AgentZone />
      <ContentZone />
    </div>
  );
}
