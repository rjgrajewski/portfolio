# flowjob.it — technical layer

flowjob.it has three parts: a scraper, an AI skill-normalization
service, and the web app.

## Collection

A Playwright scraper pulls IT listings from JustJoin.it once per run: new
listings in, gone listings out. Run on a laptop it took hours and pinned the
machine, so it moved to a container on **AWS Fargate**. The reason it is Fargate
and not Lambda: a full run is around an hour, and Lambda's hard limit is 15
minutes. **Step Functions** orchestrates the pipeline — the scraper runs first,
and skill normalization only starts if the scrape succeeded. The scraper itself
never calls the AI; the orchestrator does. A nightly schedule exists in the
infrastructure but is left off until explicitly enabled.

A typical run is on the order of a few thousand listings, roughly an hour, a
few hundred inserts and about a hundred stale deletes.

## Skill normalization

Raw tech stacks on job ads are inconsistent — `React.js`, `ReactJS`, and
`React` are the same skill written three ways. The normalizer runs on **Amazon
Bedrock** to canonicalize skill names, merge synonyms, and link them back to
listings. Listings expire; the skill dictionary persists, so each run only
touches names it has not seen before.

Decisions inside the normalizer:

- **Prompting beat embeddings.** An embeddings-based approach was built and then
  dropped — sorted-batch prompting was more precise for this task.
- **Hard rules run before the LLM.** Known cases (language names, ERP systems,
  CI/CD tools, …) are resolved by rules; only what is left goes to the model.
- **Two Bedrock models, split by job.** A larger Claude model canonicalizes
  names in batches of 50, sorted alphabetically; a smaller, cheaper one merges
  synonyms in chunks of 200. Canonicalization runs at temperature 0.
- **Failure handling is defensive.** Truncated JSON from the model is repaired;
  missing keys fall back to the original name. Deduplication is skipped entirely
  when nothing new was normalized, and the normalize loop has an iteration cap
  so a bad run cannot run up an open-ended bill.

No RAG, no agents, no fine-tuning. Job ranking is not a model at all.

## The application

A React (Vite) single-page app, a **FastAPI** backend, and **PostgreSQL** on
**AWS RDS**. The frontend is on Vercel; `/api` is a serverless wrapper around
the same FastAPI app. The UI is bilingual, Polish and English.

- **Match score is SQL, not ML.** For a listing: unique overlapping skills ×
  100 / unique skills the listing requires. Skills the candidate marked "avoid"
  exclude the listing outright. Results sort by score. "What else tends to
  co-occur if you add skill X" is another SQL query. The job card recomputes the
  same figure in the browser for display.
- **Auth.** The session JWT lives in an **HttpOnly cookie**, not in
  JavaScript-readable storage; mutations carry a **CSRF** token; login and
  register responses never put the JWT in the body. Password hashing (bcrypt)
  runs off the event loop. Login, register, and avatar upload are rate-limited.
- **The CV PDF renders in the browser** (`@react-pdf/renderer`), not on a
  server — it gives a live preview, at the cost of a run of Safari and CSP
  fixes.

## Decisions worth calling out

- A data layer over job listings, not another job board.
- Python for the scraper — and Python itself is treated as a first-class CV
  skill.
- Fargate over Lambda for collection (the 15-minute cap).
- The scraper does not call AI; the Step Functions orchestrator does.
- Prompting over embeddings for skill-name normalization.
- A swipe deck instead of filter forms, because there are several thousand
  skills.
- Match scoring in Postgres, not a separate ML service.
- HttpOnly-cookie sessions over tokens in local storage.
- CV rendered in the browser, not server-side.

The hardest piece of engineering so far was the skill-normalization logic. The
current focus is a UI refactor — the CV builder is weak on mobile and the
interface does not yet meet Rafal's bar.

## Cost of the AI

The model only runs in the nightly normalization job, never on a user request.
Once the dictionary exists, each run only pays for genuinely new skill names.

On Bedrock On-Demand in Frankfurt, canonicalization is roughly USD 3 / 15 per
million input / output tokens and synonym-merge roughly USD 1 / 5; in steady
state that is cents per day. Pipeline compute (Fargate, Lambda, logs) is about
USD 3 per month, tokens aside.

## Maturity

A solo evening project, running since October 2025. The backend has a pytest
suite (auth, offers, skills, schema, and one full user journey) and GitHub
Actions CI runs the frontend build, `mypy`, and pytest. There are no frontend
unit tests yet. A security audit is planned as the last step before a public
launch — not prompted by any known problem. Only email / password auth is
implemented today.
