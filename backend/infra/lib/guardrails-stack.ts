import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

/**
 * Deliberately empty for Phase 0.
 *
 * The two guardrails originally sketched for this stack — the AWS Budgets
 * and the SNS alert topic — already exist:
 *
 *  - AWS Budgets `portfolio-monthly-gross-usd25` (the real cost ceiling) and
 *    `portfolio-monthly-net-usd25` (the "credits are running out" signal),
 *    created by hand via the AWS CLI.
 *  - SNS topic `portfolio-billing-alerts` in us-east-1, with a confirmed
 *    email subscription, also created by hand via the AWS CLI.
 *
 * This stack MUST NOT recreate or duplicate either. Reasons:
 *
 *  - AWS Budgets: every account gets 2 free budgets, and both slots are
 *    already used by the two above. Any additional budget is a recurring
 *    ~$0.60/month, and a `cdk deploy` / `cdk destroy` cycle risks deleting
 *    and recreating (or tripling) them by accident.
 *  - SNS topic: redeclaring `portfolio-billing-alerts` in CDK risks a naming
 *    collision with the existing one, or an orphaned duplicate topic with no
 *    confirmed subscriber.
 *
 * Full reasoning: docs/ARCHITECTURE.md § Abuse protection and cost control.
 * Decision log: docs/DECISIONS.md (2026-08-29).
 *
 * Kept in the tree (not deleted) as the documented home for a genuinely new,
 * non-budget, non-SNS guardrail resource later — e.g. a WAF web ACL if real
 * abuse appears post-launch (OQ-9), or something reacting to the DynamoDB
 * circuit-breaker counter once it exists (Phase 2). TODO: add resources here
 * only when an actual need arises — do not pre-build for it now.
 */
export class GuardrailsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    // Intentionally empty — see class doc comment above.
  }
}
