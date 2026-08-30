/**
 * Manual rendering of the Education topic. Same facts as
 * content/topics/education.{business,technical}.md — must not diverge from
 * what the agent says. Form differs: short blocks, bolded specifics.
 */
import { Callout } from "../viz";

export function Education() {
  return (
    <div className="space-y-5">
      <Callout
        value="2024"
        caption="Bachelor's in Computer Science · Graphic Design specialization · Uniwersytet WSB Merito, Wroclaw"
      />
    </div>
  );
}
