/**
 * Spoken playback of the agent's answer — Amazon Polly, generative engine,
 * browser-direct (docs/ARCHITECTURE.md § Text-to-speech, § Real-time media
 * transport).
 *
 * OQ-4 (resolved): Polly's bidirectional streaming API
 * (`StartSpeechSynthesisStream`, shipped 2026-03) is real and in the JS v3
 * SDK, but its request-side event stream needs Node's HTTP/2 handler —
 * browsers can't open raw HTTP/2 from JS and there is no WebSocket variant
 * (unlike Transcribe). So it is NOT reachable browser-direct. This module
 * uses the sentence-chunked `SynthesizeSpeech` fallback the architecture
 * already anticipated: as the reasoning stream produces text, complete
 * sentences are cut off and synthesised; sentence n+1 is synthesised while
 * sentence n plays. First audio starts the moment the first sentence's MP3
 * decodes — while the answer is still streaming. Decision recorded in
 * docs/DECISIONS.md.
 *
 * Voice: `Ruth` (en-US generative) — see docs/voice-notes.md.
 *
 * Text is always the source of truth. Every failure here is surfaced as an
 * `onError(code)` and playback simply stops; the transcript stays on screen.
 */

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { runtimeConfig } from "../config/runtime";
import {
  clearMediaCredentials,
  getMediaCredentials,
  MediaCredentialError,
  type MediaCredentials,
} from "./mediaCredentials";

export type TtsErrorCode = "polly_failed" | "credentials_refused";

export interface SpeechPlayer {
  /** Resume the AudioContext from inside a user gesture (mobile autoplay
   *  unlock). Safe to call repeatedly. */
  unlock(): Promise<void>;
  /** Feed a chunk of answer text as it streams in. */
  push(textDelta: string): void;
  /** No more text is coming — synthesise whatever's buffered. */
  end(): void;
  /** Stop immediately, drop the queue (new turn / switched to text / user
   *  hit stop). */
  stop(): void;
  /** True while audio is scheduled or playing. */
  isSpeaking(): boolean;
}

const VOICE_ID = "Ruth";
const MAX_CLAUSE_CHARS = 180;

