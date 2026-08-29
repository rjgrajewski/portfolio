import type { AnchorHTMLAttributes } from "react";
import { buttonClasses, type ButtonVariant } from "./buttonStyles";

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...rest
}: LinkButtonProps) {
  return <a className={`${buttonClasses(variant)} ${className}`} {...rest} />;
}
