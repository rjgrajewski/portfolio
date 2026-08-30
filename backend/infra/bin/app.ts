#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { getConfig } from "../lib/config";
import { GuardrailsStack } from "../lib/guardrails-stack";
import { ApiStack } from "../lib/api-stack";
import { IdentityStack } from "../lib/identity-stack";

const app = new App();

const envName = app.node.tryGetContext("env") ?? process.env.CDK_ENV ?? "dev";
const config = getConfig(envName);

const env = { account: config.account, region: config.region };

new GuardrailsStack(app, `portfolio-guardrails-${config.envName}`, { env });
new ApiStack(app, `portfolio-api-${config.envName}`, { env, config });
// Phase 4 — the media identity path (OQ-8). Reads the usage-counters table
// from the api stack by physical name, so deploy the api stack first.
new IdentityStack(app, `portfolio-identity-${config.envName}`, { env, config });
