// Phase 0 placeholder — proves the build/deploy pipeline works end to end
// (Amplify Hosting → dev/main branches). Real UI (manual portfolio, agent
// panel, section reveal) lands in Phases 1–3; see docs/ROADMAP.md.
// TODO(Phase 1): replace with the real landing view + design pass.
export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-neutral-950 px-6 text-center text-neutral-100">
      <h1 className="text-2xl font-semibold tracking-tight">
        AI-Powered Voice Portfolio
      </h1>
      <p className="text-neutral-400">
        Scaffolding in progress — the real build lands in the phases ahead.
      </p>
    </main>
  );
}
