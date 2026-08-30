/**
 * Credential-vending endpoint (docs/ARCHITECTURE.md § Real-time media
 * transport, § Abuse protection and cost control — the fix for OQ-8).
 *
 * Why this exists instead of a Cognito Identity Pool: a Cognito guest role
 * is handed out by `GetId` + `GetCredentialsForIdentity`, which are
 * UNSIGNED calls that need nothing but the (public) pool id. There is no
 * hook to check a spend breaker before Cognito issues credentials, so any
 * script could pull Polly/Transcribe creds without ever loading the page
 * and with no server-side quota on that path at all. Polly generative runs
 * ~$30 / 1M characters — a real way to blow the ~$25/month ceiling.
 *
 * This Lambda is the ONLY way to obtain media credentials. It:
 *   1. takes a per-container token-bucket token (one hot client bound),
 *   2. counts the request against the daily MEDIA circuit-breaker — a
 *      counter INDEPENDENT of the reasoning breaker, so voice abuse can't
 *      disable the text agent or vice versa,
 *   3. only then calls `sts:AssumeRole` on `portfolio-media-guest-<env>`,
 *      a role scoped to exactly `polly:SynthesizeSpeech` and
 *      `transcribe:StartStreamTranscription` and nothing else,
 *   4. returns short-lived credentials (900s — the STS AssumeRole floor;
 *      see docs/DECISIONS.md for why the minimum is the right choice).
 *
 * When the breaker is tripped it returns a readable code and issues NO
 * credentials. The frontend maps that code through
 * frontend/src/agent/degradation.ts to a voice-off / text-still-works state.
 *
 * Wire contract (buffered JSON, HTTP 200 for every expected outcome — a
 * 4xx is only ever a malformed request, mirroring the reasoning path's
 * "terminal error frame at HTTP 200" rule):
 *   success  → { "ok": true, "credentials": { accessKeyId, secretAccessKey,
 *                sessionToken, expiration }, "region": "<region>" }
 *   refusal  → { "ok": false, "code": "media_breaker_tripped" |
 *                "media_throttled" | "media_internal", "message": "<text>" }
 */

import { randomUUID } from "node:crypto";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";

import { countAndCheck, recordMediaGrant } from "../../shared/breaker";
import { createTokenBucket } from "../../shared/tokenBucket";

const USAGE_COUNTERS_TABLE = requireEnv("USAGE_COUNTERS_TABLE");
const MEDIA_GUEST_ROLE_ARN = requireEnv("MEDIA_GUEST_ROLE_ARN");
const MEDIA_BREAKER_THRESHOLD = Number(
  process.env.MEDIA_BREAKER_THRESHOLD ?? "100",
);
const CREDENTIAL_TTL_SECONDS = Number(
  process.env.CREDENTIAL_TTL_SECONDS ?? "900",
);
const REGION = process.env.AWS_REGION ?? "eu-central-1";

const sts = new STSClient({});

const bucket = createTokenBucket({
  capacity: Number(process.env.THROTTLE_BUCKET_CAPACITY ?? "5"),
  refillPerSec: Number(process.env.THROTTLE_REFILL_PER_SEC ?? "0.5"),
});

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

// --- Function URL event / result shapes --------------------------------

interface FunctionUrlEvent {
  requestContext?: { http?: { method?: string } };
  body?: string;
  isBase64Encoded?: boolean;
}

interface FunctionUrlResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

type RefusalCode = "media_breaker_tripped" | "media_throttled" | "media_internal";

const JSON_HEADERS = { "content-type": "application/json" } as const;

function ok(payload: unknown): FunctionUrlResult {
  return { statusCode: 200, headers: { ...JSON_HEADERS }, body: JSON.stringify(payload) };
}

function refuse(code: RefusalCode, message: string): FunctionUrlResult {
  // HTTP 200 on purpose — the browser reads `code`, exactly like the
  // reasoning stream's in-band error frame.
  return ok({ ok: false, code, message });
}

// --- handler ----------------------------------------------------------

export async function handler(
  event: FunctionUrlEvent,
): Promise<FunctionUrlResult> {
  const method = event.requestContext?.http?.method ?? "GET";
  if (method !== "POST") {
    return {
      statusCode: 405,
      headers: { ...JSON_HEADERS },
      body: JSON.stringify({ ok: false, code: "method_not_allowed" }),
    };
  }

  try {
    if (!bucket.take()) {
      return refuse(
        "media_throttled",
        "Voice is warming up — give it a few seconds and press the mic again.",
      );
    }

    const breaker = await countAndCheck(
      USAGE_COUNTERS_TABLE,
      "media",
      MEDIA_BREAKER_THRESHOLD,
    );
    if (breaker.tripped) {
      console.warn(
        `media breaker tripped: ${breaker.count}/${breaker.threshold} grants today`,
      );
      return refuse(
        "media_breaker_tripped",
        "Voice has reached today's usage limit and is paused. You can keep asking in text.",
      );
    }

    const assumed = await sts.send(
      new AssumeRoleCommand({
        RoleArn: MEDIA_GUEST_ROLE_ARN,
        RoleSessionName: `media-${randomUUID().slice(0, 24)}`,
        DurationSeconds: CREDENTIAL_TTL_SECONDS,
      }),
    );

    const c = assumed.Credentials;
    if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken || !c.Expiration) {
      console.error("AssumeRole returned incomplete credentials", assumed);
      return refuse("media_internal", "Couldn't start voice just now. Text still works.");
    }

    // Observability only — the refusal decision is already made above.
    await recordMediaGrant(USAGE_COUNTERS_TABLE);

    return ok({
      ok: true,
      credentials: {
        accessKeyId: c.AccessKeyId,
        secretAccessKey: c.SecretAccessKey,
        sessionToken: c.SessionToken,
        expiration: c.Expiration.toISOString(),
      },
      region: REGION,
    });
  } catch (err) {
    console.error("credentials handler error", err);
    return refuse("media_internal", "Couldn't start voice just now. Text still works.");
  }
}
