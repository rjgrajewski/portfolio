import { useEffect, useRef } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";

/**
 * The agent, as an organic amber form — present from first paint, the
 * primary "talk to me" affordance (docs/ARCHITECTURE.md § Product shape,
 * rewritten). Canvas + requestAnimationFrame, no animation library.
 *
 * Four states, each recognisable without reading the caption:
 *   rest      — slow breathing; ready, invites a tap
 *   listening — swells with real mic amplitude (getMicLevel; the analyser
 *               is a read-only tap on the voice session's existing mic node)
 *   thinking  — a lobe ORBITS the perimeter (rotational, not radial) — a
 *               distinctly different motion so the stage is never ambiguous
 *   speaking  — fine shimmer pulsing with playback amplitude
 *               (getPlaybackLevel; analyser on the tts.ts output path)
 *   error     — dim, still, desaturated
 *
 * `prefers-reduced-motion`: no rAF; states are drawn once and told apart by
 * size / brightness / silhouette, not motion. Perf: one small canvas, no
 * per-frame allocation, paused while the tab is hidden — the audio thread
 * (AudioWorklet + SDK) always wins.
 */

export type VizState = "rest" | "listening" | "thinking" | "speaking" | "error";

interface Props {
  state: VizState;
  /** Voice mode is on. */
  active: boolean;
  getMicLevel: () => number;
  getPlaybackLevel: () => number;
  onActivate: () => void;
  disabled?: boolean;
  size?: number;
}

interface Lobe {
  k: number;
  a: number;
  spd: number;
}
interface Params {
  r0: number;
  breathA: number;
  breathW: number;
  lobes: Lobe[];
  levelK: number;
  alpha: number;
}

const PARAMS: Record<VizState, Params> = {
  rest: {
    r0: 0.6,
    breathA: 0.05,
    breathW: 1.1,
    lobes: [
      { k: 2, a: 0.018, spd: 0.5 },
      { k: 3, a: 0.012, spd: -0.35 },
    ],
    levelK: 0,
    alpha: 0.72,
  },
  listening: {
    r0: 0.66,
    breathA: 0.02,
    breathW: 2.2,
    lobes: [
      { k: 2, a: 0.03, spd: 1.4 },
      { k: 4, a: 0.02, spd: -1.1 },
    ],
    levelK: 0.34,
    alpha: 0.92,
  },
  thinking: {
    r0: 0.64,
    breathA: 0.015,
    breathW: 1.6,
    lobes: [
      { k: 3, a: 0.06, spd: 3.4 },
      { k: 1, a: 0.02, spd: 1.2 },
    ],
    levelK: 0,
    alpha: 0.8,
  },
  speaking: {
    r0: 0.68,
    breathA: 0.02,
    breathW: 2,
    lobes: [
      { k: 5, a: 0.02, spd: 2.2 },
      { k: 7, a: 0.014, spd: -1.8 },
      { k: 3, a: 0.02, spd: 1.5 },
    ],
    levelK: 0.4,
    alpha: 1,
  },
  error: {
    r0: 0.52,
    breathA: 0,
    breathW: 0,
    lobes: [{ k: 4, a: 0.05, spd: 0 }],
    levelK: 0,
    alpha: 0.4,
  },
};

const CAPTION: Record<VizState, string> = {
  rest: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Voice unavailable",
};

/**
 * The "conversation is live" states — listening / thinking / speaking — each
 * get a halo (a soft corona + an orbiting ring) that rest and error do NOT
 * have at all. So rest reads as a small quiet dot; the moment the agent is
 * engaged the orb visibly opens up, even in total silence. `levelReact`
 * ties the corona + ring to the same mic/playback amplitude the AI-mode
 * glow reacts to, so the orb and the screen edge move together.
 */
const HALO: Partial<
  Record<VizState, { ring: number; ringSpd: number; corona: number; react: number }>
> = {
  listening: { ring: 1.28, ringSpd: 2.6, corona: 0.16, react: 0.85 },
  thinking: { ring: 1.18, ringSpd: 1.7, corona: 0.11, react: 0 },
  speaking: { ring: 1.34, ringSpd: 2.2, corona: 0.2, react: 1 },
};

