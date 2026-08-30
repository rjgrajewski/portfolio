/**
 * Speech-to-text — Amazon Transcribe streaming, browser-direct
 * (docs/ARCHITECTURE.md § Speech-to-text, § Real-time media transport).
 *
 * A persistent VOICE SESSION, not push-to-talk-per-turn. Once started it
 * holds ONE mic + ONE 16 kHz AudioContext + ONE `pcm-chunker` worklet for
 * the whole voice-mode lifetime. Two internal states:
 *
 *   monitoring — worklet runs, no Transcribe stream open. Voice-activity
 *                detection watches for a speech onset. A 500 ms pre-roll
 *                ring buffer is kept so the first word isn't clipped when
 *                capture starts.
 *   capturing  — a Transcribe streaming WebSocket is open; PCM (pre-roll +
 *                live) is streamed; end-of-utterance silence finalises it.
 *
 * BARGE-IN: while the agent is talking (`hold()` + agent audio active) the
 * session stays in `monitoring` and the VAD keeps watching. A sustained
 * speech onset fires `onSpeechStart("barge-in")` and the session flips
 * straight to `capturing` — the caller stops the agent. Self-interruption
 * (the mic hearing the agent from a phone speaker) is guarded by:
 *   - echoCancellation + noiseSuppression in getUserMedia,
 *   - an ADAPTIVE trigger level = max(speechRms, echoFloorEMA * echoMargin)
 *     that tracks this device's residual echo, measured live,
 *   - a SUSTAIN requirement (3 chunks ~= 300 ms) that rejects taps/clicks,
 *   - a GUARD window (700 ms) after every playback start during which
 *     barge-in is disarmed — the loop-protection window; the echo floor is
 *     seeded during it.
 * `createVad` is pure and is unit-tested by `scripts/verify-vad.ts`.
 *
 * Audio format: request declares `media-encoding=pcm`, `sample-rate=16000`;
 * `pcmChunker.ts` guarantees the bytes match (worklet resample to exactly
 * 16 kHz + s16le). IAM: the browser SDK uses `transcribe:StartStream-
 * TranscriptionWebSocket` (see identity-stack.ts / verify-oq8.ts).
 *
 * Language fixed to `en-US` (Phase 4 is English only). Text is always the
 * fallback: every failure calls `onError(code)` and the session drops back
 * to `monitoring` (or, for a mic failure, the caller closes it).
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
import {
  createVad,
  DEFAULT_VAD,
  type MonitorVerdict,
  type VadParams,
} from "./vad";

export type { MonitorVerdict, VadParams } from "./vad";
export { DEFAULT_VAD, createVad } from "./vad";

export type SttErrorCode =
  | "mic_denied"
  | "mic_unavailable"
  | "transcribe_failed"
  | "credentials_refused";

export class VoiceSessionError extends Error {
  constructor(
    readonly code: SttErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VoiceSessionError";
  }
}

const TARGET_RATE = 16000;
const CHUNK_SAMPLES = 1600; // 100 ms @ 16 kHz — the size Transcribe wants
const PREROLL_CHUNKS = 5; // ~500 ms kept before a capture starts
const MAX_LISTEN_MS = 30000;

// ---------------------------------------------------------------------------
// Async queue that is also an async iterable — no lost-wakeup races.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The voice session
// ---------------------------------------------------------------------------

export type VoiceSessionState = "monitoring" | "capturing";

export interface VoiceSession {
  state(): VoiceSessionState;
  /** Current mic loudness, 0..1 (smoothed). For the visualization only. */
  micLevel(): number;
  /** The agent's turn is starting — keep monitoring (for barge-in) but
   *  don't treat ambient noise as a new question. */
  hold(): void;
  /** The agent's turn is fully done — resume plain monitoring. */
  release(): void;
  /** The agent's audio just started playing — arms the loop guard. */
  noteAgentAudioStart(): void;
  /** The agent's audio finished. */
  noteAgentAudioEnd(): void;
  /** Tear down: release the mic entirely. */
  close(): void;
}

export interface VoiceSessionCallbacks {
  /** A speech onset was detected while monitoring. `reason` is "barge-in"
   *  if the agent was mid-turn (caller must stop it), else "new-question".
   *  The session is already transitioning to `capturing`. */
  onSpeechStart: (reason: "new-question" | "barge-in") => void;
  onPartial: (text: string) => void;
  /** An utterance ended on silence. */
  onFinal: (text: string) => void;
  onError: (code: SttErrorCode, message: string) => void;
  onStateChange?: (state: VoiceSessionState, detail: string) => void;
  /** Level telemetry — only emitted while the agent is speaking (the window
   *  where the barge-in threshold matters), throttled to ~1/s. */
  onLevels?: (info: MonitorVerdict & { rms: number }) => void;
}

