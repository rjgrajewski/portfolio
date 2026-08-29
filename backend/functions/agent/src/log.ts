/**
 * Conversation logging (docs/ARCHITECTURE.md § Logging).
 *
 * Content + timestamp ONLY. No recruiter identity, no IP, no user-agent, no
 * request headers of any kind. `sessionId` is a random client-generated
 * value with no link to a person and is the table's partition key by design.
 * Purpose: let the site owner see what topics come up — not who asked.
 *
 * Best-effort: a logging failure is swallowed so it can never break a turn
 * that otherwise succeeded.
 */

import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./ddb";

const TABLE = requireEnv("CONVERSATION_LOGS_TABLE");
const TTL_SECONDS = 180 * 24 * 60 * 60;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

export interface ConversationLogEntry {
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  revealedSections: string[];
  fetchedContent: string[];
  usage: { inputTokens: number; outputTokens: number };
  modelCalls: number;
  outcome: string;
}

export async function writeConversationLog(
  entry: ConversationLogEntry,
): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          sessionId: entry.sessionId,
          ts: new Date().toISOString(),
          userMessage: entry.userMessage,
          assistantMessage: entry.assistantMessage,
          revealedSections: entry.revealedSections,
          fetchedContent: entry.fetchedContent,
          inputTokens: entry.usage.inputTokens,
          outputTokens: entry.usage.outputTokens,
          modelCalls: entry.modelCalls,
          outcome: entry.outcome,
          expiresAt: nowSec + TTL_SECONDS,
        },
      }),
    );
  } catch (err) {
    console.error("log.writeConversationLog failed", err);
  }
}
