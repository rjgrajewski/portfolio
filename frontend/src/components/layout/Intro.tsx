import { Container } from "../ui/Container";
import { ChipRow } from "../portfolio/viz";

/**
 * Photo + name + positioning. Centred landing hero — the page is the
 * portfolio (no two-zone split). Copy is aimed at HR-transformation /
 * AI-solutions readers: People Ops first, agents second.
 */
export function Intro() {
  return (
    <section className="py-16 sm:py-24">
      <Container className="flex flex-col items-center gap-4 text-center">
        <img
          src="/img/portrait.jpg"
          alt="Rafal Grajewski"
          className="h-24 w-24 shrink-0 rounded-full border border-neutral-800"
        />
        <div>
          <h1 className="text-display text-neutral-50">Rafal Grajewski</h1>
          <p className="mt-2 text-small font-medium tracking-wide text-neutral-500">
            People Operations · AI-enabled workflows
          </p>
          <p className="mx-auto mt-3 max-w-xl text-h3 font-normal text-neutral-400">
            Turns HR and workforce problems into working AI solutions.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-body text-neutral-500">
            Seven years inside Amazon People Operations — employee services,
            workforce staffing, Europe-wide talent acquisition. Now he builds
            the agents and data workflows those teams actually run on.
          </p>
          <ChipRow
            items={[
              "People Operations",
              "Talent Acquisition",
              "Agentic AI",
              "SQL",
            ]}
            className="mt-4 justify-center"
          />
          <p className="mt-4 text-small text-neutral-500">
            Ask the amber orb about his work, or browse the sections below.
          </p>
        </div>
      </Container>
    </section>
  );
}
