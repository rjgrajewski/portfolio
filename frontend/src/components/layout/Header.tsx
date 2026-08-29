import { Container } from "../ui/Container";
import { LinkButton } from "../ui/LinkButton";

/** Sticky so the CV download stays reachable ("realny, widoczny") at any
 * scroll position, not just on first paint. */
export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur">
      <Container className="flex items-center justify-between py-4">
        <span className="text-small font-medium tracking-wide text-neutral-300">
          Rafal Grajewski
        </span>
        <LinkButton href="/cv/cv.pdf" download variant="secondary">
          Download CV
        </LinkButton>
      </Container>
    </header>
  );
}
