/**
 * Section id → content component. One map, used by the section modal
 * (`SectionModal`), so a list tap and the agent cannot render different
 * content for the same section.
 */
import type { ComponentType } from "react";
import type { SectionId } from "../../content/sections";
import { Education } from "./sections/Education";
import { Amazon } from "./sections/Amazon";
import { FlowJob } from "./sections/FlowJob";
import { PortfolioItself } from "./sections/PortfolioItself";

export const SECTION_CONTENT: Record<SectionId, ComponentType> = {
  education: Education,
  amazon: Amazon,
  flowjob: FlowJob,
  "portfolio-itself": PortfolioItself,
};
