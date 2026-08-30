/**
 * Single source of truth for agent availability (docs/ARCHITECTURE.md
 * § Graceful degradation, docs/ROADMAP.md § Phase 6).
 *
 * Two independent verdicts from one function:
 *
 *   1. the TEXT agent — the backend isn't wired (`VITE_AGENT_URL` unset), or
 *      a turn ended on an `error` frame / dropped connection (codes:
 *      throttled | breaker_tripped | session_cap | upstream_error |
 *      internal | network).
 *
 *   2. VOICE (Phase 4) — a layer strictly on top of text. Mic denied,
 *      Transcribe dropped, Polly failed, or the credential-vending Lambda
 *      refused (breaker tripped / throttled / internal — the OQ-8 path).
 *      EVERY voice failure ends on working text: a voice notice never
 *      disables the composer and never changes `canRetry`. If voice isn't
 *      configured at all it is simply not offered.
 *
 * In every non-ok text mode the manual portfolio + CV download stay fully
 * functional and the copy says so. This module maps input state to
 * user-facing copy + booleans; it holds no state itself.
 */

import type { ErrorCode } from "./transport";

export type AgentMode = "ok" | "unconfigured" | "degraded";

export type VoiceErrorCode =
  | "mic_denied"
  | "mic_unavailable"
  | "transcribe_failed"
  | "polly_failed"
  | "credentials_refused";

export interface VoiceState {
  /** Whether the mic control should be shown at all. */
  available: boolean;
  /** One-line explanation after a voice failure, else null. Always points
   *  back at text — never a dead end. */
  notice: string | null;
}

export interface DegradationState {
  mode: AgentMode;
  /** One-line explanation for a non-ok text mode, else null. */
  notice: string | null;
  /** Whether the composer / starter buttons should accept input right now. */
  canRetry: boolean;
  voice: VoiceState;
}

/** Appended (as a flag, never into message text) to a partial answer that
 * ended on an error, so the transcript shows the reply was cut short. */
export const TRUNCATED_ANSWER_NOTE = "The answer was cut off there.";

/** Same idea, but for a deliberate barge-in — the visitor started speaking
 * while the answer was still playing, so it was stopped on purpose. */
export const INTERRUPTED_ANSWER_NOTE = "You cut in here — the rest wasn't said.";

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

const VOICE_NOTICE: Record<VoiceErrorCode, string> = {
  mic_denied:
    "Microphone access is blocked — allow it in your browser settings, or just type your question.",
  mic_unavailable:
    "No microphone found. You can keep asking in text.",
  transcribe_failed:
    "Voice input dropped out. You can keep asking in text.",
  polly_failed:
    "Couldn't play that back — the answer is above as text.",
  credentials_refused:
    "Voice is unavailable right now. You can keep asking in text.",
};

export function deriveDegradation(input: {
  configured: boolean;
  errorCode: ErrorCode | null;
  voice?: {
    configured: boolean;
    errorCode: VoiceErrorCode | null;
  };
}): DegradationState {
  const voice = deriveVoice(input.voice);

  if (!input.configured) {
    return {
      mode: "unconfigured",
      notice: `The assistant is unavailable right now. ${MANUAL_FALLBACK}`,
      canRetry: false,
      voice,
    };
  }

  if (input.errorCode) {
    return {
      mode: "degraded",
      notice: `${ERROR_NOTICE[input.errorCode]} ${MANUAL_FALLBACK}`,
      canRetry: !NON_RETRYABLE.has(input.errorCode),
      voice,
    };
  }

  return { mode: "ok", notice: null, canRetry: true, voice };
}

function deriveVoice(
  input: { configured: boolean; errorCode: VoiceErrorCode | null } | undefined,
): VoiceState {
  if (!input || !input.configured) {
    return { available: false, notice: null };
  }
  return {
    // Voice stays on offer even after a failure — the failure is per-attempt
    // and the next mic press can succeed. The notice explains the last one.
    available: true,
    notice: input.errorCode ? VOICE_NOTICE[input.errorCode] : null,
  };
}
