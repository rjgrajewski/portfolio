/**
 * Real-time daily circuit-breaker (docs/ARCHITECTURE.md § Abuse protection
 * and cost control).
 *
 * This is the ONLY real cost backstop against deliberate abuse — the
 * per-session cap is keyed on a client-controlled id and does not bound it
 * (see sessionCap.ts). The breaker is keyed on total volume for the UTC day,
 * in a single hot DynamoDB item, checked synchronously at the start of every
 * reasoning invocation.
 *
 * Increment-then-check: the tripping request is itself counted and then
 * refused. That makes the decision race-free under concurrency (atomic ADD +
 * ReturnValues) at the cost of over-counting by at most the in-flight
 * concurrency — fine for a soft ceiling that sits well under the $25 budget.
 */

import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./ddb";

const TABLE = requireEnv("USAGE_COUNTERS_TABLE");
const THRESHOLD = Number(process.env.DAILY_BREAKER_THRESHOLD ?? "500");
const TTL_SECONDS = 3 * 24 * 60 * 60;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

/** `day#YYYY-MM-DD` in UTC. */
function dayKey(now = new Date()): string {
  return `day#${now.toISOString().slice(0, 10)}`;
}

export interface BreakerState {
  tripped: boolean;
  count: number;
  threshold: number;
}

/**
 * Count this invocation against the daily total and report whether the
 * breaker is now tripped. Call once, at the very start of a turn.
 */
export async function countInvocationAndCheck(): Promise<BreakerState> {
  const nowSec = Math.floor(Date.now() / 1000);
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: dayKey() },
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
  return { tripped: count > THRESHOLD, count, threshold: THRESHOLD };
}

/**
 * Fold this turn's token spend into the same daily item — observability
 * only, not the breaker metric (the breaker counts invocations, matching the
 * per-env `dailyCircuitBreakerThreshold` in backend/infra/lib/config.ts).
 * Best-effort: a failure here must not break the response.
 */
export async function recordTokenSpend(
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: dayKey() },
        UpdateExpression:
          "ADD inputTokens :i, outputTokens :o, modelCalls :c",
        ExpressionAttributeValues: {
          ":i": inputTokens,
          ":o": outputTokens,
          ":c": 1,
        },
      }),
    );
  } catch (err) {
    console.error("breaker.recordTokenSpend failed", err);
  }
}
