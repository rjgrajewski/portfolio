/**
 * Turn state for the agent panel (docs/ARCHITECTURE.md § Repository layout —
 * `agent/useConversation.ts`: "turn state, history, session-cap handling").
 *
 * One turn at a time. A turn is: append the user message + an empty agent
 * message, stream frames into that agent message, and end on the single
 * terminal frame (`done` or `error`). `reveal_section` actions are applied
 * the instant they arrive, through the shared reveal path (uiActions.ts).
 *
 * Phase 4 — voice is a layer on top, not a separate machine:
 *   - a spoken turn is an ordinary turn whose reply text is ALSO piped to
 *     Polly (tts.ts) as it streams — first sentence synthesised the moment
 *     it's complete, while the answer is still arriving, so audio and the
 *     section reveal land together (the reveal already fires on the `action`
 *     frame, before the prose).
 *   - voice input (stt.ts) resolves to a transcript, which is submitted
 *     through the exact same turn path — so a visitor can ask by voice, then
 *     type the next question, in one conversation.
 *   - every voice failure leaves the text path completely untouched.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { runtimeConfig } from "../config/runtime";
import { getSessionId } from "./sessionId";
import { applyAgentAction } from "./uiActions";
import { createSpeechPlayer, type SpeechPlayer } from "./tts";
import { startListening, type RecognizerHandle } from "./stt";
import type { VoiceErrorCode } from "./degradation";
import {
  AgentTransportError,
  streamAgentTurn,
  type ErrorCode,
  type HistoryTurn,
} from "./transport";

export type ConversationStatus = "idle" | "thinking" | "streaming" | "error";

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
  voiceErrorCode: VoiceErrorCode | null;
  canSend: boolean;
  listening: boolean;
  partialTranscript: string;
  speaking: boolean;
  /** Text turn — reply is not spoken. */
  send: (text: string) => void;
  /** Start mic capture; the transcript is submitted as a spoken turn. */
  startVoice: () => void;
  /** Finish mic capture early ("done talking"). */
  stopVoice: () => void;
  /** Unlock audio playback from a user gesture (mobile autoplay). */
  unlockAudio: () => void;
  /** Abort the in-flight turn + any playback. */
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
  const [voiceErrorCode, setVoiceErrorCode] = useState<VoiceErrorCode | null>(
    null,
  );
  const [listening, setListening] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [speaking, setSpeaking] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const playerRef = useRef<SpeechPlayer | null>(null);
  const recognizerRef = useRef<RecognizerHandle | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const busy = status === "thinking" || status === "streaming";
  const canSend = runtimeConfig.agentUrl !== null && !busy && !listening;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      playerRef.current?.stop();
      recognizerRef.current?.cancel();
    };
  }, []);

  const getPlayer = useCallback((): SpeechPlayer => {
    if (!playerRef.current) {
      playerRef.current = createSpeechPlayer({
        onStart: () => setSpeaking(true),
        onIdle: () => setSpeaking(false),
        onError: (code) => {
          setSpeaking(false);
          setVoiceErrorCode(code);
        },
      });
    }
    return playerRef.current;
  }, []);

  const unlockAudio = useCallback(() => {
    void getPlayer().unlock();
  }, [getPlayer]);

  const appendToAgentMessage = useCallback((id: string, delta: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m)),
    );
  }, []);

  const setAgentMessageText = useCallback((id: string, text: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
  }, []);

  const markTruncated = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, truncated: true } : m)),
    );
  }, []);

  const runTurn = useCallback(
    (raw: string, opts: { speak: boolean }) => {
      const text = raw.trim();
      const url = runtimeConfig.agentUrl;
      if (!text || !url || abortRef.current) return;

      const history: HistoryTurn[] = messagesRef.current
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

      // Spoken turn: begin() a fresh utterance (halts any prior playback AND
      // clears the stop latch so push()/end() below actually run). A text
      // turn just silences any audio still playing.
      let player: SpeechPlayer | null = null;
      if (opts.speak) {
        player = getPlayer();
        player.begin();
        setVoiceErrorCode(null);
      } else {
        playerRef.current?.stop();
      }
      console.info(`[voice] runTurn speak=${opts.speak} chars=${text.length}`);

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
              const delta = String(frame.delta ?? "");
              appendToAgentMessage(agentId, delta);
              player?.push(delta);
            } else if (frame.type === "action") {
              applyAgentAction(frame);
            } else if (frame.type === "done") {
              sawTerminal = true;
              setStatus("idle");
              player?.end();
            } else if (frame.type === "error") {
              sawTerminal = true;
              setErrorCode((frame.code as ErrorCode) ?? "internal");
              setStatus("error");
              player?.stop();
              if (sawText) {
                markTruncated(agentId);
              } else {
                setAgentMessageText(
                  agentId,
                  typeof frame.message === "string" ? frame.message : "",
                );
              }
            }
          }
        } catch (err) {
          if (!controller.signal.aborted) {
            const code: ErrorCode =
              err instanceof AgentTransportError ? "network" : "internal";
            setErrorCode(code);
            setStatus("error");
            player?.stop();
            if (sawText) {
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
            setStatus((s) => (s === "error" ? s : "idle"));
            player?.end();
          }
          abortRef.current = null;
        }
      })();
    },
    [
      appendToAgentMessage,
      setAgentMessageText,
      markTruncated,
      getPlayer,
    ],
  );

  const send = useCallback(
    (text: string) => runTurn(text, { speak: false }),
    [runTurn],
  );

  const stopVoice = useCallback(() => {
    recognizerRef.current?.stop();
  }, []);

  const startVoice = useCallback(() => {
    if (recognizerRef.current || busy) return;
    if (runtimeConfig.credentialsUrl === null) return;

    // The mic press is our user gesture — unlock playback for the reply.
    // Do NOT stop the player here: runTurn(speak:true) calls begin() when the
    // transcript arrives, which halts prior playback and re-arms the player.
    // Calling stop() now would latch it inert before begin() runs.
    void getPlayer().unlock();

    setVoiceErrorCode(null);
    setPartialTranscript("");
    setListening(true);
    console.info("[voice] listening…");

    recognizerRef.current = startListening({
      onPartial: (t) => setPartialTranscript(t),
      onFinal: (t) => {
        recognizerRef.current = null;
        setListening(false);
        setPartialTranscript("");
        const clean = t.trim();
        console.info(`[voice] transcript final (${clean.length} chars): ` + JSON.stringify(clean.slice(0, 100)));
        if (clean.length > 0) runTurn(clean, { speak: true });
      },
      onError: (code, message) => {
        recognizerRef.current = null;
        setListening(false);
        setPartialTranscript("");
        setVoiceErrorCode(code);
        console.warn("voice input error", code, message);
      },
    });
  }, [busy, getPlayer, runTurn]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    recognizerRef.current?.cancel();
    recognizerRef.current = null;
    playerRef.current?.stop();
    setListening(false);
    setPartialTranscript("");
    setSpeaking(false);
    setStatus((s) => (s === "thinking" || s === "streaming" ? "idle" : s));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    recognizerRef.current?.cancel();
    recognizerRef.current = null;
    playerRef.current?.stop();
    setMessages([]);
    setErrorCode(null);
    setVoiceErrorCode(null);
    setListening(false);
    setPartialTranscript("");
    setSpeaking(false);
    setStatus("idle");
  }, []);

  return {
    messages,
    status,
    errorCode,
    voiceErrorCode,
    canSend,
    listening,
    partialTranscript,
    speaking,
    send,
    startVoice,
    stopVoice,
    unlockAudio,
    stop,
    reset,
  };
}
