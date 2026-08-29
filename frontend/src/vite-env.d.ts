/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Reasoning Lambda Function URL (docs/ARCHITECTURE.md § Real-time media
   * transport). Set per-branch in Amplify's env config. Unset → the agent
   * panel shows its "assistant unavailable" state and the manual portfolio
   * carries the experience (Phase 6 fallback).
   */
  readonly VITE_AGENT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
