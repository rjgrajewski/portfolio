/**
 * Speech-to-text — Amazon Transcribe streaming, browser-direct
 * (docs/ARCHITECTURE.md § Speech-to-text, § Real-time media transport).
 *
 * The browser opens the mic, streams 16 kHz mono signed-16-bit PCM straight
 * to Transcribe using short-lived credentials from the vending Lambda
 * (mediaCredentials.ts — the OQ-8 path). Interim results are reported live;
 * the turn ends automatically after a short silence once the visitor has
 * actually said something, on a hard time cap, or when the caller stops it.
 *
 * Audio format: the request declares `media-encoding=pcm`,
 * `sample-rate=16000`. The bytes MUST match or Transcribe drops the session
 * ("the audio doesn't match the parameters you provided"). The capture
 * `AudioContext` is *requested* at 16 kHz, but that is not guaranteed
 * (Safari in particular), so an AudioWorklet resamples continuously to
 * exactly 16 kHz (pass-through when the context is already there) and
 * encodes the PCM — see pcmChunker.ts for the why and the OfflineAudioContext-
 * vs-AudioWorklet call.
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
import { PCM_WORKLET_NAME, PCM_WORKLET_SOURCE } from "./pcmChunker";

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
const CHUNK_SAMPLES = 1600; // 100 ms @ 16 kHz — the size Transcribe wants
const SILENCE_MS = 1300;
const MAX_LISTEN_MS = 30000;
const SPEECH_RMS = 0.014;
const SILENCE_RMS = 0.008;

/** Async queue that is also an async iterable — no lost-wakeup races. */
class ChunkQueue {
  private items: Uint8Array[] = [];
  private waiters: ((r: IteratorResult<Uint8Array>) => void)[] = [];
  private done = false;

  push(u8: Uint8Array): void {
    if (this.done) return;
    const w = this.waiters.shift();
    if (w) w({ value: u8, done: false });
    else this.items.push(u8);
  }

  close(): void {
    this.done = true;
    let w: ((r: IteratorResult<Uint8Array>) => void) | undefined;
    while ((w = this.waiters.shift())) {
      w({ value: undefined as unknown as Uint8Array, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next: (): Promise<IteratorResult<Uint8Array>> => {
        const v = this.items.shift();
        if (v) return Promise.resolve({ value: v, done: false });
        if (this.done) {
          return Promise.resolve({
            value: undefined as unknown as Uint8Array,
            done: true,
          });
        }
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

export function startListening(cb: RecognizerCallbacks): RecognizerHandle {
  let listening = true;
  let finished = false;

  let mediaStream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let sink: GainNode | null = null;

  const queue = new ChunkQueue();

  let heardSpeech = false;
  let lastLoudAt = 0;
  let hardCap: ReturnType<typeof setTimeout> | null = null;
  let loggedFirstChunk = false;

  let finalText = "";

  async function* audioEvents(): AsyncGenerator<{
    AudioEvent: { AudioChunk: Uint8Array };
  }> {
    for await (const chunk of queue) {
      yield { AudioEvent: { AudioChunk: chunk } };
    }
  }

  function teardownAudio(): void {
    try {
      workletNode?.port.postMessage("flush");
      workletNode?.disconnect();
      sourceNode?.disconnect();
      sink?.disconnect();
    } catch {
      /* ignore */
    }
    workletNode = null;
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
    queue.close();
    teardownAudio();
    if (kind === "final") cb.onFinal?.(finalText.trim());
  }

  function emitError(code: SttErrorCode, message: string): void {
    if (finished) return;
    finished = true;
    listening = false;
    queue.close();
    teardownAudio();
    cb.onError?.(code, message);
  }

  function onChunk(pcm: ArrayBuffer, rms: number): void {
    if (!listening) return;

    if (!loggedFirstChunk) {
      loggedFirstChunk = true;
      const ms = Math.round((pcm.byteLength / 2 / TARGET_RATE) * 1000);
      console.info(
        `[stt] first PCM chunk: ${pcm.byteLength} bytes (~${ms} ms @ ${TARGET_RATE} Hz mono s16le)`,
      );
    }

    const now = performance.now();
    if (rms > SPEECH_RMS) {
      heardSpeech = true;
      lastLoudAt = now;
    } else if (rms > SILENCE_RMS) {
      lastLoudAt = now;
    }
    if (heardSpeech && now - lastLoudAt > SILENCE_MS) {
      finish("final");
      return;
    }

    queue.push(new Uint8Array(pcm));
  }

  async function run(): Promise<void> {
    // 1. mic permission
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: TARGET_RATE, // honoured by Chrome, ignored by Safari
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

    // 3. mic -> AudioWorklet (resample to exactly 16 kHz + PCM encode)
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtx = new Ctor({ sampleRate: TARGET_RATE });
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch {
          /* the mic-button gesture should have covered this */
        }
      }

      const honoured = audioCtx.sampleRate === TARGET_RATE;
      console.info(
        `[stt] AudioContext sampleRate = ${audioCtx.sampleRate} Hz ` +
          `(requested ${TARGET_RATE}; ${honoured ? "pass-through" : "resampling in worklet"})`,
      );

      if (!audioCtx.audioWorklet) {
        emitError(
          "mic_unavailable",
          "This browser can't capture audio for voice.",
        );
        return;
      }

      const url = URL.createObjectURL(
        new Blob([PCM_WORKLET_SOURCE], { type: "application/javascript" }),
      );
      try {
        await audioCtx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      if (!listening || finished) {
        teardownAudio();
        return;
      }

      sourceNode = audioCtx.createMediaStreamSource(mediaStream);
      workletNode = new AudioWorkletNode(audioCtx, PCM_WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: "explicit",
        processorOptions: {
          targetRate: TARGET_RATE,
          chunkSize: CHUNK_SAMPLES,
        },
      });
      workletNode.port.onmessage = (ev: MessageEvent) => {
        const d = ev.data as { pcm: ArrayBuffer; rms: number };
        onChunk(d.pcm, d.rms);
      };

      // Route mic -> worklet -> muted sink -> destination. The sink keeps
      // `process()` pulled while `gain = 0` means the mic is never echoed.
      sink = audioCtx.createGain();
      sink.gain.value = 0;
      sourceNode.connect(workletNode);
      workletNode.connect(sink);
      sink.connect(audioCtx.destination);
    } catch (err) {
      console.warn("[stt] audio setup failed", err);
      emitError("mic_unavailable", "Couldn't start audio capture.");
      return;
    }

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
          AudioStream: audioEvents(),
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
        console.warn("[stt] Transcribe stream error", err);
        emitError("transcribe_failed", "Transcription failed.");
      }
      return;
    }

    if (!finished) finish("final");
  }

  void run();

  return {
    stop() {
      if (finished) return;
      listening = false;
      // Flush the worklet's partial chunk, then end the stream.
      try {
        workletNode?.port.postMessage("flush");
      } catch {
        /* ignore */
      }
      setTimeout(() => queue.close(), 80);
    },
    cancel() {
      finish("cancel");
    },
    isListening() {
      return listening && !finished;
    },
  };
}
