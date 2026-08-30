import { useEffect, useRef } from "react";
import type {
  ChatMessage,
  ConversationStatus,
} from "../../agent/useConversation";
import { TRUNCATED_ANSWER_NOTE } from "../../agent/degradation";

interface TranscriptProps {
  messages: ChatMessage[];
  status: ConversationStatus;
}

/**
 * The streamed transcript. `aria-live="polite"` so a screen reader
 * announces text as it streams in. Auto-scrolls to the newest content
 * unless the reader has scrolled up.
 */
export function Transcript({ messages, status }: TranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    if (nearBottom) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, status]);

  const lastIndex = messages.length - 1;

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-label="Conversation with the portfolio agent"
      className="min-h-[200px] flex-1 space-y-4 overflow-y-auto pr-1 lg:min-h-0"
    >
      {messages.map((m, i) => {
        if (m.role === "user") {
          return (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-neutral-800 px-3.5 py-2 text-small text-neutral-100">
                {m.text}
              </p>
            </div>
          );
        }

        const isLast = i === lastIndex;
        const thinking = isLast && status === "thinking" && m.text === "";
        const streaming = isLast && status === "streaming" && m.text.length > 0;

        return (
          <div key={m.id} className="flex flex-col gap-1">
            <span className="text-small font-medium uppercase tracking-wider text-accent">
              Agent
            </span>
            {thinking ? (
              <span className="inline-flex gap-1" aria-label="The agent is thinking">
                <Dot delay="0ms" />
                <Dot delay="150ms" />
                <Dot delay="300ms" />
              </span>
            ) : (
              <p className="whitespace-pre-wrap text-body text-neutral-200">
                {m.text}
                {streaming ? (
                  <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-accent align-middle" />
                ) : null}
              </p>
            )}
            {m.truncated ? (
              <p className="text-small italic text-neutral-500">
                {TRUNCATED_ANSWER_NOTE}
              </p>
            ) : null}
          </div>
        );
      })}

      <div ref={endRef} />
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-500"
      style={{ animationDelay: delay }}
    />
  );
}
