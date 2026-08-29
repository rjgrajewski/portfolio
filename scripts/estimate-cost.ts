/**
 * scripts/estimate-cost.ts
 *
 * Skeleton token-math model for the ~$25/month (100 PLN) cost ceiling
 * (docs/ARCHITECTURE.md § Cost ceiling — hard constraint). This is a rough
 * planning calculator, not a live cost tracker — it exists to sanity-check
 * assumptions against the ceiling as the expected question mix and real
 * usage patterns firm up.
 *
 * Usage:
 *   npm run estimate-cost
 *
 * TODO(Phase 2+): replace the ASSUMPTIONS block below with real numbers once
 * there's actual dev/prod usage data — see docs/ROADMAP.md § Phase 10, final
 * cost review against real usage.
 */

const ASSUMPTIONS = {
  // Traffic — matches the "Measured cost comparison" baseline in
  // docs/ARCHITECTURE.md § Knowledge / content retrieval.
  busyHoursPerMonth: 20,
  exchangesPerBusyHour: 20,

  // Bedrock — Claude Haiku 4.5 pricing (docs/ARCHITECTURE.md § Reasoning).
  bedrockInputPricePerMillionTokens: 1,
  bedrockOutputPricePerMillionTokens: 5,
  // Option C (hybrid tool-fetch) per-exchange profile —
  // docs/ARCHITECTURE.md § Knowledge / content retrieval.
  avgInputTokensPerExchange: 6000,
  avgOutputTokensPerExchange: 300,

  // Polly generative TTS — ~$30 per 1M characters
  // (docs/ARCHITECTURE.md § Abuse protection, OQ-8).
  pollyPricePerMillionChars: 30,
  avgAnswerCharsPerExchange: 400,
  // Fraction of exchanges assumed to use voice rather than text-only.
  voiceExchangeShare: 0.5,

  // Transcribe streaming — published general streaming rate; NOT yet
  // confirmed for Frankfurt specifically.
  // TODO(Phase 4): confirm the actual eu-central-1 streaming rate before
  // relying on this number for a real budget decision.
  transcribePricePerMinute: 0.024,
  avgQuestionSecondsPerExchange: 8,

  costCeilingUsd: 25,
};

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function main() {
  const a = ASSUMPTIONS;
  const exchangesPerMonth = a.busyHoursPerMonth * a.exchangesPerBusyHour;

  const bedrockInputCost =
    ((exchangesPerMonth * a.avgInputTokensPerExchange) / 1_000_000) *
    a.bedrockInputPricePerMillionTokens;
  const bedrockOutputCost =
    ((exchangesPerMonth * a.avgOutputTokensPerExchange) / 1_000_000) *
    a.bedrockOutputPricePerMillionTokens;
  const bedrockCost = bedrockInputCost + bedrockOutputCost;

  const voiceExchanges = exchangesPerMonth * a.voiceExchangeShare;
  const pollyCost =
    ((voiceExchanges * a.avgAnswerCharsPerExchange) / 1_000_000) *
    a.pollyPricePerMillionChars;
  const transcribeCost =
    ((voiceExchanges * a.avgQuestionSecondsPerExchange) / 60) *
    a.transcribePricePerMinute;

  const total = bedrockCost + pollyCost + transcribeCost;
  const overCeiling = total > a.costCeilingUsd;

  console.log(`Estimated exchanges/month: ${exchangesPerMonth}\n`);
  console.log(`  Bedrock (input):    ${usd(bedrockInputCost)}`);
  console.log(`  Bedrock (output):   ${usd(bedrockOutputCost)}`);
  console.log(
    `  Polly (generative): ${usd(pollyCost)}  (${voiceExchanges} voice exchanges assumed)`,
  );
  console.log(`  Transcribe:         ${usd(transcribeCost)}`);
  console.log(`  ------------------------------`);
  console.log(`  Total (AI stack):   ${usd(total)}`);
  console.log(`  Ceiling:            ${usd(a.costCeilingUsd)}`);
  console.log(
    `  Headroom:           ${usd(a.costCeilingUsd - total)}  ${
      overCeiling ? "⚠️  OVER CEILING" : "✅ within ceiling"
    }`,
  );
  console.log();
  console.log(
    "Note: excludes Lambda/DynamoDB/S3/Amplify (negligible per docs/ARCHITECTURE.md",
  );
  console.log(
    "§ Data stores) and excludes the worst-case deliberate-abuse scenario (OQ-8) —",
  );
  console.log("this is the expected-traffic estimate only.");
}

main();
