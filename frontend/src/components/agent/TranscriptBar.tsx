import type { ChatMessage, ConversationStatus } from "../../agent/useConversation";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";

interface Props {
  messages: ChatMessage[];
  status: ConversationStatus;
  speaking: boolean;
  listening: boolean;
  voiceMode: boolean;
  partialTranscript: string;
  /** Degradation copy — text-agent notice takes priority over the voice one. */
  textNotice: string | null;
  voiceNotice: string | null;

  expanded: boolean;
  onToggleExpanded: () => void;
  showExpandControl: boolean;

  /** Plain text fallback — reachable, but a quiet control, not a voice element. */
  textOpen: boolean;
  onToggleText: () => void;
  canSend: boolean;
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

/**
 * Transcript, hidden by default (docs/ARCHITECTURE.md § Agentic UI pattern,
 * rewritten). Collapsed: a slim floating pill with the latest utterance (or
 * the live partial while listening, or a degradation notice). Expanded: the
 * full history, capped so it never buries an open portfolio section — and
 * on mobile it's re-collapsed whenever a section opens (AgentOverlay).
 *
 * Visually it's one cohesive component with the rest of the system: a
 * rounded, fully-enclosed card on a calm neutral ground, an amber status
 * dot while voice is live, amber-on-hover chip controls. The plain text
 * input sits under a "Type" chip — reachable, deliberately quiet, not
 * dressed up as a voice affordance.
 */
const chip =
  "shrink-0 rounded-full border px-2.5 py-1 text-small transition-colors " +
  "border-neutral-700/70 text-neutral-400 hover:border-accent/50 hover:text-accent";
const chipOn = "shrink-0 rounded-full border px-2.5 py-1 text-small border-accent/50 text-accent";
const card =
  "rounded-2xl border border-neutral-800/80 bg-neutral-900/85 shadow-lg shadow-black/40 backdrop-blur-md";

export function TranscriptBar({
  messages,
  status,
  speaking,
  listening,
  voiceMode,
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
        : voiceMode
          ? "Voice on — just start talking."
          : "";

  return (
    <div className="pointer-events-auto mx-auto w-full max-w-2xl px-3">
      {/* A persistent notice sits above the bar so it never masks the
          transcript line, and never gets lost when the bar collapses. */}
      {notice && !expanded && (messages.length > 0 || listening) ? (
        <p className="mb-1.5 px-1 text-right text-small text-neutral-500">
          {notice}
        </p>
      ) : null}

      {expanded ? (
        <div className={`overflow-hidden ${card}`}>
          <div className="flex items-center justify-between border-b border-neutral-800/70 px-4 py-2.5">
            <span className="text-small font-medium uppercase tracking-[0.14em] text-accent/70">
              Conversation
            </span>
            <button
              type="button"
              onClick={onToggleExpanded}
              className={chip}
              aria-expanded="true"
            >
              Collapse
            </button>
          </div>
          <div className="max-h-[38vh] overflow-y-auto px-4 py-3">
            {notice ? (
              <p
                role="status"
                className="mb-3 rounded-lg border border-neutral-800/80 bg-neutral-950/50 px-3 py-2 text-small text-neutral-400"
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
        <div className={`flex items-center gap-2.5 px-3.5 py-2.5 ${card}`}>
          {voiceMode ? (
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full bg-accent ${
                listening ? "animate-pulse" : ""
              }`}
              aria-hidden="true"
            />
          ) : null}
          <p
            className={`min-w-0 flex-1 truncate text-small ${
              notice ? "text-neutral-400" : "text-neutral-200"
            }`}
            aria-live="polite"
          >
            {collapsedLine || (
              <span className="text-neutral-600">
                {textOpen ? "Type your question below" : "Transcript"}
              </span>
            )}
          </p>
          {showExpandControl && messages.length > 0 ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              className={chip}
              aria-expanded="false"
            >
              History
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleText}
            aria-pressed={textOpen}
            className={textOpen ? chipOn : chip}
          >
            {textOpen ? "Hide" : "Type"}
          </button>
        </div>
      )}

      {textOpen ? (
        <div className={`mt-2 px-3.5 py-3 ${card}`}>
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
