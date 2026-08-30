import { LinkButton } from "../ui/LinkButton";

/**
 * Sticky so the CV download stays reachable at any scroll position,
 * including over an open section modal (`--z-header` sits above
 * `--z-section-takeover`). Full-width bar rather than the reading-width
 * `Container` used elsewhere — it spans the viewport edge to edge
 * above the single-column portfolio.
 */
export function Header() {
  return (
    <header
      style={{ zIndex: "var(--z-header)" }}
      className="sticky top-0 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur"
    >
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
