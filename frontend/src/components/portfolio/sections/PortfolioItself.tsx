/**
 * Manual rendering of the "This Portfolio" topic. Same facts as
 * content/topics/portfolio-itself.{business,technical}.md — must not diverge
 * from what the agent says. The visual is the agentic loop, not a cost figure.
 */
import { ChipRow, RevealScene, Split } from "../viz";

export function PortfolioItself() {
  return (
    <div className="space-y-8">
      <Split visual={<RevealScene />}>
        <p className="text-small font-medium uppercase tracking-wider text-accent">
          Agentic UI
        </p>
        <p>
          Three ways in, one page: download the CV, browse these sections, or
          ask. The agent talks about Rafal in the third person and opens the
          matching section — the same components a click drives.
        </p>
        <blockquote className="border-l-2 border-neutral-200 pl-4 font-medium text-neutral-100">
          One reveal path. A click and a tool call land on the same view.
        </blockquote>
      </Split>

      <p>
        Knowledge is tool-fetched from a small corpus, not a vector database.
        Voice is live — Amazon Transcribe in, Polly out, browser-direct.
      </p>

      <ChipRow
        items={["Bedrock Haiku 4.5", "Lambda streaming", "tool-fetch"]}
      />
    </div>
  );
}