export async function createVoiceSession(
  cb: VoiceSessionCallbacks,
  vadParams: VadParams = DEFAULT_VAD,
): Promise<VoiceSession> {
  // --- acquire mic + audio graph (before resolving) -----------------
  let mediaStream: MediaStream;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: TARGET_RATE,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err) {
    const name = (err as Error)?.name;
    throw new VoiceSessionError(
      name === "NotAllowedError" || name === "SecurityError"
        ? "mic_denied"
        : "mic_unavailable",
      name === "NotAllowedError"
        ? "Microphone access was blocked."
        : "No microphone is available.",
    );
  }

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioCtx = new Ctor({ sampleRate: TARGET_RATE });
  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch {
      /* input contexts don't need a gesture; ignore */
    }
  }
  if (!audioCtx.audioWorklet) {
    mediaStream.getTracks().forEach((t) => t.stop());
    throw new VoiceSessionError(
      "mic_unavailable",
      "This browser can't capture audio for voice.",
    );
  }

  const workletUrl = URL.createObjectURL(
    new Blob([PCM_WORKLET_SOURCE], { type: "application/javascript" }),
  );
  try {
    await audioCtx.audioWorklet.addModule(workletUrl);
  } catch (err) {
    URL.revokeObjectURL(workletUrl);
    mediaStream.getTracks().forEach((t) => t.stop());
    void audioCtx.close();
    console.warn("[stt] audioWorklet.addModule failed", err);
    throw new VoiceSessionError("mic_unavailable", "Couldn't start audio capture.");
  }
  URL.revokeObjectURL(workletUrl);

  const sourceNode = audioCtx.createMediaStreamSource(mediaStream);
  const workletNode = new AudioWorkletNode(audioCtx, PCM_WORKLET_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: "explicit",
    processorOptions: { targetRate: TARGET_RATE, chunkSize: CHUNK_SAMPLES },
  });
  const sink = audioCtx.createGain();
  sink.gain.value = 0;
  sourceNode.connect(workletNode);
  workletNode.connect(sink);
  sink.connect(audioCtx.destination);

  // A second, read-only tap off the mic for the agent visualization
  // (AgentVisualization.tsx polls `micLevel()` on its own rAF clock). No
  // extra mic stream — same `sourceNode`. The analyser runs on the audio
  // thread; the level read is a cheap typed-array copy.
  const micAnalyser = audioCtx.createAnalyser();
  micAnalyser.fftSize = 512;
  micAnalyser.smoothingTimeConstant = 0.5;
  sourceNode.connect(micAnalyser);
  const micLevelBuf = new Float32Array(micAnalyser.fftSize);

  console.info(
    `[stt] voice session live — AudioContext ${audioCtx.sampleRate} Hz`,
  );

  // --- session state ---------------------------------------------
  const vad = createVad(vadParams);
  let state: VoiceSessionState = "monitoring";
  let holding = false;
  let agentAudioActive = false;
  let closed = false;

  const preroll: Uint8Array[] = [];

  let captureQueue: ChunkQueue | null = null;
  let captureEndReason: "final" | "abort" | "error" = "final";
  let finalText = "";
  let hardCap: ReturnType<typeof setTimeout> | null = null;
  let lastLevelLogAt = 0;

  function setState(next: VoiceSessionState, detail: string): void {
    state = next;
    cb.onStateChange?.(next, detail);
  }

  workletNode.port.onmessage = (ev: MessageEvent) => {
    if (closed) return;
    const d = ev.data as { pcm: ArrayBuffer; rms: number };
    const bytes = new Uint8Array(d.pcm);
    const now = performance.now();

    if (state === "capturing") {
      captureQueue?.push(bytes);
      if (vad.captureFrame(d.rms, now).endOfTurn) endCapture("final");
      return;
    }

    // monitoring — keep the pre-roll ring and run onset detection
    preroll.push(bytes);
    if (preroll.length > PREROLL_CHUNKS) preroll.shift();

    const v = vad.monitorFrame(d.rms, { agentAudioActive, now });
    if (
      cb.onLevels &&
      holding &&
      agentAudioActive &&
      now - lastLevelLogAt > 900
    ) {
      lastLevelLogAt = now;
      cb.onLevels({ ...v, rms: d.rms });
    }
    if (v.trigger) beginCapture(holding ? "barge-in" : "new-question", now);
  };

  function beginCapture(
    reason: "new-question" | "barge-in",
    now: number,
  ): void {
    if (state === "capturing" || closed) return;
    vad.startCapture(now);
    finalText = "";
    captureEndReason = "final";
    captureQueue = new ChunkQueue();
    for (const c of preroll) captureQueue.push(c);
    preroll.length = 0;
    setState("capturing", reason);
    cb.onSpeechStart(reason);
    hardCap = setTimeout(() => endCapture("final"), MAX_LISTEN_MS);
    void runCapture();
  }

  function endCapture(reason: "final" | "abort"): void {
    if (state !== "capturing") return;
    if (hardCap) {
      clearTimeout(hardCap);
      hardCap = null;
    }
    captureEndReason = reason;
    captureQueue?.close(); // lets the WS + result loop wind down
  }

  async function* audioEvents(
    q: ChunkQueue,
  ): AsyncGenerator<{ AudioEvent: { AudioChunk: Uint8Array } }> {
    for await (const chunk of q) {
      yield { AudioEvent: { AudioChunk: chunk } };
    }
  }

  async function runCapture(): Promise<void> {
    let creds;
    try {
      creds = await getMediaCredentials();
    } catch (err) {
      // Surface the REAL reason (media_breaker_tripped / media_throttled /
      // media_internal / network / not_configured) — the UI collapses all of
      // these to one "credentials_refused" notice, so the console is the only
      // place the actual cause is visible.
      console.warn(
        "[stt] media credentials unavailable —",
        err instanceof MediaCredentialError
          ? `${err.code}: ${err.message}`
          : String(err),
      );
      clearMediaCredentials();
      finishCapture(
        "error",
        "credentials_refused",
        err instanceof MediaCredentialError ? err.message : "Couldn't start voice.",
      );
      return;
    }
    if (state !== "capturing" || closed) return;

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
          AudioStream: audioEvents(captureQueue!),
        }),
      );

      for await (const evt of res.TranscriptResultStream ?? []) {
        if (state !== "capturing" || closed) break;
        const results = evt.TranscriptEvent?.Transcript?.Results ?? [];
        let partialTail = "";
        for (const r of results) {
          const t = r.Alternatives?.[0]?.Transcript ?? "";
          if (!t) continue;
          if (r.IsPartial) partialTail = t;
          else finalText = `${finalText} ${t}`.trim();
        }
        cb.onPartial(`${finalText} ${partialTail}`.trim());
      }
    } catch (err) {
      clearMediaCredentials();
      if (err instanceof MediaCredentialError) {
        console.warn(
          "[stt] media credentials unavailable mid-stream —",
          `${err.code}: ${err.message}`,
        );
        finishCapture("error", "credentials_refused", err.message);
      } else if (state === "capturing") {
        console.warn("[stt] Transcribe stream error", err);
        finishCapture("error", "transcribe_failed", "Transcription failed.");
      }
      return;
    }

    // WS ended because endCapture() closed the queue.
    finishCapture(captureEndReason === "abort" ? "abort" : "final");
  }

  function finishCapture(
    reason: "final" | "abort" | "error",
    code?: SttErrorCode,
    message?: string,
  ): void {
    if (state !== "capturing") return;
    if (hardCap) {
      clearTimeout(hardCap);
      hardCap = null;
    }
    captureQueue = null;
    vad.resetMonitor();
    setState(
      "monitoring",
      reason === "error"
        ? `capture error: ${code}`
        : reason === "abort"
          ? "capture aborted"
          : "capture ended",
    );
    if (reason === "final") cb.onFinal(finalText.trim());
    else if (reason === "error" && code) cb.onError(code, message ?? "Voice failed.");
  }

  return {
    state: () => state,
    micLevel() {
      micAnalyser.getFloatTimeDomainData(micLevelBuf);
      let sum = 0;
      for (let i = 0; i < micLevelBuf.length; i++) {
        sum += micLevelBuf[i] * micLevelBuf[i];
      }
      // RMS of conversational speech ≈ 0.05–0.15 → map to a lively 0.4–1.
      return Math.min(1, Math.sqrt(sum / micLevelBuf.length) * 9);
    },
    hold() {
      holding = true;
      cb.onStateChange?.(state, "hold — agent turn");
    },
    release() {
      if (!holding && !agentAudioActive) return;
      holding = false;
      agentAudioActive = false;
      vad.resetMonitor();
      cb.onStateChange?.(state, "released — monitoring for next");
    },
    noteAgentAudioStart() {
      agentAudioActive = true;
      vad.noteAgentAudioStart(performance.now());
      cb.onStateChange?.(state, "agent audio start — barge-in disarmed (guard)");
    },
    noteAgentAudioEnd() {
      agentAudioActive = false;
      cb.onStateChange?.(state, "agent audio end");
    },
    close() {
      if (closed) return;
      closed = true;
      captureQueue?.close();
      captureQueue = null;
      if (hardCap) clearTimeout(hardCap);
      try {
        workletNode.port.postMessage("flush");
        workletNode.disconnect();
        sourceNode.disconnect();
        sink.disconnect();
        micAnalyser.disconnect();
      } catch {
        /* ignore */
      }
      mediaStream.getTracks().forEach((t) => t.stop());
      if (audioCtx.state !== "closed") void audioCtx.close();
      cb.onStateChange?.("monitoring", "session closed");
      console.info("[stt] voice session closed");
    },
  };
}
