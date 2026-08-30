interface SectionShellProps {
  id: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * List row for a section. Content lives in `SectionModal`, not here —
 * one reveal presentation on every breakpoint. `isOpen` only drives
 * `aria-expanded` (the modal is `aria-controls`).
 */
export function SectionShell({
  id,
  title,
  isOpen,
  onToggle,
}: SectionShellProps) {
  return (
    <section id={`section-${id}`} className="border-b border-neutral-900">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls="section-modal"
          className="flex w-full items-center justify-between gap-4 py-6 text-left"
        >
          <span
            className={`text-h3 ${isOpen ? "text-accent" : "text-neutral-100"}`}
          >
            {title}
          </span>
          <span aria-hidden="true" className="text-2xl text-accent">
            +
          </span>
        </button>
      </h2>
    </section>
  );
}
