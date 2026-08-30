/**
 * Voice-activity detection for the persistent voice session (stt.ts).
 *
 * Pure — no imports, no DOM — so it is unit-tested in Node by
 * `scripts/verify-vad.ts`. All timing is caller-supplied ms
 * (`performance.now()` in the browser, a synthetic clock in the test).
 *
 * It answers two questions, one ~100 ms audio chunk at a time:
 *   monitorFrame — has the visitor started speaking? (onset / barge-in)
 *   captureFrame — has the visitor stopped? (end-of-utterance silence)
 *
 * The hard case is barge-in while the agent plays through a phone speaker
 * with no headphones — the mic hears the agent. Defences, layered:
 *   - an ADAPTIVE trigger = max(speechRms, echoFloorEMA * echoMargin) that
 *     tracks this device's residual echo, measured live from sub-threshold
 *     chunks;
 *   - a GUARD window (guardMs) after every agent-audio start during which
 *     barge-in is disarmed — the loop-protection window, and when the echo
 *     floor is seeded;
 *   - a SUSTAIN requirement (sustainChunks) so a tap / click / single loud
 *     syllable can't trip it.
 */

export interface VadParams {
  /** RMS above which it's "user speech" when no agent echo is present. */
  speechRms: number;
  /** RMS below which an in-progress utterance counts as silence. */
  silenceRms: number;
  /** ms of continuous silence that ends a capture. */
  silenceMs: number;
  /** While agent audio plays, trigger = max(speechRms, echoFloorEMA*this). */
  echoMargin: number;
  /** Lower bound for the echo-floor EMA (room tone can't barge in). */
  floorRms: number;
  /** Barge-in disarmed this long after agent audio starts (loop guard). */
  guardMs: number;
  /** Consecutive over-threshold ~100 ms chunks required to fire. */
  sustainChunks: number;
}

export const DEFAULT_VAD: VadParams = {
  speechRms: 0.014,
  silenceRms: 0.008,
  silenceMs: 1300,
  echoMargin: 3.0,
  floorRms: 0.006,
  guardMs: 700,
  sustainChunks: 3,
};

/**
 * Echo-floor tracker weights.
 *  - SEED: during the guard window we KNOW the level is echo (the visitor
 *    isn't expected to barge in the instant the agent starts), so learn it
 *    fast and unconditionally.
 *  - SNAP_DOWN / RISE: after the guard, a lower-envelope follower — move
 *    toward any lower level quickly, creep toward a higher one slowly,
 *    and ignore anything at/above the trigger (that's candidate speech).
 *    So steady echo pulls the floor up to itself; a burst of user speech
 *    does not.
 */
const SEED = 0.5;
const SNAP_DOWN = 0.35;
const RISE = 0.02;

export interface MonitorVerdict {
  trigger: boolean;
  threshold: number;
  armed: boolean;
  echoFloor: number;
}

export interface Vad {
  noteAgentAudioStart(now: number): void;
  monitorFrame(
    rms: number,
    opts: { agentAudioActive: boolean; now: number },
  ): MonitorVerdict;
  resetMonitor(): void;
  captureFrame(rms: number, now: number): { endOfTurn: boolean };
  startCapture(now: number): void;
}

export function createVad(p: VadParams = DEFAULT_VAD): Vad {
  let floor = p.floorRms;
  let overCount = 0;
  let audioStartedAt = 0;

  let heardSpeech = false;
  let lastLoudAt = 0;

  const clamp = (v: number): number => (v < p.floorRms ? p.floorRms : v);
  const move = (target: number, w: number): void => {
    floor = clamp(floor + (target - floor) * w);
  };

  return {
    noteAgentAudioStart(now: number): void {
      audioStartedAt = now;
      floor = p.floorRms;
      overCount = 0;
    },

    monitorFrame(rms, opts): MonitorVerdict {
      const past = opts.now - audioStartedAt;
      const inGuard = opts.agentAudioActive && past <= p.guardMs;
      const armed = !opts.agentAudioActive || past > p.guardMs;

      if (opts.agentAudioActive) {
        if (inGuard) {
          // Guard window — learn the echo level fast, whatever it is.
          move(rms, SEED);
        } else {
          // Lower-envelope follower.
          const provisional = Math.max(p.speechRms, floor * p.echoMargin);
          if (rms < floor) move(rms, SNAP_DOWN);
          else if (rms < provisional) move(rms, RISE);
        }
      }

      const threshold = opts.agentAudioActive
        ? Math.max(p.speechRms, floor * p.echoMargin)
        : p.speechRms;

      if (armed && rms > threshold) overCount++;
      else overCount = 0;

      return {
        trigger: overCount >= p.sustainChunks,
        threshold,
        armed,
        echoFloor: floor,
      };
    },

    resetMonitor(): void {
      overCount = 0;
    },

    captureFrame(rms, now): { endOfTurn: boolean } {
      if (rms > p.speechRms) {
        heardSpeech = true;
        lastLoudAt = now;
      } else if (rms > p.silenceRms) {
        lastLoudAt = now;
      }
      return { endOfTurn: heardSpeech && now - lastLoudAt > p.silenceMs };
    },

    startCapture(now: number): void {
      heardSpeech = false;
      lastLoudAt = now;
      overCount = 0;
    },
  };
}
