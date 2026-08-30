/**
 * Manual rendering of the FlowJob topic. Same facts as
 * content/topics/flowjob.{business,technical}.md — must not diverge from what
 * the agent says. Form differs: the about page's visual language (a data-model
 * snippet, a scrape diagram), not a metric callout.
 */
import {
  ChipRow,
  CodeWindow,
  ScrapeScene,
  Split,
  TextLink,
} from "../viz";

function JobOfferSnippet() {
  return (
    <CodeWindow filename="job_offer.json">
      <span className="text-neutral-500">{"{\n  "}</span>
      <span className="text-neutral-400">"title"</span>
      <span className="text-neutral-500">: </span>
      <span className="text-accent">"Data Engineer"</span>
      <span className="text-neutral-500">{",\n  "}</span>
      <span className="text-neutral-400">"stack"</span>
      <span className="text-neutral-500">{": [\n    { "}</span>
      <span className="text-neutral-400">"skill"</span>
      <span className="text-neutral-500">: </span>
      <span className="text-accent">"SQL"</span>
      <span className="text-neutral-500">, </span>
      <span className="text-neutral-400">"required"</span>
      <span className="text-neutral-500">: </span>
      <span className="text-neutral-200">true</span>
      <span className="text-neutral-500">{" },\n    { "}</span>
      <span className="text-neutral-400">"skill"</span>
      <span className="text-neutral-500">: </span>
      <span className="text-accent">"Python"</span>
      <span className="text-neutral-500">, </span>
      <span className="text-neutral-400">"required"</span>
      <span className="text-neutral-500">: </span>
      <span className="text-neutral-200">true</span>
      <span className="text-neutral-500">{" },\n    { "}</span>
      <span className="text-neutral-400">"skill"</span>
      <span className="text-neutral-500">: </span>
      <span className="text-accent">"AWS"</span>
      <span className="text-neutral-500">, </span>
      <span className="text-neutral-400">"required"</span>
      <span className="text-neutral-500">: </span>
      <span className="text-neutral-200">true</span>
      <span className="text-neutral-500">{" }\n  ],\n  "}</span>
      <span className="text-neutral-400">"parsed"</span>
      <span className="text-neutral-500">: </span>
      <span className="text-neutral-200">true</span>
      <span className="text-neutral-500">{",\n  "}</span>
      <span className="text-neutral-400">"normalized"</span>
      <span className="text-neutral-500">: </span>
      <span className="text-neutral-200">true</span>
      <span className="text-neutral-500">{"\n}"}</span>
    </CodeWindow>
  );
}

export function FlowJob() {
  return (
    <div className="space-y-8">
      <Split visual={<JobOfferSnippet />}>
        <p className="text-small font-medium uppercase tracking-wider text-accent">
          The data model
        </p>
        <p>
          Not another job board. Listings become structured data — parsed,
          normalized, queryable — and the candidate&apos;s skill profile is the
          filter, not the job title.
        </p>
        <blockquote className="border-l-2 border-neutral-200 pl-4 font-medium text-neutral-100">
          The foundation is a data model, not a list of ads.
        </blockquote>
      </Split>

      <Split visual={<ScrapeScene />} reverse>
        <p className="text-small font-medium uppercase tracking-wider text-accent">
          How it runs
        </p>
        <p>
          A Playwright scraper on Fargate pulls IT listings once per run.
          Bedrock canonicalizes messy skill names. The match score is SQL in
          Postgres, not a model.
        </p>
        <p className="text-small text-neutral-500">
          Live since October 2025, unannounced.{" "}
          <TextLink href="https://flowjob.it">flowjob.it</TextLink>
          {" · "}
          <TextLink href="https://flowjob.it/about">about</TextLink>
        </p>
      </Split>

      <ChipRow
        items={["Playwright", "Fargate", "Bedrock", "PostgreSQL", "React"]}
      />
    </div>
  );
}
