/**
 * scripts/verify-oq8.ts
 *
 * Regression guard for OQ-8 — the media credential path
 * (docs/ARCHITECTURE.md § Abuse protection and cost control).
 *
 * The first OQ-8 verification (ad-hoc, 2026-08-30) proved the SECURITY
 * properties correctly — no unsigned path, no AssumeRole bypass, everything
 * outside the two actions denied — but its FUNCTIONAL check exercised the
 * Node HTTP/2 action `transcribe:StartStreamTranscription`, while the
 * browser reaches Transcribe streaming over a presigned WebSocket, which is
 * the SEPARATE IAM action `transcribe:StartStreamTranscriptionWebSocket`.
 * The guest role only had the former, so voice worked in the Node test and
 * failed in the browser. Lesson recorded in docs/DECISIONS.md.
 *
 * This script tests the actions the BROWSER actually uses, plus the
 * security properties, headlessly:
 *
 *   1. the vending Lambda issues short-lived creds (~15 min TTL);
 *   2. IAM policy simulation: the browser's two actions
 *      (`transcribe:StartStreamTranscriptionWebSocket`,
 *      `polly:SynthesizeSpeech`) are ALLOWED, and a broad denylist —
 *      including the Node HTTP/2 `transcribe:StartStreamTranscription`
 *      that is deliberately NOT granted — is denied;
 *   3. a real `polly:SynthesizeSpeech` call with the vended creds succeeds
 *      (Polly has no transport split, so this is the real browser call),
 *      and a real `polly:DescribeVoices` is AccessDenied;
 *   4. a direct `sts:AssumeRole` of the guest role, as full account admin,
 *      is AccessDenied — there is no path to these creds except the Lambda;
 *   5. with the media breaker tripped the endpoint refuses and issues NO
 *      credentials.
 *
 * The end-to-end spoken WebSocket round-trip can only be exercised from a
 * real browser (the SDK's WebSocket transport isn't reachable from raw
 * Node) — that is verified on live staging. Step 2 is IAM's own
 * authoritative answer to "will the browser's call be authorized".
 *
 * Run: AWS_PROFILE=portfolio npm run verify-oq8
 */

import { execFileSync } from "node:child_process";
import {
  DescribeVoicesCommand,
  PollyClient,
  SynthesizeSpeechCommand,
} from "@aws-sdk/client-polly";

