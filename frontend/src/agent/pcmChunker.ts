/**
 * Browser-side resampler + PCM encoder for the Transcribe streaming path
 * (docs/ARCHITECTURE.md § Speech-to-text).
 *
 * WHY THIS EXISTS: Transcribe streaming is told `media-encoding=pcm` and
 * `sample-rate=16000` in the request. The audio frames MUST match that
 * contract exactly or Transcribe drops the session with "The audio you
 * sent is malformed, or the audio doesn't match the parameters you
 * provided" (surfaced to us as a non-retryable streaming error).
 *
 * The trap: `getUserMedia`'s `{ sampleRate: 16000 }` constraint is advisory
 * and Safari ignores it; `new AudioContext({ sampleRate: 16000 })` is more
 * reliable but still not guaranteed. So the capture graph can be running at
 * 44100 or 48000 Hz. This module does a continuous linear-interpolation
 * resample to exactly 16 kHz with the fractional read position and the
 * unconsumed input tail carried across every call — no per-block
 * discontinuity — then encodes signed 16-bit little-endian mono PCM and
 * batches it into ~100 ms chunks (the size Transcribe streaming wants).
 * When the input is already 16 kHz the resample is a pass-through.
 *
 * WHY AN AudioWorklet AND NOT AN OfflineAudioContext: an
 * `OfflineAudioContext` renders a *fixed-length* buffer, so using it for a
 * live mic stream means spinning one up per audio block — allocation churn
 * ~50×/s, an async `startRendering()` in the hot path, and (the real
 * killer) no filter/resampler state carried between blocks, which
 * reintroduces exactly the boundary artifacts we're removing. An
 * `AudioWorklet` runs on the audio render thread, receives a steady 128-
 * frame quantum, and lets the resampler keep its state across quanta.
 * `ScriptProcessorNode` (the old approach) is deprecated, main-thread, and
 * increasingly unreliable on Safari.
 *
 * `createResampler` is a pure function (only `Float32Array` / `DataView` /
 * `Math`), so it is unit-tested in Node by `scripts/verify-resampler.ts`
 * AND stringified into the worklet module below — one implementation, two
 * call sites.
 */

export interface Resampler {
  /** Debug: the input rate this instance was built for, and in/out ratio. */
  readonly inRate: number;
  readonly ratio: number;
  /** Feed one block of mono Float32 samples at `inRate`. `emit` is called
   *  0+ times with a finished ~chunkSize-sample PCM buffer (transferable)
   *  and that chunk's RMS (for voice-activity detection). */
  push(input: Float32Array, emit: (pcm: ArrayBuffer, rms: number) => void): void;
  /** Emit whatever partial chunk is buffered (call on stop). */
  flush(emit: (pcm: ArrayBuffer, rms: number) => void): void;
}

export function createResampler(
  inRate: number,
  targetRate: number,
  chunkSize: number,
): Resampler {
  const ratio = inRate / targetRate;
  const acc = new Float32Array(chunkSize);
  let accLen = 0;
  let carry = new Float32Array(0);
  let readPos = 0;

  function emitChunk(
    n: number,
    emit: (pcm: ArrayBuffer, rms: number) => void,
  ): void {
    const dv = new DataView(new ArrayBuffer(n * 2));
    let sq = 0;
    for (let i = 0; i < n; i++) {
      let v = acc[i];
      v = v < -1 ? -1 : v > 1 ? 1 : v;
      sq += v * v;
      // signed 16-bit, little-endian: -1 -> -32768, +1 -> +32767
      dv.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    emit(dv.buffer, Math.sqrt(sq / n));
  }

  return {
    inRate,
    ratio,
    push(input, emit): void {
      let buf: Float32Array;
      if (carry.length > 0) {
        buf = new Float32Array(carry.length + input.length);
        buf.set(carry, 0);
        buf.set(input, carry.length);
      } else {
        buf = input;
      }

      let pos = readPos;
      const maxStart = buf.length - 1; // need buf[i0] and buf[i0 + 1]
      while (pos < maxStart) {
        const i0 = pos | 0;
        acc[accLen++] = buf[i0] + (buf[i0 + 1] - buf[i0]) * (pos - i0);
        if (accLen === chunkSize) {
          emitChunk(chunkSize, emit);
          accLen = 0;
        }
        pos += ratio;
      }

      // Keep the input from floor(pos) onward; carry the fraction into it.
      const keepFrom = Math.min(pos | 0, buf.length);
      carry = buf.slice(keepFrom);
      readPos = pos - keepFrom;
    },
    flush(emit): void {
      if (accLen > 0) {
        emitChunk(accLen, emit);
        accLen = 0;
      }
    },
  };
}

/**
 * The AudioWorklet module source. `createResampler` is inlined via
 * `.toString()` (it captures no module-scope bindings, so this is safe
 * under bundling/minification). Loaded as a Blob URL so there is no extra
 * Vite asset or MIME-type dependency on the host.
 *
 * `sampleRate` and `registerProcessor` / `AudioWorkletProcessor` are
 * globals in `AudioWorkletGlobalScope`.
 */
export const PCM_WORKLET_SOURCE = `
"use strict";
var createResampler = ${createResampler.toString()};
class PcmChunkerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    var o = (options && options.processorOptions) || {};
    this._r = createResampler(sampleRate, o.targetRate || 16000, o.chunkSize || 1600);
    var self = this;
    this._emit = function (pcm, rms) {
      self.port.postMessage({ pcm: pcm, rms: rms }, [pcm]);
    };
    this.port.onmessage = function (e) {
      if (e && e.data === "flush") self._r.flush(self._emit);
    };
  }
  process(inputs) {
    var input = inputs[0];
    var ch = input && input[0];
    if (ch && ch.length) this._r.push(ch, this._emit);
    return true;
  }
}
registerProcessor("pcm-chunker", PcmChunkerProcessor);
`;

export const PCM_WORKLET_NAME = "pcm-chunker";
