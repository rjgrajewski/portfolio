/**
 * scripts/verify-parallel-tools.ts
 *
 * Resolves the last open part of the (now retired) OQ-1: when a single user
 * turn needs BOTH a depth-fetch (`get_content`) AND a section reveal
 * (`reveal_section`), does Claude Haiku 4.5 on Bedrock emit both tool_use
 * blocks *in the same turn* (parallel tool use)?
 *
 *   - If YES  → a "goes deep" turn costs 2 model calls (fetch+reveal, then
 *               the answer after the tool result).
 *   - If NO   → the model fetches first, answers/reveals on a later turn, so
 *               a "goes deep" turn costs 3 model calls.
 *
 * This is a behavioural probe, not a correctness check — the model is
 * non-deterministic, so it runs a handful of iterations and reports the
 * distribution. Outcome is recorded in docs/DECISIONS.md.
 *
 * Usage:
 *   AWS_PROFILE=portfolio npx tsx scripts/verify-parallel-tools.ts
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type Tool,
  type ContentBlock,
} from "@aws-sdk/client-bedrock-runtime";

const REGION = "eu-central-1";
// Same working form as scripts/check-availability.ts — see
// docs/ARCHITECTURE.md § Reasoning. Do not "simplify" to the in-region ID.
const MODEL_ID = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";
const ITERATIONS = 6;

const TOOLS: Tool[] = [
  {
    toolSpec: {
      name: "get_content",
      description:
        "Fetch one depth file about Rafal for a topic and layer. Call this " +
        "when the visitor wants detail beyond the one-line summary in the core.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              enum: ["education", "amazon", "flowjob", "rhymind"],
            },
            layer: { type: "string", enum: ["business", "technical"] },
          },
          required: ["topic", "layer"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "reveal_section",
      description:
        "Open the matching portfolio section in the UI so the visitor sees it " +
        "while you answer. Call this whenever your answer is about one section.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            sectionId: {
              type: "string",
              enum: [
                "education",
                "amazon",
                "flowjob",
                "rhymind",
                "portfolio-itself",
              ],
            },
          },
          required: ["sectionId"],
        },
      },
    },
  },
];

const SYSTEM = [
  {
    text:
      "You are the portfolio agent for Rafal Grajewski. You have two tools: " +
      "get_content (fetch depth) and reveal_section (open the matching UI " +
      "section). When a question needs both depth on a topic and the section " +
      "opened, use both tools. Keep prose brief.",
  },
];

const USER_PROMPT =
  "Give me the technical details of how FlowJob works under the hood, and " +
  "open the FlowJob section so I can follow along.";

interface IterationResult {
  stopReason: string;
  toolNames: string[];
  hadText: boolean;
}

async function runOnce(
  client: BedrockRuntimeClient,
): Promise<IterationResult> {
  const messages: Message[] = [
    { role: "user", content: [{ text: USER_PROMPT }] },
  ];

  const res = await client.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: SYSTEM,
      messages,
      toolConfig: { tools: TOOLS },
      inferenceConfig: { maxTokens: 512, temperature: 0 },
    }),
  );

  const blocks: ContentBlock[] = res.output?.message?.content ?? [];
  const toolNames = blocks
    .filter((b): b is ContentBlock.ToolUseMember => "toolUse" in b)
    .map((b) => b.toolUse.name ?? "?");
  const hadText = blocks.some(
    (b) => "text" in b && (b.text ?? "").trim().length > 0,
  );

  return {
    stopReason: res.stopReason ?? "?",
    toolNames,
    hadText,
  };
}

async function main() {
  const client = new BedrockRuntimeClient({ region: REGION });
  console.log(
    `Probing parallel tool use — ${MODEL_ID} @ ${REGION}, ${ITERATIONS} iterations\n`,
  );

  const results: IterationResult[] = [];
  for (let i = 1; i <= ITERATIONS; i++) {
    try {
      const r = await runOnce(client);
      results.push(r);
      console.log(
        `#${i}  stop=${r.stopReason.padEnd(10)} ` +
          `tools=[${r.toolNames.join(", ") || "none"}] ` +
          `leadingText=${r.hadText ? "yes" : "no"}`,
      );
    } catch (err) {
      console.log(`#${i}  ERROR ${err instanceof Error ? err.message : err}`);
    }
  }

  const bothInOneTurn = results.filter(
    (r) =>
      r.toolNames.includes("get_content") &&
      r.toolNames.includes("reveal_section"),
  ).length;
  const revealOnly = results.filter(
    (r) =>
      r.toolNames.includes("reveal_section") &&
      !r.toolNames.includes("get_content"),
  ).length;
  const fetchOnly = results.filter(
    (r) =>
      r.toolNames.includes("get_content") &&
      !r.toolNames.includes("reveal_section"),
  ).length;
  const withLeadingText = results.filter((r) => r.hadText).length;

  console.log("\n--- summary ---");
  console.log(`both tools in one turn : ${bothInOneTurn}/${results.length}`);
  console.log(`reveal_section only    : ${revealOnly}/${results.length}`);
  console.log(`get_content only       : ${fetchOnly}/${results.length}`);
  console.log(`turn had leading prose : ${withLeadingText}/${results.length}`);
  console.log(
    `\nConclusion: parallel tool use ${
      bothInOneTurn > 0 ? "IS" : "is NOT"
    } supported by this model on Bedrock ` +
      `→ a "goes deep" turn costs ${bothInOneTurn > 0 ? "2" : "3"} model calls.`,
  );
}

main();
