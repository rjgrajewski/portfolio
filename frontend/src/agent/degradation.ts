/**
 * Single source of truth for agent availability (docs/ARCHITECTURE.md
 * § Graceful degradation, docs/ROADMAP.md § Phase 6).
 *
 * Demo scope only. Voice does not exist yet (Transcribe / Polly / mic are
 * Phase 4), so the full Phase 6 failure matrix is NOT modelled here — just
 * the two things that can actually fail in the text agent:
 *
 *   1. the backend isn't wired at all (`VITE_AGENT_URL` unset), or
 *   2. a turn ended on an `error` frame / a dropped connection
 *      (codes: throttled | breaker_tripped | session_cap | upstream_error |
 *      internal | network — the stream contract's set, plus `network` for a
 *      transport-level failure).
 *
 * In every non-ok mode the manual portfolio + CV download stay fully
 * functional and the copy says so. This module maps an input state to
 * user-facing copy and a couple of booleans; it holds no state itself.
 */

import type { ErrorCode } from "./transport";

export type AgentMode = "ok" | "unconfigured" | "degraded";

export interface DegradationState {
  mode: AgentMode;
  /** One-line explanation for a non-ok mode, else null. */
  notice: string | null;
  /** Whether the composer / starter buttons should accept input right now. */
  canRetry: boolean;
}

/** Appended (as a flag, never into message text) to a partial answer that
 * ended on an error, so the transcript shows the reply was cut short. */
export const TRUNCATED_ANSWER_NOTE = "The answer was cut off there.";

const MANUAL_FALLBACK =
  "Browse the sections here or download the CV — everything about Rafal's work is there too.";

const ERROR_NOTICE: Record<ErrorCode, string> = {
  session_cap:
    "This session has reached its message limit. Reload the page for a fresh one.",
  throttled: "That came through fast. Give it a few seconds, then try again.",
  breaker_tripped:
    "The assistant has hit today's usage limit and is paused until tomorrow.",
  upstream_error:
    "The assistant's model backend is momentarily unavailable. Try again shortly.",
  network: "Couldn't reach the assistant. Check your connection and try again.",
  internal: "Something went wrong answering that. Try again in a moment.",
};

/** Codes that a retry in the same session cannot clear. */
const NON_RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "session_cap",
  "breaker_tripped",
]);

export function deriveDegradation(input: {
  configured: boolean;
  errorCode: ErrorCode | null;
}): DegradationState {
  if (!input.configured) {
    return {
      mode: "unconfigured",
      notice: `The assistant is unavailable right now. ${MANUAL_FALLBACK}`,
      canRetry: false,
    };
  }

  if (input.errorCode) {
    return {
      mode: "degraded",
      notice: `${ERROR_NOTICE[input.errorCode]} ${MANUAL_FALLBACK}`,
      canRetry: !NON_RETRYABLE.has(input.errorCode),
    };
  }

  return { mode: "ok", notice: null, canRetry: true };
}
