import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../ui/Button";

interface ComposerProps {
  canSend: boolean;
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Voice (Phase 4) — omitted / false when voice isn't configured. */
  voiceAvailable?: boolean;
  listening?: boolean;
  partialTranscript?: string;
  onMicStart?: () => void;
  onMicStop?: () => void;
}

/**
 * Text input for the agent, plus the mic control when voice is available.
 * Enter sends, Shift+Enter inserts a newline. The text path is never
 * disabled by a voice failure — voice is strictly additive.
 */
export function Composer({
  canSend,
  busy,
  onSend,
  onStop,
  voiceAvailable = false,
  listening = false,
  partialTranscript = "",
  onMicStart,
  onMicStop,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusedRef = useRef(false);

  // Mobile: the on-screen keyboard covers the bottom of the layout (the
  // page scrolls as one column below `lg:`). Keep the input — and the
  // latest turn just above it — visible by scrolling it into the middle of
  // the *visual* viewport whenever the keyboard opens or resizes
  // (docs/ARCHITECTURE.md § Graceful degradation — "keyboard-covers-input").
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (!focusedRef.current) return;
      inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  function onFocus() {
    focusedRef.current = true;
    // Wait for the keyboard animation, then bring the field into view.
    window.setTimeout(() => {
      inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 250);
  }

  function onBlur() {
    focusedRef.current = false;
  }

  function submit() {
    const text = value.trim();
    if (!text || !canSend) return;
    onSend(text);
    setValue("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const textDisabled = (!canSend && !busy) || listening;

  return (
    <div className="agent-composer mt-3">
      {listening ? (
        <p
          className="mb-2 min-h-[1.25rem] text-small text-neutral-300"
          aria-live="polite"
        >
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent align-middle" />
          {partialTranscript || "Listening…"}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        {voiceAvailable ? (
          <button
            type="button"
            onClick={listening ? onMicStop : onMicStart}
            disabled={busy && !listening}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Ask by voice"}
            className={`flex h-[2.75rem] w-[2.75rem] shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-40 ${
              listening
                ? "border-accent bg-accent/15 text-accent"
                : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-700 hover:text-neutral-100"
            }`}
          >
            <MicGlyph listening={listening} />
          </button>
        ) : null}

        <label htmlFor="agent-input" className="sr-only">
          Ask a question about Rafal&rsquo;s work
        </label>
        <textarea
          id="agent-input"
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          disabled={textDisabled}
          placeholder={listening ? "Listening…" : "Ask about Rafal's work…"}
          className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-small text-neutral-100 placeholder:text-neutral-600 focus-visible:border-accent focus-visible:outline-none disabled:opacity-50"
        />
        {busy ? (
          <Button variant="secondary" onClick={onStop} aria-label="Stop generating">
            Stop
          </Button>
        ) : (
          <Button
            onClick={submit}
            disabled={!canSend || value.trim().length === 0}
          >
            Send
          </Button>
        )}
      </div>
    </div>
  );
}

function MicGlyph({ listening }: { listening: boolean }) {
  if (listening) {
    return (
      <span className="block h-3 w-3 rounded-[2px] bg-current" aria-hidden />
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
    </svg>
  );
}
