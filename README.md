# AI-Powered Voice Portfolio

A single-page portfolio that a recruiter can engage with three ways:

1. **Download a CV** — a traditional PDF, for people who just want the artifact.
2. **Browse manually** — an interactive click-through portfolio (Education, Amazon, FlowJob, …).
3. **Talk to an AI agent** (voice or text) — it answers questions about the candidate in the third person *and* opens the relevant portfolio section in sync with its spoken answer.

The AI and the manual click-through drive the **same** underlying content and UI. The agent is an alternate way of navigating the portfolio, not a separate feature bolted on. The portfolio itself is intended to double as a working demonstration of agentic AI design.

---

## Status

Live in production. The core flow works end to end: the manual portfolio, the
CV download, and the **text** AI agent (streamed answers, section reveal in
sync on desktop and mobile).

| | |
|---|---|
| **Done** | Phases 0–3. Cost guardrails + dev/prod split, the manual portfolio shell, the text agent on Bedrock, and the agentic reveal UI — all deployed and verified on production. |
| **Content (Phase 8)** | A first real pass for the flagship topics (Amazon, FlowJob, education, this portfolio itself) — beyond the original seed, not yet the full authoring. STAR case studies and the personal layer are not written yet. |
| **Partial (Phase 6)** | Graceful degradation is done for the **text-agent** failure paths (demo scope): one availability source of truth, every failure routes to the manual portfolio + CV, partial answers are kept and flagged. The mic / Transcribe / Polly rows wait on Phase 4. |
| **Not started** | Voice I/O (Phase 4), bilingual EN / PL (Phase 5), the prompt-injection test pass (Phase 7), the full visual / accessibility polish (Phase 9). |
| **Longer-term goal** | Reusable, general-purpose portfolio asset for an ongoing job search. |

URLs: **production** `https://main.daz9bpic9q3nd.amplifyapp.com` · **staging** `https://dev.daz9bpic9q3nd.amplifyapp.com`

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phase-by-phase detail and [docs/DECISIONS.md](docs/DECISIONS.md) for the decision log.

---

## Documents in this repo

All project documentation lives under [`docs/`](docs/). This file is the only markdown kept at the repository root.

| File | Purpose |
|---|---|
| [README.md](README.md) | This file — overview, how to run/deploy, status |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The technical decisions and their rationale. The "why", so future changes get checked against it. Includes the cost ceiling, the OpenSearch trap, and open questions to resolve during the build. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased milestones with checkboxes. Add new ideas here as they come up. |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Timestamped one-line decision log. |

Operational specs that land later in the same folder: `agent-persona.md`, `prompt-injection-tests.md`, `graceful-degradation.md`, `voice-notes.md`, `runbook.md`.

---

## Hard constraint: cost

**Total running cost must stay under ~100 PLN/month (~$25 USD) in the worst case.** This is a firm ceiling. Every architectural choice is checked against it, and the architecture must scale toward zero when the site is idle (a personal portfolio sits unvisited for long stretches). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#cost-ceiling-hard-constraint) for the full reasoning, the banned components, and the abuse-protection design.

