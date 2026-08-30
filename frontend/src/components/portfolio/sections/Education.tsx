/**
 * Manual rendering of the Education topic. Same facts as
 * content/topics/education.{business,technical}.md — must not diverge from
 * what the agent says. Form differs: short blocks, bolded specifics.
 */
export function Education() {
  return (
    <div className="space-y-5">
      <p>
        A <strong className="font-medium text-neutral-100">computer science
        degree</strong> from Uniwersytet WSB Merito in Wroclaw, completed in{" "}
        <strong className="font-medium text-neutral-100">2024</strong>.
      </p>

      <p>
        The timing is the point. Rafal started in sales and account management
        (2014–2018), moved into operations and workforce staffing at Amazon,
        and studied computer science alongside that work — finishing the degree
        while employed as a staffing manager. A deliberate move from operations
        toward engineering, not a first qualification.
      </p>

      <p>
        It shows up in the work that followed: the shift into a Business
        Analyst role built on SQL and data modelling, and the solo AWS builds —
        flowjob.it and this portfolio. The degree is a foundation, not the
        headline; the projects since are where the practical judgement comes
        from.
      </p>

      <div>
        <p className="text-small font-medium uppercase tracking-wider text-accent">
          Technical
        </p>
        <p className="mt-1.5">
          The fundamentals that carry into the builds:{" "}
          <strong className="font-medium text-neutral-100">relational data
          modelling</strong> (the Redshift work, flowjob's PostgreSQL schema
          where the match score is a SQL query rather than an ML service);
          reasoning about systems and cost (Lambda's 15-minute limit, a hard
          monthly cost ceiling, "scale to zero when idle"); and enough theory
          to choose deliberately — prompting over embeddings, SQL over ML,
          tool-fetch over a vector database — and defend the choice.
        </p>
      </div>
    </div>
  );
}
