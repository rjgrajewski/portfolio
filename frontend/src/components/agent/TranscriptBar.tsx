import type { ChatMessage, ConversationStatus } from "../../agent/useConversation";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";

interface Props {
  messages: ChatMessage[];
  status: ConversationStatus;
  speaking: boolean;
  listening: boolean;
  partialTranscript: string;
  /** Degradation copy — text-agent notice takes priority over the voice one. */
  textNotice: string | null;
  voiceNotice: string | null;

  expanded: boolean;
  onToggleExpanded: () => void;
  showExpandControl: boolean;

  /** Plain text fallback — deliberately NOT styled into the voice aesthetic. */
  textOpen: boolean;
  onToggleText: () => void;
  canSend: boolean;
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

/**
 * Transcript, hidden by default (docs/ARCHITECTURE.md § Agentic UI pattern,
 * rewritten). Collapsed: a slim one-line bar with the latest utterance (or
 * the live partial while listening, or a degradation notice). Expanded: the
 * full history, capped so it never buries an open portfolio section — and
 * on mobile it's re-collapsed whenever a section opens (AgentOverlay).
 *
 * The plain text input lives here too, behind a small "Type" toggle. It is
 * intentionally unstyled relative to the voice UI — whether typing belongs
 * inside voice mode or is an exit from it is a post-device-test decision.
 */
export function TranscriptBar({
  messages,
  status,
  speaking,
  listening,
  partialTranscript,
  textNotice,
  voiceNotice,
  expanded,
  onToggleExpanded,
  showExpandControl,
  textOpen,
  onToggleText,
  canSend,
  busy,
  onSend,
  onStop,
}: Props) {
  const last = messages[messages.length - 1];
  const notice = textNotice ?? voiceNotice;

  const collapsedLine = listening
    ? partialTranscript || "Listening…"
    : last
      ? `${last.role === "user" ? "You" : "Agent"}: ${last.text || "…"}`
      : notice
        ? notice
        : "";

  return (
    <div className="pointer-events-auto w-full">
      {/* A persistent notice sits above the bar so it never masks the
          transcript line, and never gets lost when the bar collapses. */}
      {notice && !expanded && (messages.length > 0 || listening) ? (
        <p className="mx-auto max-w-3xl px-4 pb-1 text-right text-small text-neutral-500">
          {notice}
        </p>
      ) : null}

      {expanded ? (
        <div className="mx-auto max-w-3xl overflow-hidden rounded-t-xl border border-b-0 border-neutral-800 bg-neutral-950/95 backdrop-blur">
          <div className="flex items-center justify-between border-b border-neutral-900 px-4 py-2">
            <span className="text-small font-medium uppercase tracking-wider text-neutral-500">
              Conversation
            </span>
            <button
              type="button"
              onClick={onToggleExpanded}
              className="text-small text-neutral-400 hover:text-neutral-100"
              aria-expanded="true"
            >
              Collapse ▾
            </button>
          </div>
          <div className="max-h-[40vh] overflow-y-auto px-4 py-3">
            {notice ? (
              <p
                role="status"
                className="mb-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-small text-neutral-400"
              >
                {notice}
              </p>
            ) : null}
            {messages.length > 0 ? (
              <Transcript
                messages={messages}
                status={status}
                speaking={speaking}
              />
            ) : (
              <p className="text-small text-neutral-500">
                Nothing yet — tap the orb and ask something.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-t-xl border border-b-0 border-neutral-800 bg-neutral-950/90 px-4 py-2 backdrop-blur">
          <p
            className={`min-w-0 flex-1 truncate text-small ${
              notice ? "text-neutral-400" : "text-neutral-300"
            }`}
            aria-live="polite"
          >
            {collapsedLine || (
              <span className="text-neutral-600">Transcript</span>
            )}
          </p>
          {showExpandControl && messages.length > 0 ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="shrink-0 text-small text-neutral-500 hover:text-neutral-200"
              aria-expanded="false"
            >
              History ▴
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleText}
            aria-pressed={textOpen}
            className="shrink-0 text-small text-neutral-500 hover:text-neutral-200"
          >
            {textOpen ? "Hide typing" : "Type"}
          </button>
        </div>
      )}

      {textOpen ? (
        <div className="mx-auto max-w-3xl border-x border-neutral-800 bg-neutral-950/95 px-4 pb-3 backdrop-blur">
          <Composer
            canSend={canSend}
            busy={busy}
            onSend={onSend}
            onStop={onStop}
          />
        </div>
      ) : null}
    </div>
  );
}
