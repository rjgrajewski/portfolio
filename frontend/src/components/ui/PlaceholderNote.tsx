/**
 * Shared "this is seed/placeholder content" marker used across every
 * section (docs/ROADMAP.md § Phase 8 hasn't run yet). Keeping it as one
 * component means the real Phase 8 content pass only has to delete this
 * import, not hunt down five differently-worded disclaimers.
 */
export function PlaceholderNote({ children }: { children: string }) {
  return (
    <p className="mt-3 text-small italic text-neutral-500">{children}</p>
  );
}
