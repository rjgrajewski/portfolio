/**
 * Turn state for the agent panel (docs/ARCHITECTURE.md § Repository layout —
 * `agent/useConversation.ts`: "turn state, history, session-cap handling").
 *
 * One turn at a time. A turn is: append the user message + an empty agent
 * message, stream frames into that agent message, and end on the single
 * terminal frame (`done` or `error`). `reveal_section` actions are applied
 * the instant they arrive, through the shared reveal path (uiActions.ts).
 *
 * Phase 4 — voice:
 *   - a spoken turn is an ordinary turn whose reply text is ALSO piped to
 *     Polly (tts.ts) as it streams — first sentence synthesised the moment
 *     it's complete, so audio and the section reveal land together.
 *   - "voice mode" is a persistent session (stt.ts `createVoiceSession`):
 *     one mic, always monitoring. It auto-captures when the visitor speaks —
 *     including WHILE THE AGENT IS TALKING (barge-in): the agent is cut off
 *     instantly, the partial answer is kept and flagged, and the new
 *     utterance becomes the next turn.
 *   - a spoken question and a typed one interleave freely; a voice failure
 *     never disables the text composer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { runtimeConfig } from "../config/runtime";
import { getSessionId } from "./sessionId";
import { applyAgentAction } from "./uiActions";
import { createSpeechPlayer, type SpeechPlayer } from "./tts";
import {
  createVoiceSession,
  VoiceSessionError,
  type VoiceSession,
} from "./stt";
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
  /** Streamed answer ended on an error / dropped connection. A flag, never
   * folded into `text`, so it never enters the model history. */
  truncated?: boolean;
  /** The visitor barged in (started speaking) while this answer was still
   * playing — it was cut off deliberately. Same flag discipline. */
  interrupted?: boolean;
}

