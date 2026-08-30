# This portfolio — business layer

This site is itself a work sample. It is a portfolio a recruiter can use three
ways: download a CV, click through the sections manually, or ask the agent —
the one answering now — which talks about Rafal in the third person and opens
the relevant section as it replies.

Why build it this way:

- **The medium is the message.** For an AI-focused job search, a portfolio that
  is itself a working agentic system is stronger evidence than a list of past
  projects.
- **No dead ends.** The manual click-through is a complete alternative, not a
  fallback stub — a recruiter who will not talk to an AI still gets the whole
  portfolio, and if the agent is unavailable the site still works.
- **Discipline under constraint.** The whole thing runs to a hard cost ceiling
  of about USD 25 per month, worst case, and scales toward zero when nobody is
  visiting. Staying inside that ceiling drove most of the technical decisions.

It is meant to be a reusable asset for an ongoing job search, not a single-use
demo.

## Built documentation-first, deliberately

flowjob.it taught Rafal that building solo and fast without documentation gets
chaotic — ideas outpace structure, and both he and any AI coding assistant lose
track of what was actually decided. He corrected that here: before writing any
application code, he spent the first five to six hours on the repository
skeleton and the documentation itself (architecture, roadmap, decisions log).
The whole build took about three days, and he credits that upfront discipline
with making that pace possible.

Ask for the technical layer for the architecture — the model, the agentic UI
pattern, how knowledge is retrieved, and the cost guardrails.
