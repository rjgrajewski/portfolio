import { Container } from "../ui/Container";
import { Button } from "../ui/Button";
import { AgentEntryTeaser } from "./AgentEntryTeaser";

/** No href/hash anywhere in this component on purpose — "browse manually"
 * scrolls via scrollIntoView, not a URL fragment, so the URL never changes
 * even in the most literal sense (docs/ARCHITECTURE.md § Product shape:
 * "no route changes"). */
function scrollToPortfolio() {
  document
    .getElementById("portfolio")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Hero() {
  return (
    <section className="py-16 sm:py-24">
      <Container className="flex flex-col items-center gap-8 text-center">
        <img
          src="/img/portrait-placeholder.svg"
          alt=""
          className="h-24 w-24 rounded-full border border-neutral-800"
        />

        <div>
          <h1 className="text-display text-neutral-50">Rafal Grajewski</h1>
          <p className="mt-3 text-h3 font-normal text-neutral-400">
            Placeholder blurb — real copy lands in Phase 9. In short: builds
            AI-native products end to end, from Bedrock-backed agents to the
            infrastructure underneath them.
          </p>
        </div>

        <AgentEntryTeaser />

        <Button variant="secondary" onClick={scrollToPortfolio}>
          Browse manually ↓
        </Button>
      </Container>
    </section>
  );
}
