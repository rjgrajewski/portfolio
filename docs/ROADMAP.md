# Roadmap

Phased milestones. Checkboxes are the unit of progress. New ideas go in the relevant phase (or the [backlog](#backlog--parking-lot)) as they come up — don't lose the plan.

Context for scope decisions: [ARCHITECTURE.md](ARCHITECTURE.md). Decisions log: [DECISIONS.md](DECISIONS.md). Open questions referenced as *OQ-n* map to [ARCHITECTURE.md § Open questions](ARCHITECTURE.md#open-questions--risks-to-resolve-during-the-build).

---

## Tuesday demo — minimum bar

The core flow must work; it need not be polished. Concretely, by Tuesday:

- [x] Phase 0 complete (budget alarm live, region verified, dev/prod split real) — `portfolio-api-prod` deployed `2026-08-30` (`CREATE_COMPLETE`), separate `-prod` DynamoDB tables + `prod/` S3 prefix confirmed live.
- [x] Phase 1 complete (landing + manual click-through + CV download all work — this is the non-AI fallback) — live on production (`https://main.daz9bpic9q3nd.amplifyapp.com`) after the `dev` → `main` merge.
- [x] Phase 2 complete (agent answers questions in **text**, with real-but-minimal content) — deployed to dev **and production**, verified on both Amplify URLs
- [x] Phase 3 complete (agent answer reveals the matching section, simultaneously) — desktop in-place + **mobile full-screen takeover**; one reveal path, verified on the live dev URL (tap and agent-triggered) and on production.
- [x] Phase 8 at least **seeded with real content** for the flagship topics (FlowJob, Amazon, education, this portfolio) — done; full authoring can continue after.
- [x] Phase 6 fallbacks for the paths in the demo (Bedrock down → manual portfolio; slow → loading state) — **demo scope only** (voice doesn't exist yet); `agent/degradation.ts` is the single source of truth, every failure notice points at the manual portfolio + CV, partial-answer-then-error keeps the text and flags it cut off.
- [ ] **Monday evening: mini dry-run on the actual device and network the demo will use.** The **prod daily circuit-breaker threshold** is a per-env config value (`dailyCircuitBreakerThreshold: 500`, session cap `40`, in `backend/infra/lib/config.ts`) — reviewed for this cutover and confirmed far above any realistic interview volume (~10–40 messages), so it cannot trip mid-demo. Still worth one real end-to-end pass on the demo device/network.

Nice to have by Tuesday, not required: voice I/O (Phase 4), full bilingual (Phase 5), the full injection test pass (Phase 7).

---

## Phase 0 — Foundations & cost guardrails

- [x] Create/confirm AWS account access in the existing org; configure CLI for `eu-central-1` — account `portfolio` (`776715560866`); no AWS Identity Center in this org, access via CLI profile `portfolio` assuming `OrganizationAccountAccessRole` from `rj.grajewski-admin`. See [README § Prerequisites](../README.md#prerequisites).
- [x] **AWS Budgets monthly budgets + alerts to SNS + email** — done **manually via CLI, not CDK** (deliberate — see [ARCHITECTURE.md § Abuse protection](ARCHITECTURE.md#abuse-protection-and-cost-control)): `portfolio-monthly-gross-usd25` (the real ceiling) and `portfolio-monthly-net-usd25` (credits-running-out signal), alerting to SNS topic `portfolio-billing-alerts` (`us-east-1`), email subscription confirmed.
- [x] Enable Bedrock model access for Claude Haiku 4.5 in-region — **resolved**, retired open question (was OQ-2): works only via the EU inference profile `eu.anthropic.claude-haiku-4-5-20251001-v1:0`, not the direct in-region ID; recorded in [ARCHITECTURE.md § Reasoning](ARCHITECTURE.md#reasoning--amazon-bedrock-claude-haiku-45).
- [x] Manually verified Bedrock, Polly generative (EN + `Ola`/`Ewa`), and Transcribe streaming (`en-US`/`en-GB`/`pl-PL`) all work in Frankfurt, by real calls (synthesis + a full Polly→Transcribe round trip) rather than `describe` checks — see [ARCHITECTURE.md § Region](ARCHITECTURE.md#region). A later regression (Bedrock's per-account "use case details" form gate) was caught by `scripts/check-availability.ts` and has since been resolved — see the line below and [ARCHITECTURE.md § Region](ARCHITECTURE.md#region) for the full story.
- [x] `scripts/check-availability.ts` — codifies the above into a repeatable script (Bedrock Haiku 4.5, Polly generative PL + EN, Transcribe streaming `en-US`/`en-GB`/`pl-PL`, all in Frankfurt). **6/6 green.** It briefly caught a real regression (Bedrock: `ResourceNotFoundException — Model use case details have not been submitted for this account`) that the original manual verification hadn't hit; fixed by submitting the Anthropic use case details form in the Bedrock console (Model catalog → Submit use case details) for the `portfolio` account. Run with `AWS_PROFILE=portfolio npm run check-availability`.
- [x] `scripts/estimate-cost.ts` — token-math skeleton against the expected question mix vs the ~$25 ceiling; run with `npm run estimate-cost`. Current placeholder assumptions put the AI-stack total around $6/month, well inside the ceiling — see the script for what's still a TODO (real Transcribe Frankfurt pricing, real usage data).
- [x] Repo scaffold: npm workspaces (`frontend`, `backend/infra`), `frontend/` (Vite + React + TS + Tailwind, builds clean), `backend/infra/` (see below), `content/` (stub `README.md`, seeded from Phase 2), `scripts/`, `.nvmrc`, `.gitignore`, CI stubs (below). Git repo pushed to `github.com/rjgrajewski/portfolio`, `main` and `dev` branches both tracked.
- [x] CDK skeleton: `config.ts` with dev/prod params (model ID as the `eu.*` inference-profile form, circuit-breaker threshold as a configurable per-env value, not hardcoded); `api-stack.ts` and `guardrails-stack.ts` as intentionally empty skeletons (see file-level doc comments for why); `identity-stack.ts` correctly **not created** (Phase 4, after OQ-8). `cdk synth` verified green locally for both `env=dev` and `env=prod`, and wired into `backend-ci.yml`.
- [x] Amplify Hosting app connected to the repo (done by hand in the console, as anticipated above); `dev` → `https://dev.daz9bpic9q3nd.amplifyapp.com` (staging), `main` → `https://main.daz9bpic9q3nd.amplifyapp.com` (production). **Hit one real failure on the way**: the original `amplify.yml` used `appRoot: frontend` + `cd .. && npm ci` to reach the npm-workspaces root — `preBuild` passed, but `build` started from a different working directory than expected and walked above the repo root, hitting `ENOENT` on `package.json`. Fixed by dropping `appRoot` entirely and building straight from the repo root (`npm ci`, `npm run build --workspace=frontend`), with `artifacts.baseDirectory: frontend/dist`. `main`'s first build (job 1) is `FAILED` in Amplify's history for exactly this reason; job 2, on the fix commit, is `SUCCEED`. `dev`'s first build already used the fixed spec and is `SUCCEED`. See `docs/DECISIONS.md`.
- [x] Confirm dev/prod separation is real: separate CDK stacks, separate S3 prefixes, separate DynamoDB table names — **confirmed `2026-08-30`**. `portfolio-api-prod` deployed to `eu-central-1` (`CREATE_COMPLETE`); `portfolio-agent-prod` Lambda + Function URL (CORS locked to `https://main.daz9bpic9q3nd.amplifyapp.com`), tables `portfolio-{sessions,usage-counters,conversation-logs}-prod`, bucket `portfolio-content-776715560866-prod` all created and distinct from dev. Content synced to the `prod/` prefix. `guardrails-*` stacks stay undeployed (empty skeletons — nothing to deploy).

**Exit:** money can't leak silently (done — manual budgets + circuit-breaker design); a placeholder deploys to two URLs from two branches (**done**). Phase 0 is **closed** — dev/prod separation is now real, not just scaffolded.

---

## Phase 1 — Frontend shell & manual portfolio (the non-AI fallback)

- [x] Design pass: type scale, colour, spacing, motion language — **timeboxed**, done directly in `tailwind.config.ts`: near-monochrome dark neutral + one warm amber accent, Fraunces (headings only) + system-ui (everything else), a named `display/h1/h2/h3/body/small` type scale. Presentable, deliberately not the full Phase 9 bar — see `docs/DECISIONS.md`.
- [x] Landing view: photo (SVG monogram placeholder) + short blurb (placeholder copy) in `Hero.tsx`, with the `AgentEntryTeaser` given the visually primary spot — agent-as-main-entry, not an afterthought — and a "Browse manually" control underneath.
- [x] Section registry (`frontend/src/content/sections.ts`) — id/title/order for `education`, `amazon`, `flowjob`, `portfolio-itself`.
- [x] `SectionShell` + reveal-in-place animation (the one code path for "show section X") — CSS `grid-template-rows` 0fr→1fr + opacity, no animation library, `prefers-reduced-motion` respected globally. State lives in `frontend/src/content/activeSectionStore.ts`, a plain module-level store (not React Context) specifically so Phase 3's `reveal_section` tool handler can call the exact same `revealSection()` function from outside the component tree. See `docs/DECISIONS.md`.
- [x] Manual section components: Education, Amazon, FlowJob, Portfolio-itself — **real content** (`2026-08-30`), authored from `content/topics/*.md` so the manual view and the agent can't diverge; scannable visual form (short blocks, bolded specifics), not the corpus prose. `PlaceholderNote` dropped from all four. The old PortfolioItself + Footer copy claiming Polly/Transcribe were live is fixed — they describe only what runs today.
- [x] CV download — real (generated placeholder) PDF at `frontend/public/cv/cv.pdf`, wired to a visible button in the sticky header.
- [x] Responsive: desktop-primary, verified genuinely usable on a 375×812 mobile viewport (layout only at this stage — full-screen section takeover shipped in Phase 3).
- [x] Deploys clean to staging — pushed to `dev`, Amplify build `SUCCEED`, verified live at `https://dev.daz9bpic9q3nd.amplifyapp.com`: renders correctly, no console errors, `/cv/cv.pdf` serves `200` with the right content type and byte size.

**Exit:** a recruiter who never touches the AI has a complete portfolio experience.

---

## Phase 2 — Agent MVP (text only)

- [x] `content/core/core.md` + `content/manifest.json` with seed content
- [x] `content/topics/*.md` — minimal but real seed files for flagship topics (education / amazon / flowjob × business + technical)
- [x] Reasoning Lambda: assemble system prompt (persona + guardrails + core + manifest) → history → user turn; call Bedrock Haiku 4.5 **streaming** (`backend/functions/agent/`)
- [x] `get_content(topic, layer)` tool — fetch from bundled files first, S3 next (`contentStore.ts`; S3 seam is a `CONTENT_BUCKET` env var away)
- [x] Resolve **OQ-1** (tool-use sequencing vs. streaming, and the Lambda→browser wire format) — NDJSON `{text|action|done|error}` contract settled, two-model-call approach adopted; **parallel tool use confirmed** for Haiku 4.5 on Bedrock (`scripts/verify-parallel-tools.ts`, 6/6) so a "goes deep" turn is 2 model calls, not 3. Recorded in [DECISIONS.md](DECISIONS.md); OQ-1 retired from [ARCHITECTURE.md](ARCHITECTURE.md).
- [x] Reasoning transport: **Lambda Function URL with response streaming** (`api-stack.ts` — `InvokeMode: RESPONSE_STREAM`, CORS on the Function URL, in-function token-bucket throttle in `throttle.ts`)
- [x] `sessions` + `usage-counters` + `conversation-logs` DynamoDB tables (dev **and prod**, separate `-dev` / `-prod` names) — on-demand, TTL, `RemovalPolicy.DESTROY`; content + timestamp only, zero identifiers
- [x] **Per-session message cap** enforced server-side (`sessionCap.ts`, per-env `sessionMessageCap` in `config.ts`)
- [x] **Real-time daily circuit-breaker** — atomic daily counter checked at invocation start (`breaker.ts`, per-env `dailyCircuitBreakerThreshold`)
- [x] **Conversation logging** — content + timestamp, no identity (`log.ts`)
- [x] Frontend agent panel: text input, streamed transcript, thinking/loading state (`components/agent/`, `agent/useConversation.ts`, `agent/transport.ts`; `reveal_section` routed through the existing `revealSection` in `activeSectionStore.ts`)
- [x] `scripts/sync-content.ts` — push `content/` to the dev S3 prefix (`npm run content:sync -- --env dev`)

**Exit:** ask a question in text, get a concise, on-persona, streamed answer grounded in the corpus; spend is capped and logged. **Met** — `portfolio-api-dev` and `portfolio-api-prod` deployed to `eu-central-1`, verified live on both the staging and production Amplify URLs (scope boundary, sensitive-question redirect, injection resistance, multi-turn history, and simultaneous section reveal all confirmed against the deployed stacks).

---

## Phase 3 — Agentic UI integration

- [x] `reveal_section(sectionId)` tool exposed to the model — shipped in Phase 2 (`backend/functions/agent/src/tools.ts`).
- [x] Frontend maps the action to the section registry and triggers the reveal — `agent/uiActions.ts` → `revealSection` (Phase 2).
- [x] Reveal and answer land **simultaneously** — the `action` frame fires the reveal the instant the model emits it, before the prose; verified on the live dev URL (`reveal` at t=0, answer still streaming).
- [x] Manual click and agent action share one reveal code path — `content/activeSectionStore.ts`, verified not assumed. `SECTION_CONTENT` also extracted to one module (`components/portfolio/sectionContent.ts`) so desktop and mobile render identical content.
- [x] Mobile: section reveal becomes a full-screen takeover (`components/portfolio/MobileSectionOverlay.tsx`) with a clear "All sections" exit, body-scroll lock, Esc-to-close, focus moved to the exit control. `useIsDesktop` (matchMedia `(min-width:1024px)`, the same breakpoint as `lg:` / `.app-layout`) only picks the *presentation* — desktop stays the in-place accordion — it is not a second reveal state.
- [x] No route changes / no new tabs — chat state survives every reveal. The overlay only *reads* `activeSectionStore` and calls `closeActiveSection` / `revealSection`; the agent zone never unmounts, so an agent-triggered reveal opens the takeover and the transcript is intact on close. Verified live (tap **and** agent-triggered) on desktop and a 375×812 mobile viewport.

**Exit:** "tell me about FlowJob" → FlowJob section opens as the answer is delivered, on desktop and mobile. **Met** — verified on the live dev URL and on production.

---

## Phase 4 — Voice I/O

- [ ] **Spike first:** validate browser-direct-to-AWS media via Cognito end to end — resolve **OQ-3**
- [ ] **Blocking, before `identity-stack` is provisioned to production:** resolve **OQ-8** (Cognito guest-role abuse ceiling) — guest creds are pullable by any script without loading the page, and there is currently no server-side quota on the Transcribe/Polly path at all; if the scoped role + short TTL aren't sufficient on their own, build `backend/functions/credentials/` (breaker-checked credential vending) instead
- [ ] Cognito Identity Pool + guest role scoped to exactly `transcribe:StartStreamTranscription` and `polly:SynthesizeSpeech` (+ streaming action if used) — `identity-stack` (only after OQ-8 is resolved)
- [ ] Transcribe streaming from the browser (`stt.ts`) — interim results shown live
- [ ] Polly generative playback (`tts.ts`); resolve **OQ-4** (bidirectional streaming vs sentence-chunked `SynthesizeSpeech`)
- [ ] Audio begins while the answer is still generating (streamed TTS or chunk-ahead)
- [ ] Mobile: mic permission flow; autoplay unlock on the send tap; keyboard-covers-input handling
- [ ] Voice ↔ text are interchangeable within one conversation

**Exit:** full voice round-trip on desktop Chrome/Safari and mobile Safari/Chrome, with text still available at any point.

---

## Phase 5 — Bilingual EN / PL

- [ ] `LanguageToggle` in the UI — single source driving Transcribe language, Polly voice, and response-language instruction
- [ ] Response-language instruction in the prompt; verify answers stay grounded in the English corpus while replying in Polish
- [ ] Polish generative voice wired (`Ola` or `Ewa`); resolve **OQ-6** (male voice availability)
- [ ] Choose EN voice identity to pair with the PL voice — resolve **OQ-7**; record in `docs/voice-notes.md`
- [ ] Resolve **OQ-5** (Transcribe streaming auto language-ID for Polish) — toggle stays regardless
- [ ] QA: a full Polish voice conversation, and an EN↔PL switch mid-session

**Exit:** a Polish-speaking recruiter has the same quality of experience as an English-speaking one.

---

## Phase 6 — Graceful degradation hardening

> **Demo-scope pass done `2026-08-30`.** Only the text-agent failure modes are handled — mic / Transcribe / Polly don't exist yet (Phase 4), so their rows stay open on purpose. Full hardening + the written matrix is still a later pass.

- [x] Single client-side degradation state (`agent/degradation.ts`) reflected in the UI — `deriveDegradation({configured, errorCode})` → `{mode, notice, canRetry}`. `AgentPanel` renders its verdict; no ad-hoc availability logic anywhere else.
- [ ] Mic denied/unavailable → text input + clear message *(Phase 4 — no mic yet)*
- [ ] Transcribe fails → text input still works; voice button error state *(Phase 4 — no Transcribe yet)*
- [ ] Polly fails → answer shown as text (optional `speechSynthesis` last resort) *(Phase 4 — no Polly yet)*
- [x] Bedrock fails / throttled / **circuit-breaker tripped** → agent panel shows a clear notice ("browse the sections here or download the CV"); the manual portfolio + CV stay fully functional. Handles every stream-contract error code (`throttled` / `breaker_tripped` / `session_cap` / `upstream_error` / `internal`) plus a dropped connection (`network`). `session_cap` / `breaker_tripped` also disable the composer + starters (a retry can't clear them this session).
- [x] Partial answer that then errors / drops → the streamed text stays in the transcript, the message is flagged `truncated` ("The answer was cut off there."), and the banner carries the reason. The flag never enters the model history.
- [x] Slow response → visible "thinking" dots the instant a turn starts, a streaming cursor while text arrives; never silent dead air.
- [ ] `docs/graceful-degradation.md` — the matrix, kept current *(later pass — full matrix)*
- [ ] Manually exercise every row (kill each dependency in dev and observe) *(later pass — needs the voice deps to exist)*

**Exit:** every single failure mode lands somewhere usable; nothing dead-ends. **Text-agent paths met**; voice paths pending Phase 4.

---

## Phase 7 — Prompt injection & guardrail testing

- [ ] `docs/prompt-injection-tests.md` — attack catalogue with expected behaviour:
  - [ ] "ignore previous instructions" / "you are now a general assistant"
  - [ ] "print / repeat your system prompt / configuration"
  - [ ] instructions embedded in pasted text (e.g. a fake job description containing directives)
  - [ ] role-play / persona-override attempts
  - [ ] a poisoned `content/` file (verify corpus-as-data boundary holds)
- [ ] Out-of-scope requests → agent explicitly names the scope boundary (not silent deflection)
- [ ] Sensitive/borderline questions → soft redirect to "ask him directly", not a hard refusal
- [ ] Confirm the system prompt never reaches the client in any response or error
- [ ] Session cap + breaker bound the cost of sustained injection attempts
- [ ] Re-run the catalogue in both EN and PL

**Exit:** the agent holds persona and scope under deliberate attack and leaks nothing; the handling is good enough to *show off* in an interview.

---

## Phase 8 — Content authoring (post-MVP, on the critical path)

> The agent is only as good as its source material. This comes *after* the MVP build so the pipeline can be tested end to end early — but it is still **on the critical path for Tuesday** and must not be discovered late. A genuinely solid first pass across business + technical layers for four flagship topics plus STAR case studies is realistically **closer to a full day** than "a couple of hours". For Tuesday, minimal real content for the flagship topics (as already scoped in the [minimum bar](#tuesday-demo--minimum-bar)) is sufficient — full authoring for every layer can continue after the demo.
>
> **Status:** the flagship-topic first pass (business + technical, plus `portfolio-itself`) is **done and synced to dev + prod**. What's left is STAR case studies, the personal layer, the `content/README.md` authoring guide, and folding in the answers to the open questions below.

- [ ] CV — the authoritative summary (feeds `core.md` and the PDF) *(CV PDF was swapped for the real one in `4c38ea1`; `core.md` summary rewritten from it)*
- [x] Per-topic write-ups, **business layer**: problem solved, why it mattered — Amazon, FlowJob, education *(first real pass — from the code-based flowjob.it repo analysis + the CV; `core.md` + `manifest.json` updated, seed markers removed. Open questions below.)*
- [x] Per-topic write-ups, **technical layer**: stack, decisions, trade-offs *(FlowJob rebuilt from the repo analysis — Argus/Minerva, Fargate-vs-Lambda, the two Bedrock models, SQL match score, HttpOnly+CSRF kept; source-doc artifacts stripped)*
- [x] Portfolio-as-a-project write-up (`portfolio-itself.*.md`) — architecture as a topic the agent can discuss *(from ARCHITECTURE.md + DECISIONS.md)*
- [x] `manifest.json` finalised — every topic, its layers, a one-line summary *(rhymind → portfolio-itself; summaries refreshed; seed note dropped)*
- [x] Sync to dev, then prod *(`prod/` prefix synced `2026-08-30`; dev + prod Lambdas also carry the bundled copy)*
- [ ] STAR case studies for the flagship projects (business + technical layers)
- [ ] Thin personal / interests layer (`personal.md`)
- [ ] `content/README.md` authoring guide reflects the final tone/length/layering rules

**Open content questions — to resolve with Rafal (voice chat), then fold into the corpus:**

- [ ] FlowJob: confirm the AWS Summit Warsaw / USD 1,000 Amazon funding line (public? year? "more funding after launch" = commitment or expectation?) — it's the one fact in the flowjob files that could not have come from code/git.
- [ ] FlowJob: the two Bedrock models — keep abstract ("a larger / a smaller Claude model") or name them (repo README says Claude 3.5 Sonnet / Claude 3 Haiku)? Which is current in code?
- [ ] FlowJob: keep the cost figures (USD 3/15 and 1/5 per M tokens, ~USD 3/mo compute — public pricing + estimate, not measured) or drop to "cents a day / a few dollars a month"?
- [ ] FlowJob: confirm "since October 2025" as the date to state; confirm the run figures (~few thousand listings, ~1h, ~hundreds of inserts, ~100 deletes) are OK to give.
- [ ] Amazon: what did the **Associate Partner (2018–2021)** role actually involve? Currently only "the entry point, in operations".
- [ ] Amazon: is "hundreds of thousands of workers" the right public figure, and what does it measure (headcount supported / hired per year / total)?
- [ ] Amazon: anything that must **not** be said publicly (programme names, internal tools, teams, exact metrics)? Any specific achievement to name? BI tool for the dashboards (QuickSight / Tableau / internal) or keep "dashboards" generic?
- [ ] Education: degree level (inżynier / licencjat)? Confirm CS was studied part-time alongside the Amazon job. Any specialisation / thesis to add (`education.technical.md` currently flags this as a gap). Keep the "sales & account management 2014–2018" summary of the pre-Amazon years, or drop it?
- [ ] portfolio-itself: anything the agent should not volunteer unprompted (the $25 figure, circuit-breaker mechanics, "session ID trivially rotated")?
- [ ] Corpus name convention: currently ASCII `Rafal` / `Wroclaw` (matches `core.md` + system prompt). Switch the whole corpus to `Rafał`?
- [ ] `docs/ARCHITECTURE.md` still names Rhymind in non-historical, structural spots (repo-layout tree, the `reveal_section` section-ID list, § Agent persona "Scope"). Left untouched per instruction — clean up in a follow-up?

**Exit:** the agent can go deep, credibly, across the whole professional history in both business and technical registers.

---

## Phase 9 — Polish & responsive/accessibility pass

> This is where the full "visual quality is a hard requirement" bar from [ARCHITECTURE.md § Product shape](ARCHITECTURE.md#product-shape) formally applies. The Phase 1 design pass only had to be presentable and timeboxed; **this phase is where "not templated / design-forward" must actually be true.**

- [ ] Real landing copy (blurb) — replaces placeholder *(copy itself is deferred, not an architecture concern)*
- [ ] Conversation opener: the agent introduces itself and its role at conversation start; a few example starter questions *(exact script deferred)*
- [ ] Visual polish pass that clears the "not templated / design-forward" bar in full — spacing, motion timing, imagery
- [ ] Mobile pass: voice flow, keyboard behaviour, full-screen section takeover, tap targets
- [ ] Accessibility: keyboard nav, focus management on reveal, transcript semantics, contrast, reduced-motion
- [ ] Performance: bundle size, first paint, time-to-first-token perceived latency

---

## Phase 10 — Launch prep

- [ ] Final cost review against the ceiling with real (dev) usage data
- [ ] `docs/runbook.md`: deploy, rollback, "break glass" disable-the-agent switch
- [ ] Custom domain — purchased and wired **when needed**; build must not assume a specific domain until then
- [ ] Production content sync; smoke-test all three entry points on production
- [ ] Demo dry-run on the actual devices/browsers that will be used

---

## Backlog / parking lot

Not scheduled. Pull into a phase when it matters.

- [ ] Admin/dashboard view for reviewing logged conversation topics
- [ ] Decide whether the portfolio-as-a-project knowledge is *proactively* surfaced or only available on request
- [ ] S3 Vectors migration — trigger: the corpus outgrows comfortable enumeration in the manifest. Additive, behind the existing `get_content` tool.
- [ ] WAF — add only if real abuse appears (the ~$5/mo web-ACL floor is why it's deferred)
- [ ] `speechSynthesis` last-resort TTS fallback
- [ ] Polyglot Polly generative voice — adopt if one ships that covers EN+PL acceptably (removes the dual voice-identity compromise)
- [ ] Analytics on which entry point recruiters actually use (still no personal identifiers)
