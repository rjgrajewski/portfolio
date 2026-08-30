/**
 * Manual rendering of the FlowJob topic. Same facts as
 * content/topics/flowjob.{business,technical}.md — must not diverge from what
 * the agent says. Form differs: short blocks, bolded specifics, scannable.
 */
export function FlowJob() {
  return (
    <div className="space-y-5">
      <p>
        <strong className="font-medium text-neutral-100">flowjob.it</strong> is
        an IT job-search product Rafal built for himself. It is live and he
        uses it, but it has not been announced and has no real users — an
        evening project since <strong className="font-medium text-neutral-100">October 2025</strong>.
      </p>

      <p>
        Instead of another job board, it is a logical layer between the
        candidate and the listing: job ads become structured data — parsed,
        normalized, queryable. Job boards match on one skill in isolation;
        flowjob makes the <strong className="font-medium text-neutral-100">skill
        profile the filter</strong> and scores every listing against it.
      </p>

      <div>
        <p className="text-small font-medium uppercase tracking-wider text-accent">
          What exists today
        </p>
        <ul className="mt-1.5 space-y-1.5">
          <li>
            <span className="text-accent">—</span> a job board with a match
            score (share of a listing's required skills the profile covers);
            skills marked "avoid" drop the listing.
          </li>
          <li>
            <span className="text-accent">—</span> a swipe-style skill selector
            — several thousand entries, one at a time, because dropdowns were
            unusable.
          </li>
          <li>
            <span className="text-accent">—</span> an in-browser PDF CV fed by
            the skills chosen in the deck. Solid on desktop, weak on mobile.
          </li>
        </ul>
      </div>

      <p>
        It is not public yet because the interface does not meet Rafal's bar
        and CV creation is awkward on a phone — a UI refactor is underway.
        There is no security audit yet; that is planned as the last step
        before launch. At AWS Summit Warsaw, Amazon backed the project with{" "}
        <strong className="font-medium text-neutral-100">USD 1,000</strong>.
      </p>

      <div>
        <p className="text-small font-medium uppercase tracking-wider text-accent">
          Technical
        </p>
        <p className="mt-1.5">
          Three parts. <strong className="font-medium text-neutral-100">Argus</strong>,
          a Playwright scraper on <strong className="font-medium text-neutral-100">AWS
          Fargate</strong> — Fargate not Lambda because a run is around an hour
          and Lambda caps at 15 minutes. <strong className="font-medium text-neutral-100">Minerva</strong>,
          skill normalization on <strong className="font-medium text-neutral-100">Amazon
          Bedrock</strong> — hard rules first, then a larger Claude model to
          canonicalize names and a smaller one to merge synonyms; prompting
          beat an embeddings approach that was built and dropped.{" "}
          <strong className="font-medium text-neutral-100">Step Functions</strong>{" "}
          orchestrates the two; the scraper never calls the AI itself.
        </p>
        <p className="mt-3">
          The app is a React SPA, a FastAPI backend, and PostgreSQL on AWS RDS.
          The <strong className="font-medium text-neutral-100">match score is
          SQL, not ML</strong>. Auth keeps the session JWT in an{" "}
          <strong className="font-medium text-neutral-100">HttpOnly cookie</strong>{" "}
          with a CSRF token on mutations. The CV PDF renders in the browser,
          not on a server.
        </p>
      </div>
    </div>
  );
}
