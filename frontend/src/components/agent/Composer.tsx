import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../ui/Button";

interface ComposerProps {
  canSend: boolean;
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Voice (Phase 4) — omitted / false when voice isn't configured. */
  voiceAvailable?: boolean;
  /** Voice mode is on: the mic is live and listening hands-free. */
  voiceMode?: boolean;
  /** Actively capturing an utterance right now (vs. passively monitoring). */
  listening?: boolean;
  partialTranscript?: string;
  onToggleVoice?: () => void;
}

/**
 * Text input for the agent, plus the voice-mode toggle when voice is
 * available. Enter sends, Shift+Enter inserts a newline. The text path is
 * never disabled by a voice failure, and typing still works while voice
 * mode is on (as long as you're not mid-utterance).
 */
export function Composer({
  canSend,
  busy,
  onSend,
  onStop,
  voiceAvailable = false,
  voiceMode = false,
  listening = false,
  partialTranscript = "",
  onToggleVoice,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusedRef = useRef(false);

  // Mobile: the on-screen keyboard covers the bottom of the layout. Keep the
  // input (and the latest turn just above it) visible by scrolling it into
  // the middle of the *visual* viewport whenever the keyboard opens/resizes.
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
      ) : voiceMode ? (
        <p className="mb-2 min-h-[1.25rem] text-small text-neutral-500">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent/60 align-middle" />
          Voice on — just start talking. You can cut in while the agent speaks.
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        {voiceAvailable ? (
          <button
            type="button"
            onClick={onToggleVoice}
            aria-pressed={voiceMode}
            aria-label={voiceMode ? "Turn voice off" : "Talk to the agent"}
            className={`flex h-[2.75rem] w-[2.75rem] shrink-0 items-center justify-center rounded-lg border transition-colors ${
              voiceMode
                ? "border-accent bg-accent/15 text-accent"
                : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-700 hover:text-neutral-100"
            }`}
          >
            <MicGlyph active={voiceMode} />
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

function MicGlyph({ active }: { active: boolean }) {
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
      {active ? <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" /> : null}
    </svg>
  );
}
