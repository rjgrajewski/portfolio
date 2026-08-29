import type { ReactNode } from "react";

interface SectionShellProps {
  id: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * The reveal-in-place shell — presentational only. `isOpen`/`onToggle` are
 * owned by the caller (frontend/src/content/activeSectionStore.ts) so this
 * component has no state of its own to fall out of sync with the store that
 * Phase 3's agent will also drive.
 *
 * Animation: CSS grid-template-rows 0fr → 1fr + opacity, not a JS height
 * measurement or an animation library — no layout thrash, no bundle cost,
 * and it degrades to an instant snap under prefers-reduced-motion (handled
 * globally in styles/index.css) rather than needing special-casing here.
 */
export function SectionShell({
  id,
  title,
  isOpen,
  onToggle,
  children,
}: SectionShellProps) {
  const panelId = `section-panel-${id}`;

  return (
    <section className="border-b border-neutral-900">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-4 py-6 text-left"
        >
          <span className="text-h3 text-neutral-100">{title}</span>
          <span
            aria-hidden="true"
            className={`text-2xl text-accent transition-transform duration-300 ${
              isOpen ? "rotate-45" : ""
            }`}
          >
            +
          </span>
        </button>
      </h2>
      <div
        id={panelId}
        role="region"
        aria-labelledby={panelId}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            className={`pb-8 text-body text-neutral-300 transition-opacity duration-300 ${
              isOpen ? "opacity-100" : "opacity-0"
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
