/**
 * Reasoning-path binding for the shared in-function token bucket
 * (backend/functions/shared/tokenBucket.ts). Sized from env, one bucket per
 * warm container, `takeToken()` kept as the call site in handler.ts expects.
 */

import { createTokenBucket } from "../../shared/tokenBucket";

const bucket = createTokenBucket({
  capacity: Number(process.env.THROTTLE_BUCKET_CAPACITY ?? "5"),
  refillPerSec: Number(process.env.THROTTLE_REFILL_PER_SEC ?? "0.5"),
});

/** Take one token. Returns false if the bucket is empty (caller should
 *  refuse the request with a `throttled` error frame). */
export function takeToken(): boolean {
  return bucket.take();
}
