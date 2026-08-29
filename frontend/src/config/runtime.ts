/**
 * Runtime configuration from build-time env (docs/ARCHITECTURE.md
 * § Repository layout — `config/runtime.ts`: "API base URL, region, identity
 * pool id — from env"). Phase 2 only needs the reasoning endpoint.
 */

const rawAgentUrl = import.meta.env.VITE_AGENT_URL?.trim();

export const runtimeConfig = {
  /** Reasoning Lambda Function URL, or null when the backend isn't wired. */
  agentUrl: rawAgentUrl && rawAgentUrl.length > 0 ? rawAgentUrl : null,
} as const;

export const isAgentConfigured = runtimeConfig.agentUrl !== null;
