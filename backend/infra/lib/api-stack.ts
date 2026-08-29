import * as path from "node:path";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  FunctionUrlAuthType,
  HttpMethod,
  InvokeMode,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { contentBucketName, EnvConfig } from "./config";

export interface ApiStackProps extends StackProps {
  readonly config: EnvConfig;
}

/**
 * The reasoning path (docs/ARCHITECTURE.md § Real-time media transport,
 * § Data stores, § Abuse protection, § Logging).
 *
 * Everything the Phase 2 agent MVP needs, in one stack:
 *   - three DynamoDB tables (on-demand, TTL, dev = DESTROY): `sessions`
 *     (per-session message cap), `usage-counters` (daily circuit-breaker),
 *     `conversation-logs` (content + timestamp, zero identity).
 *   - the S3 content bucket (`dev/` / `prod/` prefixes) — created now so
 *     scripts/sync-content.ts has a target; the Lambda still reads bundled
 *     content for Phase 2 (see CONTENT_BUCKET note below).
 *   - the reasoning Lambda (Node 20, Bedrock Haiku 4.5) behind a Function
 *     URL with `InvokeMode: RESPONSE_STREAM` — the only transport that
 *     satisfies Phase 2's streamed-transcript requirement. Throttling is a
 *     token bucket inside the function (a Function URL has no built-in
 *     throttling); CORS is on the Function URL directly.
 *
 * The repo layout doc anticipated a separate `agent-stack.ts` for the
 * tables + Lambda; folded into this stack for Phase 2 simplicity (one
 * deploy unit, one place to look). Split later if it grows. Recorded in
 * docs/DECISIONS.md.
 */
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config } = props;
    const env = config.envName;

    // --- DynamoDB (docs/ARCHITECTURE.md § Data stores) ---------------

    const sessionsTable = new Table(this, "SessionsTable", {
      tableName: `portfolio-sessions-${env}`,
      partitionKey: { name: "sessionId", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const usageCountersTable = new Table(this, "UsageCountersTable", {
      tableName: `portfolio-usage-counters-${env}`,
      partitionKey: { name: "pk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const conversationLogsTable = new Table(this, "ConversationLogsTable", {
      tableName: `portfolio-conversation-logs-${env}`,
      partitionKey: { name: "sessionId", type: AttributeType.STRING },
      sortKey: { name: "ts", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- S3 content bucket (docs/ARCHITECTURE.md § Data stores) -------

    const contentBucket = new Bucket(this, "ContentBucket", {
      bucketName: contentBucketName(env),
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- reasoning Lambda -------------------------------------------

    const contentDir = path.join(__dirname, "..", "..", "..", "content");
    const repoRoot = path.join(__dirname, "..", "..", "..");

    const agentFn = new NodejsFunction(this, "AgentFn", {
      functionName: `portfolio-agent-${env}`,
      // Lambda runtime (independent of the repo's Node 20 build tooling in
      // .nvmrc). 22.x is current; nodejs20.x is already flagged deprecated
      // in CDK. `awslambda.streamifyResponse` is available on both.
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(
        __dirname,
        "..",
        "..",
        "functions",
        "agent",
        "src",
        "handler.ts",
      ),
      handler: "handler",
      timeout: Duration.seconds(60),
      memorySize: 512,
      projectRoot: repoRoot,
      depsLockFilePath: path.join(repoRoot, "package-lock.json"),
      bundling: {
        // The Node 20 Lambda runtime ships the full AWS SDK v3 — do not
        // bundle it (smaller artifact, faster cold start). Everything in
        // backend/functions/agent/package.json is a devDependency for
        // exactly this reason.
        externalModules: ["@aws-sdk/*"],
        // Copy the knowledge corpus into the bundle so contentStore.ts can
        // read it from the local filesystem (docs/ARCHITECTURE.md
        // § Knowledge / content retrieval — "bundled with the Lambda for
        // the earliest MVP"). The S3 seam is a `CONTENT_BUCKET` env var away.
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_inputDir: string, outputDir: string) => [
            `cp -r "${contentDir}" "${path.join(outputDir, "content")}"`,
          ],
        },
      },
      environment: {
        BEDROCK_MODEL_ID: config.bedrockModelId,
        DAILY_BREAKER_THRESHOLD: String(config.dailyCircuitBreakerThreshold),
        SESSION_MESSAGE_CAP: String(config.sessionMessageCap),
        SESSIONS_TABLE: sessionsTable.tableName,
        USAGE_COUNTERS_TABLE: usageCountersTable.tableName,
        CONVERSATION_LOGS_TABLE: conversationLogsTable.tableName,
        CONTENT_PREFIX: `${env}/`,
        // CONTENT_BUCKET is intentionally unset for Phase 2 — the handler
        // reads the bundled copy above. To switch to S3: set this to
        // contentBucket.bucketName (grantRead below already covers it) and
        // run `npm run content:sync -- --env <env>`.
      },
    });

    sessionsTable.grantReadWriteData(agentFn);
    usageCountersTable.grantReadWriteData(agentFn);
    conversationLogsTable.grantReadWriteData(agentFn);
    contentBucket.grantRead(agentFn);

    // Bedrock: the model is reachable only through the EU inference profile
    // (docs/ARCHITECTURE.md § Reasoning). Invoking a profile also checks the
    // underlying foundation-model ARN in whichever region it routes to, so
    // both are granted; foundation-model ARNs carry no account id.
    const foundationModel = config.bedrockModelId.replace(/^eu\./, "");
    agentFn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:InvokeModel",
        ],
        resources: [
          `arn:aws:bedrock:*::foundation-model/${foundationModel}`,
          `arn:aws:bedrock:${config.region}:${config.account}:inference-profile/${config.bedrockModelId}`,
        ],
      }),
    );

    // --- Function URL: response streaming + CORS (no API Gateway) -----

    const fnUrl = agentFn.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      invokeMode: InvokeMode.RESPONSE_STREAM,
      cors: {
        allowedOrigins: config.allowedOrigins,
        allowedMethods: [HttpMethod.POST],
        allowedHeaders: ["content-type"],
        maxAge: Duration.hours(1),
      },
    });

    new CfnOutput(this, "AgentFunctionUrl", {
      value: fnUrl.url,
      description: "POST here from the frontend (VITE_AGENT_URL).",
    });
    new CfnOutput(this, "ContentBucketName", {
      value: contentBucket.bucketName,
      description: "Target for scripts/sync-content.ts.",
    });
  }
}
