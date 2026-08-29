/**
 * Reasoning endpoint — Bedrock Claude Haiku 4.5, streaming NDJSON to the
 * browser over a Lambda Function URL (`InvokeMode: RESPONSE_STREAM`).
 *
 * One HTTP connection per user turn. Underneath, a turn is 1 model call
 * (plain answer) or 2 (a "goes deep" turn: get_content + reveal_section in
 * one turn — parallel tool use is confirmed for this model, see
 * scripts/verify-parallel-tools.ts — then the answer after the tool result).
 * The frontend never sees that split. See src/types.ts for the full wire
 * contract.
 *
 * Order of gates at the top of every turn (docs/ARCHITECTURE.md § Abuse
 * protection): in-memory token bucket → daily circuit-breaker → per-session
 * message cap. The breaker is the only real cost backstop; the others are
 * cheaper first lines.
 */

import { randomUUID } from "node:crypto";
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type ContentBlock,
  type Message,
  type SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime";

import { countInvocationAndCheck, recordTokenSpend } from "./breaker";
import { countMessageAndCheck } from "./sessionCap";
import { takeToken } from "./throttle";
import { writeConversationLog } from "./log";
import { buildSystemPrompt } from "./systemPrompt";
import {
  GET_CONTENT,
  REVEAL_SECTION,
  TOOLS,
  isLayer,
  isSectionId,
  isTopicId,
} from "./tools";
import {
  ContentNotFoundError,
  getCore,
  getManifest,
  getTopicContent,
} from "./contentStore";
import type { AgentRequest, ErrorCode, HistoryTurn, ServerFrame } from "./types";

const MODEL_ID = requireEnv("BEDROCK_MODEL_ID");
const MAX_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS ?? "800");
const TEMPERATURE = Number(process.env.MODEL_TEMPERATURE ?? "0.4");
const MAX_MODEL_CALLS = 3;

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_TURNS = 20;

const bedrock = new BedrockRuntimeClient({});

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

// --- request shape (Lambda Function URL) -----------------------------------

interface LambdaFunctionUrlEvent {
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
}

// --- Converse stream item (loose view of the SDK event union) -------------

interface StreamItem {
  contentBlockStart?: {
    start?: { toolUse?: { toolUseId?: string; name?: string } };
    contentBlockIndex?: number;
  };
  contentBlockDelta?: {
    delta?: { text?: string; toolUse?: { input?: string } };
    contentBlockIndex?: number;
  };
  contentBlockStop?: { contentBlockIndex?: number };
  messageStop?: { stopReason?: string };
  metadata?: { usage?: { inputTokens?: number; outputTokens?: number } };
  internalServerException?: { message?: string };
  modelStreamErrorException?: { message?: string };
  serviceUnavailableException?: { message?: string };
  throttlingException?: { message?: string };
  validationException?: { message?: string };
}

// --- errors --------------------------------------------------------------

class BadRequest extends Error {}
class UpstreamError extends Error {}
class Guard extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// --- NDJSON frame writer ------------------------------------------------

class FrameWriter {
  private terminated = false;
  constructor(private readonly stream: awslambda.ResponseStream) {}

  text(delta: string): void {
    this.line({ type: "text", delta });
  }

  action(sectionId: string): void {
    this.line({ type: "action", name: "reveal_section", args: { sectionId } });
  }

  done(
    usage: { inputTokens: number; outputTokens: number },
    stopReason: string,
  ): void {
    if (this.terminated) return;
    this.line({ type: "done", usage, stopReason });
    this.terminated = true;
  }

  error(code: ErrorCode, message: string): void {
    if (this.terminated) return;
    this.line({ type: "error", code, message });
    this.terminated = true;
  }

  get isTerminated(): boolean {
    return this.terminated;
  }

  private line(frame: ServerFrame): void {
    if (this.terminated) return;
    this.stream.write(`${JSON.stringify(frame)}\n`);
  }
}

// --- request parsing --------------------------------------------------

