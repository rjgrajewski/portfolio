/**
 * Section id → content component. One map, imported by both the desktop
 * in-place list (PortfolioSections) and the mobile full-screen takeover
 * (MobileSectionOverlay), so the two presentations can never render
 * different content for the same section.
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
