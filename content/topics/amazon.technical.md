# Amazon — technical layer

The current role — Business Analyst, 2024–present — is a data role built on
**Amazon Redshift**.

- **Ownership of the analytical layer.** Rafal owns the analytical layer that
  supports mass recruitment across Europe end to end — not a single report, but
  the models the reports are built on.
- **SQL as the primary tool.** Complex SQL against Redshift: multi-step
  transformations, the data models that turn raw operational data into
  something reportable, and the reporting models on top of those.
- **Dashboards as the delivery surface.** The output is dashboards used to run
  and monitor hiring operations — the consumers are operational teams and
  leadership, not other analysts.
- **Scale sets the bar.** The pipelines feed a recruitment operation measured
  in hundreds of thousands of workers, which decides what a transformation has
  to handle and how wrong a number is allowed to be.

## Two tools that show the technical progression

**Temporary-associate tenure tracking** — checking each associate's history
against an 18-months-within-36-months legal cap. First version: an Excel tool
with formulas, built with no coding background and before AI tooling existed,
because the process (previously done manually, weekly) was assumed impossible
to automate. It worked, but ran locally and took hours to generate a report
across the full population. Once in the Business Analyst seat, Rafal rebuilt it
as a SQL-based on-demand dashboard — the same calculation, queryable whenever
needed, with no laptop tied up for hours.

**Document-compliance checking** — a tool that pulls the list of candidates who
have reached a specific step/sub-step in the recruitment pipeline, checks a
separate document-management system (EDM) for what's already on file, and
surfaces what's missing before onboarding rather than after.

From the staffing-manager years (2022–2024), the technical-adjacent work was
**forecasting** — modelling attendance and attrition to drive headcount
decisions — and **rolling out internal IT / HR tools** to the sites that used
them.

This is where Rafal's SQL and data-modelling depth comes from. Moving from
consuming these systems to building his own — flowjob.it, this portfolio — is
the through-line; ask about those for application and infrastructure work.
