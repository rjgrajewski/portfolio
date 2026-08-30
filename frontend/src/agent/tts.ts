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
 * uses the sentence-chunked `SynthesizeSpeech` fallback: as the reasoning
 * stream produces text, complete sentences are cut off and synthesised;
 * sentence n+1 is synthesised while sentence n plays. First audio starts the
 * moment the first sentence's MP3 decodes — while the answer is still
 * streaming.
 *
 * LIFECYCLE — a spoken answer is one "utterance":
 *   begin()  — start a fresh utterance (halts any prior playback, clears the
 *              per-utterance latch). MUST be called before push().
 *   push()   — feed answer-text deltas.
 *   end()    — no more text; synthesise whatever's buffered.
 *   stop()   — hard halt (error / user switched to text / teardown). Unlike
 *              begin()'s reset, stop() leaves the player inert until the
 *              next begin().
 * An earlier version had only stop(), whose latch was never cleared, so the
 * synth path silently never ran (no Polly call, no error). begin() is the fix.
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
  /** Start a fresh spoken answer — halts any prior playback and clears the
   *  stop latch. Call once, before the first push(). */
  begin(): void;
  /** Feed a chunk of answer text as it streams in. */
  push(textDelta: string): void;
  /** No more text is coming — synthesise whatever's buffered. */
  end(): void;
  /** Hard halt: drop the queue, stop playback, stay inert until begin(). */
  stop(): void;
  /** True while audio is scheduled or playing. */
  isSpeaking(): boolean;
  /** Current playback loudness, 0..1 (smoothed). For the visualization. */
  playbackLevel(): number;
}

const VOICE_ID = "Ruth";
const MAX_CLAUSE_CHARS = 180;

// A complete sentence: run of non-terminators, then one or more terminators,
// then optional closing quote/bracket, then trailing whitespace.
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
  let stopped = true; // inert until begin()
  /** Bumped by begin()/stop(); a synth loop or decode from an older
   *  utterance checks this so a late Polly response can't play over a new
   *  answer. */
  let epoch = 0;

  const synthQueue: string[] = [];
  let synthRunning = false;
  let sentenceNo = 0;

  const liveSources = new Set<AudioBufferSourceNode>();
  let nextStartAt = 0;
  let announcedStart = false;

  let analyser: AnalyserNode | null = null;
  let levelBuf: Float32Array<ArrayBuffer> | null = null;

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

  /** Shared analyser on the output path — every scheduled source routes
   *  through it so the visualization can pulse in time with the voice. */
  function getOutNode(): AudioNode {
    const audioCtx = getCtx();
    if (!analyser) {
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.55;
      analyser.connect(audioCtx.destination);
      levelBuf = new Float32Array(analyser.fftSize);
    }
    return analyser;
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
      if (s) enqueue(s);
      consumed = SENTENCE_RE.lastIndex;
    }
    if (consumed > 0) textBuf = textBuf.slice(consumed);

    // No terminator yet but the clause is long — break on the last space so
    // playback doesn't stall waiting for a period.
    if (!final && textBuf.length > MAX_CLAUSE_CHARS) {
      const sp = textBuf.lastIndexOf(" ", MAX_CLAUSE_CHARS);
      if (sp > 20) {
        enqueue(textBuf.slice(0, sp).trim());
        textBuf = textBuf.slice(sp + 1);
      }
    }

    if (final) {
      const rest = textBuf.trim();
      if (rest) enqueue(rest);
      textBuf = "";
    }

    void runSynth();
  }

  function enqueue(sentence: string): void {
    synthQueue.push(sentence);
    console.info(
      `[tts] queued sentence #${++sentenceNo} (${sentence.length} chars): ` +
        JSON.stringify(sentence.slice(0, 80)),
    );
  }

  async function runSynth(): Promise<void> {
    if (synthRunning || stopped) return;
    const myEpoch = epoch;
    synthRunning = true;
    try {
      while (synthQueue.length > 0 && !stopped && epoch === myEpoch) {
        const sentence = synthQueue.shift()!;
        let bytes: Uint8Array;
        try {
          console.info(`[tts] synth → Polly (${VOICE_ID}, generative): ` + JSON.stringify(sentence.slice(0, 80)));
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
          console.info(`[tts] Polly ok: ${bytes.byteLength} bytes mp3`);
        } catch (err) {
          clearMediaCredentials();
          if (err instanceof MediaCredentialError) {
            // The specific cause (media_breaker_tripped / media_throttled /
            // …) — the UI shows only the generic "credentials_refused" notice.
            console.warn(
              "[tts] media credentials unavailable —",
              `${err.code}: ${err.message}`,
            );
            fail("credentials_refused", err.message);
          } else {
            console.warn("[tts] Polly request failed", err);
            fail("polly_failed", "Speech synthesis failed.");
          }
          return;
        }

        if (stopped || epoch !== myEpoch) return;
        try {
          const audioCtx = getCtx();
          // Copy into a fresh, standalone ArrayBuffer — the SDK's Uint8Array
          // can be a view into a larger (and possibly shared) buffer.
          const ab = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(ab).set(bytes);
          const buf = await audioCtx.decodeAudioData(ab);
          if (!stopped && epoch === myEpoch) schedule(buf);
        } catch (err) {
          // A single undecodable chunk shouldn't kill the whole answer.
          console.warn("[tts] decodeAudioData failed for one chunk — skipping", err);
        }
      }
    } finally {
      synthRunning = false;
      if (synthQueue.length > 0 && !stopped && epoch === myEpoch) void runSynth();
    }
  }

  function schedule(buf: AudioBuffer): void {
    const audioCtx = getCtx();
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(getOutNode());

    const startAt = Math.max(audioCtx.currentTime + 0.02, nextStartAt);
    src.start(startAt);
    nextStartAt = startAt + buf.duration;
    console.info(
      `[tts] scheduled chunk: starts +${(startAt - audioCtx.currentTime).toFixed(2)}s, ` +
        `dur ${buf.duration.toFixed(2)}s`,
    );

    liveSources.add(src);
    src.onended = () => {
      liveSources.delete(src);
      if (liveSources.size === 0 && synthQueue.length === 0 && !synthRunning) {
        console.info("[tts] idle (playback complete)");
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

  function haltPlayback(): void {
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

  function stop(): void {
    epoch++;
    stopped = true;
    haltPlayback();
  }

  function begin(): void {
    epoch++;
    haltPlayback();
    stopped = false;
    ended = false;
    announcedStart = false;
    sentenceNo = 0;
    console.info("[tts] begin (new spoken answer)");
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
      console.info(`[tts] unlock: AudioContext state = ${audioCtx.state}`);
    },
    begin,
    push(delta: string) {
      if (stopped || ended) return;
      textBuf += delta;
      cutSentences(false);
    },
    end() {
      if (stopped || ended) return;
      ended = true;
      console.info(`[tts] end (flush ${textBuf.length} buffered chars)`);
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
    playbackLevel() {
      if (!analyser || !levelBuf) return 0;
      analyser.getFloatTimeDomainData(levelBuf);
      let sum = 0;
      for (let i = 0; i < levelBuf.length; i++) sum += levelBuf[i] * levelBuf[i];
      return Math.min(1, Math.sqrt(sum / levelBuf.length) * 6);
    },
  };
}
