/**
 * In-function request throttle (docs/ARCHITECTURE.md § Abuse protection):
 * a Lambda Function URL has no built-in throttling / usage plans, so it
 * lives here as a token bucket.
 *
 * Scope and limits, stated plainly:
 *   - Per warm container. It does not coordinate across concurrent Lambda
 *     containers, and it resets on cold start.
 *   - It exists to stop ONE hot client (a tab in a tight retry loop) from
 *     hammering a single container. The cross-invocation cost bound is the
 *     circuit-breaker (breaker.ts), not this.
 */

const CAPACITY = Number(process.env.THROTTLE_BUCKET_CAPACITY ?? "5");
const REFILL_PER_SEC = Number(process.env.THROTTLE_REFILL_PER_SEC ?? "0.5");

let tokens = CAPACITY;
let lastRefill = Date.now();

/** Take one token. Returns false if the bucket is empty (caller should
 *  refuse the request with a `throttled` error frame). */
export function takeToken(): boolean {
  const now = Date.now();
  tokens = Math.min(
    CAPACITY,
    tokens + ((now - lastRefill) / 1000) * REFILL_PER_SEC,
  );
  lastRefill = now;

  if (tokens >= 1) {
    tokens -= 1;
    return true;
  }
  return false;
}
