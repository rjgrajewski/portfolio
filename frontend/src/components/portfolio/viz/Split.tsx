import type { ReactNode } from "react";

/** Visual + copy side by side on desktop, stacked on mobile. */
export function Split({
  visual,
  reverse = false,
  children,
}: {
  visual: ReactNode;
  reverse?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid items-center gap-5 sm:grid-cols-2">
      <div className={reverse ? "sm:order-2" : undefined}>{visual}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
