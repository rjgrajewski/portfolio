import type { ReactNode } from "react";

/**
 * Framed scene with a faint grid — the about-page diagram language,
 * in this site's neutral + amber palette.
 */
export function DiagramFrame({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"
    >
      <div
        className="flex min-h-[10.5rem] items-center justify-center px-5 py-8"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Card({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent";
}) {
  const ring =
    tone === "accent"
      ? "border-accent/50 shadow-[0_0_18px_rgba(232,163,61,0.18)]"
      : "border-neutral-500/70";
  return (
    <div
      className={`flex h-16 w-16 items-center justify-center rounded-xl border bg-neutral-950 ${ring}`}
    >
      {children}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 text-neutral-300" aria-hidden="true">
      <circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="16" cy="16" rx="4.5" ry="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 16h20M8.5 11h15M8.5 21h15" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 text-accent" aria-hidden="true">
      <ellipse cx="16" cy="8" rx="8" ry="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 8v12c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5V8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M8 14c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Dots() {
  const dots = [
    { x: 6, y: 10, r: 2.2, a: 0.9 },
    { x: 22, y: 4, r: 1.6, a: 0.55 },
    { x: 18, y: 16, r: 2.4, a: 1 },
    { x: 34, y: 8, r: 1.8, a: 0.7 },
    { x: 30, y: 20, r: 2, a: 0.85 },
    { x: 10, y: 22, r: 1.4, a: 0.45 },
    { x: 42, y: 14, r: 2.1, a: 0.75 },
  ];
  return (
    <svg viewBox="0 0 52 28" className="h-10 w-16 shrink-0" aria-hidden="true">
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.r}
          fill={i % 2 === 0 ? "#e8a33d" : "#a3a3a3"}
          opacity={d.a}
        />
      ))}
    </svg>
  );
}

/** Listings on the open web pulled into a structured store. */
export function ScrapeScene() {
  return (
    <DiagramFrame label="A scraper pulling job listings into a structured database">
      <div className="flex w-full items-center justify-between gap-2">
        <Card>
          <GlobeIcon />
        </Card>
        <Dots />
        <Card tone="accent">
          <DatabaseIcon />
        </Card>
      </div>
    </DiagramFrame>
  );
}

function Node({
  label,
  children,
  accent = false,
}: {
  label: string;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-xl border bg-neutral-950 ${
          accent
            ? "border-accent/50 shadow-[0_0_18px_rgba(232,163,61,0.18)]"
            : "border-neutral-500/70"
        }`}
      >
        {children}
      </div>
      <span className="text-small text-neutral-400">{label}</span>
    </div>
  );
}

/** Ask the agent → model answers → the matching section opens. */
export function RevealScene() {
  return (
    <DiagramFrame label="Asking the agent opens the matching portfolio section">
      <div className="flex w-full items-center justify-between gap-1">
        <Node label="Ask">
          <svg viewBox="0 0 32 32" className="h-7 w-7 text-neutral-300" aria-hidden="true">
            <path
              d="M8 22V10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H13l-5 4v-4z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </Node>
        <span className="mb-6 text-accent" aria-hidden="true">
          →
        </span>
        <Node label="Bedrock" accent>
          <span className="h-4 w-4 rounded-full bg-accent" aria-hidden="true" />
        </Node>
        <span className="mb-6 text-accent" aria-hidden="true">
          →
        </span>
        <Node label="Reveal">
          <svg viewBox="0 0 32 32" className="h-7 w-7 text-neutral-300" aria-hidden="true">
            <rect x="7" y="6" width="18" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 12h10M11 16h10M11 20h6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </Node>
      </div>
    </DiagramFrame>
  );
}
