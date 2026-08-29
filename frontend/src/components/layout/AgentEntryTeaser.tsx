/**
 * Visual placeholder for the agent panel that lands in Phase 2/4
 * (frontend/src/components/agent/AgentPanel.tsx — not built yet). This is
 * intentionally NOT that component: it exists only to give the agent its
 * visually primary spot in the landing hero now, per docs/ARCHITECTURE.md
 * § Product shape ("the agent and the manual experience are the same
 * experience" — the layout should already read that way before the agent
 * itself exists). No chat logic, no state — a real AgentPanel will occupy
 * this slot once Phase 2 lands.
 */
export function AgentEntryTeaser() {
  return (
    <div className="w-full max-w-xl rounded-2xl border border-accent/30 bg-neutral-900/60 p-6 shadow-[0_0_60px_-20px] shadow-accent/30">
      <p className="text-small font-medium uppercase tracking-wider text-accent">
        Ask the AI agent
      </p>
      <p className="mt-2 text-body text-neutral-300">
        Ask a question about Rafal&rsquo;s work — the agent answers and opens
        the relevant section as it talks.
      </p>
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-500">
        <span aria-hidden="true">💬</span>
        <span className="text-small">Agent chat — arrives in Phase 2</span>
      </div>
    </div>
  );
}
