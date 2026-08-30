/**
 * Speech-to-text — Amazon Transcribe streaming, browser-direct
 * (docs/ARCHITECTURE.md § Speech-to-text, § Real-time media transport).
 *
 * The browser opens the mic, streams 16 kHz mono PCM straight to Transcribe
 * using short-lived credentials from the vending Lambda (mediaCredentials.ts
 * — the OQ-8 path, breaker-checked, no Cognito). Interim results are
 * reported live; the turn ends automatically after a short silence once the
 * visitor has actually said something, or on a hard time cap, or when the
 * caller stops it.
 *
 * Language is fixed to `en-US` — Phase 4 is English only; the EN/PL toggle
 * is Phase 5 (docs/ROADMAP.md).
 *
 * Text is always the fallback: every failure path calls `onError(code)` and
 * ends cleanly, leaving the text composer untouched.
 */

import {
  StartStreamTranscriptionCommand,
  TranscribeStreamingClient,
} from "@aws-sdk/client-transcribe-streaming";
import { runtimeConfig } from "../config/runtime";
import {
  clearMediaCredentials,
  getMediaCredentials,
  MediaCredentialError,
} from "./mediaCredentials";

export type SttErrorCode =
  | "mic_denied"
  | "mic_unavailable"
  | "transcribe_failed"
  | "credentials_refused";

export interface RecognizerCallbacks {
  /** Best transcript so far (finalised segments + current partial). */
  onPartial?: (text: string) => void;
  /** Fired once, when listening ends normally — the full transcript
   *  (may be empty if nothing was said). */
  onFinal?: (text: string) => void;
  onError?: (code: SttErrorCode, message: string) => void;
}

export interface RecognizerHandle {
  /** Stop listening and finalise (normal "I'm done talking"). */
  stop(): void;
  /** Abandon — no `onFinal`. */
  cancel(): void;
  /** True between start and end. */
  isListening(): boolean;
}

const TARGET_RATE = 16000;
const SILENCE_MS = 1300;
const MAX_LISTEN_MS = 30000;
const SPEECH_RMS = 0.014;
const SILENCE_RMS = 0.008;

