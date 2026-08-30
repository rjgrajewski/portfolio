/**
 * scripts/verify-resampler.ts
 *
 * Regression guard for the Phase 4 voice bug: Transcribe streaming was
 * dropping the session with a non-retryable "the audio doesn't match the
 * parameters you provided" because the browser sent ~44.1/48 kHz audio
 * while the request declared sample-rate=16000.
 *
 * This exercises `createResampler` (frontend/src/agent/pcmChunker.ts) — the
 * exact code that runs inside the AudioWorklet — and asserts:
 *   1. duration is preserved: N input samples at the source rate produce
 *      ~N * 16000 / sourceRate output samples (i.e. the stream really is
 *      16 kHz, not just labelled 16 kHz);
 *   2. pitch is preserved: a 440 Hz sine stays 440 Hz after resampling
 *      (zero-crossing rate ~= 880/s), so the time base isn't stretched;
 *   3. the bytes are valid signed-16-bit little-endian mono PCM in range;
 *   4. 16 kHz input is a true pass-through;
 *   5. the generated AudioWorklet source string parses as valid JS.
 *
 * Run: npm run verify-resampler
 */

import { createResampler, PCM_WORKLET_SOURCE } from "../frontend/src/agent/pcmChunker";

const TARGET = 16000;
const CHUNK = 1600;
const TONE_HZ = 440;

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

function sine(rate: number, seconds: number, hz = TONE_HZ): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.6 * Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

/** Feed `input` through the resampler in realistic 128-frame quanta. */
function runResampler(
  input: Float32Array,
  sourceRate: number,
): { pcm: Int16Array; chunkCount: number } {
  const r = createResampler(sourceRate, TARGET, CHUNK);
  const collected: number[] = [];
  let chunkCount = 0;
  const emit = (buf: ArrayBuffer): void => {
    chunkCount++;
    const dv = new DataView(buf);
    for (let i = 0; i < buf.byteLength; i += 2) collected.push(dv.getInt16(i, true));
  };
  for (let i = 0; i < input.length; i += 128) {
    r.push(input.subarray(i, Math.min(i + 128, input.length)), emit);
  }
  r.flush(emit);
  return { pcm: Int16Array.from(collected), chunkCount };
}

function zeroCrossRate(pcm: Int16Array, rate: number): number {
  let crossings = 0;
  for (let i = 1; i < pcm.length; i++) {
    if ((pcm[i - 1] < 0 && pcm[i] >= 0) || (pcm[i - 1] >= 0 && pcm[i] < 0)) crossings++;
  }
  return crossings / (pcm.length / rate);
}

function checkRate(sourceRate: number, seconds: number): Check[] {
  const input = sine(sourceRate, seconds);
  const { pcm, chunkCount } = runResampler(input, sourceRate);

  const expectedSamples = (input.length * TARGET) / sourceRate;
  const sampleErrPct = Math.abs(pcm.length - expectedSamples) / expectedSamples * 100;
  const durIn = input.length / sourceRate;
  const durOut = pcm.length / TARGET;

  const zcr = zeroCrossRate(pcm, TARGET);
  const zcrErrPct = Math.abs(zcr - 2 * TONE_HZ) / (2 * TONE_HZ) * 100;

  let inRange = true;
  for (let i = 0; i < pcm.length; i++) {
    if (pcm[i] < -32768 || pcm[i] > 32767) {
      inRange = false;
      break;
    }
  }
  const peak = pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  return [
    {
      name: `${sourceRate} Hz -> 16000 Hz: duration preserved`,
      ok: sampleErrPct < 0.5,
      detail: `in ${durIn.toFixed(3)}s -> out ${durOut.toFixed(3)}s (${pcm.length} samples, ${sampleErrPct.toFixed(3)}% off ${Math.round(expectedSamples)})`,
    },
    {
      name: `${sourceRate} Hz -> 16000 Hz: pitch preserved (440 Hz)`,
      ok: zcrErrPct < 3,
      detail: `zero-cross rate ${zcr.toFixed(1)}/s (ideal ${2 * TONE_HZ}, ${zcrErrPct.toFixed(2)}% off)`,
    },
    {
      name: `${sourceRate} Hz -> 16000 Hz: valid s16le, ~100 ms chunks`,
      ok: inRange && peak > 15000 && peak <= 32767 && chunkCount >= 1,
      detail: `peak |amp| ${peak}, ${chunkCount} chunk(s) of ${CHUNK} samples`,
    },
  ];
}

function checkPassThrough(): Check {
  const input = sine(TARGET, 0.5);
  const { pcm } = runResampler(input, TARGET);
  // Compare against a direct encode of the same samples.
  let maxDelta = 0;
  const n = Math.min(pcm.length, input.length);
  for (let i = 0; i < n; i++) {
    const ref = input[i] < 0 ? input[i] * 0x8000 : input[i] * 0x7fff;
    maxDelta = Math.max(maxDelta, Math.abs(pcm[i] - ref));
  }
  return {
    name: "16000 Hz input is a pass-through",
    ok: Math.abs(pcm.length - input.length) <= 2 && maxDelta <= 1,
    detail: `len ${pcm.length} vs ${input.length}, max sample delta ${maxDelta}`,
  };
}

function checkWorkletParses(): Check {
  try {
    // Compile (not run) the worklet source with its globals declared, to
    // catch a broken `.toString()` embedding.
    // eslint-disable-next-line no-new-func
    new Function(
      "AudioWorkletProcessor",
      "registerProcessor",
      "sampleRate",
      PCM_WORKLET_SOURCE,
    );
    return { name: "AudioWorklet source parses as valid JS", ok: true, detail: `${PCM_WORKLET_SOURCE.length} chars` };
  } catch (err) {
    return {
      name: "AudioWorklet source parses as valid JS",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function main(): void {
  const checks: Check[] = [
    ...checkRate(48000, 1.0),
    ...checkRate(44100, 1.0),
    ...checkRate(16000, 1.0),
    checkPassThrough(),
    checkWorkletParses(),
  ];

  for (const c of checks) {
    console.log(`${c.ok ? "✅ PASS" : "❌ FAIL"}  ${c.name} — ${c.detail}`);
  }
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main();
