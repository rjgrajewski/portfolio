# Roadmap

Phased milestones. Checkboxes are the unit of progress. New ideas go in the relevant phase (or the [backlog](#backlog--parking-lot)) as they come up — don't lose the plan.

Context for scope decisions: [ARCHITECTURE.md](ARCHITECTURE.md). Decisions log: [DECISIONS.md](DECISIONS.md). Open questions referenced as *OQ-n* map to [ARCHITECTURE.md § Open questions](ARCHITECTURE.md#open-questions--risks-to-resolve-during-the-build).

---

## Tuesday demo — minimum bar

The core flow must work; it need not be polished. Concretely, by Tuesday:

- [ ] Phase 0 complete (budget alarm live, region verified, dev/prod split real)
- [ ] Phase 1 complete (landing + manual click-through + CV download all work — this is the non-AI fallback)
- [x] Phase 2 complete (agent answers questions in **text**, with real-but-minimal content) — deployed to dev, verified on the Amplify staging URL
- [ ] Phase 3 complete (agent answer reveals the matching section, simultaneously)
- [ ] Phase 8 at least **seeded with real content** for the flagship topics (FlowJob, Rhymind, Amazon, education) — full authoring can continue after
- [ ] Phase 6 fallbacks for the paths in the demo (Bedrock down → manual portfolio; slow → loading state)
- [ ] **Monday evening: mini dry-run on the actual device and network the demo will use.** Explicitly confirm the **daily circuit-breaker threshold on prod is a per-env config value set high enough that it cannot trip mid-interview** — this is the one failure mode that would be actively caused by the abuse-protection design working as intended, and it must not happen live.

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
- [ ] Confirm dev/prod separation is real: separate CDK stacks, separate S3 prefixes, separate DynamoDB table names — **scaffolded** in `config.ts`/`bin/app.ts` (stacks are already named `portfolio-guardrails-dev`/`-prod`, `portfolio-api-dev`/`-prod`), but nothing has been deployed yet, so this can't be marked confirmed until a real `cdk deploy` happens.

**Exit:** money can't leak silently (done — manual budgets + circuit-breaker design); a placeholder deploys to two URLs from two branches (**done** — see the Amplify line above). Phase 0 is closed; the one item left unchecked below (CDK dev/prod separation) needs a real `cdk deploy`, which hasn't happened yet and isn't required for the placeholder-deploy exit bar.

---

## Phase 1 — Frontend shell & manual portfolio (the non-AI fallback)

- [x] Design pass: type scale, colour, spacing, motion language — **timeboxed**, done directly in `tailwind.config.ts`: near-monochrome dark neutral + one warm amber accent, Fraunces (headings only) + system-ui (everything else), a named `display/h1/h2/h3/body/small` type scale. Presentable, deliberately not the full Phase 9 bar — see `docs/DECISIONS.md`.
- [x] Landing view: photo (SVG monogram placeholder) + short blurb (placeholder copy) in `Hero.tsx`, with the `AgentEntryTeaser` given the visually primary spot — agent-as-main-entry, not an afterthought — and a "Browse manually" control underneath.
- [x] Section registry (`frontend/src/content/sections.ts`) — id/title/order for `education`, `amazon`, `flowjob`, `rhymind`, `portfolio-itself`.
- [x] `SectionShell` + reveal-in-place animation (the one code path for "show section X") — CSS `grid-template-rows` 0fr→1fr + opacity, no animation library, `prefers-reduced-motion` respected globally. State lives in `frontend/src/content/activeSectionStore.ts`, a plain module-level store (not React Context) specifically so Phase 3's `reveal_section` tool handler can call the exact same `revealSection()` function from outside the component tree. See `docs/DECISIONS.md`.
- [x] Manual section components: Education, Amazon, FlowJob, Rhymind, Portfolio-itself — placeholder content, each flagging itself as seed content pending Phase 8.
- [x] CV download — real (generated placeholder) PDF at `frontend/public/cv/cv.pdf`, wired to a visible button in the sticky header.
- [x] Responsive: desktop-primary, verified genuinely usable on a 375×812 mobile viewport (layout only at this stage — full-screen section takeover is Phase 3).
- [x] Deploys clean to staging — pushed to `dev`, Amplify build `SUCCEED`, verified live at `https://dev.daz9bpic9q3nd.amplifyapp.com`: renders correctly, no console errors, `/cv/cv.pdf` serves `200` with the right content type and byte size.

**Exit:** a recruiter who never touches the AI has a complete portfolio experience.

---

## Phase 2 — Agent MVP (text only)

- [x] `content/core/core.md` + `content/manifest.json` with seed content
- [x] `content/topics/*.md` — minimal but real seed files for flagship topics (education / amazon / flowjob / rhymind × business + technical)
- [x] Reasoning Lambda: assemble system prompt (persona + guardrails + core + manifest) → history → user turn; call Bedrock Haiku 4.5 **streaming** (`backend/functions/agent/`)
- [x] `get_content(topic, layer)` tool — fetch from bundled files first, S3 next (`contentStore.ts`; S3 seam is a `CONTENT_BUCKET` env var away)
- [x] Resolve **OQ-1** (tool-use sequencing vs. streaming, and the Lambda→browser wire format) — NDJSON `{text|action|done|error}` contract settled, two-model-call approach adopted; **parallel tool use confirmed** for Haiku 4.5 on Bedrock (`scripts/verify-parallel-tools.ts`, 6/6) so a "goes deep" turn is 2 model calls, not 3. Recorded in [DECISIONS.md](DECISIONS.md); OQ-1 retired from [ARCHITECTURE.md](ARCHITECTURE.md).
- [x] Reasoning transport: **Lambda Function URL with response streaming** (`api-stack.ts` — `InvokeMode: RESPONSE_STREAM`, CORS on the Function URL, in-function token-bucket throttle in `throttle.ts`)
- [x] `sessions` + `usage-counters` + `conversation-logs` DynamoDB tables (dev) — on-demand, TTL, `RemovalPolicy.DESTROY`; content + timestamp only, zero identifiers
- [x] **Per-session message cap** enforced server-side (`sessionCap.ts`, per-env `sessionMessageCap` in `config.ts`)
- [x] **Real-time daily circuit-breaker** — atomic daily counter checked at invocation start (`breaker.ts`, per-env `dailyCircuitBreakerThreshold`)
- [x] **Conversation logging** — content + timestamp, no identity (`log.ts`)
- [x] Frontend agent panel: text input, streamed transcript, thinking/loading state (`components/agent/`, `agent/useConversation.ts`, `agent/transport.ts`; `reveal_section` routed through the existing `revealSection` in `activeSectionStore.ts`)
- [x] `scripts/sync-content.ts` — push `content/` to the dev S3 prefix (`npm run content:sync -- --env dev`)

**Exit:** ask a question in text, get a concise, on-persona, streamed answer grounded in the seed corpus; spend is capped and logged. **Met** — `portfolio-api-dev` deployed to `eu-central-1`, verified live on the dev Amplify staging URL (scope boundary, sensitive-question redirect, injection resistance, multi-turn history, and simultaneous section reveal all confirmed against the deployed stack).

---

## Phase 3 — Agentic UI integration

- [ ] `reveal_section(sectionId)` tool exposed to the model
- [ ] Frontend maps the action to the section registry and triggers the reveal
- [ ] Reveal and answer land **simultaneously** — fire the reveal as soon as the streamed output yields the action, not after the prose
- [ ] Manual click and agent action share one reveal code path (verified, not assumed)
- [ ] Mobile: section reveal becomes a full-screen takeover where a side panel won't work
- [ ] No route changes / no new tabs — chat + audio state survives every reveal

**Exit:** "tell me about FlowJob" → FlowJob section opens as the answer is delivered, on desktop and mobile.

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

- [ ] Single client-side degradation state (`degradation.ts`) reflected in the UI
- [ ] Mic denied/unavailable → text input + clear message
- [ ] Transcribe fails → text input still works; voice button error state
- [ ] Polly fails → answer shown as text (optional `speechSynthesis` last resort)
- [ ] Bedrock fails / throttled / **circuit-breaker tripped** → agent panel shows an unavailable state; manual portfolio + CV download fully functional
- [ ] Slow response → visible thinking state; no silent dead air
- [ ] `docs/graceful-degradation.md` — the matrix, kept current
- [ ] Manually exercise every row (kill each dependency in dev and observe)

**Exit:** every single failure mode lands somewhere usable; nothing dead-ends.

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

> The agent is only as good as its source material. This comes *after* the MVP build so the pipeline can be tested end to end early — but it is still **on the critical path for Tuesday** and must not be discovered late. A genuinely solid first pass across business + technical layers for four flagship topics plus STAR case studies is realistically **closer to a full day** than "a couple of hours". For Tuesday, minimal real seed content for the flagship topics (as already scoped in the [minimum bar](#tuesday-demo--minimum-bar)) is sufficient — full authoring for every layer can continue after the demo.

- [ ] CV — the authoritative summary (feeds `core.md` and the PDF)
- [ ] Per-topic write-ups, **business layer**: problem solved, why it mattered — Amazon, FlowJob, Rhymind, education
- [ ] Per-topic write-ups, **technical layer**: stack, decisions, trade-offs
- [ ] STAR case studies for the flagship projects (business + technical layers)
- [ ] Thin personal / interests layer (`personal.md`)
- [ ] Portfolio-as-a-project write-up (`portfolio-itself.*.md`) — architecture as a topic the agent can discuss
- [ ] `manifest.json` finalised — every topic, its layers, a one-line summary
- [ ] `content/README.md` authoring guide reflects the final tone/length/layering rules
- [ ] Sync to dev, then prod

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