export function startListening(cb: RecognizerCallbacks): RecognizerHandle {
  let listening = true;
  let finished = false;

  let mediaStream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let sink: GainNode | null = null;

  // PCM chunk queue with async backpressure.
  const chunks: Uint8Array[] = [];
  let notify: (() => void) | null = null;
  let closed = false;

  let heardSpeech = false;
  let lastLoudAt = 0;
  let hardCap: ReturnType<typeof setTimeout> | null = null;

  let finalText = "";

  function pushChunk(u8: Uint8Array): void {
    chunks.push(u8);
    notify?.();
  }

  function closeAudioQueue(): void {
    closed = true;
    notify?.();
  }

  async function* audioStream(): AsyncGenerator<{
    AudioEvent: { AudioChunk: Uint8Array };
  }> {
    for (;;) {
      if (chunks.length === 0) {
        if (closed) return;
        await new Promise<void>((r) => (notify = r));
        notify = null;
        continue;
      }
      const next = chunks.shift()!;
      yield { AudioEvent: { AudioChunk: next } };
    }
  }

  function teardownAudio(): void {
    try {
      processor?.disconnect();
      sourceNode?.disconnect();
      sink?.disconnect();
    } catch {
      /* ignore */
    }
    processor = null;
    sourceNode = null;
    sink = null;
    mediaStream?.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    if (audioCtx && audioCtx.state !== "closed") void audioCtx.close();
    audioCtx = null;
    if (hardCap) clearTimeout(hardCap);
    hardCap = null;
  }

  function finish(kind: "final" | "cancel"): void {
    if (finished) return;
    finished = true;
    listening = false;
    closeAudioQueue();
    teardownAudio();
    if (kind === "final") cb.onFinal?.(finalText.trim());
  }

  function emitError(code: SttErrorCode, message: string): void {
    if (finished) return;
    finished = true;
    listening = false;
    closeAudioQueue();
    teardownAudio();
    cb.onError?.(code, message);
  }

  function onFrame(input: Float32Array, inRate: number): void {
    if (!listening) return;

    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    const now = performance.now();

    if (rms > SPEECH_RMS) {
      heardSpeech = true;
      lastLoudAt = now;
    } else if (rms > SILENCE_RMS) {
      lastLoudAt = now;
    }
    if (heardSpeech && now - lastLoudAt > SILENCE_MS) {
      // Natural end of turn.
      finish("final");
      return;
    }

    pushChunk(encodePcm16(input, inRate));
  }

  async function run(): Promise<void> {
    // 1. mic permission
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        emitError("mic_denied", "Microphone access was blocked.");
      } else {
        emitError("mic_unavailable", "No microphone is available.");
      }
      return;
    }

    // 2. credentials (breaker-checked vend)
    let creds;
    try {
      creds = await getMediaCredentials();
    } catch (err) {
      const message =
        err instanceof MediaCredentialError
          ? err.message
          : "Couldn't start voice.";
      emitError("credentials_refused", message);
      return;
    }

    if (!listening) {
      teardownAudio();
      return;
    }

    // 3. mic → PCM pump
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    audioCtx = new Ctor();
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch {
        /* the mic-button gesture should have covered this */
      }
    }
    const inRate = audioCtx.sampleRate;
    sourceNode = audioCtx.createMediaStreamSource(mediaStream);
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => onFrame(e.inputBuffer.getChannelData(0), inRate);
    // Route mic → processor → muted sink. The sink keeps `onaudioprocess`
    // firing (some browsers need the node graph to reach `destination`)
    // while `gain = 0` means the mic is never echoed back to the speakers.
    sink = audioCtx.createGain();
    sink.gain.value = 0;
    sourceNode.connect(processor);
    processor.connect(sink);
    sink.connect(audioCtx.destination);

    lastLoudAt = performance.now();
    hardCap = setTimeout(() => finish("final"), MAX_LISTEN_MS);

    // 4. Transcribe streaming
    const client = new TranscribeStreamingClient({
      region: runtimeConfig.mediaRegion,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });

    try {
      const res = await client.send(
        new StartStreamTranscriptionCommand({
          LanguageCode: "en-US",
          MediaEncoding: "pcm",
          MediaSampleRateHertz: TARGET_RATE,
          AudioStream: audioStream(),
        }),
      );

      for await (const evt of res.TranscriptResultStream ?? []) {
        if (finished) break;
        const results = evt.TranscriptEvent?.Transcript?.Results ?? [];
        let partialTail = "";
        for (const r of results) {
          const text = r.Alternatives?.[0]?.Transcript ?? "";
          if (!text) continue;
          if (r.IsPartial) {
            partialTail = text;
          } else {
            finalText = `${finalText} ${text}`.trim();
          }
        }
        cb.onPartial?.(`${finalText} ${partialTail}`.trim());
      }
    } catch (err) {
      clearMediaCredentials();
      if (err instanceof MediaCredentialError) {
        emitError("credentials_refused", err.message);
      } else if (!finished) {
        emitError("transcribe_failed", "Transcription failed.");
      }
      return;
    }

    // Stream ended (we closed the audio queue on stop()/silence).
    if (!finished) finish("final");
  }

  void run();

  return {
    stop() {
      if (finished) return;
      // Let the last audio flush; the result loop will resolve and finish().
      listening = false;
      closeAudioQueue();
    },
    cancel() {
      finish("cancel");
    },
    isListening() {
      return listening && !finished;
    },
  };
}

/** Float32 @ inRate → Int16LE @ 16 kHz, little-endian bytes. */
function encodePcm16(input: Float32Array, inRate: number): Uint8Array {
  const ratio = inRate / TARGET_RATE;
  const outLen = ratio <= 1 ? input.length : Math.floor(input.length / ratio);
  const out = new DataView(new ArrayBuffer(outLen * 2));
  let pos = 0;
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = ratio <= 1 ? start + 1 : Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < input.length; j++) {
      sum += input[j];
      count++;
    }
    let s = count > 0 ? sum / count : 0;
    s = Math.max(-1, Math.min(1, s));
    out.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    pos += 2;
  }
  return new Uint8Array(out.buffer);
}
