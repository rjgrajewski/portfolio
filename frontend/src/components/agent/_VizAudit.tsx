import { AgentVisualization, type VizState } from "./AgentVisualization";

/**
 * TEMPORARY visual-audit harness (not shipped). Mount via `?vizaudit=1`.
 * Renders the orb states side by side over a static AI-mode glow so the
 * rest ↔ listening difference can be judged at a glance.
 */
function Cell({
  label,
  state,
  level,
  glow,
}: {
  label: string;
  state: VizState;
  level: number;
  glow: number;
}) {
  return (
    <div className="relative flex h-[360px] w-[210px] flex-col items-center justify-end overflow-hidden rounded-2xl bg-neutral-950">
      {glow > 0 ? (
        <div
          className="ai-frame !absolute"
          data-viz={state}
          style={{ ["--ai-glow" as string]: String(glow) }}
        />
      ) : null}
      <div className="relative z-10 mb-8">
        <AgentVisualization
          state={state}
          active={glow > 0}
          disabled={false}
          size={96}
          getMicLevel={() => level}
          getPlaybackLevel={() => level}
          onActivate={() => {}}
        />
      </div>
      <p className="relative z-10 mb-3 text-small text-neutral-400">{label}</p>
    </div>
  );
}

export function VizAudit() {
  return (
    <div className="app-shell flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-950 p-8">
      <p className="text-small uppercase tracking-wider text-neutral-500">
        orb / glow states
      </p>
      <div className="flex flex-wrap items-center justify-center gap-6">
        <Cell label="rest (before tap)" state="rest" level={0} glow={0} />
        <Cell
          label="listening — silence"
          state="listening"
          level={0}
          glow={0.88}
        />
        <Cell
          label="listening — sound"
          state="listening"
          level={0.75}
          glow={1}
        />
      </div>
    </div>
  );
}
