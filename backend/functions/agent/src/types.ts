/**
 * Shared types for the reasoning Lambda.
 *
 * The `ServerFrame` union IS the Lambda→browser wire contract (the resolved,
 * now-retired OQ-1). Kept deliberately in lockstep with
 * frontend/src/agent/transport.ts — if you change a frame shape here, change
 * it there in the same commit. The contract in full:
 *
 *   - NDJSON: one JSON object per line, `\n`-terminated,
 *     `Content-Type: application/x-ndjson`.
 *   - One connection per user turn, even when two model calls happen
 *     underneath (before and after a tool result). The frontend never sees
 *     that split.
 *   - `text`   — a response fragment; append in arrival order.
 *   - `action` — a UI action, emitted the INSTANT the model yields it (not
 *     after the prose). This is the "reveal and answer at the same time"
 *     mechanism.
 *   - `done`   — terminal, exactly one per turn, last. `usage` sums BOTH
 *     model calls.
 *   - `error`  — terminal, the alternative to `done`. May arrive mid-stream
 *     after `text` frames were already sent (partial answer + error).
 *   - Every turn ends with exactly one terminal frame (`done` XOR `error`).
 *   - `get_content` never appears in the stream — it is internal to the
 *     Lambda.
 *   - Unknown frame types are ignored by the frontend (room to extend).
 */

export type ErrorCode =
  | "throttled"
  | "breaker_tripped"
  | "session_cap"
  | "upstream_error"
  | "internal";

export interface TextFrame {
  type: "text";
  delta: string;
}

export interface ActionFrame {
  type: "action";
  name: "reveal_section";
  args: { sectionId: string };
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

export type ServerFrame = TextFrame | ActionFrame | DoneFrame | ErrorFrame;

/** One prior turn, as sent by the frontend. */
export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

/** POST body the frontend sends for one user turn. */
export interface AgentRequest {
  sessionId: string;
  message: string;
  history?: HistoryTurn[];
}

/** content/manifest.json shape (the table of contents the model sees). */
export interface Manifest {
  version: number;
  note?: string;
  topics: ManifestTopic[];
}

export interface ManifestTopic {
  id: string;
  title: string;
  sectionId: string;
  layers: Record<string, string>;
}
