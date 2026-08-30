/**
 * Runtime configuration from build-time env (docs/ARCHITECTURE.md
 * § Repository layout — `config/runtime.ts`).
 *
 *   - VITE_AGENT_URL        — reasoning Lambda Function URL (Phase 2).
 *   - VITE_CREDENTIALS_URL  — credential-vending Lambda Function URL
 *     (Phase 4 / OQ-8). Unset → voice is simply not offered; text is
 *     unaffected. It is never a hard dependency of the app.
 *
 * Region is fixed (`eu-central-1`, docs/ARCHITECTURE.md § Region) — the
 * media SDK clients need it and it never varies per env.
 */

const rawAgentUrl = import.meta.env.VITE_AGENT_URL?.trim();
const rawCredentialsUrl = import.meta.env.VITE_CREDENTIALS_URL?.trim();

export const runtimeConfig = {
  /** Reasoning Lambda Function URL, or null when the backend isn't wired. */
  agentUrl: rawAgentUrl && rawAgentUrl.length > 0 ? rawAgentUrl : null,
  /** Credential-vending Function URL, or null when voice isn't wired. */
  credentialsUrl:
    rawCredentialsUrl && rawCredentialsUrl.length > 0 ? rawCredentialsUrl : null,
  /** AWS region for the browser-direct Polly / Transcribe clients. */
  mediaRegion: "eu-central-1",
} as const;

export const isAgentConfigured = runtimeConfig.agentUrl !== null;
export const isVoiceConfigured = runtimeConfig.credentialsUrl !== null;
