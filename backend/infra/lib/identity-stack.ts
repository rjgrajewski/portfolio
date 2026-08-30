import * as path from "node:path";
import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Effect, PolicyStatement, Role } from "aws-cdk-lib/aws-iam";
import {
  FunctionUrlAuthType,
  HttpMethod,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { EnvConfig } from "./config";

export interface IdentityStackProps extends StackProps {
  readonly config: EnvConfig;
}

/**
 * The media identity path (docs/ARCHITECTURE.md § Real-time media transport,
 * § Abuse protection and cost control) — the resolution of OQ-8.
 *
 * NO Cognito Identity Pool. A Cognito guest role is handed out by `GetId` +
 * `GetCredentialsForIdentity`, which are UNSIGNED calls needing only the
 * (public) pool id — there is no point at which a spend breaker can be
 * checked before Cognito issues credentials, so any script could pull
 * Polly/Transcribe creds without loading the page and with no server-side
 * quota on that path. Disabling unauthenticated identities would force real
 * login, which the product rules out. Cognito therefore cannot close OQ-8;
 * this stack takes the documented alternative instead: a breaker-checked
 * credential-vending Lambda that calls `sts:AssumeRole` itself.
 *
 * Contents:
 *   - `portfolio-media-guest-<env>` — an IAM role scoped to EXACTLY the two
 *     actions the browser makes with these credentials:
 *     `polly:SynthesizeSpeech` and
 *     `transcribe:StartStreamTranscriptionWebSocket` (the WebSocket form,
 *     NOT the HTTP/2 `StartStreamTranscription` — see the policy comment
 *     below). Nothing else. Its trust policy names one principal: the
 *     credential-vending Lambda's execution role. Nothing else can assume
 *     it — there is no unsigned path to these credentials.
 *   - `portfolio-credentials-<env>` — the only way to obtain those
 *     credentials. Token bucket → daily MEDIA circuit-breaker (a counter
 *     INDEPENDENT of the reasoning breaker, in the same `usage-counters`
 *     table) → `sts:AssumeRole` with a 900s TTL (the STS floor). Breaker
 *     tripped → a readable refusal code, no credentials issued.
 *
 * Cross-stack coupling is by physical name only: this stack reads the
 * `usage-counters` table created by `portfolio-api-<env>` via
 * `Table.fromTableName` (no CloudFormation import, no deploy-order lock
 * beyond "api stack exists first", which it always does by Phase 4).
 */
export class IdentityStack extends Stack {
  constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, props);

    const { config } = props;
    const env = config.envName;
    const repoRoot = path.join(__dirname, "..", "..", "..");

    // Deterministic ARN for the guest role, built as a string so the Lambda
    // can carry it in an env var + IAM grant without a construct reference
    // to the Role below (the Role's trust policy references the Lambda, so
    // referencing it back here would be a dependency cycle).
    const mediaGuestRoleName = `portfolio-media-guest-${env}`;
    const mediaGuestRoleArn = `arn:aws:iam::${config.account}:role/${mediaGuestRoleName}`;

    // --- credential-vending Lambda --------------------------------------

    const credentialsFn = new NodejsFunction(this, "CredentialsFn", {
      functionName: `portfolio-credentials-${env}`,
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(
        __dirname,
        "..",
        "..",
        "functions",
        "credentials",
        "src",
        "handler.ts",
      ),
      handler: "handler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      projectRoot: repoRoot,
      depsLockFilePath: path.join(repoRoot, "package-lock.json"),
      bundling: {
        // The Node 22 Lambda runtime ships AWS SDK v3 — don't bundle it.
        // Everything in backend/functions/credentials/package.json is a
        // devDependency for exactly this reason.
        externalModules: ["@aws-sdk/*"],
      },
      environment: {
        USAGE_COUNTERS_TABLE: `portfolio-usage-counters-${env}`,
        MEDIA_GUEST_ROLE_ARN: mediaGuestRoleArn,
        MEDIA_BREAKER_THRESHOLD: String(config.mediaBreakerThreshold),
      },
    });

    // usage-counters, shared physically with portfolio-api-<env>. The
    // Lambda does an atomic ADD (UpdateItem) on the media breaker item.
    Table.fromTableName(
      this,
      "UsageCountersTable",
      `portfolio-usage-counters-${env}`,
    ).grantReadWriteData(credentialsFn);

    // --- the scoped guest role ---------------------------------------

    const mediaGuestRole = new Role(this, "MediaGuestRole", {
      roleName: mediaGuestRoleName,
      description:
        "Assumed ONLY by portfolio-credentials-<env>. Scoped to exactly " +
        "polly:SynthesizeSpeech + transcribe:StartStreamTranscriptionWebSocket " +
        "(the browser's real calls). See docs/ARCHITECTURE.md § Abuse " +
        "protection (OQ-8).",
      // Trust: exactly the credential-vending Lambda's execution role.
      assumedBy: credentialsFn.role!,
      // AssumeRole DurationSeconds (900s) is well under the 3600s default
      // ceiling, so it is left at the default.
    });

    mediaGuestRole.addToPolicy(
      new PolicyStatement({
        sid: "MediaGuestBrowserSpeechOnly",
        effect: Effect.ALLOW,
        actions: [
          // Browser TTS (frontend/src/agent/tts.ts) — a plain SigV4 POST.
          // No WebSocket/streaming IAM variant; the generative engine is a
          // request parameter, not a separate action.
          "polly:SynthesizeSpeech",
          // Browser STT (frontend/src/agent/stt.ts) — the JS SDK reaches
          // Transcribe streaming over a PRESIGNED WEBSOCKET, which is a
          // SEPARATE IAM action from the HTTP/2 `transcribe:StartStream-
          // Transcription` the Node SDK uses. These credentials are ONLY
          // ever used from the browser (the whole media path is
          // browser-direct), so only the WebSocket form is granted and the
          // HTTP/2 form is deliberately withheld — the scope matches
          // exactly what runs. (Missed in the first OQ-8 pass because the
          // functional check exercised the Node HTTP/2 action; see
          // docs/DECISIONS.md and scripts/verify-oq8.ts.)
          "transcribe:StartStreamTranscriptionWebSocket",
        ],
        // Neither action supports resource-level permissions; "*" is the
        // only valid resource. The scope is the action list itself.
        resources: ["*"],
      }),
    );

    // Lambda side of the trust: permission to assume exactly that role.
    credentialsFn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["sts:AssumeRole"],
        resources: [mediaGuestRoleArn],
      }),
    );

    // --- Function URL: buffered JSON + CORS (no API Gateway) ---------

    const fnUrl = credentialsFn.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: config.allowedOrigins,
        allowedMethods: [HttpMethod.POST],
        allowedHeaders: ["content-type"],
        maxAge: Duration.hours(1),
      },
    });

    new CfnOutput(this, "CredentialsFunctionUrl", {
      value: fnUrl.url,
      description: "POST here from the frontend (VITE_CREDENTIALS_URL).",
    });
    new CfnOutput(this, "MediaGuestRoleArn", {
      value: mediaGuestRole.roleArn,
      description: "Scoped Polly/Transcribe role — assumable only by the vending Lambda.",
    });
  }
}
