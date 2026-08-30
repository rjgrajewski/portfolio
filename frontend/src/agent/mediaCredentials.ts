/**
 * Fetches short-lived AWS credentials for the browser-direct media path
 * (docs/ARCHITECTURE.md § Real-time media transport, § Abuse protection —
 * the OQ-8 fix).
 *
 * The ONLY source of these credentials is the credential-vending Lambda
 * (backend/functions/credentials/), which checks the daily media
 * circuit-breaker before it will call `sts:AssumeRole`. There is no Cognito
 * Identity Pool and no unsigned path — see the identity-stack doc comment.
 *
 * Wire contract (buffered JSON, HTTP 200 for every expected outcome):
 *   { ok: true,  credentials: { accessKeyId, secretAccessKey, sessionToken,
 *                               expiration }, region }
 *   { ok: false, code: "media_breaker_tripped" | "media_throttled" |
 *                      "media_internal", message }
 *
 * Credentials are cached in memory and reused until ~2 min before they
 * expire (the STS floor is 15 min). Nothing is persisted.
 */

import { runtimeConfig } from "../config/runtime";

export type MediaCredentialCode =
  | "media_breaker_tripped"
  | "media_throttled"
  | "media_internal"
  | "network"
  | "not_configured";

export class MediaCredentialError extends Error {
  constructor(
    readonly code: MediaCredentialCode,
    message: string,
  ) {
    super(message);
    this.name = "MediaCredentialError";
  }
}

export interface MediaCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  /** ms epoch */
  expiration: number;
}

const RENEW_MARGIN_MS = 2 * 60 * 1000;

let cached: MediaCredentials | null = null;
let inFlight: Promise<MediaCredentials> | null = null;

function stillFresh(c: MediaCredentials | null): c is MediaCredentials {
  return c !== null && c.expiration - Date.now() > RENEW_MARGIN_MS;
}

async function vend(): Promise<MediaCredentials> {
  const url = runtimeConfig.credentialsUrl;
  if (!url) {
    throw new MediaCredentialError("not_configured", "Voice is not configured.");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  } catch {
    throw new MediaCredentialError(
      "network",
      "Couldn't reach the voice service.",
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new MediaCredentialError("media_internal", "Malformed voice response.");
  }

  const b = body as Record<string, unknown>;
  if (b.ok === true && b.credentials && typeof b.credentials === "object") {
    const c = b.credentials as Record<string, unknown>;
    if (
      typeof c.accessKeyId === "string" &&
      typeof c.secretAccessKey === "string" &&
      typeof c.sessionToken === "string" &&
      typeof c.expiration === "string"
    ) {
      return {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
        sessionToken: c.sessionToken,
        expiration: Date.parse(c.expiration),
      };
    }
    throw new MediaCredentialError("media_internal", "Incomplete credentials.");
  }

  const code =
    b.code === "media_breaker_tripped" ||
    b.code === "media_throttled" ||
    b.code === "media_internal"
      ? (b.code as MediaCredentialCode)
      : "media_internal";
  const message =
    typeof b.message === "string" ? b.message : "Voice is unavailable.";
  throw new MediaCredentialError(code, message);
}

/**
 * Return usable media credentials, from cache when fresh, otherwise vended.
 * Concurrent callers share one in-flight request. Throws
 * `MediaCredentialError` (never a bare Error) so the caller can route the
 * `code` through degradation.ts.
 */
export async function getMediaCredentials(): Promise<MediaCredentials> {
  if (stillFresh(cached)) return cached;
  if (inFlight) return inFlight;

  inFlight = vend()
    .then((c) => {
      cached = c;
      return c;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Drop the cache — call after a media call fails with an auth error, so the
 *  next attempt re-vends rather than reusing a bad set. */
export function clearMediaCredentials(): void {
  cached = null;
}
