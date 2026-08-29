import { Button } from "../ui/Button";
import { AgentEntryTeaser } from "./AgentEntryTeaser";

/** No href/hash anywhere in this component on purpose — "browse manually"
 * scrolls via scrollIntoView, not a URL fragment, so the URL never changes
 * even in the most literal sense (docs/ARCHITECTURE.md § Product shape:
 * "no route changes"). Desktop-only irrelevant: both zones are already
 * visible side by side there, so the button is `lg:hidden`. */
function scrollToPortfolio() {
  document
    .getElementById("portfolio")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * The agent's fixed zone (docs/ARCHITECTURE.md § Agentic UI pattern —
 * this is what makes "reveal and answer land simultaneously" possible at
 * all: without a permanently visible agent zone, the user can't see both
 * the answer and the section it just opened at the same time). Holds
 * `AgentEntryTeaser` as a placeholder for now; Phase 2 replaces/extends
 * this with the real transcript + input.
 *
 * Structure is deliberately flex-col with the teaser sitting in a
 * flex-1/overflow-y-auto region at `lg:` — that's the part designed to
 * accept a growing, scrollable transcript later without restructuring
 * this wrapper: Phase 2 only has to change what's *inside* the scrollable
 * region (and add a docked input below it), not this container.
 */
export function AgentZone() {
  return (
    <div className="layout-agent flex flex-col lg:border-l lg:border-neutral-900">
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <div className="px-4 py-6 sm:px-6 lg:px-6 lg:py-6">
          <AgentEntryTeaser />
        </div>
      </div>

      <div className="px-4 pb-10 text-center sm:px-6 lg:hidden">
        <Button variant="secondary" onClick={scrollToPortfolio}>
          Browse manually ↓
        </Button>
      </div>
    </div>
  );
}
