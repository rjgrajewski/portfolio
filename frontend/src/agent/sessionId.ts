/**
 * A random, non-identifying session id (docs/ARCHITECTURE.md § Logging:
 * "random value with no link to a person"). Held in `sessionStorage` so it
 * survives reloads within a tab but a fresh tab / session starts clean —
 * which also resets the per-session message cap (that cap is UX, not a
 * security boundary; see docs/ARCHITECTURE.md § Abuse protection).
 */

const KEY = "portfolio.agent.sessionId";

export function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private mode / storage disabled — a per-call id is fine.
    return crypto.randomUUID();
  }
}
