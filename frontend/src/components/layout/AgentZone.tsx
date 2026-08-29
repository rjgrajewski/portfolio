import { Button } from "../ui/Button";
import { AgentPanel } from "../agent/AgentPanel";

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
 * the answer and the section it just opened at the same time).
 *
 * Phase 2: holds the real `AgentPanel` (text input, streamed transcript,
 * thinking state). At `lg:` the panel fills the zone's fixed-height grid
 * cell and scrolls its transcript internally; on mobile it's just the next
 * block in normal page flow, followed by the "browse manually" button.
 */
export function AgentZone() {
  return (
    <div className="layout-agent flex flex-col lg:border-l lg:border-neutral-900">
      <div className="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 lg:px-6">
        <AgentPanel />
      </div>

      <div className="px-4 pb-10 text-center sm:px-6 lg:hidden">
        <Button variant="secondary" onClick={scrollToPortfolio}>
          Browse manually ↓
        </Button>
      </div>
    </div>
  );
}
