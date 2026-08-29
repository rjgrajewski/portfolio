/**
 * Reasoning transport — one POST per user turn to the streaming Lambda
 * Function URL, reading the NDJSON response frame by frame.
 *
 * This is the browser half of the Lambda→browser wire contract (the
 * resolved, now-retired OQ-1). Kept in lockstep with
 * backend/functions/agent/src/types.ts. The rules this code depends on:
 *
 *   - NDJSON: one JSON object per line, `\n`-terminated.
 *   - `text`  — append `delta` to the transcript in arrival order.
 *   - `action` — a UI action; act on it the instant it arrives, not after
 *     the prose. (`reveal_section` is the only one today.)
 *   - `done` / `error` — terminal; exactly one per turn, and it may be
 *     `error` even after `text` frames already arrived (partial answer,
 *     then failure).
 *   - Unknown `type` values are IGNORED, not treated as errors — that is
 *     the extension point.
 */

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AgentTurnRequest {
  sessionId: string;
  message: string;
  history: HistoryTurn[];
}

export type ErrorCode =
  | "throttled"
  | "breaker_tripped"
  | "session_cap"
  | "upstream_error"
  | "internal"
  | "network";

export interface TextFrame {
  type: "text";
  delta: string;
}
export interface ActionFrame {
  type: "action";
  name: string;
  args: Record<string, unknown>;
}
export interface DoneFrame {
  type: "done";
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
}
export interface ErrorFrame {
  type: "error";
  code: ErrorCode;
  message: string;
}
/** Anything the frontend doesn't recognise — carried through and ignored. */
export interface UnknownFrame {
  type: string;
  [k: string]: unknown;
}

export type ServerFrame =
  | TextFrame
  | ActionFrame
  | DoneFrame
  | ErrorFrame
  | UnknownFrame;

/**
 * POST one turn and yield decoded frames as they arrive. Throws only for a
 * transport-level failure (network, non-2xx, no body) — an in-band `error`
 * frame is yielded, not thrown.
 */
export async function* streamAgentTurn(
  url: string,
  req: AgentTurnRequest,
  signal?: AbortSignal,
): AsyncGenerator<ServerFrame, void, void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    throw new AgentTransportError("network request failed");
  }

  if (!res.ok || !res.body) {
    throw new AgentTransportError(`agent endpoint returned ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        const frame = parseLine(line);
        if (frame) yield frame;
      }
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    throw new AgentTransportError("stream read failed");
  }

  buffer += decoder.decode();
  const tail = parseLine(buffer.trim());
  if (tail) yield tail;
}

function parseLine(line: string): ServerFrame | null {
  if (!line) return null;
  try {
    const value = JSON.parse(line) as unknown;
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { type?: unknown }).type === "string"
    ) {
      return value as ServerFrame;
    }
  } catch {
    // A partial or malformed line is not a frame — skip it.
  }
  return null;
}

export class AgentTransportError extends Error {}