const ENV = process.env.OQ8_ENV ?? "dev";
const REGION = "eu-central-1";
const ACCOUNT = "776715560866";
const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/portfolio-media-guest-${ENV}`;
const FN = `portfolio-credentials-${ENV}`;
const STACK = `portfolio-identity-${ENV}`;

const BROWSER_ACTIONS = [
  "transcribe:StartStreamTranscriptionWebSocket", // browser STT transport
  "polly:SynthesizeSpeech", // browser TTS
];
const MUST_DENY = [
  "transcribe:StartStreamTranscription", // Node HTTP/2 form — deliberately NOT granted
  "transcribe:StartTranscriptionJob",
  "transcribe:StartMedicalStreamTranscription",
  "transcribe:StartCallAnalyticsStreamTranscription",
  "polly:StartSpeechSynthesisTask",
  "polly:DescribeVoices",
  "polly:GetLexicon",
  "polly:PutLexicon",
  "s3:GetObject",
  "s3:PutObject",
  "dynamodb:GetItem",
  "dynamodb:UpdateItem",
  "bedrock:InvokeModel",
  "bedrock:InvokeModelWithResponseStream",
  "sts:AssumeRole",
  "iam:PassRole",
];

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}
const checks: Check[] = [];
function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
}

function aws(args: string[]): string {
  return execFileSync("aws", [...args, "--region", REGION, "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function main(): Promise<void> {
  // Resolve the vending Function URL from the stack output.
  const outs = JSON.parse(
    aws([
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      STACK,
      "--query",
      "Stacks[0].Outputs",
    ]),
  ) as { OutputKey: string; OutputValue: string }[];
  const credUrl = outs.find(
    (o) => o.OutputKey === "CredentialsFunctionUrl",
  )?.OutputValue;
  if (!credUrl) throw new Error(`no CredentialsFunctionUrl on ${STACK}`);

  // --- 1. vend -------------------------------------------------------
  const vend = await (
    await fetch(credUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
  ).json();
  const creds = vend?.credentials;
  const ttlMin = creds?.expiration
    ? (Date.parse(creds.expiration) - Date.now()) / 60000
    : 0;
  record(
    "vending Lambda issues short-lived credentials",
    vend?.ok === true && !!creds?.sessionToken && ttlMin > 10 && ttlMin < 20,
    `ok=${vend?.ok}, TTL≈${ttlMin.toFixed(1)} min`,
  );

  // --- 2. IAM policy simulation (browser actions) ------------------
  const sim = (actions: string[]) =>
    JSON.parse(
      aws([
        "iam",
        "simulate-principal-policy",
        "--policy-source-arn",
        ROLE_ARN,
        "--action-names",
        ...actions,
        "--query",
        "EvaluationResults[].{a:EvalActionName,d:EvalDecision}",
      ]),
    ) as { a: string; d: string }[];

  const allowRes = sim(BROWSER_ACTIONS);
  const allowMissing = BROWSER_ACTIONS.filter(
    (a) => allowRes.find((r) => r.a === a)?.d !== "allowed",
  );
  record(
    "browser actions ALLOWED (StartStreamTranscriptionWebSocket + SynthesizeSpeech)",
    allowMissing.length === 0,
    allowMissing.length === 0
      ? allowRes.map((r) => `${r.a}=${r.d}`).join(", ")
      : `not allowed: ${allowMissing.join(", ")}`,
  );

  const denyRes = sim(MUST_DENY);
  const leaked = denyRes.filter((r) => r.d === "allowed").map((r) => r.a);
  record(
    "everything else DENIED (incl. Node HTTP/2 transcribe:StartStreamTranscription)",
    leaked.length === 0,
    leaked.length === 0
      ? `${denyRes.length} actions, all denied`
      : `LEAKED: ${leaked.join(", ")}`,
  );

  // --- 3. real calls with the vended creds ------------------------
  const polly = new PollyClient({
    region: REGION,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
  try {
    const r = await polly.send(
      new SynthesizeSpeechCommand({
        Engine: "generative",
        VoiceId: "Ruth",
        OutputFormat: "mp3",
        Text: "Scope check.",
      }),
    );
    const bytes = await r.AudioStream?.transformToByteArray();
    record(
      "real polly:SynthesizeSpeech with vended creds succeeds",
      !!bytes && bytes.length > 0,
      `${bytes?.length ?? 0} bytes of audio`,
    );
  } catch (err) {
    record(
      "real polly:SynthesizeSpeech with vended creds succeeds",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
  try {
    await polly.send(new DescribeVoicesCommand({}));
    record("real polly:DescribeVoices with vended creds is denied", false, "call SUCCEEDED — scope too wide");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record(
      "real polly:DescribeVoices with vended creds is denied",
      /AccessDenied|not authorized/i.test(msg),
      msg.split("\n")[0],
    );
  }

  // --- 4. no AssumeRole bypass (as account admin) ----------------
  let bypass = "assume-role unexpectedly SUCCEEDED";
  let bypassBlocked = false;
  try {
    aws([
      "sts",
      "assume-role",
      "--role-arn",
      ROLE_ARN,
      "--role-session-name",
      "verify-oq8-bypass",
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    bypassBlocked = /AccessDenied|not authorized to perform: sts:AssumeRole/i.test(msg);
    bypass = msg.split("\n").find((l) => /AccessDenied/i.test(l)) ?? "denied";
  }
  record("direct sts:AssumeRole of the guest role (as admin) is denied", bypassBlocked, bypass);

  // --- 5. breaker refuses + issues nothing ----------------------
  const cfg = JSON.parse(
    aws([
      "lambda",
      "get-function-configuration",
      "--function-name",
      FN,
      "--query",
      "Environment.Variables",
    ]),
  ) as Record<string, string>;
  const originalThreshold = cfg.MEDIA_BREAKER_THRESHOLD;

  const setThreshold = (value: string): void => {
    const vars = { ...cfg, MEDIA_BREAKER_THRESHOLD: value };
    const kv = Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    aws([
      "lambda",
      "update-function-configuration",
      "--function-name",
      FN,
      "--environment",
      `Variables={${kv}}`,
    ]);
    execFileSync("aws", [
      "lambda",
      "wait",
      "function-updated",
      "--function-name",
      FN,
      "--region",
      REGION,
    ]);
  };

  try {
    setThreshold("0");
    const tripped = await (
      await fetch(credUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ).json();
    record(
      "media breaker tripped → refusal code + NO credentials",
      tripped?.ok === false &&
        tripped?.code === "media_breaker_tripped" &&
        tripped?.credentials === undefined,
      `ok=${tripped?.ok}, code=${tripped?.code}, hasCreds=${!!tripped?.credentials}`,
    );
  } finally {
    setThreshold(originalThreshold);
  }
  const restored = await (
    await fetch(credUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
  ).json();
  record(
    "breaker restored → credentials flow again",
    restored?.ok === true && !!restored?.credentials,
    `ok=${restored?.ok}`,
  );

  // --- report -----------------------------------------------------
  console.log(`\nOQ-8 verification — env=${ENV}\n`);
  for (const c of checks) {
    console.log(`${c.ok ? "✅ PASS" : "❌ FAIL"}  ${c.name}\n           ${c.detail}`);
  }
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  console.log(
    "\nNote: the end-to-end spoken WebSocket round-trip is browser-only and is\n" +
      "verified on live staging. Check 2 is IAM's authoritative decision on the\n" +
      "browser's actual action (transcribe:StartStreamTranscriptionWebSocket).",
  );
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
