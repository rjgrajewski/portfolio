/**
 * scripts/verify-vad.ts
 *
 * Unit tests for the barge-in / voice-activity state machine
 * (frontend/src/agent/vad.ts) — the logic that decides, without hardware,
 * whether the visitor has started (or stopped) speaking. The acoustic
 * behaviour on a real phone can't be tested here; this pins the decision
 * rules so a regression is caught before it ships.
 *
 * Chunks are ~100 ms. RMS levels used below (rough, from typical mic input):
 *   silence / room tone ~ 0.003
 *   residual speaker echo (phone, no headphones) ~ 0.02 quiet, ~ 0.045 loud
 *   user speaking to the phone ~ 0.10 - 0.30
 *
 * Run: npm run verify-vad
 */

import { createVad, DEFAULT_VAD } from "../frontend/src/agent/vad";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}
const checks: Check[] = [];
function expect(name: string, ok: boolean, detail = ""): void {
  checks.push({ name, ok, detail });
}

const CHUNK_MS = 100;

// --- 1. fresh question: sustain rejects transients, accepts real speech ---
{
  const vad = createVad();
  let t = 0;
  let triggeredAt = -1;
  // room tone
  for (let i = 0; i < 10; i++, t += CHUNK_MS) {
    if (vad.monitorFrame(0.003, { agentAudioActive: false, now: t }).trigger)
      triggeredAt = t;
  }
  expect("fresh Q: room tone never triggers", triggeredAt === -1, `t=${triggeredAt}`);

  // a single loud spike (1 chunk) then back to quiet
  vad.monitorFrame(0.15, { agentAudioActive: false, now: t });
  t += CHUNK_MS;
  let spikeTrig = false;
  for (let i = 0; i < 5; i++, t += CHUNK_MS) {
    if (vad.monitorFrame(0.003, { agentAudioActive: false, now: t }).trigger)
      spikeTrig = true;
  }
  expect("fresh Q: 1-chunk spike does NOT trigger", !spikeTrig, "");

  // sustained speech: must fire on exactly the 3rd over-threshold chunk
  let fireChunk = -1;
  for (let i = 1; i <= 5; i++, t += CHUNK_MS) {
    if (vad.monitorFrame(0.12, { agentAudioActive: false, now: t }).trigger && fireChunk < 0)
      fireChunk = i;
  }
  expect(
    "fresh Q: sustained speech fires after sustainChunks",
    fireChunk === DEFAULT_VAD.sustainChunks,
    `fired on chunk ${fireChunk} (want ${DEFAULT_VAD.sustainChunks})`,
  );
}

// --- 2. guard window: agent can't interrupt itself at playback start ----
{
  const vad = createVad();
  let t = 1000;
  vad.noteAgentAudioStart(t);
  // feed LOUD (as if echo cancellation failed completely) during the guard
  let firedInGuard = false;
  let armedBefore = true;
  while (t - 1000 <= DEFAULT_VAD.guardMs) {
    const v = vad.monitorFrame(0.2, { agentAudioActive: true, now: t });
    if (v.trigger) firedInGuard = true;
    if (t - 1000 <= DEFAULT_VAD.guardMs) armedBefore = v.armed;
    t += CHUNK_MS;
  }
  expect(
    "guard: no trigger during the guard window even at full volume",
    !firedInGuard,
    "",
  );
  expect("guard: disarmed for the whole window", armedBefore === false, "");
}

// --- 3. adaptive threshold: steady echo never self-triggers -------------
function echoNeverTriggers(echoRms: number, label: string): void {
  const vad = createVad();
  let t = 5000;
  vad.noteAgentAudioStart(t);
  // the echo plays through the guard window (where it's measured)…
  for (let i = 0; i * CHUNK_MS <= DEFAULT_VAD.guardMs; i++, t += CHUNK_MS) {
    vad.monitorFrame(echoRms, { agentAudioActive: true, now: t });
  }
  // …and keeps playing, now armed
  let fired = false;
  let lastThr = 0;
  let lastFloor = 0;
  for (let i = 0; i < 80; i++, t += CHUNK_MS) {
    const v = vad.monitorFrame(echoRms, { agentAudioActive: true, now: t });
    lastThr = v.threshold;
    lastFloor = v.echoFloor;
    if (v.trigger) fired = true;
  }
  expect(
    `adaptive: steady ${label} echo (${echoRms}) never barges in`,
    !fired,
    `floor ${lastFloor.toFixed(3)}, threshold ${lastThr.toFixed(3)}`,
  );
}
echoNeverTriggers(0.02, "quiet");
echoNeverTriggers(0.045, "loud");

// --- 4. user speech over live echo DOES trigger ------------------------
{
  const vad = createVad();
  let t = 8000;
  vad.noteAgentAudioStart(t);
  // echo through the guard window
  for (let i = 0; i * CHUNK_MS <= DEFAULT_VAD.guardMs; i++, t += CHUNK_MS) {
    vad.monitorFrame(0.03, { agentAudioActive: true, now: t });
  }
  // more steady echo, armed
  for (let i = 0; i < 30; i++, t += CHUNK_MS) {
    vad.monitorFrame(0.03, { agentAudioActive: true, now: t });
  }
  // user speaks over it
  let fired = false;
  let thr = 0;
  for (let i = 0; i < 6; i++, t += CHUNK_MS) {
    const v = vad.monitorFrame(0.18, { agentAudioActive: true, now: t });
    thr = v.threshold;
    if (v.trigger) fired = true;
  }
  expect(
    "adaptive: user speech (0.18) over 0.03 echo triggers barge-in",
    fired,
    `threshold was ${thr.toFixed(3)}`,
  );
}

// --- 5. end-of-utterance silence ends a capture ----------------------
{
  const vad = createVad();
  let t = 12000;
  vad.startCapture(t);
  // speech
  for (let i = 0; i < 8; i++, t += CHUNK_MS) vad.captureFrame(0.1, t);
  // silence — should NOT end before silenceMs, SHOULD end after
  let endedEarly = false;
  const speechEndT = t;
  while (t - speechEndT < DEFAULT_VAD.silenceMs - CHUNK_MS) {
    if (vad.captureFrame(0.003, t).endOfTurn) endedEarly = true;
    t += CHUNK_MS;
  }
  expect("capture: does not end before silenceMs", !endedEarly, "");
  let endedLate = false;
  for (let i = 0; i < 5; i++, t += CHUNK_MS) {
    if (vad.captureFrame(0.003, t).endOfTurn) endedLate = true;
  }
  expect("capture: ends after silenceMs of silence", endedLate, "");
}

// --- 6. capture never ends if the visitor never actually spoke -------
{
  const vad = createVad();
  let t = 16000;
  vad.startCapture(t);
  let ended = false;
  for (let i = 0; i < 40; i++, t += CHUNK_MS) {
    if (vad.captureFrame(0.003, t).endOfTurn) ended = true;
  }
  expect("capture: silence-only never yields endOfTurn", !ended, "");
}

// --- report --------------------------------------------------------
for (const c of checks) {
  console.log(`${c.ok ? "✅ PASS" : "❌ FAIL"}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length > 0) process.exitCode = 1;
