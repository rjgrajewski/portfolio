/**
 * Manual rendering of the "This Portfolio" topic. Same facts as
 * content/topics/portfolio-itself.{business,technical}.md — must not diverge
 * from what the agent says.
 *
 * NOTE: the old placeholder claimed Polly and Transcribe were running. They
 * are not — voice is a later phase, not built. This describes only what
 * actually works today.
 */
export function PortfolioItself() {
  return (
    <div className="space-y-5">
      <p>
        This site is itself a work sample. It can be used three ways: download
        the CV, click through these sections, or ask the agent — the one in
        the panel — which talks about Rafal in the third person and opens the
        matching section as it replies.
      </p>

      <p>
        For an AI-focused job search, a portfolio that is itself a working
        agentic system is stronger evidence than a list of past projects. The
        manual path is a{" "}
        <strong className="font-medium text-neutral-100">
          complete alternative
        </strong>
        , not a stub — everything is here for a recruiter who never opens the
        chat, and the site still works if the agent is down.
      </p>

      <div>
        <p className="text-small font-medium uppercase tracking-wider text-accent">
          What runs today
        </p>
        <ul className="mt-1.5 space-y-1.5">
          <li>
            <span className="text-accent">—</span>{" "}
            <strong className="font-medium text-neutral-100">
              Amazon Bedrock, Claude Haiku 4.5
            </strong>{" "}
            — Haiku over Sonnet or Opus on purpose: CV questions with supplied
            context don't need frontier reasoning, and this is
            latency-sensitive. Responses stream over a Lambda Function URL.
          </li>
          <li>
            <span className="text-accent">—</span> the agent returns a
            structured action (<code className="text-neutral-200">reveal_section</code>)
            alongside its answer, executed against the{" "}
            <strong className="font-medium text-neutral-100">
              same components a manual click drives
            </strong>{" "}
            — one reveal code path.
          </li>
          <li>
            <span className="text-accent">—</span> knowledge is retrieved with
            a <strong className="font-medium text-neutral-100">tool-fetch</strong>{" "}
            approach (an always-loaded core plus a{" "}
            <code className="text-neutral-200">get_content</code> tool for
            depth) — <strong className="font-medium text-neutral-100">no vector
            database</strong>. The corpus is small and enumerable; the agent
            needs to choose, not search.
          </li>
          <li>
            <span className="text-accent">—</span> a hard{" "}
            <strong className="font-medium text-neutral-100">
              ~$25/month cost ceiling
            </strong>
            : no always-on compute, a real-time daily circuit-breaker as the
            spend backstop, a per-session message cap for runaway tabs.
          </li>
        </ul>
      </div>

      <p className="text-neutral-400">
        Voice input and output (Amazon Transcribe and Polly, browser-direct)
        are designed but not built — a later phase. Today the agent is text.
      </p>
    </div>
  );
}
