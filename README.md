# AI-Powered Voice Portfolio

A single-page portfolio that a recruiter can engage with three ways:

1. **Download a CV** — a traditional PDF, for people who just want the artifact.
2. **Browse manually** — an interactive click-through portfolio (Education, Amazon, FlowJob, …).
3. **Talk to an AI agent** (voice or text) — it answers questions about the candidate in the third person *and* opens the relevant portfolio section in sync with its spoken answer.

The AI and the manual click-through drive the **same** underlying content and UI. The agent is an alternate way of navigating the portfolio, not a separate feature bolted on. The portfolio itself is intended to double as a working demonstration of agentic AI design.

---

## Status

| | |
|---|---|
| **Phase** | Documentation / pre-implementation |
| **Code** | None yet — scaffolding begins after these docs are approved |
| **Near-term goal** | Core flow demoable for an interview on **Tuesday** (does not need to be fully polished) |
| **Longer-term goal** | Reusable, general-purpose portfolio asset for an ongoing job search |

See [docs/ROADMAP.md](docs/ROADMAP.md) for phased milestones and the Tuesday minimum bar.

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

| Layer | Choice |
|---|---|
| Hosting | AWS Amplify Hosting — branch-based deploys (`dev` → staging, `main` → production) |
| Region | `eu-central-1` (Frankfurt) |
| Frontend | Vite + React + TypeScript (static SPA), Tailwind for styling |
| Reasoning | Amazon Bedrock — Claude Haiku 4.5 (`anthropic.claude-haiku-4-5`), streaming |
| Text-to-speech | Amazon Polly — **generative engine tier** |
| Speech-to-text | Amazon Transcribe — streaming |
| Knowledge retrieval | Hybrid tool-fetch: always-loaded core in the system prompt + a `get_content(topic, layer)` tool that fetches depth from S3 on demand |
| Compute | Lambda only — no always-on servers, no provisioned capacity |
| State | DynamoDB (on-demand) — session caps, daily spend counter, conversation logs |
| Direct browser→AWS media | Cognito Identity Pool with a tightly-scoped guest role (Polly + Transcribe only) — *current plan, not yet validated; see [ARCHITECTURE.md § Real-time media transport](docs/ARCHITECTURE.md#real-time-media-transport), the least-settled part of this architecture* |
| Infra-as-code | AWS CDK (TypeScript) for everything except the Amplify hosting app |

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

## How to run (planned — not yet implemented)

> These commands describe the intended developer workflow. None of this exists yet.

### Prerequisites

- Node.js 20+ (`.nvmrc` will pin the exact version)
- AWS account **`portfolio`**, account ID `776715560866`, in the target organization. This organization has **no AWS Identity Center** — access is via **role assumption**, not SSO. AWS CLI profile: **`portfolio`** (assumes `OrganizationAccountAccessRole` from the `rj.grajewski-admin` profile), default region `eu-central-1`.
- Bedrock model access for Claude Haiku 4.5 — confirmed working **only** via the EU inference profile (`eu.anthropic.claude-haiku-4-5-20251001-v1:0`); the direct in-region model ID does not work. See [docs/ARCHITECTURE.md § Reasoning](docs/ARCHITECTURE.md#reasoning--amazon-bedrock-claude-haiku-45).

### Local development

```bash
npm install
npm run dev            # runs the frontend against the deployed dev backend
```

### Deploy the backend (dev)

```bash
cd backend/infra
npm run deploy:dev     # cdk deploy of the dev stacks
```

### Deploy the frontend

Frontend deploys are handled by Amplify Hosting on push:

- push to `dev` → staging URL
- push to `main` → production URL

CDK backend deploys stay manual (`npm run deploy:dev` / `deploy:prod`) so infra changes are always deliberate.

### Sync knowledge content

```bash
npm run content:sync -- --env dev     # pushes content/ to the dev S3 prefix
```

Dev and prod use separate S3 prefixes / DynamoDB tables so test queries never pollute real usage data.

---

## Contributing notes

- All knowledge content, system prompts, and project docs are written in **English only**. The agent translates/responds in the user's language (EN or PL) at generation time — the corpus is not duplicated per language.
- If a change contradicts a decision in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) or [docs/DECISIONS.md](docs/DECISIONS.md), update that doc in the same change with the new rationale. Don't silently diverge.