function parseBody(event: LambdaFunctionUrlEvent): AgentRequest {
  const raw = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body
    : "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    throw new BadRequest("body is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new BadRequest("body must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;
  const message =
    typeof obj.message === "string" ? obj.message.trim().slice(0, MAX_MESSAGE_CHARS) : "";
  if (!message) throw new BadRequest("missing 'message'");

  const sessionId =
    typeof obj.sessionId === "string" && obj.sessionId.trim()
      ? obj.sessionId.trim().slice(0, 200)
      : randomUUID();

  const history: HistoryTurn[] = Array.isArray(obj.history)
    ? obj.history
        .filter(
          (t): t is { role: unknown; text: unknown } =>
            typeof t === "object" && t !== null,
        )
        .map((t) => ({
          role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
          text:
            typeof t.text === "string" ? t.text.slice(0, MAX_MESSAGE_CHARS) : "",
        }))
        .filter((t) => t.text.length > 0)
        .slice(-MAX_HISTORY_TURNS)
    : [];

  return { sessionId, message, history };
}

/** Coalesce consecutive same-role turns and guarantee the sequence starts
 *  with a user turn — Converse rejects anything else. */
function toConverseMessages(
  history: HistoryTurn[],
  newUserMessage: string,
): Message[] {
  const turns: HistoryTurn[] = [
    ...history,
    { role: "user", text: newUserMessage },
  ];
  const out: Message[] = [];
  for (const t of turns) {
    const role: Message["role"] = t.role === "assistant" ? "assistant" : "user";
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.content!.push({ text: t.text });
    } else {
      out.push({ role, content: [{ text: t.text }] });
    }
  }
  while (out.length > 0 && out[0].role !== "user") out.shift();
  return out;
}

// --- one model call ---------------------------------------------------

interface ModelToolUse {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
}

