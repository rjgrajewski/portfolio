import { LinkButton } from "../ui/LinkButton";

/**
 * Sticky so the CV download stays reachable ("realny, widoczny") at any
 * scroll position on mobile. On desktop it sits in the grid's fixed
 * `header` row (see styles/index.css `.app-layout`) above the two zones,
 * so `sticky` has nothing to stick against there — harmless, just inert.
 *
 * Full-width bar rather than the constrained reading-width `Container`
 * used elsewhere: at `lg:` it sits above a full-bleed two-column split, so
 * a narrow centered header would float oddly above content that spans
 * edge to edge.
 */
export function Header() {
  return (
    <header className="layout-header sticky top-0 z-10 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <span className="text-small font-medium tracking-wide text-neutral-300">
          Rafal Grajewski
        </span>
        <LinkButton href="/cv/cv.pdf" download variant="secondary">
          Download CV
        </LinkButton>
      </div>
    </header>
  );
}
