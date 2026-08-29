import { useState, type KeyboardEvent } from "react";
import { Button } from "../ui/Button";

interface ComposerProps {
  canSend: boolean;
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

/**
 * Text input for the agent. Enter sends, Shift+Enter inserts a newline.
 * Disabled whenever a turn is in flight or the agent isn't wired up.
 */
export function Composer({ canSend, busy, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState("");

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

  return (
    <div className="mt-3 flex items-end gap-2">
      <label htmlFor="agent-input" className="sr-only">
        Ask a question about Rafal&rsquo;s work
      </label>
      <textarea
        id="agent-input"
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={!canSend && !busy}
        placeholder="Ask about Rafal's work…"
        className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-small text-neutral-100 placeholder:text-neutral-600 focus-visible:border-accent focus-visible:outline-none disabled:opacity-50"
      />
      {busy ? (
        <Button variant="secondary" onClick={onStop} aria-label="Stop generating">
          Stop
        </Button>
      ) : (
        <Button onClick={submit} disabled={!canSend || value.trim().length === 0}>
          Send
        </Button>
      )}
    </div>
  );
}
