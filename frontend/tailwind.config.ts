import type { Config } from "tailwindcss";

// Phase 1 design pass (docs/ROADMAP.md § Phase 1) — timeboxed, not the full
// "not templated / design-forward" bar (that's Phase 9). These tokens exist
// so every component reaches for a named scale instead of ad hoc values —
// that consistency is most of what "not templated" actually buys at this
// stage, more than any one choice of colour or font.
//
// Palette: near-monochrome dark neutral (Tailwind's built-in `neutral` scale)
// plus exactly one accent (warm amber/gold) for the AI-agent entry point,
// active-section state, and links — deliberately not the blue/purple
// gradient look most AI-product templates default to.
//
// Type: a serif display face (Fraunces, loaded in index.html) for headings
// only, system-ui for everything else — one distinctive signature without
// paying the network-font cost across all body text.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#e8a33d",
          hover: "#f2b658",
        },
      },
      fontFamily: {
        display: ['"Fraunces"', "ui-serif", "Georgia", "serif"],
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      // Named scale (roughly a 1.25 ratio) — reach for these, not arbitrary
      // text-[…] values, so headings stay consistent across every section.
      fontSize: {
        display: [
          "clamp(2.5rem, 2rem + 2.5vw, 4.5rem)",
          { lineHeight: "1.05", letterSpacing: "-0.02em" },
        ],
        h1: [
          "clamp(2rem, 1.6rem + 1.5vw, 3rem)",
          { lineHeight: "1.1", letterSpacing: "-0.01em" },
        ],
        h2: ["1.75rem", { lineHeight: "1.25" }],
        h3: ["1.25rem", { lineHeight: "1.35" }],
        body: ["1rem", { lineHeight: "1.65" }],
        small: ["0.875rem", { lineHeight: "1.5" }],
      },
    },
  },
  plugins: [],
} satisfies Config;
