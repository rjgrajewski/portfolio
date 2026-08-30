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
 *
 * A factory rather than module state so both Lambdas get an independent
 * bucket sized for their own path (the reasoning function and the
 * credential-vending function each call `createTokenBucket` once at module
 * load).
 */

export interface TokenBucket {
  /** Take one token. Returns false if the bucket is empty (caller should
   *  refuse the request — `throttled`). */
  take(): boolean;
}

export function createTokenBucket(opts: {
  capacity: number;
  refillPerSec: number;
}): TokenBucket {
  const { capacity, refillPerSec } = opts;
  let tokens = capacity;
  let lastRefill = Date.now();

  return {
    take(): boolean {
      const now = Date.now();
      tokens = Math.min(
        capacity,
        tokens + ((now - lastRefill) / 1000) * refillPerSec,
      );
      lastRefill = now;

      if (tokens >= 1) {
        tokens -= 1;
        return true;
      }
      return false;
    },
  };
}
