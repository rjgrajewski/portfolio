/**
 * Reasoning-path binding for the shared daily circuit-breaker
 * (backend/functions/shared/breaker.ts). Binds the env-configured table +
 * threshold and keeps the call sites in handler.ts unchanged.
 *
 * The breaker logic itself — atomic increment-then-check, the independent
 * media counter, TTL — lives in the shared module so the credential-vending
 * Lambda uses the exact same code (docs/ARCHITECTURE.md § Abuse protection).
 */

import {
  countAndCheck,
  recordTokenSpend as recordSpend,
  type BreakerState,
} from "../../shared/breaker";

const TABLE = requireEnv("USAGE_COUNTERS_TABLE");
const THRESHOLD = Number(process.env.DAILY_BREAKER_THRESHOLD ?? "500");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

export type { BreakerState };

/**
 * Count this reasoning invocation against the daily total and report
 * whether the breaker is now tripped. Call once, at the very start of a turn.
 */
export function countInvocationAndCheck(): Promise<BreakerState> {
  return countAndCheck(TABLE, "reasoning", THRESHOLD);
}

/**
 * Fold this turn's token spend into the same daily item — observability
 * only, not the breaker metric. Best-effort.
 */
export function recordTokenSpend(
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  return recordSpend(TABLE, inputTokens, outputTokens);
}
