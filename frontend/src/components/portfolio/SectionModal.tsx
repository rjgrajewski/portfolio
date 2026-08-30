import { useEffect, useRef, useState, type TransitionEvent } from "react";
import { createPortal } from "react-dom";
import { SECTIONS, type SectionId } from "../../content/sections";
import { closeActiveSection } from "../../content/activeSectionStore";
import { useActiveSection } from "../../hooks/useActiveSection";
import { SECTION_CONTENT } from "./sectionContent";

/**
 * The revealed section — a modal card over the hero, every breakpoint.
 * Same `activeSectionStore` a list tap and the agent's `reveal_section`
 * write; this component only reads it. Portaled to `document.body` so
 * `position: fixed` cannot be re-based, sitting under the agent dock /
 * AI-mode frame and under the sticky header (CV stays reachable).
 */
export function SectionModal() {
  const activeId = useActiveSection();
  const [renderedId, setRenderedId] = useState<SectionId | null>(null);
  const [entered, setEntered] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeId) {
      setRenderedId(activeId);
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    setEntered(false);
  }, [activeId]);

  useEffect(() => {
    if (activeId || !renderedId) return;
    const t = window.setTimeout(() => setRenderedId(null), 450);
    return () => window.clearTimeout(t);
  }, [activeId, renderedId]);

  useEffect(() => {
    if (!renderedId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [renderedId]);

  useEffect(() => {
    if (!activeId) return;
    closeRef.current?.focus();
    scrollRef.current?.scrollTo(0, 0);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeActiveSection();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeId]);

  if (!renderedId) return null;

  const meta = SECTIONS.find((s) => s.id === renderedId);
  const Content = SECTION_CONTENT[renderedId];
  if (!meta || !Content) return null;

  const enteredAttr = entered ? "true" : "false";

  function handlePanelTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "transform" && e.propertyName !== "opacity") return;
    if (!activeId) setRenderedId(null);
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center px-3 pt-[4.75rem] pb-[9.5rem] sm:px-6"
      style={{ zIndex: "var(--z-section-takeover)" }}
    >
      <button
        type="button"
        aria-label="Close section"
        data-entered={enteredAttr}
        className="section-modal-backdrop absolute inset-0 bg-neutral-950/60"
        onClick={closeActiveSection}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-modal-title"
        id="section-modal"
        data-entered={enteredAttr}
        onTransitionEnd={handlePanelTransitionEnd}
        className="section-modal-panel relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-[0_28px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-900 px-5 py-3">
          <h2
            id="section-modal-title"
            className="text-h3 text-neutral-50"
          >
            {meta.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={closeActiveSection}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-2xl leading-none text-accent hover:bg-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span aria-hidden="true" className="rotate-45">
              +
            </span>
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
          <div className="text-body text-neutral-300">
            <Content />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
