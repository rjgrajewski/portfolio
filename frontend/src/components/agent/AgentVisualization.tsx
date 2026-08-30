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
  /** Caption shown at rest (voice mode off), e.g. "Tap to talk". */
  restCaption?: string;
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
  const maxR = px * 0.42;
  const dprLine = Math.max(1, px / 88);

  ctx.clearRect(0, 0, px, px);

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
  g.addColorStop(0, `rgba(242,182,88,${0.4 * p.alpha})`);
  g.addColorStop(0.6, `rgba(232,163,61,${0.17 * p.alpha})`);
  g.addColorStop(1, "rgba(232,163,61,0)");
  ctx.fillStyle = g;
  ctx.fill();

  ctx.lineWidth = dprLine * 1.1;
  ctx.strokeStyle = `rgba(242,182,88,${0.62 * p.alpha})`;
  ctx.stroke();

  if (state === "listening") {
    // a faint open outer ring — "receiving"
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * (p.r0 + 0.22 + level * 0.1), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(232,163,61,${0.18 * p.alpha})`;
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
  restCaption = "Tap to talk",
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

  // Reduced motion: one static draw per state. States are told apart by
  // size / brightness / silhouette (frozen phases), not by movement.
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
      listening: 0.5,
      thinking: 0,
      speaking: 0.7,
      error: 0,
    };
    drawBlob(ctx, px, state, frozenT[state], frozenLevel[state]);
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
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onActivate}
        disabled={disabled}
        aria-label={
          disabled
            ? "Voice agent unavailable"
            : active
              ? `Voice on — ${CAPTION[state].toLowerCase()}. Tap to leave.`
              : "Talk to the agent"
        }
        className="rounded-full transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
      >
        <canvas
          ref={canvasRef}
          width={px}
          height={px}
          style={{ width: size, height: size, display: "block" }}
        />
      </button>
      <span className="select-none text-small text-neutral-500" aria-hidden="true">
        {disabled ? "Voice unavailable" : active ? CAPTION[state] : restCaption}
      </span>
    </div>
  );
}