function drawBlob(
  ctx: CanvasRenderingContext2D,
  px: number,
  state: VizState,
  t: number,
  level: number,
): void {
  const p = PARAMS[state];
  const cx = px / 2;
  const cy = px / 2;
  const maxR = px * 0.34;
  const dprLine = Math.max(1, px / 96);

  ctx.clearRect(0, 0, px, px);

  const halo = HALO[state];

  // --- corona (behind the blob) --------------------------------------
  if (halo) {
    const boost = level * 0.3 * halo.react;
    const cg = ctx.createRadialGradient(
      cx,
      cy,
      maxR * 0.5,
      cx,
      cy,
      maxR * 1.45,
    );
    cg.addColorStop(0, `rgba(242,182,88,${halo.corona + boost})`);
    cg.addColorStop(0.55, `rgba(232,163,61,${(halo.corona + boost) * 0.45})`);
    cg.addColorStop(1, "rgba(232,163,61,0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * 1.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- the blob ----------------------------------------------------
  const N = 72;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    let rr = p.r0 + p.breathA * Math.sin(t * p.breathW) + p.levelK * level;
    for (const lb of p.lobes) rr += lb.a * Math.sin(lb.k * th + t * lb.spd);
    const r = maxR * rr;
    const x = cx + Math.cos(th) * r;
    const y = cy + Math.sin(th) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  if (state === "error") {
    ctx.fillStyle = `rgba(120,120,120,${0.12 * p.alpha})`;
    ctx.fill();
    ctx.lineWidth = dprLine;
    ctx.strokeStyle = `rgba(150,150,150,${0.5 * p.alpha})`;
    ctx.stroke();
    return;
  }

  const g = ctx.createRadialGradient(cx, cy, maxR * 0.1, cx, cy, maxR * 1.08);
  g.addColorStop(0, `rgba(242,182,88,${0.42 * p.alpha})`);
  g.addColorStop(0.6, `rgba(232,163,61,${0.18 * p.alpha})`);
  g.addColorStop(1, "rgba(232,163,61,0)");
  ctx.fillStyle = g;
  ctx.fill();

  ctx.lineWidth = dprLine * 1.1;
  ctx.strokeStyle = `rgba(242,182,88,${0.62 * p.alpha})`;
  ctx.stroke();

  // --- ring (in front) — a distinct faster pulse than the blob's breath
  if (halo) {
    const rr =
      maxR *
      (halo.ring +
        0.06 * Math.sin(t * halo.ringSpd) +
        level * 0.22 * halo.react);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.lineWidth = dprLine * 1.4;
    ctx.strokeStyle = `rgba(242,182,88,${0.4 + level * 0.35 * halo.react})`;
    ctx.stroke();
  }
}

export function AgentVisualization({
  state,
  active,
  getMicLevel,
  getPlaybackLevel,
  onActivate,
  disabled = false,
  size = 88,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  const stateRef = useRef(state);
  stateRef.current = state;
  const micRef = useRef(getMicLevel);
  micRef.current = getMicLevel;
  const playRef = useRef(getPlaybackLevel);
  playRef.current = getPlaybackLevel;

  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const px = Math.round(size * dpr);

  // Reduced motion: one static draw per state. With the text caption gone
  // these carry the full load, so the four are deliberately stepped —
  // rest small+faint, listening medium + a concentric "receiving" ring,
  // thinking medium with pronounced lobes, speaking large + a solid amber
  // core, error small + grey. Distinguishable by size / fill / silhouette,
  // no motion needed.
  useEffect(() => {
    if (!reducedMotion) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const frozenT: Record<VizState, number> = {
      rest: 0,
      listening: 0.4,
      thinking: 0.52, // phase where the k=3 lobe shows 3 clear bumps
      speaking: 0.3,
      error: 0,
    };
    const frozenLevel: Record<VizState, number> = {
      rest: 0,
      listening: 0.55,
      thinking: 0.15,
      speaking: 1,
      error: 0,
    };
    drawBlob(ctx, px, state, frozenT[state], frozenLevel[state]);
    if (state === "speaking") {
      // solid core so "speaking" reads as the loudest state even frozen
      const cx = px / 2;
      ctx.beginPath();
      ctx.arc(cx, cx, px * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(242,182,88,0.85)";
      ctx.fill();
    }
  }, [reducedMotion, state, px]);

  // Animated loop — one loop for the component's life; reads state + levels
  // from refs so it never restarts. Draws one frame synchronously so there
  // is always something painted (rAF is throttled/paused while the tab is
  // hidden); the loop then keeps redrawing while visible.
  useEffect(() => {
    if (reducedMotion) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let level = 0;
    const start = performance.now();

    const frame = (now: number): void => {
      const st = stateRef.current;
      const raw =
        st === "listening"
          ? micRef.current()
          : st === "speaking"
            ? playRef.current()
            : 0;
      level += (raw - level) * 0.25;
      drawBlob(ctx, px, st, (now - start) / 1000, level);
    };

    frame(start); // initial paint, even if hidden

    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      if (!document.hidden) frame(now);
    };
    raf = requestAnimationFrame(loop);

    const onVisible = (): void => {
      if (!document.hidden) frame(performance.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reducedMotion, px]);

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onActivate}
        disabled={disabled}
        aria-label={
          disabled
            ? "Voice agent unavailable"
            : active
              ? "Voice conversation active. Tap to leave."
              : "Talk to the agent"
        }
        className="rounded-full transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 active:scale-90"
      >
        <canvas
          ref={canvasRef}
          width={px}
          height={px}
          style={{ width: size, height: size, display: "block" }}
        />
      </button>
      {/* No visible caption — the four blob states are meant to read on
          sight. Screen readers still get the state (announced on change)
          and the button label. */}
      <span className="sr-only" role="status" aria-live="polite">
        {active && !disabled && state !== "rest" ? CAPTION[state] : ""}
      </span>
    </div>
  );
}