export interface UseConversation {
  messages: ChatMessage[];
  status: ConversationStatus;
  errorCode: ErrorCode | null;
  voiceErrorCode: VoiceErrorCode | null;
  canSend: boolean;
  /** Voice mode is on — the mic is live and listening hands-free. */
  voiceMode: boolean;
  /** Currently capturing an utterance (as opposed to passively monitoring). */
  listening: boolean;
  partialTranscript: string;
  speaking: boolean;
  /** Live mic loudness 0..1 while a voice session exists, else 0. Viz only. */
  micLevel: () => number;
  /** Live playback loudness 0..1 while the agent speaks, else 0. Viz only. */
  playbackLevel: () => number;
  /** Text turn — reply is not spoken. */
  send: (text: string) => void;
  /** Turn voice mode on/off. */
  toggleVoice: () => void;
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
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [speaking, setSpeaking] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const playerRef = useRef<SpeechPlayer | null>(null);
  const sessionRef = useRef<VoiceSession | null>(null);
  const currentAgentIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const busy = status === "thinking" || status === "streaming";
  const canSend = runtimeConfig.agentUrl !== null && !busy && !listening;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      playerRef.current?.stop();
      sessionRef.current?.close();
    };
  }, []);

  const getPlayer = useCallback((): SpeechPlayer => {
    if (!playerRef.current) {
      playerRef.current = createSpeechPlayer({
        onStart: () => {
          setSpeaking(true);
          sessionRef.current?.noteAgentAudioStart();
        },
        onIdle: () => {
          setSpeaking(false);
          sessionRef.current?.noteAgentAudioEnd();
          sessionRef.current?.release();
        },
        onError: (code) => {
          setSpeaking(false);
          setVoiceErrorCode(code);
          sessionRef.current?.noteAgentAudioEnd();
          sessionRef.current?.release();
        },
      });
    }
    return playerRef.current;
  }, []);

  const unlockAudio = useCallback(() => {
    void getPlayer().unlock();
  }, [getPlayer]);

  const micLevel = useCallback(() => sessionRef.current?.micLevel() ?? 0, []);
  const playbackLevel = useCallback(
    () => playerRef.current?.playbackLevel() ?? 0,
    [],
  );

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

  const markInterrupted = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && m.text.trim().length > 0 ? { ...m, interrupted: true } : m,
      ),
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
      currentAgentIdRef.current = agentId;
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", text },
        { id: agentId, role: "agent", text: "" },
      ]);
      setErrorCode(null);
      setStatus("thinking");

      // Tell the voice session an agent turn is in flight (so ambient noise
      // isn't taken as a new question) — but it keeps monitoring for barge-in.
      sessionRef.current?.hold();

      // Spoken turn: begin() a fresh utterance (halts prior playback AND
      // clears the stop latch so push()/end() run). Text turn: silence audio.
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
          // If nothing is (or will be) playing, hand the session back to
          // plain monitoring now. Otherwise the player's onIdle does it.
          if (
            (!player || !player.isSpeaking()) &&
            sessionRef.current?.state() !== "capturing"
          ) {
            sessionRef.current?.release();
          }
        }
      })();
    },
    [appendToAgentMessage, setAgentMessageText, markTruncated, getPlayer],
  );

  const send = useCallback(
    (text: string) => runTurn(text, { speak: false }),
    [runTurn],
  );

  const exitVoiceMode = useCallback(() => {
    // Tapping the orb ends voice mode outright — including any in-flight
    // turn and playback. (Barge-in is a separate path: it's triggered by
    // *speaking*, never by a tap.)
    abortRef.current?.abort();
    abortRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    playerRef.current?.stop();
    setVoiceMode(false);
    setListening(false);
    setPartialTranscript("");
    setSpeaking(false);
    setStatus((s) => (s === "thinking" || s === "streaming" ? "idle" : s));
    console.info("[voice] mode OFF (orb tap)");
  }, []);

  const enterVoiceMode = useCallback(async () => {
    if (sessionRef.current || runtimeConfig.credentialsUrl === null) return;
    // This runs from the mic-button click — unlock playback in the gesture.
    void getPlayer().unlock();
    setVoiceErrorCode(null);
    console.info("[voice] starting session…");

    try {
      const session = await createVoiceSession({
        onSpeechStart: (reason) => {
          console.info(`[voice] speech start (${reason})`);
          if (reason === "barge-in") {
            // Cut the agent off immediately — not at the next sentence.
            abortRef.current?.abort();
            abortRef.current = null;
            playerRef.current?.stop();
            setSpeaking(false);
            setStatus((s) => (s === "thinking" || s === "streaming" ? "idle" : s));
            const id = currentAgentIdRef.current;
            if (id) markInterrupted(id);
            console.info("[voice] speaking → interrupted → listening");
          }
          setListening(true);
          setPartialTranscript("");
        },
        onPartial: (t) => setPartialTranscript(t),
        onFinal: (t) => {
          setListening(false);
          setPartialTranscript("");
          const clean = t.trim();
          console.info(
            `[voice] transcript final (${clean.length} chars): ` +
              JSON.stringify(clean.slice(0, 100)),
          );
          if (clean.length > 0) {
            sessionRef.current?.hold();
            runTurn(clean, { speak: true });
          } else {
            sessionRef.current?.release();
          }
        },
        onError: (code, message) => {
          console.warn("[voice] session error", code, message);
          setListening(false);
          setPartialTranscript("");
          setVoiceErrorCode(code);
          if (code === "mic_denied" || code === "mic_unavailable") {
            exitVoiceMode();
          }
        },
        onStateChange: (state, detail) =>
          console.info(`[voice] ${state} — ${detail}`),
        onLevels: (i) =>
          console.info(
            `[voice] levels rms=${i.rms.toFixed(4)} thr=${i.threshold.toFixed(4)} ` +
              `echoFloor=${i.echoFloor.toFixed(4)} armed=${i.armed}`,
          ),
      });
      sessionRef.current = session;
      setVoiceMode(true);
      console.info("[voice] mode ON — just speak; cut in any time");
    } catch (err) {
      const e = err as VoiceSessionError;
      setVoiceErrorCode(e?.code ?? "mic_unavailable");
      console.warn("[voice] session failed to start", err);
    }
  }, [getPlayer, markInterrupted, runTurn, exitVoiceMode]);

  const toggleVoice = useCallback(() => {
    if (sessionRef.current) exitVoiceMode();
    else void enterVoiceMode();
  }, [enterVoiceMode, exitVoiceMode]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    playerRef.current?.stop();
    setSpeaking(false);
    if (sessionRef.current?.state() !== "capturing") {
      sessionRef.current?.release();
    }
    setStatus((s) => (s === "thinking" || s === "streaming" ? "idle" : s));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    playerRef.current?.stop();
    setMessages([]);
    setErrorCode(null);
    setVoiceErrorCode(null);
    setVoiceMode(false);
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
    voiceMode,
    listening,
    partialTranscript,
    speaking,
    micLevel,
    playbackLevel,
    send,
    toggleVoice,
    unlockAudio,
    stop,
    reset,
  };
}
