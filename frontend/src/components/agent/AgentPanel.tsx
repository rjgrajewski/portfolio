import { isAgentConfigured } from "../../config/runtime";
import { useConversation } from "../../agent/useConversation";
import { deriveDegradation } from "../../agent/degradation";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";

const STARTERS = [
  "What has Rafal worked on?",
  "Tell me about FlowJob.",
  "How was this portfolio built?",
];

/**
 * The agent panel — lives in the agent zone (AgentZone.tsx). Text input, a
 * streamed transcript, and a "thinking" state (docs/ROADMAP.md § Phase 2).
 *
 * Availability is not decided here — `deriveDegradation` (agent/degradation.ts)
 * is the single source of truth (docs/ROADMAP.md § Phase 6). This component
 * just renders its verdict: an unavailable notice when the backend isn't
 * wired, an inline banner when a turn failed, and — either way — the manual
 * portfolio + CV keep working, which the copy points at.
 */
export function AgentPanel() {
  const { messages, status, errorCode, canSend, send, stop } = useConversation();
  const degradation = deriveDegradation({
    configured: isAgentConfigured,
    errorCode,
  });
  const busy = status === "thinking" || status === "streaming";
  const isEmpty = messages.length === 0;
  const inputEnabled = canSend && degradation.canRetry;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4">
        <p className="text-small font-medium uppercase tracking-wider text-accent">
          Ask the AI agent
        </p>
        <p className="mt-1 text-small text-neutral-400">
          It answers in Rafal&rsquo;s third person and opens the matching
          section as it talks.
        </p>
      </div>

      {degradation.mode === "unconfigured" ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-small text-neutral-400">
          {degradation.notice}
        </div>
      ) : (
        <>
          {isEmpty ? (
            <div className="flex-1">
              <p className="text-small text-neutral-500">Try asking:</p>
              <ul className="mt-2 space-y-2">
                {STARTERS.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => send(q)}
                      disabled={!inputEnabled}
                      className="w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-left text-small text-neutral-300 transition-colors hover:border-neutral-700 hover:text-neutral-100 disabled:opacity-50"
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Transcript messages={messages} status={status} />
          )}

          {degradation.notice ? (
            <p
              role="status"
              className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-small text-neutral-400"
            >
              {degradation.notice}
            </p>
          ) : null}

          <Composer
            canSend={inputEnabled}
            busy={busy}
            onSend={send}
            onStop={stop}
          />
        </>
      )}
    </div>
  );
}
