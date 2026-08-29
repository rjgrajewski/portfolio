import type { ReactNode } from "react";

/** Consistent content width + horizontal padding rhythm, used everywhere
 * instead of ad hoc max-w-/px- values scattered per component. */
export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-3xl px-4 sm:px-6 ${className}`}>
      {children}
    </div>
  );
}
