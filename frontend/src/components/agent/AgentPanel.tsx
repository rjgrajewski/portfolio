import { isAgentConfigured, isVoiceConfigured } from "../../config/runtime";
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
 * voice-mode toggle, a streamed transcript, and a "thinking" state
 * (docs/ROADMAP.md § Phase 2 / § Phase 4).
 *
 * Availability is not decided here — `deriveDegradation` (agent/degradation.ts)
 * is the single source of truth (docs/ROADMAP.md § Phase 6). This component
 * renders its verdict; the text composer and the manual portfolio + CV keep
 * working through any voice failure.
 */
export function AgentPanel() {
  const {
    messages,
    status,
    errorCode,
    voiceErrorCode,
    canSend,
    voiceMode,
    listening,
    partialTranscript,
    speaking,
    send,
    toggleVoice,
    stop,
  } = useConversation();

  const degradation = deriveDegradation({
    configured: isAgentConfigured,
    errorCode,
    voice: { configured: isVoiceConfigured, errorCode: voiceErrorCode },
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
          {degradation.voice.available
            ? " Tap the mic and just talk — you can cut in while it speaks."
            : ""}
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
            <Transcript messages={messages} status={status} speaking={speaking} />
          )}

          {degradation.notice ? (
            <p
              role="status"
              className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-small text-neutral-400"
            >
              {degradation.notice}
            </p>
          ) : null}

          {degradation.voice.notice ? (
            <p role="status" className="mt-2 text-small text-neutral-500">
              {degradation.voice.notice}
            </p>
          ) : null}

          <Composer
            canSend={inputEnabled}
            busy={busy}
            onSend={send}
            onStop={stop}
            voiceAvailable={degradation.voice.available}
            voiceMode={voiceMode}
            listening={listening}
            partialTranscript={partialTranscript}
            onToggleVoice={toggleVoice}
          />
        </>
      )}
    </div>
  );
}
