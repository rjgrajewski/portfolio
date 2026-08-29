import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { EnvConfig } from "./config";

export interface ApiStackProps extends StackProps {
  readonly config: EnvConfig;
}

/**
 * Skeleton for the reasoning path's Lambda Function URL.
 *
 * Decided (docs/ARCHITECTURE.md § Real-time media transport): a Lambda
 * Function URL with response streaming (`InvokeMode: RESPONSE_STREAM`), not
 * API Gateway — API Gateway REST buffers the full response before returning
 * it, and HTTP API doesn't support response streaming either, so a Function
 * URL is the only option that satisfies Phase 2's streamed-transcript
 * requirement.
 *
 * No Lambda code exists yet (backend/functions/agent/src/handler.ts is
 * Phase 2 scope), so there is nothing to attach a Function URL to. This
 * stack is intentionally empty until then.
 *
 * TODO(Phase 2), once the handler exists:
 *   - the reasoning Lambda (aws-lambda-nodejs.NodejsFunction)
 *   - fn.addFunctionUrl({
 *       authType: FunctionUrlAuthType.NONE,
 *       invokeMode: InvokeMode.RESPONSE_STREAM,
 *       cors: { allowedOrigins: [...], allowedMethods: [HttpMethod.POST] },
 *     })
 *   - the in-function token-bucket throttle — a Function URL has no built-in
 *     throttling/usage-plans (see docs/ARCHITECTURE.md § Abuse protection)
 */
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    // Intentionally empty — see class doc comment above.
    void props.config; // referenced once real resources land in Phase 2
  }
}
