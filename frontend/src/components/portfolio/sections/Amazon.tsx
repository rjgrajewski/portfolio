/**
 * Manual (read-with-your-eyes) rendering of the Amazon topic. Same facts as
 * content/topics/amazon.{business,technical}.md — the agent and this view
 * must not diverge. Form differs on purpose: short blocks, bolded specifics,
 * scannable. No fact here that isn't in those two files.
 */
export function Amazon() {
  return (
    <div className="space-y-5">
      <p>
        At Amazon since <strong className="font-medium text-neutral-100">2018</strong>
        {" — four roles in seven years."} The arc is the point: front-line
        operations, into workforce staffing, into data.
      </p>

      <ul className="space-y-2.5">
        <li>
          <strong className="font-medium text-neutral-100">
            Associate Partner
          </strong>{" "}
          <span className="text-neutral-500">2018–2021</span>
          <br />
          the entry point, in operations.
        </li>
        <li>
          <strong className="font-medium text-neutral-100">
            Workforce Staffing Specialist
          </strong>{" "}
          <span className="text-neutral-500">2021–2022</span>
          <br />
          supporting large-scale hourly hiring.
        </li>
        <li>
          <strong className="font-medium text-neutral-100">
            Workforce Staffing Manager
          </strong>{" "}
          <span className="text-neutral-500">2022–2024</span>
          <br />
          staffing operations at scale — vendor management, attendance and
          attrition forecasting, partnership with senior site leadership, and
          rolling out internal IT / HR tooling.
        </li>
        <li>
          <strong className="font-medium text-neutral-100">
            Business Analyst
          </strong>{" "}
          <span className="text-neutral-500">2024–present</span>
          <br />
          owns the analytical layer behind mass recruitment across Europe.
        </li>
      </ul>

      <p>
        The recruitment operation he supports runs at European scale —{" "}
        <strong className="font-medium text-neutral-100">
          hundreds of thousands of workers
        </strong>
        . He ran the operational side before he measured it, so the data work
        is grounded in knowing what the numbers are used for.
      </p>

      <div>
        <p className="text-small font-medium uppercase tracking-wider text-accent">
          Technical
        </p>
        <p className="mt-1.5">
          The Business Analyst role is built on{" "}
          <strong className="font-medium text-neutral-100">Amazon Redshift</strong>:
          multi-step SQL transformations, the data models that turn raw
          operational data into something reportable, and the reporting models
          on top. The delivery surface is dashboards used to run and monitor
          hiring — the consumers are operational teams and leadership. The
          staffing-manager years added forecasting work: modelling attendance
          and attrition to drive headcount decisions.
        </p>
      </div>
    </div>
  );
}
