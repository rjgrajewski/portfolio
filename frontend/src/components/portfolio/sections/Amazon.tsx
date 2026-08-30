/**
 * Manual (read-with-your-eyes) rendering of the Amazon topic. Same facts as
 * content/topics/amazon.{business,technical}.md — the agent and this view
 * must not diverge. Form differs on purpose: short blocks, bolded specifics,
 * scannable. No fact here that isn't in those two files.
 */
import { ChipRow, Timeline } from "../viz";

const ROLES = [
  {
    period: "2018–2021",
    title: "Associate Partner",
    detail: "Front-line HR support.",
  },
  {
    period: "2021–2022",
    title: "Workforce Staffing Specialist",
    detail: "Large-scale hiring.",
  },
  {
    period: "2022–2024",
    title: "Workforce Staffing Manager",
    detail: "Staffing at scale, team management.",
  },
  {
    period: "2024–present",
    title: "Business Analyst",
    detail: "Analytics for Europe-wide hiring.",
  },
] as const;

export function Amazon() {
  return (
    <div className="space-y-5">
      <p>Four roles in seven years: operations → staffing → data.</p>
      <Timeline items={ROLES} />
      <ChipRow
        items={[
          "HR Background",
          "Redshift",
          "SQL",
          "Stakeholder Management",
          "Data-driven approach",
        ]}
      />
    </div>
  );
}
