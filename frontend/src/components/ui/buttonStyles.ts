/**
 * Shared class strings for Button/LinkButton so the two native elements
 * (a real <button> for section triggers, a real <a> for the CV download)
 * look identical without a shared polymorphic component — kept simple and
 * type-safe rather than reaching for `as`-prop gymnastics this early.
 */

export type ButtonVariant = "primary" | "secondary";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 " +
  "text-small font-medium transition-colors duration-150 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-neutral-950 hover:bg-accent-hover",
  secondary:
    "border border-neutral-700 text-neutral-100 hover:border-neutral-500 hover:bg-neutral-900",
};

export function buttonClasses(variant: ButtonVariant = "primary"): string {
  return `${base} ${variants[variant]}`;
}
