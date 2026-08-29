/**
 * Per-session message cap (docs/ARCHITECTURE.md § Abuse protection and cost
 * control).
 *
 * NOT an abuse control. `sessionId` is generated client-side and a script (or
 * a visitor) can rotate it for free, so this does not bound deliberate abuse
 * — the circuit-breaker (breaker.ts) is what does. This is protection against
 * *accidental* overuse: a browser tab stuck in a retry loop, a runaway
 * effect. The count is checked against DynamoDB rather than trusted from the
 * client, but the identity being counted is still client-controlled.
 *
 * TTL auto-expires rows so the table stays small (docs/ARCHITECTURE.md
 * § Data stores: "TTL auto-expires rows (e.g. 24-48h)").
 */

import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./ddb";

const TABLE = requireEnv("SESSIONS_TABLE");
const CAP = Number(process.env.SESSION_MESSAGE_CAP ?? "20");
const TTL_SECONDS = 48 * 60 * 60;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

export interface SessionCapState {
  capped: boolean;
  count: number;
  cap: number;
}

/**
 * Count this message against the session and report whether the cap is now
 * exceeded. Call once per turn, after the breaker check.
 */
export async function countMessageAndCheck(
  sessionId: string,
): Promise<SessionCapState> {
  const nowSec = Math.floor(Date.now() / 1000);
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { sessionId },
      UpdateExpression:
        "SET lastSeenAt = :now, expiresAt = if_not_exists(expiresAt, :ttl) ADD messageCount :one",
      ExpressionAttributeValues: {
        ":now": new Date().toISOString(),
        ":ttl": nowSec + TTL_SECONDS,
        ":one": 1,
      },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  const count = Number(res.Attributes?.messageCount ?? 0);
  return { capped: count > CAP, count, cap: CAP };
}
