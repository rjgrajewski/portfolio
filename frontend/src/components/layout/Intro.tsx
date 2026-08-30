import { Container } from "../ui/Container";

/**
 * Photo + name + blurb. The whole page is the portfolio now (no two-zone
 * split), so this is a plain centred hero again — the compact desktop strip
 * it briefly became for the docked chat layout is gone.
 */
export function Intro() {
  return (
    <section className="py-16 sm:py-24">
      <Container className="flex flex-col items-center gap-4 text-center">
        <img
          src="/img/portrait.jpg"
          alt=""
          className="h-24 w-24 shrink-0 rounded-full border border-neutral-800"
        />
        <div>
          <h1 className="text-display text-neutral-50">Rafal Grajewski</h1>
          <p className="mt-3 text-h3 font-normal text-neutral-400">
            Placeholder blurb — real copy lands in Phase 9. In short: builds
            AI-native products end to end, from Bedrock-backed agents to the
            infrastructure underneath them.
          </p>
          <p className="mt-4 text-small text-neutral-500">
            Ask about his work out loud — tap the amber form at the bottom of
            the screen. Or browse the sections below.
          </p>
        </div>
      </Container>
    </section>
  );
}
