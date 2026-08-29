/**
 * Per-env (dev/prod) configuration for the CDK app.
 * See docs/ARCHITECTURE.md § Dev / prod separation.
 */

export type EnvName = "dev" | "prod";

export interface EnvConfig {
  readonly envName: EnvName;
  readonly account: string;
  readonly region: string;

  /**
   * Bedrock model ID for reasoning (docs/ARCHITECTURE.md § Reasoning).
   *
   * Must be the EU cross-region inference-profile form (`eu.*`) — confirmed
   * in Phase 0 as the *only* working form for Claude Haiku 4.5 in this
   * region. The direct in-region ID (`anthropic.claude-haiku-4-5-...`)
   * fails with ValidationException; `global.*` also fails (separate
   * Anthropic use-case form required). If this is ever switched to Sonnet
   * (the documented fallback), re-verify the same way before assuming the
   * `eu.*` form carries over — don't assume, check.
   */
  readonly bedrockModelId: string;

  /**
   * Real-time daily circuit-breaker threshold (docs/ARCHITECTURE.md
   * § Abuse protection and cost control) — number of reasoning invocations
   * allowed per UTC day before the agent degrades to text-only / disables.
   * Deliberately a config value, not a hardcoded constant in the breaker
   * logic itself: prod must be set high enough that it cannot trip mid-demo
   * (see docs/ROADMAP.md § Tuesday demo minimum bar, Monday dry-run check),
   * while dev can stay tight since it's disposable.
   *
   * TODO(Phase 2): tune both values against scripts/estimate-cost.ts once
   * the Phase 2 reasoning Lambda exists and real per-exchange cost is known.
   */
  readonly dailyCircuitBreakerThreshold: number;
}

const dev: EnvConfig = {
  envName: "dev",
  account: "776715560866",
  region: "eu-central-1",
  bedrockModelId: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
  dailyCircuitBreakerThreshold: 200,
};

const prod: EnvConfig = {
  ...dev,
  envName: "prod",
  // Higher than dev on purpose — see the Monday dry-run check in
  // docs/ROADMAP.md: this must not trip during the actual interview demo.
  dailyCircuitBreakerThreshold: 500,
};

const configs: Record<EnvName, EnvConfig> = { dev, prod };

export function getConfig(envName: unknown): EnvConfig {
  if (envName !== "dev" && envName !== "prod") {
    throw new Error(
      `Unknown environment "${String(envName)}" — expected "dev" or "prod" ` +
        `(pass via --context env=dev|prod).`,
    );
  }
  return configs[envName];
}
