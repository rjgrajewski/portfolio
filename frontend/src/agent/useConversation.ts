/**
 * Turn state for the agent panel (docs/ARCHITECTURE.md § Repository layout —
 * `agent/useConversation.ts`: "turn state, history, session-cap handling").
 *
 * One turn at a time. A turn is: append the user message + an empty agent
 * message, stream frames into that agent message, and end on the single
 * terminal frame (`done` or `error`). `reveal_section` actions are applied
 * the instant they arrive, through the shared reveal path (uiActions.ts).
 */

import { useCallback, useRef, useState } from "react";
import { runtimeConfig } from "../config/runtime";
import { getSessionId } from "./sessionId";
import { applyAgentAction } from "./uiActions";
import {
  AgentTransportError,
  streamAgentTurn,
  type ErrorCode,
  type HistoryTurn,
} from "./transport";

export type ConversationStatus =
  | "idle"
  | "thinking"
  | "streaming"
  | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  /** Set on an agent message whose streamed answer ended on an error /
   * dropped connection — the transcript shows it was cut short. Kept as a
   * flag, never folded into `text`, so it never enters the model history. */
  truncated?: boolean;
}

export interface UseConversation {
  messages: ChatMessage[];
  status: ConversationStatus;
  errorCode: ErrorCode | null;
  canSend: boolean;
  send: (text: string) => void;
  stop: () => void;
  reset: () => void;
}

function newId(): string {
  return crypto.randomUUID();
}

export function useConversation(): UseConversation {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const busy = status === "thinking" || status === "streaming";
  const canSend = runtimeConfig.agentUrl !== null && !busy;

  const appendToAgentMessage = useCallback((id: string, delta: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m)),
    );
  }, []);

  const setAgentMessageText = useCallback((id: string, text: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text } : m)),
    );
  }, []);

  const markTruncated = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, truncated: true } : m)),
    );
  }, []);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      const url = runtimeConfig.agentUrl;
      if (!text || !url || abortRef.current) return;

      const history: HistoryTurn[] = messages
        .filter((m) => m.text.trim().length > 0)
        .map((m) => ({
          role: m.role === "agent" ? "assistant" : "user",
          text: m.text,
        }));

      const agentId = newId();
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", text },
        { id: agentId, role: "agent", text: "" },
      ]);
      setErrorCode(null);
      setStatus("thinking");

      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        let sawText = false;
        let sawTerminal = false;
        try {
          const sessionId = getSessionId();
          for await (const frame of streamAgentTurn(
            url,
            { sessionId, message: text, history },
            controller.signal,
          )) {
            if (controller.signal.aborted) break;

            if (frame.type === "text") {
              sawText = true;
              setStatus("streaming");
              appendToAgentMessage(agentId, String(frame.delta ?? ""));
            } else if (frame.type === "action") {
              applyAgentAction(frame);
            } else if (frame.type === "done") {
              sawTerminal = true;
              setStatus("idle");
            } else if (frame.type === "error") {
              sawTerminal = true;
              setErrorCode((frame.code as ErrorCode) ?? "internal");
              setStatus("error");
              if (sawText) {
                // Partial answer already on screen — keep it, flag it as
                // cut short. The banner (AgentPanel) carries the "why".
                markTruncated(agentId);
              } else {
                setAgentMessageText(
                  agentId,
                  typeof frame.message === "string" ? frame.message : "",
                );
              }
            }
            // unknown frame types: ignored on purpose
          }
        } catch (err) {
          if (!controller.signal.aborted) {
            const code: ErrorCode =
              err instanceof AgentTransportError ? "network" : "internal";
            setErrorCode(code);
            setStatus("error");
            if (sawText) {
              // Connection dropped mid-answer — keep what arrived, flag it.
              markTruncated(agentId);
            } else {
              setAgentMessageText(
                agentId,
                "The assistant is unavailable right now. Browse the portfolio below or download the CV.",
              );
            }
          }
        } finally {
          if (!sawTerminal && !controller.signal.aborted) {
            // Stream ended without a terminal frame — treat as a soft error.
            setStatus((s) => (s === "error" ? s : "idle"));
          }
          abortRef.current = null;
        }
      })();
    },
    [messages, appendToAgentMessage, setAgentMessageText, markTruncated],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((s) => (s === "thinking" || s === "streaming" ? "idle" : s));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setErrorCode(null);
    setStatus("idle");
  }, []);

  return { messages, status, errorCode, canSend, send, stop, reset };
}
