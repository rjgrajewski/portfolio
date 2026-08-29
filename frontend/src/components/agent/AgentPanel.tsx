import { isAgentConfigured } from "../../config/runtime";
import { useConversation } from "../../agent/useConversation";
import type { ErrorCode } from "../../agent/transport";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";

const STARTERS = [
  "What has Rafal worked on?",
  "Tell me about FlowJob.",
  "How was this portfolio built?",
];

const ERROR_COPY: Record<ErrorCode, string> = {
  session_cap:
    "You've reached the message limit for this session. Reload the page to start a fresh one — or browse the portfolio below.",
  throttled: "That was a lot at once. Give it a few seconds and try again.",
  breaker_tripped:
    "The assistant has hit its usage limit for today and is paused. The portfolio below and the CV download still work.",
  upstream_error:
    "The assistant's model backend is momentarily unavailable. Try again shortly, or browse the portfolio below.",
  network:
    "Couldn't reach the assistant. Check your connection and try again, or browse the portfolio below.",
  internal:
    "Something went wrong answering that. Try again, or browse the portfolio below.",
};

/**
 * The agent panel — lives in the agent zone (AgentZone.tsx). Text input, a
 * streamed transcript, and a "thinking" state (docs/ROADMAP.md § Phase 2).
 * When the backend isn't wired (`VITE_AGENT_URL` unset) it shows the
 * unavailable state and the manual portfolio carries the experience
 * (docs/ARCHITECTURE.md § Graceful degradation).
 */
export function AgentPanel() {
  const { messages, status, errorCode, canSend, send, stop } = useConversation();
  const busy = status === "thinking" || status === "streaming";
  const isEmpty = messages.length === 0;

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

      {!isAgentConfigured ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-small text-neutral-400">
          The assistant is unavailable right now. Browse the portfolio below
          or download the CV &mdash; everything about Rafal&rsquo;s work is
          there too.
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
                      disabled={!canSend}
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

          {status === "error" && errorCode ? (
            <p
              role="status"
              className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-small text-neutral-400"
            >
              {ERROR_COPY[errorCode]}
            </p>
          ) : null}

          <Composer
            canSend={canSend}
            busy={busy}
            onSend={send}
            onStop={stop}
          />
        </>
      )}
    </div>
  );
}
