/**
 * A random, non-identifying session id (docs/ARCHITECTURE.md § Logging:
 * "random value with no link to a person").
 *
 * REGENERATED ON EVERY PAGE LOAD — held in memory only, not persisted.
 *
 * It keys the per-session message cap, which is explicitly NOT an abuse
 * control (docs/ARCHITECTURE.md § Abuse protection — the id is client-side
 * and rotates for free; the daily circuit-breaker is the real cost
 * backstop). The cap only exists to stop ONE stuck page view (a runaway
 * retry loop) from hammering the endpoint. Persisting the id across reloads
 * bought no security and made the "reload for a fresh conversation" copy a
 * lie — a reload kept the same id, so the cap stayed hit. One id per load
 * makes that copy true and never blocks a real visitor who just refreshes.
 */

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const SESSION_ID = makeId();

export function getSessionId(): string {
  return SESSION_ID;
}
