/**
 * The two tools exposed to the model (docs/ARCHITECTURE.md § Knowledge /
 * content retrieval and § Agentic UI pattern), in Bedrock Converse
 * `toolConfig` shape.
 *
 *   - get_content(topic, layer)   → internal to the Lambda. Its call and
 *                                   result NEVER appear in the browser
 *                                   stream.
 *   - reveal_section(sectionId)   → surfaced to the browser as an `action`
 *                                   frame the instant the model emits it.
 *
 * Parallel tool use is confirmed for Claude Haiku 4.5 on Bedrock
 * (scripts/verify-parallel-tools.ts, 6/6): the model emits both in one turn
 * when a question needs depth AND a reveal, so a "goes deep" turn is 2 model
 * calls, not 3. Recorded in docs/DECISIONS.md.
 */

import type { Tool } from "@aws-sdk/client-bedrock-runtime";

export const TOPIC_IDS = ["education", "amazon", "flowjob", "rhymind"] as const;
export const LAYERS = ["business", "technical"] as const;

/**
 * Section ids the model may reveal. MUST stay in sync with
 * frontend/src/content/sections.ts `SectionId` (the frontend validates the
 * incoming action against that same list and silently ignores an unknown
 * one, per the stream contract).
 */
export const SECTION_IDS = [
  "education",
  "amazon",
  "flowjob",
  "rhymind",
  "portfolio-itself",
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];
export type Layer = (typeof LAYERS)[number];
export type SectionId = (typeof SECTION_IDS)[number];

export const GET_CONTENT = "get_content";
export const REVEAL_SECTION = "reveal_section";

export const TOOLS: Tool[] = [
  {
    toolSpec: {
      name: GET_CONTENT,
      description:
        "Fetch one depth file about Rafal for a given topic and layer. Call " +
        "this only when the visitor wants detail that goes beyond the " +
        "one-line summaries already in your reference material. Business " +
        "layer = problem solved and why it mattered; technical layer = " +
        "stack, decisions, trade-offs. Do not mention that you are fetching " +
        "anything — just answer.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              enum: [...TOPIC_IDS],
              description: "Which topic to fetch.",
            },
            layer: {
              type: "string",
              enum: [...LAYERS],
              description: "Which layer of that topic to fetch.",
            },
          },
          required: ["topic", "layer"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: REVEAL_SECTION,
      description:
        "Open the matching portfolio section in the visitor's UI so they see " +
        "it while you answer. Call this whenever your answer centres on one " +
        "section. Fire it as early as possible in the turn. You may call " +
        "get_content and reveal_section together in the same turn.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            sectionId: {
              type: "string",
              enum: [...SECTION_IDS],
              description: "Which section to open.",
            },
          },
          required: ["sectionId"],
        },
      },
    },
  },
];

export function isTopicId(v: unknown): v is TopicId {
  return typeof v === "string" && (TOPIC_IDS as readonly string[]).includes(v);
}

export function isLayer(v: unknown): v is Layer {
  return typeof v === "string" && (LAYERS as readonly string[]).includes(v);
}

export function isSectionId(v: unknown): v is SectionId {
  return (
    typeof v === "string" && (SECTION_IDS as readonly string[]).includes(v)
  );
}
