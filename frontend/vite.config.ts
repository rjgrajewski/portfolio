import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// See docs/ARCHITECTURE.md § Frontend — Vite + React + TS static SPA, no SSR.
export default defineConfig({
  plugins: [react()],
});