An AWS Budget with an alarm is part of initial setup ([docs/ROADMAP.md Phase 0](docs/ROADMAP.md#phase-0--foundations--cost-guardrails)), not an afterthought.

---

## Tech stack (summary)

**Running today:** Amazon Bedrock (Claude Haiku 4.5), a streaming Lambda
Function URL, DynamoDB, S3, and AWS Amplify Hosting. Polly, Transcribe, and
Cognito are **Phase 4 (voice) and not built** — the rows below are marked.

| Layer | Choice | State |
|---|---|---|
| Hosting | AWS Amplify Hosting — branch-based deploys (`dev` → staging, `main` → production) | live |
| Region | `eu-central-1` (Frankfurt) | live |
| Frontend | Vite + React + TypeScript (static SPA), Tailwind for styling | live |
| Reasoning | Amazon Bedrock — Claude Haiku 4.5 (`eu.anthropic.claude-haiku-4-5-20251001-v1:0`, the EU inference profile), streamed over a **Lambda Function URL** (`InvokeMode: RESPONSE_STREAM`) | live |
| Knowledge retrieval | Hybrid tool-fetch: always-loaded core in the system prompt + a `get_content(topic, layer)` tool for depth. No vector store. Content is bundled with the Lambda today; the S3 seam (`CONTENT_BUCKET`) is wired and ready | live |
| Compute | Lambda only — no always-on servers, no provisioned capacity | live |
| State | DynamoDB (on-demand) — per-session message cap, daily spend counter, conversation logs (content + timestamp, zero identity) | live |
| Infra-as-code | AWS CDK (TypeScript) for everything except the Amplify hosting app | live |
| Text-to-speech | Amazon Polly — generative engine tier | **planned — Phase 4, not built** |
| Speech-to-text | Amazon Transcribe — streaming | **planned — Phase 4, not built** |
| Direct browser→AWS media | Cognito Identity Pool with a tightly-scoped guest role (Polly + Transcribe only) — see [ARCHITECTURE.md § Real-time media transport](docs/ARCHITECTURE.md#real-time-media-transport), the least-settled part of the design | **planned — Phase 4, not built** |

Full rationale, rejected alternatives, and trade-offs are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Repository layout

See [docs/ARCHITECTURE.md § Repository layout](docs/ARCHITECTURE.md#repository-layout) for the annotated tree. Top level:

```
docs/       All project documentation (architecture, roadmap, decisions, specs, runbook)
frontend/   Vite + React SPA (manual portfolio + agent UI)
backend/    CDK infra + Lambda functions
content/    Knowledge corpus — English only, source of truth for the agent
scripts/    Content sync, region/model availability checks, cost estimation
```

---

## How to run

Everything below is implemented and in use. `dev` and `prod` are both
deployed (`portfolio-api-dev` / `portfolio-api-prod` in `eu-central-1`), with
separate DynamoDB tables and S3 prefixes so staging traffic never touches
production data.

### Prerequisites

- Node — the version is pinned by `.nvmrc`.
- For anything that touches AWS (backend deploy, content sync, the
  availability scripts): AWS CLI profile **`portfolio`** — account
  `776715560866`, region `eu-central-1`. This org has **no AWS Identity
  Center**; the profile assumes `OrganizationAccountAccessRole` from
  `rj.grajewski-admin`. Prefix those commands with `AWS_PROFILE=portfolio`.
  Bedrock access for Claude Haiku 4.5 is already enabled (EU inference
  profile only — see [docs/ARCHITECTURE.md § Reasoning](docs/ARCHITECTURE.md#reasoning--amazon-bedrock-claude-haiku-45)).
- Frontend-only work needs none of the above.

### Local development

```bash
npm install
npm run dev            # Vite dev server on http://localhost:5173
```

The agent panel reads `VITE_AGENT_URL` from `frontend/.env.local` (copy
`frontend/.env.example`). Leave it unset to work against the "assistant
unavailable" fallback; set it to a `portfolio-api-<env>` stack's
`AgentFunctionUrl` output to develop against a deployed backend.

### Checks (what CI runs)

```bash
npm run typecheck --workspace=frontend
npm run lint --workspace=frontend
npm run build --workspace=frontend
npm run typecheck --workspace=@portfolio/agent-fn
npm run synth --workspace=backend/infra          # cdk synth, no AWS creds needed
```

### Deploy

Frontend deploys are automatic — Amplify Hosting builds on push:

- push to `dev` → `https://dev.daz9bpic9q3nd.amplifyapp.com` (staging)
- push to `main` → `https://main.daz9bpic9q3nd.amplifyapp.com` (production)

Backend deploys are manual so infra changes stay deliberate:

```bash
cd backend/infra
AWS_PROFILE=portfolio npm run deploy:dev     # cdk deploy --all --context env=dev
AWS_PROFILE=portfolio npm run deploy:prod    # cdk deploy --all --context env=prod
```

`VITE_AGENT_URL` is set per branch in the Amplify console (each branch points
at its own `portfolio-api-<env>` Function URL).

### Sync knowledge content

The Lambda bundles a copy of `content/` at deploy time, so a `cdk deploy`
already refreshes the corpus. This pushes it to the S3 prefix as well (the
`CONTENT_BUCKET` seam, kept in step):

```bash
AWS_PROFILE=portfolio npm run content:sync -- --env dev     # or --env prod
```

### AWS availability / cost scripts

```bash
AWS_PROFILE=portfolio npm run check-availability     # Bedrock / Polly / Transcribe in eu-central-1
npm run estimate-cost                                # token math vs the ~$25 ceiling
AWS_PROFILE=portfolio npm run verify-parallel-tools  # Haiku 4.5 parallel tool-use check
```

---

## Contributing notes

- All knowledge content, system prompts, and project docs are written in **English only**. The agent translates/responds in the user's language (EN or PL) at generation time — the corpus is not duplicated per language.
- If a change contradicts a decision in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) or [docs/DECISIONS.md](docs/DECISIONS.md), update that doc in the same change with the new rationale. Don't silently diverge.