// A complete sentence: run of non-terminators, then one or more terminators,
// then optional closing quote/bracket, then trailing space.
const SENTENCE_RE = /[^.!?…]+[.!?…]+["'”’)\]]*\s+/g;

interface SpeechPlayerOptions {
  onError?: (code: TtsErrorCode, message: string) => void;
  onStart?: () => void;
  onIdle?: () => void;
}

export function createSpeechPlayer(opts: SpeechPlayerOptions = {}): SpeechPlayer {
  let ctx: AudioContext | null = null;
  let pollyClient: PollyClient | null = null;
  let clientKey = "";

  let textBuf = "";
  let ended = false;
  let stopped = false;

  const synthQueue: string[] = [];
  let synthRunning = false;

  const liveSources = new Set<AudioBufferSourceNode>();
  let nextStartAt = 0;
  let announcedStart = false;

  function getCtx(): AudioContext {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new Ctor();
    }
    return ctx;
  }

  async function client(): Promise<PollyClient> {
    const creds: MediaCredentials = await getMediaCredentials();
    if (!pollyClient || clientKey !== creds.accessKeyId) {
      pollyClient = new PollyClient({
        region: runtimeConfig.mediaRegion,
        credentials: {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
        },
      });
      clientKey = creds.accessKeyId;
    }
    return pollyClient;
  }

  function cutSentences(final: boolean): void {
    let m: RegExpExecArray | null;
    SENTENCE_RE.lastIndex = 0;
    let consumed = 0;
    while ((m = SENTENCE_RE.exec(textBuf)) !== null) {
      const s = m[0].trim();
      if (s) synthQueue.push(s);
      consumed = SENTENCE_RE.lastIndex;
    }
    if (consumed > 0) textBuf = textBuf.slice(consumed);

    // No terminator yet but the clause is long — break on the last space so
    // playback doesn't stall waiting for a period.
    if (!final && textBuf.length > MAX_CLAUSE_CHARS) {
      const sp = textBuf.lastIndexOf(" ", MAX_CLAUSE_CHARS);
      if (sp > 20) {
        synthQueue.push(textBuf.slice(0, sp).trim());
        textBuf = textBuf.slice(sp + 1);
      }
    }

    if (final) {
      const rest = textBuf.trim();
      if (rest) synthQueue.push(rest);
      textBuf = "";
    }

    void runSynth();
  }

  async function runSynth(): Promise<void> {
    if (synthRunning || stopped) return;
    synthRunning = true;
    try {
      while (synthQueue.length > 0 && !stopped) {
        const sentence = synthQueue.shift()!;
        let bytes: Uint8Array;
        try {
          const c = await client();
          const res = await c.send(
            new SynthesizeSpeechCommand({
              Engine: "generative",
              VoiceId: VOICE_ID,
              OutputFormat: "mp3",
              Text: sentence,
            }),
          );
          if (!res.AudioStream) throw new Error("empty AudioStream");
          bytes = await res.AudioStream.transformToByteArray();
        } catch (err) {
          clearMediaCredentials();
          if (err instanceof MediaCredentialError) {
            fail("credentials_refused", err.message);
          } else {
            fail("polly_failed", "Speech synthesis failed.");
          }
          return;
        }

        if (stopped) return;
        try {
          const audioCtx = getCtx();
          // Copy into a fresh, standalone ArrayBuffer — the SDK's Uint8Array
          // can be a view into a larger (and possibly shared) buffer.
          const ab = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(ab).set(bytes);
          const buf = await audioCtx.decodeAudioData(ab);
          if (!stopped) schedule(buf);
        } catch {
          // A single undecodable chunk shouldn't kill the whole answer.
          // Skip it and keep going.
        }
      }
    } finally {
      synthRunning = false;
      if (synthQueue.length > 0 && !stopped) void runSynth();
    }
  }

  function schedule(buf: AudioBuffer): void {
    const audioCtx = getCtx();
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);

    const startAt = Math.max(audioCtx.currentTime + 0.02, nextStartAt);
    src.start(startAt);
    nextStartAt = startAt + buf.duration;

    liveSources.add(src);
    src.onended = () => {
      liveSources.delete(src);
      if (liveSources.size === 0 && synthQueue.length === 0 && !synthRunning) {
        opts.onIdle?.();
      }
    };

    if (!announcedStart) {
      announcedStart = true;
      opts.onStart?.();
    }
  }

  function fail(code: TtsErrorCode, message: string): void {
    if (stopped) return;
    stop();
    opts.onError?.(code, message);
  }

  function stop(): void {
    stopped = true;
    synthQueue.length = 0;
    textBuf = "";
    for (const src of liveSources) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    liveSources.clear();
    nextStartAt = 0;
  }

  return {
    async unlock() {
      const audioCtx = getCtx();
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch {
          /* ignore — will retry on next gesture */
        }
      }
      // iOS needs an actual buffer played inside the gesture.
      try {
        const src = audioCtx.createBufferSource();
        src.buffer = audioCtx.createBuffer(1, 1, 22050);
        src.connect(audioCtx.destination);
        src.start(0);
      } catch {
        /* ignore */
      }
    },
    push(delta: string) {
      if (stopped || ended) return;
      textBuf += delta;
      cutSentences(false);
    },
    end() {
      if (stopped || ended) return;
      ended = true;
      cutSentences(true);
    },
    stop,
    isSpeaking() {
      const audioCtx = ctx;
      if (!audioCtx) return false;
      return (
        liveSources.size > 0 ||
        nextStartAt > audioCtx.currentTime ||
        synthQueue.length > 0 ||
        synthRunning
      );
    },
  };
}
