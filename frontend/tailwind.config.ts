import type { Config } from "tailwindcss";

// TODO(Phase 1): extend the theme (type scale, colour, spacing, motion
// language) as part of the timeboxed design pass — see docs/ROADMAP.md
// § Phase 1. Left at defaults for the Phase 0 placeholder.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
