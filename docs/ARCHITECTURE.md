# Architecture

This document is the **"why"**. It records the technical decisions behind the AI-Powered Voice Portfolio and the reasoning for each, so that future changes can be checked against past intent instead of silently contradicting it. If you change something here, update this doc and [DECISIONS.md](DECISIONS.md) in the same change.

Short one-line decisions live in [DECISIONS.md](DECISIONS.md). Milestones live in [ROADMAP.md](ROADMAP.md).

---

## Table of contents

- [Product shape](#product-shape)
- [Cost ceiling (hard constraint)](#cost-ceiling-hard-constraint)
  - [The OpenSearch Serverless trap](#the-opensearch-serverless-trap)
  - [No always-on compute](#no-always-on-compute)
- [Region](#region)
- [Hosting](#hosting)
- [Frontend](#frontend)
- [AI stack](#ai-stack)
  - [Reasoning — Amazon Bedrock, Claude Haiku 4.5](#reasoning--amazon-bedrock-claude-haiku-45)
  - [Text-to-speech — Amazon Polly, generative tier](#text-to-speech--amazon-polly-generative-tier)
  - [Speech-to-text — Amazon Transcribe, streaming](#speech-to-text--amazon-transcribe-streaming)
  - [Rejected: Web Speech API](#rejected-web-speech-api)
  - [Rejected: ElevenLabs](#rejected-elevenlabs)
- [Knowledge / content retrieval](#knowledge--content-retrieval)
  - [The three options considered](#the-three-options-considered)
  - [Decision: Option C (hybrid tool-fetch)](#decision-option-c-hybrid-tool-fetch)
  - [Migration path if the corpus outgrows this](#migration-path-if-the-corpus-outgrows-this)
  - [Rejected: non-AWS vector databases](#rejected-non-aws-vector-databases)
- [Agentic UI pattern](#agentic-ui-pattern)
- [Real-time media transport](#real-time-media-transport)
- [Data stores](#data-stores)
- [Abuse protection and cost control](#abuse-protection-and-cost-control)
- [Logging](#logging)
- [Bilingual EN / PL support](#bilingual-en--pl-support)
- [Graceful degradation](#graceful-degradation)
- [Agent persona and guardrails](#agent-persona-and-guardrails)
- [Dev / prod separation](#dev--prod-separation)
- [Repository layout](#repository-layout)
- [Open questions / risks to resolve during the build](#open-questions--risks-to-resolve-during-the-build)

---



## Product shape

A single-page app. Three entry points into the **same** content and UI:

1. **CV download** — a static PDF artifact.
2. **Manual click-through** — interactive portfolio sections that expand/reveal in place.
3. **AI agent** (voice or text) — answers questions about the candidate in the third person and drives the same section-reveal UI in sync with its answer.

Non-negotiables that shape everything below:

- **Single page.** Sections expand/reveal in place. **No new browser tabs, no route changes** — that risks breaking chat state.
- **The agent and the manual experience are the same experience.** The agent emits a structured UI action alongside its answer; the frontend executes it against the same components a click would drive.
- **Voice is the primary entry; the whole screen is the portfolio.** The layout is a single scrolling column (mobile and desktop alike). The agent is present as a fixed, organic **visualization** at the bottom of the viewport — breathing at rest, reacting to mic/playback amplitude in conversation — and, while a conversation is live, a subtle **AI-mode frame** around the viewport that signals "the agent is driving the interface". It does **not** occupy a docked chat column. The **transcript is hidden by default** — a slim bottom bar with the last line, expandable to full history, capped so it never buries an open section (and re-collapsed on mobile whenever a section opens). A discreet **"Leave voice"** control is always available; on exit the frame clears and the portfolio is untouched. This replaces the earlier desktop two-zone layout (a fixed agent column beside a scrolling content column) — recorded in `docs/DECISIONS.md`. Text input stays reachable behind a small "Type" toggle in the bar, deliberately *not* styled into the voice aesthetic pending a device-test decision on whether typing belongs inside voice mode or is an exit from it.
- **The manual click-through is a complete, real alternative** for recruiters who won't use AI — not a dead-end PDF.
- **Visual quality is a hard requirement — for launch, not for Tuesday.** Design-forward, clean, minimalist, not templated or obviously generated. This bar is formally owned by [ROADMAP Phase 9](ROADMAP.md#phase-9--polish--responsiveaccessibility-pass); the [Tuesday minimum bar](ROADMAP.md#tuesday-demo--minimum-bar) only requires a timeboxed design pass (Phase 1) that is presentable, not the fully polished result. This resolves an earlier inconsistency where Phase 1's exit criteria implied the full bar had to clear before Tuesday.
- **The portfolio is itself a proof of skill.** Agentic design choices should be defensible in an interview.

---



## Cost ceiling (hard constraint)

**Total running cost must stay under ~100 PLN/month (~$25 USD) in the worst realistic case.** This is a firm ceiling, not a target. Two rules follow from it:

1. Every architectural choice is checked against it.
2. The architecture must genuinely **scale toward zero when idle**. This is a personal portfolio; it will sit unvisited for weeks at a time and must cost almost nothing during those weeks.

An **AWS Budget with an alarm** (plus a CloudWatch billing alarm and an SNS alert) is configured in [Phase 0](ROADMAP.md#phase-0--foundations--cost-guardrails), before any feature work.

### The OpenSearch Serverless trap

**Classic OpenSearch Serverless as a vector store is banned for this project.**

- It carries a **4 OCU minimum** at ~$0.24/OCU-hour ≈ **~$700/month with zero traffic**.
- AWS nudges you toward it as the default when you create a Bedrock Knowledge Base — it is the path of least resistance in the console, which is exactly why this warning exists.
- **Deleting a Knowledge Base does not delete the underlying OpenSearch collection.** It keeps billing silently until you find and delete the collection itself.

Newer "NextGen" OpenSearch Serverless collections reportedly scale compute to zero after ~10 minutes idle, which would change this calculus — but **do not rely on that without explicitly verifying it**, and the default posture is to avoid OpenSearch entirely. The chosen knowledge approach ([Option C](#decision-option-c-hybrid-tool-fetch)) needs no vector store at all, and the documented migration path uses **Amazon S3 Vectors**, not OpenSearch.

### No always-on compute

**Lambda + API Gateway (or Lambda Function URLs) only.** No persistent servers. No provisioned concurrency. No always-warm anything. If a component bills by the hour whether or not anyone is using it, it does not belong in this architecture unless its idle cost is negligible and explicitly accepted here (see [WAF note](#abuse-protection-and-cost-control)).

---



## Region

**Europe (Frankfurt) /** `eu-central-1`**.**

- Lowest latency from Poland — this is a latency-sensitive voice app.
- Confirmed to support Polly generative voices, Transcribe streaming, and Bedrock.
- **Verified in [Phase 0](ROADMAP.md#phase-0--foundations--cost-guardrails), by real calls, not `describe`/console checks:**
  - **Claude Haiku 4.5 on Bedrock** — reachable **only** via the EU cross-region inference profile, `eu.anthropic.claude-haiku-4-5-20251001-v1:0`. The direct in-region model ID (`anthropic.claude-haiku-4-5-20251001-v1:0`) does **not** work — it fails with `ValidationException`, because this model's `inferenceTypesSupported` is `["INFERENCE_PROFILE"]` only, with no `ON_DEMAND` option. This isn't a preference between two working options; the inference-profile form is the only one that works. A `global.*` profile was also tried and does not work — it requires a separate Anthropic use-case form. **Correction to an earlier claim in this section:** it was previously stated that no console click-through was needed for model access, on the basis that `list-foundation-models` shows Anthropic models with `authorizationStatus: AUTHORIZED`. That was wrong — `AUTHORIZED` describes catalog/model-agreement status, not whether the model can actually be invoked. See the second pitfall below: a separate, per-account "use case details" form gates real invocation and has to be submitted in the console regardless of that status. See [§ Reasoning](#reasoning--amazon-bedrock-claude-haiku-45) for the config consequence.
  - **Polly generative voices in Frankfurt** — confirmed by actually synthesizing audio, not just listing voices. Polish: `Ola` and `Ewa`, confirmed via MP3 synthesis. English generative: `en-US` (`Danielle`, `Joanna`, `Matthew`, `Ruth`, `Salli`, `Stephen`, `Tiffany`) and `en-GB` (`Amy`, `Brian`) — this roster is the input set for [OQ-7](#open-questions--risks-to-resolve-during-the-build) (choosing the EN voice identity to pair with `Ola`/`Ewa`).
  - **Transcribe streaming in Frankfurt** — confirmed for `en-US`, `en-GB`, and `pl-PL` with a full round trip: Polly-synthesized audio → PCM 16kHz → Transcribe streaming, and the resulting transcripts matched the original input text.

**Operational pitfall to know about, not to re-discover mid-build:** a brand-new AWS account goes through an account-verification hold of roughly 2 hours, during which **Bedrock specifically** returns `AccessDeniedException: "Your account is currently being verified"` on every call — this is not a permissions or config bug. It's scoped to Bedrock; Polly worked immediately on the same account with no such hold.

**Second pitfall, found by `scripts/check-availability.ts` (the regression check, not the original manual pass above) — resolved, but worth keeping documented since it can resurface:** Bedrock also gates on a one-time, per-account "model use case details" form for Anthropic models, independently of the account-verification hold above and independently of the model's `authorizationStatus: AUTHORIZED` in the catalog (see the correction above — that status does not mean the model can actually be invoked). After the original manual verification had already succeeded once, a later run of the same `eu.anthropic.claude-haiku-4-5-20251001-v1:0` Converse call — reproduced identically via the script, a direct CLI call, and a retry — started failing with:

```
ResourceNotFoundException: Model use case details have not been submitted
for this account. Fill out the Anthropic use case details form before using
the model. If you have already filled out the form, try again in 15 minutes.
```

`aws bedrock list-foundation-models` / `get-foundation-model` still showed the model as `ACTIVE` with `inferenceTypesSupported: ["INFERENCE_PROFILE"]` throughout — the model catalog entry looked fine the whole time; this is a separate, account-level entitlement gate that sits in front of actually invoking the model. **Fix is console-only, not CLI/CDK**: AWS Console → Bedrock → **Model catalog** → **Submit use case details**, filled in once for the `portfolio` account (`776715560866`) in `eu-central-1` — this is submitted either per account or once at the organization's management-account level; it is not something CDK or the CLI can do. **Resolved 2026-08-29** — re-ran `AWS_PROFILE=portfolio npm run check-availability` after submitting and got 6/6 green, Bedrock responding normally through the `eu.*` profile. Recorded here because the gate can apparently reassert itself even after previously working, so it's worth knowing the shape of the error if it comes back rather than re-diagnosing from scratch.

Everything (Amplify app, Lambdas, DynamoDB, S3, Cognito) lives in `eu-central-1` unless a service forces otherwise.

---



## Hosting

**AWS Amplify Hosting.**

Chosen over Vercel / GitHub Pages deliberately:

- Gives a second real Bedrock proof point (FlowJob already uses Bedrock), reinforcing genuine hands-on AWS AI-infrastructure experience rather than "a nice website".
- Config risk assessed and judged low given prior AWS experience from FlowJob and Rhymind.
- Funds already exist in the current AWS organization account — no new spend to approve.

**Branch-based deploys:**

- `dev` branch → staging URL
- `main` branch → production URL

This also satisfies the dev/prod separation requirement (a lesson from FlowJob/Rhymind, where it wasn't set up from day one).

The app is a **static SPA** — no SSR, no Amplify compute tier. Idle hosting cost is effectively storage + per-request bandwidth, which is negligible. Amplify build minutes are the only real cost line and only accrue on push.

---



## Frontend

**Vite + React + TypeScript**, static SPA output, **Tailwind CSS** for styling, with hand-crafted CSS where the design bar needs it.

Rationale:

- **React** is the default assumption in the brief; nothing here argues against it.
- **Vite over Next.js** — there is no SSR need and the "no route changes" rule means we don't want a router. A static SPA is the simplest thing that fits, deploys trivially on Amplify, and has the smallest surface area to get wrong before Tuesday.
- **Tailwind** for velocity and consistency; the "not templated" bar is met through custom layout, type, motion, and restraint — not by reaching for a component kit.
- A lightweight animation approach (CSS transitions / a small motion lib) for the section-reveal. Section reveal and spoken answer must land **simultaneously**, so the reveal animation budget is tight.

State management: local React state + a small number of contexts (conversation, language, degradation status). No Redux-scale tooling for an app this size.

---



## AI stack

All AWS-native. No non-AWS vendor, no third-party API key.

### Reasoning — Amazon Bedrock, Claude Haiku 4.5

- Model: **Claude Haiku 4.5** — Bedrock ID **`eu.anthropic.claude-haiku-4-5-20251001-v1:0`** (the EU cross-region inference profile). Confirmed in Phase 0 as the *only* working form — see [§ Region](#region) for the full result (direct in-region ID and `global.*` both fail). ~$1 / 1M input tokens, ~$5 / 1M output tokens, 200K context.
- **Rationale:** this is a latency-sensitive voice app where response speed materially affects the experience, and the task — answering questions about a CV with supplied context — does not need frontier reasoning.
- **Sonnet is the fallback** only if answer quality proves insufficient in testing (the code path should make the model ID a per-env config value so this is a one-line change). **Consequence of the Phase 0 result:** since Haiku 4.5 needed the inference-profile form and not the direct ID, Sonnet cannot be assumed to be reachable via a direct in-region ID either — its inference-profile requirement must be checked the same way before it's ever flipped to in `config.ts`. The per-env model-ID config should default to the inference-profile form (`eu.*`) as the expected shape, not the in-region form, for any Bedrock Anthropic model added here.
- **Do not use Opus / Fable-tier models here.** ~10× the cost, slower, unjustified for this workload. This is a standing rule, not a default to reconsider casually.
- Requests **stream** (`InvokeModelWithResponseStream` semantics) so the first tokens — and therefore the first spoken audio and the section reveal — arrive as early as possible.



### Text-to-speech — Amazon Polly, generative tier

- **Generative engine tier specifically** — not standard, not neural. The generative tier is meaningfully more natural and conversational.
- It supports a **bidirectional streaming API** so audio can begin playing while the LLM is still generating text, cutting perceived latency. **Verify this API's availability, the exact engine it supports, and whether it is reachable from the browser SDK** ([open question 4](#open-questions--risks-to-resolve-during-the-build)). Fallback if not: chunk the answer by sentence and fire sequential `SynthesizeSpeech` calls, playing sentence *n* while synthesizing *n+1*.
- English and Polish generative voices are **different voice identities** (see [Bilingual](#bilingual-en--pl-support)).



### Speech-to-text — Amazon Transcribe, streaming

- Streaming transcription so the user sees their words appear as they speak and the turn can start promptly on silence.
- Polish (`pl-PL`) is supported for both batch and streaming.
- **Language is selected explicitly in the UI** (EN / PL toggle) rather than relying on Transcribe streaming automatic language identification, whose Polish coverage for the *streaming* path is unconfirmed ([open question 5](#open-questions--risks-to-resolve-during-the-build)). The toggle also selects the Polly voice and sets the agent's response-language instruction, so it earns its place regardless.



### Rejected: Web Speech API

Browser-native STT/TTS was rejected: too limited, inconsistent across browsers, and the portfolio is meant to showcase "advanced", not "basic browser feature". It may still appear as a *last-resort* degradation layer for TTS only (read the answer aloud with `speechSynthesis` if Polly is entirely unavailable) — but it is not part of the primary design.

### Rejected: ElevenLabs

ElevenLabs voice quality is genuinely more natural/expressive (confirmed across multiple independent comparisons), and there is prior hands-on experience with it. Rejected anyway:

1. **Quality gap isn't decisive here.** Polly's generative tier, once actually listened to, was judged acceptable for this use case.
2. **Cost.** Roughly 3–6× more per use, and its pricing is largely subscription-tier based (e.g. $99/mo) rather than pure pay-as-you-go — recurring cost even in idle months, which breaks the 100 PLN ceiling.
3. **New vendor.** A separate account and API key outside the existing AWS setup, breaking the AWS-native architecture chosen deliberately.

Net: Polly generative keeps the stack fully AWS-native, elastic, and free of new spend, at an acceptable (not superior) quality level.

---



## Knowledge / content retrieval

**Decided: Option C — hybrid tool-fetch. No vector store.**

> **Note on brief consistency:** an earlier framing treated this as an open decision between two options. It has since been resolved to Option C below, and the deliverable is written that way. All three options and their trade-offs are recorded here so the decision stays auditable and reversible, and so the [migration path](#migration-path-if-the-corpus-outgrows-this) is explicit.

The earlier working assumption was a full vector-based retrieval pipeline (Bedrock Knowledge Bases). That was reconsidered once two things were known: the 100 PLN cost ceiling, and that assembling the source content is expected to take only a couple of hours — implying a **small corpus**, likely well under 100k tokens, and a **known, enumerable** set of topics.

### The three options considered

Cost alone doesn't rule any of the three out on its own — even the priciest, uncached Option A ($16.50/month at 20 busy hours) stays under the 100 PLN ceiling in isolation. But it eats roughly two-thirds of the ceiling before Polly, Transcribe, and hosting are even added, which leaves little margin — so cost is a real factor, just not the *deciding* one. Corpus structure, latency, and answer quality are what actually separate the three options.

**Option A — Full context + prompt caching (no vector store).**
Load the entire corpus into the system prompt on every request; use prompt caching to keep cost down.
*Pros:* simplest; no retrieval step; no retrieval failures.
*Cons:* every request carries the whole corpus, so time-to-first-token scales with corpus size — bad for a voice app. Bedrock's prompt-cache TTL is short (~5 min); a visitor who pauses between questions blows the cache and pays full price on the next call.

**Option B — Agentic tool-fetch (structured retrieval, no vector store).**
The agent gets a small routing prompt containing only a table of contents, and calls a tool like `get_content(topic, layer)` to fetch a single content file (e.g. `flowjob` / `technical`) from S3 on demand. The model chooses what it needs; nothing is silently injected by a retriever.
*Pros:* small, predictable context per turn; low latency; the model's retrieval choices are visible and debuggable; reuses the tool-use mechanism already being built for UI control.
*Cons:* a fetch round-trip when depth is needed; the model must choose correctly from the menu.

**Option C — Hybrid (chosen).**
A small **always-loaded core** in the system prompt — CV summary, one line per project, persona, guardrails — **plus** Option B's tool-fetch for depth.
*Pros:* broad questions ("tell me about Fono", "what has he worked on") are answered with **no fetch at all**; only going deep on a specific topic triggers a fetch. Best latency profile of the three for the expected question mix.
*Cons:* two content tiers to keep in sync (core blurb vs. full topic file).

**Measured cost comparison** (Claude Haiku 4.5, one busy hour = 20 exchanges):


| Approach                              | per busy hour | × 20 busy hours/month |
| ------------------------------------- | ------------- | --------------------- |
| A — 40k corpus, no caching            | $0.83         | $16.50                |
| A — 40k corpus, 50% cache hits        | $0.47         | $9.30                 |
| B / C — tool-fetch (~6k tokens/query) | $0.09         | $1.82                 |




### Decision: Option C (hybrid tool-fetch)

**Why not semantic retrieval, for now:** semantic search exists to find things in a corpus too large or too unstructured to enumerate. This corpus is neither. It is a small, known, well-structured set of topics (Amazon, FlowJob, Rhymind, education, the portfolio-as-a-project, a thin personal layer), each with a **business layer** and a **technical layer**. The agent doesn't need to *search*; it needs to *choose*, and it can see the entire menu. Tool-fetch is the architecturally correct fit at this scale, not a workaround. It is also ~5× cheaper and lower-latency than full-context, and latency is what users actually perceive in a voice interface.

**Shape of the implementation:**

- `content/core/core.md` — the always-loaded core. Small. CV summary, one line per project, persona, guardrails.
- `content/manifest.json` — the table of contents the agent sees: for each topic, its available layers and a one-line summary.
- `content/topics/<topic>.<layer>.md` — the depth files, fetched one at a time.
- Tools exposed to the model:
  - `get_content(topic, layer)` → returns one content file (from S3 in dev/prod; may be bundled with the Lambda for the earliest MVP).
  - `reveal_section(sectionId)` → the [agentic UI action](#agentic-ui-pattern).
- The Lambda assembles: system prompt (persona + guardrails + core + manifest) → conversation history → user turn. Fetched content is appended as tool results.



### Migration path if the corpus outgrows this

If the corpus later grows past what's comfortable to enumerate, add a **Bedrock Knowledge Base backed by Amazon S3 Vectors** (GA Dec 2025) **behind the existing tool interface**. This is additive, not a rewrite — the agent is already fetching through a tool, so only what sits behind `get_content` changes.

- S3 Vectors has **no provisioned compute**. Storage ~$0.06/GB/month; a published benchmark puts 100,000 vectors at roughly $0.10/month. A corpus this size would be a few hundred vectors.
- This keeps the migration inside the cost ceiling and inside the AWS-native architecture.



### Rejected: non-AWS vector databases

Evaluated and rejected. At this scale the vector store is not a meaningful cost line, so there is nothing to save. Pinecone's paid Standard tier carries a **~$50/month minimum that alone breaches the cost ceiling**. Any external provider also adds a vendor, an API key, and a cross-cloud network hop on every query, while breaking the AWS-native architecture chosen deliberately above.

---



## Agentic UI pattern

The agent does not just return text/audio. It returns a **structured UI action alongside its answer**, which the frontend executes. This is function calling / tool use: the model's output includes a UI command; the frontend reacts.

- The primary action is `reveal_section(sectionId)`. The section IDs are a fixed, known set (`education`, `amazon`, `flowjob`, `rhymind`, `portfolio-itself`, …), shared between the manual portfolio and the agent.
- **Single-page only.** Sections expand/reveal in place. **No new tabs. No route changes.** State (conversation, audio, language) must survive every interaction.
- The section reveal and the spoken answer happen **simultaneously**, not sequentially. Practically: as soon as the streamed model output yields the action (early, ideally before the prose finishes), the frontend triggers the reveal while audio playback of the answer begins.
- On mobile, "reveal in place" becomes a **full-screen takeover** for the active section (`MobileSectionOverlay`); on desktop it's the in-place accordion. Both are driven by the same `activeSectionStore` state. The agent presence (visualization + AI-mode frame) sits **above** the takeover — a section reveal is when it's most important to see the agent is driving the UI, not least. The stacking order is one named scale in `styles/index.css` (`--z-header` 20 < `--z-section-takeover` 40 < `--z-ai-frame` 50 < `--z-agent-dock` 60); the dock is rendered through a portal to `document.body` so no ancestor can re-base its `position: fixed`.
- The manual click-through calls the **same** reveal logic. There is one code path for "show section X", whether the trigger is a click or the agent — `revealSection` in `content/activeSectionStore.ts`, no exceptions. The agent's on-screen presence (the visualization, the AI-mode frame, the transcript dock — see [§ Product shape](#product-shape)) is layered *over* the portfolio and only ever **reads** `activeSectionStore`; it never forks the reveal path.
- **The agent's presence is ambient, not a panel.** A fixed canvas visualization (organic amber form, `requestAnimationFrame`, no animation library) shows four states without text — rest (breathing), listening (swells with real mic amplitude, tapped off the voice session's existing mic node), thinking (a lobe orbits the perimeter — distinct rotational motion), speaking (shimmer pulsing with an analyser on the Polly output path). `prefers-reduced-motion` switches to statically-distinguishable shapes. Audio processing (the AudioWorklet + SDK) always has thread priority over the animation.

---



## Real-time media transport

**This is the least-settled part of the architecture and needs validation early ([open question 3](#open-questions--risks-to-resolve-during-the-build)).** Recorded here as the current plan.

The tension: Transcribe streaming and Polly bidirectional streaming need a **persistent bidirectional connection** (HTTP/2 or WebSocket). The "Lambda + API Gateway only, no persistent compute" rule does not naturally accommodate a live audio stream proxied through a function.

**Current plan — browser talks to AWS directly for media, Lambda owns reasoning + policy:**


| Path                          | Transport                                                                                                                     | Notes                                                                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Get media credentials         | **Browser → `backend/functions/credentials/` Lambda** (Function URL, buffered JSON)                                          | The OQ-8 fix. Token bucket → **media** circuit-breaker → `sts:AssumeRole` on `portfolio-media-guest-<env>`. **No Cognito Identity Pool** (an unsigned pool call can't be breaker-gated). 900s TTL (the STS floor).   |
| Mic audio → text              | **Browser → Amazon Transcribe streaming directly** (`en-US`), using the short-lived credentials from the vending Lambda      | No server in the audio loop. Scales to zero. Role scoped to `transcribe:StartStreamTranscriptionWebSocket` only — the browser SDK reaches Transcribe over a presigned WebSocket, a *separate* IAM action from the Node HTTP/2 `StartStreamTranscription`. A 16 kHz AudioWorklet resamples + PCM-encodes so the stream matches the declared `sample-rate=16000` (`frontend/src/agent/{stt,pcmChunker}.ts`).                             |
| Answer text → speech          | **Browser → Amazon Polly directly** (generative, `Ruth`), same vended credentials                                            | Role scoped to `polly:SynthesizeSpeech` only. Sentence-chunked `SynthesizeSpeech` (OQ-4: bidirectional streaming exists but isn't browser-reachable); synth *n+1* while *n* plays (`frontend/src/agent/tts.ts`).     |
| Question → answer (reasoning) | **Browser → Lambda** (Function URL, response streaming) → Bedrock                                         | This is where the [session cap](#abuse-protection-and-cost-control), the [circuit-breaker](#abuse-protection-and-cost-control), and [logging](#logging) are enforced. Bedrock is **never** called from the browser. |


**Decided (reasoning-transport question, resolved 2026-08-29 — no longer open): Lambda Function URL with response streaming (`InvokeMode: RESPONSE_STREAM`) for the reasoning path.** Streaming the response is a hard requirement of [Phase 2](ROADMAP.md#phase-2--agent-mvp-text-only) (the frontend needs a live streamed transcript); API Gateway REST buffers the full response before returning it, and HTTP API does not support response streaming either. Function URL is therefore the only option that satisfies the requirement, not merely the preferred one. Consequences, now settled rather than open:

- **Throttling must live in the function itself** (token bucket) — this was framed as an "either/or" with API Gateway throttling; it no longer is, since a Function URL has no built-in throttling/usage-plans at all.
- **CORS is configured directly on the Function URL** (the `cors` block of the CDK `FunctionUrl` construct), not via API Gateway.
- **CloudFront in front is deferred** — not needed for Tuesday; revisit only if abuse patterns or caching needs appear post-launch.

**Abuse concern with browser-direct media — resolved (OQ-8).** The original plan vended media credentials from a Cognito Identity Pool guest role. That was abandoned: `GetId` / `GetCredentialsForIdentity` are **unsigned** calls that need only the (public) pool id, so a script can pull guest credentials without ever loading the page and there is **no point at which a spend breaker can gate issuance** — and disabling unauthenticated identities would force real login, which the product rules out. Cognito cannot close this hole.

Instead, `backend/functions/credentials/` is the **only** way to obtain media credentials:

1. an in-container token bucket (one hot client bound),
2. an atomic increment-and-check of the daily **media** circuit-breaker — a counter **independent** of the reasoning breaker (`pk = media#day#<date>` in the same `usage-counters` table; per-env `mediaBreakerThreshold`), so voice abuse can't disable the text agent or vice versa,
3. only then `sts:AssumeRole` on `portfolio-media-guest-<env>` — a role scoped to **exactly the two actions the browser makes with these credentials**: `polly:SynthesizeSpeech` and `transcribe:StartStreamTranscriptionWebSocket` (the WebSocket form the browser SDK uses — a *separate* IAM action from the Node HTTP/2 `transcribe:StartStreamTranscription`, which is deliberately **not** granted). Trust policy names **one** principal: this Lambda's execution role. `DurationSeconds` is 900 — the STS floor, and deliberately the minimum (a leaked set is useless after 15 min; the frontend re-vends transparently; the breaker bounds total grants regardless).

Breaker tripped → `{ ok:false, code:"media_breaker_tripped" }` and **zero credentials issued**; the frontend routes that code through `frontend/src/agent/degradation.ts` to a voice-off / text-still-works state. **Empirically verified on dev** by `scripts/verify-oq8.ts` (`npm run verify-oq8`, 8/8): IAM policy simulation confirms the browser's two actions (`transcribe:StartStreamTranscriptionWebSocket`, `polly:SynthesizeSpeech`) are allowed and 16 others — including the Node HTTP/2 `transcribe:StartStreamTranscription`, S3, DynamoDB, Bedrock, `sts:AssumeRole` — are denied; a real `polly:SynthesizeSpeech` with the vended creds works while `polly:DescribeVoices` is `AccessDenied`; a direct `AssumeRole` of the guest role is `AccessDenied` even to full account admin; the tripped breaker returns `media_breaker_tripped` and issues nothing. The end-to-end spoken WebSocket round-trip is browser-only and is verified on live staging. There is no credential path that bypasses the breaker.

**Verification lesson (2026-08-30):** the *first* OQ-8 pass proved the security properties but its functional check used the Node HTTP/2 `transcribe:StartStreamTranscription` — the browser uses the distinct `…WebSocket` action, which the role lacked, so voice failed only in a real browser. The role and `verify-oq8.ts` now target the browser's actual action names. See [DECISIONS.md](DECISIONS.md).

**Residual risk (accepted).** Within a live 15-min credential window the creds are not bounded on *characters* — bounding those would need the browser to report usage (untrustworthy) or a media proxy (defeats browser-direct). The bounds that do apply: the media breaker caps *grants* per day, Polly generative's low per-account TPS quota caps throughput inside a window, and the `portfolio-monthly-gross-usd25` AWS Budget alarm is the hard backstop. Full elimination needs the plan-B WebSocket media proxy — deferred, tracked in the backlog.

**Alternative if browser-direct is rejected:** API Gateway **WebSocket API** + a Lambda that proxies frames to Transcribe. Still serverless, still scales to zero, but more moving parts and the 15-minute Lambda cap to design around. Kept as plan B.

---



## Data stores

The brief doesn't name a database; these are **proposed**. All on-demand / pay-per-use, all scale to zero.


| Store                              | Purpose                                                                                                         | Notes                                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **DynamoDB —** `sessions`          | Per-session message count (the [session cap](#abuse-protection-and-cost-control)), session language, timestamps | Partition key: random non-identifying `sessionId`. TTL auto-expires rows (e.g. 24–48h).                     |
| **DynamoDB —** `usage-counters`    | Rolling daily request/token counter for the [real-time circuit-breaker](#abuse-protection-and-cost-control)     | Single hot item per day (`pk = day#<date>`), atomic `ADD`. Read at the start of every reasoning invocation. |
| **DynamoDB —** `conversation-logs` | [Logged](#logging) conversation content + timestamps, **no identity**                                           | Partition key: `sessionId`. Optional TTL. This is the only place conversation text is retained.             |
| **S3 —** `content` **bucket**      | The knowledge corpus fetched by `get_content`                                                                   | `dev/` and `prod/` key prefixes. Synced from `content/` by `scripts/sync-content.ts`.                       |
| **S3 (Amplify-managed)**           | The built static frontend + the downloadable CV PDF                                                             | Managed by Amplify Hosting.                                                                                 |


Dev and prod use **separate tables and separate S3 prefixes** so development traffic never contaminates real usage data.

DynamoDB on-demand with this volume is effectively free (well under $1/month in any realistic scenario). It is not a cost concern; it is chosen for "scales to zero" and operational simplicity.

---



## Abuse protection and cost control

This is a public endpoint that spends money per request. It needs protection from both malicious and accidental over-use. The requirement is fixed; the specific mechanisms below are the current plan.


| Control                             | Mechanism                                                                                                                                                                                                                               | Layer             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **Request throttling**              | Token-bucket check inside the reasoning Lambda — the Function URL decision ([above](#real-time-media-transport)) means API Gateway's throttling/usage-plans aren't available; optional CloudFront rate rules if abuse appears           | Function           |
| **Per-session message cap**         | Hard cap on exchanges per `sessionId`, checked server-side against the `sessions` table; surfaced gracefully in the UI when hit. **Not an abuse control** — see note below.                                                            | Function + client |
| **Real-time daily circuit-breaker** | Atomic daily counter in `usage-counters`; every reasoning invocation checks it first. Over threshold → degrade to **text-only** (skip Polly) or **disable the agent** and fall through to the [manual portfolio](#graceful-degradation) | Function          |
| **Media circuit-breaker (OQ-8)**    | A **second, independent** atomic daily counter in `usage-counters` (`pk = media#day#<date>`), checked by `backend/functions/credentials/` **before** it will `sts:AssumeRole` and hand the browser Polly/Transcribe credentials. Over threshold → no credentials issued, voice degrades to text. Independent of the reasoning breaker so neither path's abuse disables the other. | Function          |
| **AWS Budgets (manual, not CDK)**   | Two monthly budgets — `portfolio-monthly-gross-usd25` (the real ceiling) and `portfolio-monthly-net-usd25` (the "credits are running out" signal) — provisioned by hand via CLI; SNS topic `portfolio-billing-alerts` (`us-east-1`), email subscription confirmed. See below.                                                        | Account           |
| **Bedrock never client-side**       | The browser can reach Polly/Transcribe directly (bounded, cheap) but **never** Bedrock                                                                                                                                                  | Architecture      |


**Correction — the per-session cap is not an abuse control.** `sessionId` is generated client-side, and nothing stops a visitor (or a script) from discarding it and starting a fresh one — the cap resets for free on every rotation. It is real protection against *accidental* overuse (a recruiter's browser tab stuck in a retry loop, a runaway `useEffect`), and it is genuinely "enforced server-side" in the sense that the count itself is checked against DynamoDB rather than trusted from the client — but the identity being counted is client-controlled, so it does not bound *deliberate* abuse. The **only real cost backstop against deliberate abuse is the daily circuit-breaker below**, which is keyed on total volume, not on any client-supplied identity. Treat the per-session cap as UX (stop one browser tab from spamming itself), not as security.

**Why the circuit-breaker can't be AWS Budgets:** AWS Budgets and Cost Explorer data lag by hours (commonly 8–24h). They cannot stop a spend spike in progress. The real-time breaker is therefore a **self-managed counter** (request count and/or estimated token spend) in DynamoDB, checked synchronously on every reasoning call. AWS Budgets is the slower backstop, not the breaker — the gross budget (below) is that slower, independent second signal; the DynamoDB circuit-breaker is what actually stops a spike as it happens.

**AWS Budgets — provisioned manually via CLI, deliberately kept out of CDK.** Two budgets exist and are live:

- **`portfolio-monthly-gross-usd25`** — gross spend (credits excluded), i.e. what the account would actually be billed. This is the real project ceiling and doubles as the slower, independent backstop behind the real-time circuit-breaker.
- **`portfolio-monthly-net-usd25`** — net spend (after credits). Its job isn't the cost ceiling — it's an early warning that the credit balance funding this project is running low, since net spend only becomes meaningful once credits stop absorbing it.
- Both alert to the SNS topic **`portfolio-billing-alerts`** in `us-east-1` (AWS Budgets alerting is a `us-east-1` service regardless of the app's region); the email subscription is confirmed.

**Why manual, not CDK:** AWS gives every account **2 free budgets**; this account's free allotment is already fully used by these two. Each additional budget costs **~$0.60/month** — a real, if small, ongoing line that a `cdk deploy`/`cdk destroy` cycle during development could trip over (redeploying a budgets construct risks deleting and recreating it, and any transient duplicate burns the remaining headroom or adds a recurring charge for no reason). Keeping them hand-provisioned avoids that risk entirely. **Consequence for the CDK backend:** `guardrails-stack.ts` (see [§ Repository layout](#repository-layout)) does **not** create any `AWS::Budgets` resource — only the SNS topic and any future non-budget guardrail resources belong there. Anyone writing that stack should not attempt to define the budgets in CDK; doing so risks either a naming collision with the manually-created ones or an unplanned third budget and its $0.60/mo charge. **For `docs/runbook.md` when it's written:** record that budgets are manual, name them explicitly (`portfolio-monthly-gross-usd25`, `portfolio-monthly-net-usd25`), and flag them as "do not delete, do not duplicate" if the project is ever migrated onto CDK-managed budgets.

**CloudWatch billing alarm — evaluated and rejected**, not merely deferred. Three independent reasons, any one of which is disqualifying on its own:

1. `EstimatedCharges` is computed **after credits are applied** — so a CloudWatch billing alarm would just duplicate the net-spend budget above, not add an independent signal.
2. In **consolidated billing**, the `EstimatedCharges` metric for a linked account is only published in the **payer (management) account**, scoped with a `LinkedAccount` dimension. The alarm would have to live in the management account, not this project's account — a meaningfully different (and less contained) setup than "add an alarm here."
3. It requires **"Receive Billing Alerts"** to be enabled as the **root user** of the management account, and the underlying metric only updates roughly every **24 hours** — no faster, and often slower, than the AWS Budgets signal it would be duplicating.

Net: the gross-spend AWS Budget is the second independent signal; the DynamoDB circuit-breaker is the real-time protection. A CloudWatch billing alarm would add operational complexity (management-account access, root billing-alerts opt-in) without adding a signal that either of those two doesn't already cover.

**Credits — context, not yet fully resolved.** Credit sharing for the `portfolio` account is confirmed **enabled** via the API. Balance and expiry are **not yet established** — reading them needs "IAM access to billing" enabled at the management-account level, which hasn't been done. What is known: the organization is running at roughly **$84/month gross**, fully absorbed by credits today. Bedrock usage is confirmed to be covered by credits; Polly and Transcribe coverage is **unconfirmed**, simply for lack of any usage history yet to check against. This is why the net-spend budget above exists as an early-warning signal, separate from the gross ceiling — the moment credits run out, net spend stops being near-zero and starts being real spend.

**WAF — deferred for MVP.** AWS WAF carries a per-web-ACL monthly charge (~$5/mo) plus per-rule and per-request costs — a recurring line even at zero traffic, which sits uneasily with "scale toward zero". For MVP, rely on the function-side token bucket (the reasoning path's only throttling, per the Function URL decision above) + the session cap + the circuit-breaker. Add WAF only if real abuse appears. This trade-off is deliberate and recorded in [DECISIONS.md](DECISIONS.md).

---



## Logging

**Log conversation content + timestamps only.**

- **No recruiter identity. No forms. No personal identifiers of any kind.** `sessionId` is a random value with no link to a person.
- Purpose: for the site owner to see what questions and topics come up across conversations — not to track who asked.
- Stored in the `conversation-logs` DynamoDB table.
- An admin/dashboard view for reviewing this is **a later decision**, explicitly out of scope for this phase ([ROADMAP backlog](ROADMAP.md#backlog--parking-lot)).

---



## Bilingual EN / PL support

- The web app supports **English and Polish** speakers — input and output.
- **All knowledge content, system prompts, and documentation are English only.** The agent responds in the user's language at generation time. The corpus is **not** duplicated per language.
- **Language is chosen with an explicit UI toggle** (EN / PL). That single choice drives: Transcribe input language, Polly voice selection, and a response-language instruction added to the model prompt.
- Confirmed available: Polly generative Polish voices **Ola** and **Ewa** (both female, launched Aug 2025); Transcribe `pl-PL` for both batch and streaming; all available in Frankfurt.
- **Open items** (tracked in [ROADMAP Phase 5](ROADMAP.md#phase-5--bilingual-en--pl)):
  - No confirmed Polish **male** generative voice. If a male voice is wanted, check current availability; otherwise accept a female voice for Polish.
  - **Voice identity across EN/PL:** there is no single Polly generative polyglot voice that cleanly covers both languages. Plan for **distinct voice identities per language** — pick one English generative female voice to pair tonally with `Ola`/`Ewa`. Revisit if Polly ships a suitable polyglot generative voice.
  - Whether Transcribe streaming automatic language identification now covers Polish. Regardless, the explicit toggle stays — it's needed for voice selection anyway.

---



## Graceful degradation

The site must **never** present a broken or dead-end experience if part of the AI stack fails. This will be demoed live. Explicit fallback layers:


| Failure                                             | Fallback                                                                                                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microphone permission denied / unavailable          | Fall back cleanly to **text input**, with a clear message.                                                                                                                                      |
| Transcribe fails / unavailable                      | **Text input** still works; voice button shows an unobtrusive error state.                                                                                                                      |
| Polly fails                                         | Display the answer as **text** instead of audio. (Optional last resort: browser `speechSynthesis`.)                                                                                             |
| Bedrock fails / throttled / circuit-breaker tripped | The **manual click-through portfolio and CV download remain fully functional**. The agent panel shows a plain "the assistant is unavailable right now — browse below or download the CV" state. |
| Slow response                                       | Visible loading / thinking state. **Never silent dead air.**                                                                                                                                    |
| Mobile autoplay blocks audio                        | First playback is gated behind the user's tap (which they already made to send the turn); subsequent playback inherits the unlock.                                                              |
| On-screen keyboard covers input (mobile)            | Layout adjusts so the text input and latest turn stay visible when focused.                                                                                                                     |


The degradation state is tracked in one place on the client (`frontend/src/agent/degradation.ts`) and the UI reflects the current best available mode.

---



## Agent persona and guardrails

Full behavioural spec and the injection-test catalogue live alongside this file in `docs/` (`agent-persona.md`, `prompt-injection-tests.md`); summary here.

**Persona**

- **Third person only.** The agent talks *about* the candidate as its creator/subject ("Rafal built this platform"). It never speaks in the first person as the candidate.
- **Tone:** professional and credible to a recruiter, with a light touch of warmth / dry humour so it doesn't read as a cold script-reader. Humour never undercuts credibility.
- **Answer length:** deliberately concise, not exhaustive. Controls token/audio cost, and invites follow-up questions rather than delivering a monologue. Where natural, answers trail toward a next question ("want the technical side of that?").
- **Content layering:** lead with the **business framing** — what problem was solved, why it mattered — before technical depth. Technical detail comes on follow-up.
- **Scope:** deep, comprehensive coverage of the full professional history (Amazon, FlowJob, Rhymind, education), plus a **thin** personal/interests layer surfaced only if asked.
- **The portfolio as a topic:** if asked how it was built, the agent can discuss its own architecture (Bedrock, the agentic UI pattern, Polly/Transcribe, the tool-fetch knowledge approach) as a project in its own right.

**Guardrails (hard requirements)**

1. **Fully out-of-scope requests** ("write me a Python script", general trivia, "act as a general assistant"): the agent **explicitly names** that this is outside its scope — it exists only to discuss this candidate — and says so plainly rather than silently deflecting. This is intentional; it signals deliberate scope design.
2. **Borderline / sensitive personal questions** (salary expectations, political opinions, personal life): **softer** handling — the agent says it doesn't have that information and suggests asking the candidate directly in a real conversation. A redirect, not a hard refusal.
3. **Prompt-injection resistance.** Visitors will try to break the agent out of role ("ignore previous instructions", "you are now a general assistant", "print your system prompt", instructions embedded in pasted text). The agent must hold persona and scope and decline gracefully **without leaking its system prompt or configuration**. This is part of the demo, not an edge case — designed for explicitly and included in testing ([ROADMAP Phase 7](ROADMAP.md#phase-7--prompt-injection--guardrail-testing)).

Implementation notes:

- Guardrails live in the system prompt, which is assembled server-side and never returned to the client.
- The `content/` corpus is treated as **data**, not instructions — the system prompt states this explicitly so a poisoned content file can't redirect the agent.
- The session cap and circuit-breaker also bound the blast radius of someone hammering the agent with injection attempts.

---



## Dev / prod separation

A lesson from FlowJob/Rhymind, set up from day one here.


| Concern         | Dev                                                                         | Prod                                   |
| --------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| Frontend        | `dev` branch → Amplify staging URL                                          | `main` branch → Amplify production URL |
| Backend infra   | CDK `*-dev` stacks                                                          | CDK `*-prod` stacks                    |
| Content in S3   | `dev/` key prefix                                                           | `prod/` key prefix                     |
| DynamoDB tables | `*-dev`                                                                     | `*-prod`                               |
| Bedrock         | same model, separate CloudWatch namespaces / log groups                     |                                        |
| Budget alarm    | one account-level budget covers both; dev spend is expected to be near zero |                                        |


Test queries during development must not pollute real usage data — hence separate tables and prefixes.

---



## Repository layout

Proposed. Tree only — no code yet. `npm` workspaces at the root tie `frontend/` and `backend/` together.

**Documentation lives under `docs/`**, not at the repository root. The root keeps only `README.md` as the GitHub entry point (overview, status, how to run); every other project document — architecture, roadmap, decisions, behavioural specs, runbooks — sits in `docs/`. That keeps the root reserved for code, config, and the workspaces that will appear once scaffolding starts, and gives one obvious place to look for anything written for humans.

```
portfolio/
├── README.md                           # entry point only — overview, status, how to run/deploy
├── .gitignore
├── .nvmrc                              # pins Node version
├── package.json                       # npm workspaces root
├── amplify.yml                        # Amplify Hosting build spec (frontend only)
│
├── docs/                               # all project documentation (English only)
│   ├── ARCHITECTURE.md                 # technical decisions and rationale ("why")
│   ├── ROADMAP.md                      # phased milestones
│   ├── DECISIONS.md                    # timestamped one-line decision log
│   ├── agent-persona.md                # full behavioural spec (tone, layering, opener)
│   ├── prompt-injection-tests.md       # attack catalogue + expected behaviour
│   ├── graceful-degradation.md         # the fallback matrix, expanded
│   ├── voice-notes.md                  # EN/PL voice identity findings
│   └── runbook.md                      # deploy, rollback, "break glass" disable-agent
│
├── frontend/                           # Vite + React + TypeScript SPA
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── public/
│   │   ├── cv/
│   │   │   └── cv.pdf                  # the downloadable CV artifact
│   │   └── img/                        # photo, section imagery
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── config/
│   │   │   └── runtime.ts              # API base URL, region, identity pool id — from env
│   │   ├── content/
│   │   │   └── sections.ts             # section registry: id, title, order (shared by manual + agent)
│   │   ├── components/
│   │   │   ├── layout/                 # shell, header, landing hero
│   │   │   ├── portfolio/              # manual click-through
│   │   │   │   ├── SectionShell.tsx
│   │   │   │   └── sections/           # Education, Amazon, FlowJob, Rhymind, PortfolioItself, ...
│   │   │   ├── agent/                  # the agent's on-screen presence (not a panel)
│   │   │   │   ├── AgentOverlay.tsx     # fixed dock: viz + transcript bar + AI-mode frame
│   │   │   │   ├── AgentVisualization.tsx  # canvas blob, 4 states, rAF, no anim lib
│   │   │   │   ├── TranscriptBar.tsx    # hidden-by-default transcript, expandable
│   │   │   │   ├── Transcript.tsx       # the message list (used inside TranscriptBar)
│   │   │   │   └── Composer.tsx         # plain text fallback, behind a "Type" toggle
│   │   │   └── ui/                     # design-system primitives (button, card, motion wrappers)
│   │   ├── agent/                      # client-side agent orchestration
│   │   │   ├── useConversation.ts      # turn state, history, session-cap handling
│   │   │   ├── transport.ts            # calls the reasoning Lambda (streaming)
│   │   │   ├── uiActions.ts            # maps reveal_section payload → section registry
│   │   │   ├── stt.ts                  # Transcribe streaming via browser SDK + Cognito creds
│   │   │   ├── tts.ts                  # Polly generative playback + chunked fallback
│   │   │   └── degradation.ts          # single source of truth for current available mode
│   │   ├── hooks/
│   │   ├── styles/
│   │   └── types/
│   └── tests/
│
├── backend/
│   ├── infra/                          # AWS CDK (TypeScript) — its own package.json here, not
│   │   │                                #   at backend/ root: ts-node's CLI resolves relative
│   │   │                                #   script paths off the nearest package.json, so it has
│   │   │                                #   to sit next to cdk.json/bin/app.ts, not one level up
│   │   ├── package.json
│   │   ├── bin/app.ts
│   │   ├── lib/
│   │   │   ├── config.ts               # per-env (dev/prod) parameters — model id, breaker /
│   │   │   │                           #   media-breaker / session-cap thresholds, CORS origins, bucket
│   │   │   ├── api-stack.ts            # Phase 2: reasoning Lambda + streaming Function URL (CORS,
│   │   │   │                           #   in-function throttle) + the 3 DynamoDB tables + content
│   │   │   │                           #   bucket. `agent-stack.ts` (below) was folded in here for
│   │   │   │                           #   Phase 2 — one deploy unit; split out later if it grows.
│   │   │   ├── identity-stack.ts       # Phase 4 (OQ-8): NO Cognito pool — the credential-vending
│   │   │   │                           #   Lambda + `portfolio-media-guest-<env>` (scoped to exactly
│   │   │   │                           #   polly:SynthesizeSpeech + transcribe:StartStreamTranscriptionWebSocket)
│   │   │   └── guardrails-stack.ts     # empty skeleton — the AWS Budgets AND the SNS topic already
│   │   │                               #   exist, created by hand; this stack must not recreate either
│   │   │                               #   (see § Abuse protection and cost control)
│   │   ├── cdk.json
│   │   └── tsconfig.json
│   └── functions/
│       ├── agent/                      # the reasoning endpoint (Phase 2)
│       │   ├── src/
│       │   │   ├── handler.ts          # request → Bedrock (Haiku 4.5) ConverseStream, NDJSON out;
│       │   │   │                       #   token bucket → breaker → session cap, then the model loop
│       │   │   ├── systemPrompt.ts     # persona + guardrails + always-loaded core + manifest
│       │   │   ├── tools.ts            # get_content(topic, layer), reveal_section(sectionId)
│       │   │   ├── contentStore.ts     # bundled files by default; S3 GetObject when CONTENT_BUCKET set
│       │   │   ├── sessionCap.ts       # per-session message cap (sessions table)
│       │   │   ├── breaker.ts / throttle.ts / ddb.ts   # thin env-binding shims over functions/shared/
│       │   │   ├── log.ts              # conversation content + timestamp, no identity
│       │   │   ├── types.ts / awslambda.d.ts           # wire types, stream global
│       │   ├── package.json            # @aws-sdk/* are devDependencies — externalised at bundle time
│       │   └── tsconfig.json
│       ├── shared/                     # imported by BOTH Lambdas (relative import, not a pkg):
│       │   ├── breaker.ts              #   circuit-breaker — reasoning + media counters in one module
│       │   ├── tokenBucket.ts          #   token-bucket factory
│       │   └── ddb.ts                  #   the DynamoDB document client
│       └── credentials/                # Phase 4 (OQ-8) — the ONLY way to get media credentials:
│           ├── src/handler.ts          #   token bucket → media breaker → sts:AssumeRole (900s) | refuse
│           ├── package.json
│           └── tsconfig.json
│
├── content/                            # knowledge corpus — English only, source of truth
│   ├── core/
│   │   └── core.md                     # always-loaded: CV summary, 1 line/project, persona, guardrail notes
│   ├── topics/
│   │   ├── amazon.business.md
│   │   ├── amazon.technical.md
│   │   ├── flowjob.business.md
│   │   ├── flowjob.technical.md
│   │   ├── rhymind.business.md
│   │   ├── rhymind.technical.md
│   │   ├── education.business.md
│   │   ├── education.technical.md
│   │   ├── portfolio-itself.business.md
│   │   ├── portfolio-itself.technical.md
│   │   └── personal.md                 # thin hobbies / interests layer
│   ├── star/                           # STAR case studies (business + technical layers)
│   ├── manifest.json                   # the table of contents the agent sees
│   └── README.md                       # authoring guide: layering, tone, length
│
├── scripts/
│   ├── sync-content.ts                 # push content/ → S3 (dev/prod prefixes)
│   ├── check-availability.ts           # verify Bedrock / Polly generative / Transcribe in eu-central-1
│   └── estimate-cost.ts                # token math vs the 100 PLN ceiling
│
└── .github/
    └── workflows/
        ├── frontend-ci.yml             # typecheck + unit tests + lint
        └── backend-ci.yml              # cdk synth + unit tests (deploy stays manual)
```

---



## Open questions / risks to resolve during the build

**OQ numbers are stable and never renumbered or reused.** A resolved question is removed from this list and its number retires with it — it is not reassigned to whatever question happens to be next, so references elsewhere never silently start pointing at a different question. Numbers are written as explicit `OQ-N` labels rather than relying on markdown's auto-numbering, specifically so a retired number leaves a visible gap instead of the list silently closing up. Each open item has an owning roadmap phase.

**Retired:**

- `OQ-1` (tool-use sequencing vs. streaming, and the Lambda→browser wire format) — resolved in Phase 2. The wire format is the **NDJSON `{text|action|done|error}` contract** now recorded in [DECISIONS.md](DECISIONS.md) (2026-08-30) and implemented in `backend/functions/agent/src/types.ts` + `frontend/src/agent/transport.ts`: one connection per user turn, `reveal_section` sent as an `action` frame the instant the model emits it, exactly one terminal frame (`done` XOR `error`), `get_content` never in the stream, unknown frame types ignored. `reveal_section` stays a genuine tool call (two model calls per "goes deep" turn accepted). The Phase 2 verification question — can Haiku 4.5 on Bedrock emit `get_content` + `reveal_section` in the same turn — is **answered yes**: `scripts/verify-parallel-tools.ts` got both tools in one turn 6/6 runs (temperature 0), with no leading prose. A "goes deep" turn is therefore **2 model calls, not 3**. Plan B (demote `reveal_section` to an inline text marker) was not needed. The number stays retired, not reused.
- `OQ-2` (Bedrock model access in `eu-central-1`) — resolved 2026-08-29, see [§ Region](#region) and [§ Reasoning](#reasoning--amazon-bedrock-claude-haiku-45). The number stays retired, not reused.
- `OQ-4` (Polly generative bidirectional streaming) — resolved 2026-08-30, Phase 4. `StartSpeechSynthesisStream` (announced 2026-03, generative-only, HTTP/2 event streams) **exists** and is in the AWS SDK for JavaScript v3, but its request-side event stream needs Node's HTTP/2 handler — a browser can't open raw HTTP/2 from JS, `fetch` request-body streaming isn't full-duplex, and there is **no Polly WebSocket fallback** (unlike Transcribe streaming). Since Bedrock is never called from the browser there is no server in the media loop to run the Node handler, so it is **not usable browser-direct**. The [sentence-chunked `SynthesizeSpeech` fallback](#text-to-speech--amazon-polly-generative-tier) is used instead (synthesise sentence *n+1* while *n* plays; fire the first sentence the instant it's complete). Meets the latency bar — audio starts while the answer is still streaming. Full write-up: [DECISIONS.md](DECISIONS.md) and `docs/voice-notes.md`. The number stays retired, not reused.
- `OQ-8` (Cognito guest-role abuse ceiling) — resolved 2026-08-30, Phase 4. **Cognito could not close it** — `GetId` / `GetCredentialsForIdentity` are unsigned calls needing only the public pool id, so there is no point at which a spend breaker can gate issuance, and disabling unauthenticated identities would force real login (ruled out by the product). Resolution: **no Identity Pool at all.** `backend/functions/credentials/` vends the media credentials, checking a daily **media** circuit-breaker (independent of the reasoning breaker) before it will `sts:AssumeRole` a role scoped to exactly the browser's two calls — `polly:SynthesizeSpeech` + `transcribe:StartStreamTranscriptionWebSocket` (the WebSocket form; the Node HTTP/2 `StartStreamTranscription` is deliberately not granted) — whose trust policy names only that Lambda. 900s TTL (the STS floor). **Verified on dev** by `scripts/verify-oq8.ts` (8/8): browser actions allowed, 16 others denied, no `AssumeRole` bypass, tripped breaker issues nothing. See [§ Real-time media transport](#real-time-media-transport) and [§ Abuse protection and cost control](#abuse-protection-and-cost-control). The number stays retired, not reused.

- **OQ-3 — Real-time media transport.** Validate the [browser-direct-to-Polly/Transcribe](#real-time-media-transport) plan end to end, including whether it's acceptable from a cost/abuse standpoint, before committing. Confirm plan B (API Gateway WebSocket proxy) is a viable fallback if not. — *Phase 4 (spike earlier)*
- **OQ-5 — Transcribe streaming automatic language ID for Polish.** Does it now cover `pl-PL` for the streaming path? (The explicit EN/PL toggle stays regardless — it's needed for voice selection.) — *Phase 5*
- **OQ-6 — Polish male generative voice.** None confirmed. Check current availability; otherwise accept a female Polish voice. — *Phase 5*
- **OQ-7 — EN/PL voice identity.** Confirm whether a single Polly generative polyglot voice can cover both acceptably; if not (expected), choose the English female voice that pairs best tonally with `Ola`/`Ewa`. Now that the confirmed English generative roster is known (see [§ Region](#region)), this is a choice among `Danielle`, `Joanna`, `Matthew`, `Ruth`, `Salli`, `Stephen`, `Tiffany` (`en-US`) and `Amy`, `Brian` (`en-GB`), not an open-ended search. **English half settled in Phase 4: `Ruth` (en-US generative)** — see `docs/voice-notes.md`; the PL pairing is confirmed in Phase 5. — *Phase 5*
- **OQ-9 — WAF later or not at all.** Revisit after launch if abuse patterns appear; the ~$5/mo web-ACL floor is the reason it's deferred. — *post-launch*

