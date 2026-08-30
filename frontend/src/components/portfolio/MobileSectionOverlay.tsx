import { useEffect, useRef } from "react";
import { SECTIONS } from "../../content/sections";
import {
  closeActiveSection,
  revealSection,
} from "../../content/activeSectionStore";
import { useActiveSection } from "../../hooks/useActiveSection";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { SECTION_CONTENT } from "./sectionContent";

/**
 * Mobile-only full-screen takeover for the revealed section
 * (docs/ROADMAP.md § Phase 3: "on mobile, reveal becomes a full-screen
 * takeover where a side panel won't work").
 *
 * It is driven entirely by `activeSectionStore` — the SAME state a desktop
 * in-place reveal uses, and the same state the agent's `reveal_section` tool
 * writes through `revealSection`. There is no mobile-specific reveal path:
 * this component only ever *reads* the active section and calls
 * `closeActiveSection` on exit. So an agent-triggered reveal opens this
 * overlay exactly like a tap does, and the agent transcript (mounted in the
 * agent zone, untouched underneath this layer) survives open/close.
 *
 * `lg:hidden` and the `useActiveSection` null-check both gate it: on desktop
 * it never renders; on mobile it renders only while a section is open.
 */
export function MobileSectionOverlay() {
  const activeId = useActiveSection();
  const isDesktop = useIsDesktop();
  const open = !isDesktop && activeId !== null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lock the page behind the overlay so a scroll gesture moves the section,
  // not the list underneath. Only while the overlay is actually up (mobile,
  // a section open) — never leaves `body` locked after a resize to desktop.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Esc closes; move focus onto the exit control when a section opens (or
  // when the agent swaps the open section from under the reader).
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    scrollRef.current?.scrollTo(0, 0);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeActiveSection();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, activeId]);

  if (!open || !activeId) return null;

  const meta = SECTIONS.find((s) => s.id === activeId);
  const Content = SECTION_CONTENT[activeId];
  if (!meta || !Content) return null;

  const others = SECTIONS.filter((s) => s.id !== activeId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
      style={{ zIndex: "var(--z-section-takeover)" }}
      className="fixed inset-0 flex flex-col bg-neutral-950 lg:hidden"
    >
      <div className="flex items-center border-b border-neutral-900 px-4 py-3">
        <button
          ref={closeRef}
          type="button"
          onClick={closeActiveSection}
          className="-mx-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-small text-neutral-300 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true">←</span> All sections
        </button>
      </div>

      {/* pb-40: the agent visualization now floats ABOVE this takeover
          (docs/DECISIONS.md), so leave room for it under the content. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-40 pt-8">
        <h2 className="text-h2 text-neutral-50">{meta.title}</h2>
        <div className="mt-5 text-body text-neutral-300">
          <Content />
        </div>

        <div className="mt-12 border-t border-neutral-900 pt-6">
          <p className="text-small font-medium uppercase tracking-wider text-neutral-500">
            More
          </p>
          <ul className="mt-2 space-y-1">
            {others.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => revealSection(s.id)}
                  className="flex w-full items-center justify-between py-2 text-left text-body text-neutral-300 hover:text-neutral-100"
                >
                  {s.title}
                  <span aria-hidden="true" className="text-accent">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