interface ModelCallResult {
  text: string;
  toolUses: ModelToolUse[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
}

function parseToolInput(json: string): Record<string, unknown> {
  const s = json.trim();
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return typeof v === "object" && v !== null
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function firstExceptionMessage(item: StreamItem): string | undefined {
  return (
    item.internalServerException?.message ??
    item.modelStreamErrorException?.message ??
    item.serviceUnavailableException?.message ??
    item.throttlingException?.message ??
    item.validationException?.message
  );
}

async function runModelCall(
  system: SystemContentBlock[],
  messages: Message[],
  writer: FrameWriter,
): Promise<ModelCallResult> {
  const res = await bedrock.send(
    new ConverseStreamCommand({
      modelId: MODEL_ID,
      system,
      messages,
      toolConfig: { tools: TOOLS },
      inferenceConfig: {
        maxTokens: MAX_OUTPUT_TOKENS,
        temperature: TEMPERATURE,
      },
    }),
  );

  let text = "";
  let stopReason = "end_turn";
  let usage = { inputTokens: 0, outputTokens: 0 };
  const pending = new Map<
    number,
    { toolUseId: string; name: string; inputJson: string }
  >();
  const toolUses: ModelToolUse[] = [];

  for await (const raw of res.stream ?? []) {
    const item = raw as StreamItem;

    if (
      item.internalServerException ||
      item.modelStreamErrorException ||
      item.serviceUnavailableException ||
      item.throttlingException
    ) {
      throw new UpstreamError(firstExceptionMessage(item) ?? "model stream error");
    }
    if (item.validationException) {
      throw new Error(
        `Bedrock validation error: ${item.validationException.message ?? "unknown"}`,
      );
    }

    if (item.contentBlockStart?.start?.toolUse) {
      const idx = item.contentBlockStart.contentBlockIndex ?? 0;
      pending.set(idx, {
        toolUseId: item.contentBlockStart.start.toolUse.toolUseId ?? "",
        name: item.contentBlockStart.start.toolUse.name ?? "",
        inputJson: "",
      });
      continue;
    }

    if (item.contentBlockDelta?.delta) {
      const idx = item.contentBlockDelta.contentBlockIndex ?? 0;
      const delta = item.contentBlockDelta.delta;
      if (typeof delta.text === "string" && delta.text.length > 0) {
        text += delta.text;
        writer.text(delta.text);
      }
      if (delta.toolUse && typeof delta.toolUse.input === "string") {
        const acc = pending.get(idx);
        if (acc) acc.inputJson += delta.toolUse.input;
      }
      continue;
    }

    if (item.contentBlockStop) {
      const idx = item.contentBlockStop.contentBlockIndex ?? 0;
      const acc = pending.get(idx);
      if (acc) {
        const input = parseToolInput(acc.inputJson);
        toolUses.push({ toolUseId: acc.toolUseId, name: acc.name, input });
        pending.delete(idx);
        // Surface reveal_section to the browser the instant it is fully
        // formed — before the answer prose. This is the "reveal and answer
        // at the same time" mechanism.
        if (acc.name === REVEAL_SECTION && isSectionId(input.sectionId)) {
          writer.action(input.sectionId);
        }
      }
      continue;
    }

    if (item.messageStop?.stopReason) {
      stopReason = item.messageStop.stopReason;
      continue;
    }

    if (item.metadata?.usage) {
      usage = {
        inputTokens: item.metadata.usage.inputTokens ?? 0,
        outputTokens: item.metadata.usage.outputTokens ?? 0,
      };
    }
  }

  // Defensive: any tool block that never got an explicit stop.
  for (const acc of pending.values()) {
    toolUses.push({
      toolUseId: acc.toolUseId,
      name: acc.name,
      input: parseToolInput(acc.inputJson),
    });
  }

  return { text, toolUses, usage, stopReason };
}

// --- tool resolution -------------------------------------------------

function errorToolResult(toolUseId: string, message: string): ContentBlock {
  return {
    toolResult: {
      toolUseId,
      content: [{ text: message }],
      status: "error",
    },
  } as ContentBlock;
}

function okToolResult(toolUseId: string, text: string): ContentBlock {
  return {
    toolResult: {
      toolUseId,
      content: [{ text }],
      status: "success",
    },
  } as ContentBlock;
}

interface TurnAccumulator {
  fullText: string;
  revealed: string[];
  fetched: string[];
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  finalStop: string;
}

async function resolveToolUses(
  toolUses: ModelToolUse[],
  acc: TurnAccumulator,
): Promise<ContentBlock[]> {
  const results: ContentBlock[] = [];
  for (const tu of toolUses) {
    if (tu.name === REVEAL_SECTION) {
      const sectionId = tu.input.sectionId;
      if (isSectionId(sectionId)) {
        if (!acc.revealed.includes(sectionId)) acc.revealed.push(sectionId);
        results.push(
          okToolResult(tu.toolUseId, `Section "${sectionId}" is now open for the visitor.`),
        );
      } else {
        results.push(
          errorToolResult(
            tu.toolUseId,
            `"${String(sectionId)}" is not a known section id; nothing was opened.`,
          ),
        );
      }
      continue;
    }

    if (tu.name === GET_CONTENT) {
      const { topic, layer } = tu.input;
      if (!isTopicId(topic) || !isLayer(layer)) {
        results.push(
          errorToolResult(
            tu.toolUseId,
            `Unknown topic/layer "${String(topic)}"/"${String(layer)}".`,
          ),
        );
        continue;
      }
      try {
        const body = await getTopicContent(topic, layer);
        acc.fetched.push(`${topic}.${layer}`);
        results.push(okToolResult(tu.toolUseId, body));
      } catch (err) {
        if (err instanceof ContentNotFoundError) {
          results.push(errorToolResult(tu.toolUseId, err.message));
        } else {
          throw err;
        }
      }
      continue;
    }

    results.push(errorToolResult(tu.toolUseId, `Unknown tool "${tu.name}".`));
  }
  return results;
}

// --- the turn ------------------------------------------------------

async function runTurn(
  event: LambdaFunctionUrlEvent,
  writer: FrameWriter,
): Promise<{ sessionId: string; userMessage: string; acc: TurnAccumulator; outcome: string }> {
  const acc: TurnAccumulator = {
    fullText: "",
    revealed: [],
    fetched: [],
    inputTokens: 0,
    outputTokens: 0,
    modelCalls: 0,
    finalStop: "end_turn",
  };
  let sessionId = "unknown";
  let userMessage = "";
  let outcome = "ok";

  try {
    const req = parseBody(event);
    sessionId = req.sessionId;
    userMessage = req.message;

    if (!takeToken()) {
      throw new Guard(
        "throttled",
        "Too many requests in a short window — give it a moment and try again.",
      );
    }

    const breaker = await countInvocationAndCheck();
    if (breaker.tripped) {
      throw new Guard(
        "breaker_tripped",
        "The assistant has reached its usage limit for today and is paused. You can still browse the portfolio or download the CV.",
      );
    }

    const cap = await countMessageAndCheck(sessionId);
    if (cap.capped) {
      throw new Guard(
        "session_cap",
        "You've reached the message limit for this session. Reload the page to start a fresh one.",
      );
    }

    const [core, manifest] = await Promise.all([getCore(), getManifest()]);
    const system: SystemContentBlock[] = [
      { text: buildSystemPrompt(core, manifest) },
    ];
    const messages = toConverseMessages(req.history ?? [], req.message);

    while (acc.modelCalls < MAX_MODEL_CALLS) {
      acc.modelCalls += 1;
      const result = await runModelCall(system, messages, writer);
      acc.inputTokens += result.usage.inputTokens;
      acc.outputTokens += result.usage.outputTokens;
      acc.fullText += result.text;
      acc.finalStop = result.stopReason;

      if (result.stopReason !== "tool_use" || result.toolUses.length === 0) {
        break;
      }

      const assistantContent: ContentBlock[] = [];
      if (result.text.trim().length > 0) {
        assistantContent.push({ text: result.text });
      }
      for (const tu of result.toolUses) {
        assistantContent.push({
          toolUse: { toolUseId: tu.toolUseId, name: tu.name, input: tu.input },
        } as ContentBlock);
      }
      messages.push({ role: "assistant", content: assistantContent });
      messages.push({
        role: "user",
        content: await resolveToolUses(result.toolUses, acc),
      });
    }

    outcome = "ok";
  } catch (err) {
    if (err instanceof Guard) {
      writer.error(err.code, err.message);
      outcome = `guard:${err.code}`;
    } else if (err instanceof BadRequest) {
      writer.error("internal", "The request was malformed.");
      outcome = "bad_request";
      console.error("bad request", err);
    } else if (err instanceof UpstreamError || isBedrockThrottle(err)) {
      writer.error(
        "upstream_error",
        "The assistant's model backend is momentarily unavailable. Try again shortly.",
      );
      outcome = "upstream_error";
      console.error("upstream error", err);
    } else {
      writer.error("internal", "Something went wrong while generating the answer.");
      outcome = "internal";
      console.error("internal error", err);
    }
  }

  return { sessionId, userMessage, acc, outcome };
}

function isBedrockThrottle(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "ThrottlingException" || e.$metadata?.httpStatusCode === 429;
}

// --- entrypoint ---------------------------------------------------

export const handler = awslambda.streamifyResponse(
  async (
    event: LambdaFunctionUrlEvent,
    responseStream: awslambda.ResponseStream,
  ): Promise<void> => {
    const httpStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    });
    const writer = new FrameWriter(httpStream);

    try {
      const { sessionId, userMessage, acc, outcome } = await runTurn(
        event,
        writer,
      );

      if (!writer.isTerminated) {
        writer.done(
          { inputTokens: acc.inputTokens, outputTokens: acc.outputTokens },
          acc.finalStop,
        );
      }

      // Best-effort bookkeeping — never throws, never adds a frame.
      await recordTokenSpend(acc.inputTokens, acc.outputTokens);
      if (userMessage) {
        await writeConversationLog({
          sessionId,
          userMessage,
          assistantMessage: acc.fullText,
          revealedSections: acc.revealed,
          fetchedContent: acc.fetched,
          usage: { inputTokens: acc.inputTokens, outputTokens: acc.outputTokens },
          modelCalls: acc.modelCalls,
          outcome,
        });
      }
    } catch (err) {
      console.error("unhandled error in handler", err);
      writer.error("internal", "Unexpected server error.");
    } finally {
      httpStream.end();
    }
  },
);
