# This portfolio — technical layer

All AWS-native — no third-party AI vendor or API key. Today the agent is
text-only; voice input and output (Amazon Transcribe and Polly, browser-direct)
are a designed-but-later phase.

## Reasoning

**Amazon Bedrock, Claude Haiku 4.5.** Haiku over Sonnet or Opus deliberately:
answering questions about a CV with supplied context does not need frontier
reasoning, and the interaction is latency-sensitive. The model ID is per-
environment config, so Sonnet is a one-line fallback if answer quality falls
short. Responses **stream** so the first text — and the section reveal — arrive
as early as possible, over a **Lambda Function URL** with response streaming
(API Gateway buffers the whole response, so it was not an option). The
Lambda-to-browser wire format is newline-delimited JSON with a fixed frame
contract: text deltas, one action frame, exactly one terminal frame.

## Agentic UI

The agent returns a **structured action alongside its answer** —
`reveal_section(sectionId)` — which the frontend executes against the same
components a manual click drives. One reveal code path, whether the trigger is
a click or the model. Section IDs are a fixed, shared set. Single page: no route
changes, no new tabs, so conversation state survives every interaction.
Parallel tool use is confirmed on Haiku 4.5, so a "go deep" turn is two model
calls — fetch plus answer — not three.

## Knowledge retrieval — tool-fetch, no vector database

A small **always-loaded core** (CV summary, one line per topic, persona,
guardrails) sits in the system prompt. Depth lives in per-topic files the model
pulls on demand through a `get_content(topic, layer)` tool. There is **no
vector store**.

The reasoning: semantic search exists to find things in a corpus too large or
too unstructured to enumerate. This corpus is neither — it is a small, known
set of topics, each with a business and a technical layer. The agent does not
need to *search*, it needs to *choose*, and it can see the whole menu.
Tool-fetch is also roughly 5× cheaper and lower-latency than loading the full
corpus every turn. If the corpus ever outgrows enumeration, the sanctioned path
is a Bedrock Knowledge Base on **Amazon S3 Vectors** behind the same tool —
additive, not a rewrite.

## Cost guardrails

The hard ceiling is about **USD 25 per month**, worst case, and it drove the
architecture — no always-on compute, everything scales to zero.

- **Real-time daily circuit-breaker** — an atomic counter in DynamoDB, checked
  at the start of every reasoning call; over threshold, the agent degrades to
  text-only or steps aside for the manual portfolio. This is the real spend
  backstop.
- **Per-session message cap** — checked server-side, but the session ID is
  client-generated and trivially rotated, so this is UX (stopping one runaway
  browser tab), not an abuse control.
- **AWS Budgets** — a slower, independent backstop; billing data lags hours, so
  it cannot stop a spike in progress.
- **WAF** is deferred — its ~USD 5/month floor conflicts with "scale to zero";
  it goes in only if real abuse appears.

## Delivery

Vite + React + TypeScript static SPA on **AWS Amplify Hosting**; the `dev`
branch deploys to staging, `main` to production, which also gives dev / prod
separation from day one. Backend infrastructure is AWS CDK; deploys stay manual
so infra changes are deliberate.
