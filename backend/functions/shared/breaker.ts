/**
 * Real-time daily circuit-breaker (docs/ARCHITECTURE.md § Abuse protection
 * and cost control).
 *
 * This is the ONLY real cost backstop against deliberate abuse — the
 * per-session cap is keyed on a client-controlled id and does not bound it
 * (see agent/src/sessionCap.ts). The breaker is keyed on total volume for
 * the UTC day, in a single hot DynamoDB item, checked synchronously at the
 * start of every invocation that can spend money.
 *
 * Two INDEPENDENT counters, one per spend path, so abuse of one cannot
 * disable the other (docs/ARCHITECTURE.md § Abuse protection — the media
 * path must not be able to trip the text agent, or vice versa):
 *
 *   - `kind: "reasoning"` → item `pk = day#<YYYY-MM-DD>` — one count per
 *     Bedrock reasoning turn. Checked in agent/src/handler.ts.
 *   - `kind: "media"`     → item `pk = media#day#<YYYY-MM-DD>` — one count
 *     per short-lived-credential grant. Checked in
 *     credentials/src/handler.ts BEFORE any STS AssumeRole call, so a
 *     tripped breaker means no new Polly/Transcribe credentials are issued
 *     at all (this is what OQ-8's fix hinges on).
 *
 * Increment-then-check: the tripping request is itself counted and then
 * refused. That makes the decision race-free under concurrency (atomic ADD +
 * ReturnValues) at the cost of over-counting by at most the in-flight
 * concurrency — fine for a soft ceiling that sits well under the $25 budget.
 * (Decision recorded in docs/DECISIONS.md, 2026-08-30.)
 */

import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./ddb";

const TTL_SECONDS = 3 * 24 * 60 * 60;

export type BreakerKind = "reasoning" | "media";

/** `day#YYYY-MM-DD` / `media#day#YYYY-MM-DD` in UTC. */
function dayKey(kind: BreakerKind, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return kind === "media" ? `media#day#${day}` : `day#${day}`;
}

export interface BreakerState {
  tripped: boolean;
  count: number;
  threshold: number;
}

/**
 * Count this invocation against the daily total for `kind` and report
 * whether the breaker is now tripped. Call once, at the very start of a
 * turn / before issuing credentials.
 */
export async function countAndCheck(
  table: string,
  kind: BreakerKind,
  threshold: number,
): Promise<BreakerState> {
  const nowSec = Math.floor(Date.now() / 1000);
  const res = await ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: { pk: dayKey(kind) },
      UpdateExpression:
        "SET expiresAt = if_not_exists(expiresAt, :ttl) ADD requests :one",
      ExpressionAttributeValues: {
        ":ttl": nowSec + TTL_SECONDS,
        ":one": 1,
      },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  const count = Number(res.Attributes?.requests ?? 0);
  return { tripped: count > threshold, count, threshold };
}

/**
 * Fold this reasoning turn's token spend into the same daily item —
 * observability only, not the breaker metric (the breaker counts
 * invocations, matching the per-env `dailyCircuitBreakerThreshold` in
 * backend/infra/lib/config.ts). Best-effort: a failure here must not break
 * the response.
 */
export async function recordTokenSpend(
  table: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: table,
        Key: { pk: dayKey("reasoning") },
        UpdateExpression:
          "ADD inputTokens :i, outputTokens :o, modelCalls :c",
        ExpressionAttributeValues: { ":i": inputTokens, ":o": outputTokens, ":c": 1 },
      }),
    );
  } catch (err) {
    console.error("breaker.recordTokenSpend failed", err);
  }
}

/**
 * Note that a media-credential grant actually went out (the breaker check
 * passed and STS returned creds). Observability only — the refusal decision
 * is already made by `countAndCheck`. Best-effort.
 */
export async function recordMediaGrant(table: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: table,
        Key: { pk: dayKey("media") },
        UpdateExpression: "ADD grants :one",
        ExpressionAttributeValues: { ":one": 1 },
      }),
    );
  } catch (err) {
    console.error("breaker.recordMediaGrant failed", err);
  }
}
