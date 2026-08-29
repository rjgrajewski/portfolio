# Knowledge corpus

The agent's knowledge corpus — `core/`, `topics/`, and `manifest.json`, per
[docs/ARCHITECTURE.md § Knowledge / content
retrieval](../docs/ARCHITECTURE.md#knowledge--content-retrieval).

## Current state — Phase 2 seed

Seeded in **Phase 2** with minimal-but-real content:

- `core/core.md` — the always-loaded core injected into every system prompt:
  CV summary, one line per project, persona notes, guardrail notes. Keep it
  small; every token here is paid on every turn.
- `manifest.json` — the table of contents the agent sees: each topic, its
  available layers, a one-line summary of each, and the matching
  `reveal_section` id.
- `topics/<topic>.<layer>.md` — depth files fetched one at a time by the
  `get_content` tool. Phase 2 covers `education` / `amazon` / `flowjob` /
  `rhymind`, each with a `business` and a `technical` layer.

These files are marked as seed content inline. The full authoring pass
across every topic and layer (plus `star/` case studies, `personal.md`, and
`portfolio-itself.*.md`) is **Phase 8** — see [docs/ROADMAP.md § Phase
8](../docs/ROADMAP.md#phase-8--content-authoring-post-mvp-on-the-critical-path).
The authoring guide (layering, tone, length rules) replaces this file when
Phase 8 starts.

## How it's served

- **Phase 2:** copied into the reasoning Lambda bundle and read from the
  local filesystem (`backend/functions/agent/src/contentStore.ts`).
- **S3 path (ready, not yet the default):** `npm run content:sync -- --env
  dev` pushes this tree to `s3://portfolio-content-<account>-<env>/<env>/`.
  Set `CONTENT_BUCKET` on the Lambda to switch reads to S3.

English only — see [docs/ARCHITECTURE.md § Bilingual EN / PL
support](../docs/ARCHITECTURE.md#bilingual-en--pl-support). The agent
responds in the user's language at generation time; the corpus is not
duplicated per language.
