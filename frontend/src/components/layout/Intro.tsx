import { Container } from "../ui/Container";

/**
 * Photo + name + blurb only — no agent teaser, no browse-manually button.
 * Those moved to AgentZone.tsx when the two-zone desktop layout split this
 * out of the old Hero.tsx. Big and centered on mobile (unchanged from
 * Phase 1); compact and inline on desktop, since here it sits in a fixed
 * grid row that has to leave most of the viewport height to the two
 * scrolling zones below it — see styles/index.css `.app-layout`.
 */
export function Intro() {
  return (
    <section className="layout-intro py-16 sm:py-24 lg:py-4">
      <Container className="flex flex-col items-center gap-4 text-center lg:max-w-none lg:flex-row lg:items-center lg:gap-4 lg:px-8 lg:text-left">
        <img
          src="/img/portrait.jpg"
          alt=""
          className="h-24 w-24 shrink-0 rounded-full border border-neutral-800 lg:h-10 lg:w-10"
        />
        <div>
          <h1 className="text-display text-neutral-50 lg:text-h3">
            Rafal Grajewski
          </h1>
          <p className="mt-3 text-h3 font-normal text-neutral-400 lg:mt-0.5 lg:text-small">
            Placeholder blurb — real copy lands in Phase 9. In short: builds
            AI-native products end to end, from Bedrock-backed agents to the
            infrastructure underneath them.
          </p>
        </div>
      </Container>
    </section>
  );
}
