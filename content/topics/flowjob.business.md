# flowjob.it — business layer

flowjob.it is an IT job-search product Rafal Grajewski built for himself first.
It is live and he uses it, but it has not been announced and has no real users
yet. It has run as an evening project since October 2025 — a portfolio piece
with commercial potential, not a business.

It didn't start as a product. Rafal set out to test his own Python skills —
a scraper, and a database he could query for listings relevant to his own job
search, nothing more. It grew into a real product with commercial potential
once he got seriously into AI-assisted engineering and kept building on it.

The idea: instead of another job board, put a **logical layer between the
candidate and the listing**. Job ads become structured data — parsed,
normalized, queryable — rather than text to skim.

## The problem

Job boards promise "roles for you" and then surface a listing because you
happen to know SQL, sitting next to requirements for fluent Swedish and five
years of AWS. flowjob inverts that: the candidate's **skill profile is the
filter**, and every listing is scored against it.

The audience is IT candidates. Listings come from JustJoin.it. The job list is
public; the skill profile and CV need an account.

## What exists today

1. **Job board** — filters plus a match score: the share of a listing's
   required skills the profile covers. Skills the candidate marks "avoid" drop
   the listing entirely.
2. **Swipe-style skill selector** — know it / avoid / show on CV / skip, one
   skill at a time. The dictionary holds several thousand entries, which made
   dropdowns unusable.
3. **In-browser PDF CV** — skills chosen in the deck flow into the document.
   Solid on desktop, weak on mobile.
4. Rounded public counts of listings and skills. A fuller market dashboard —
   salary trends, skill demand over time — is planned, not built.

Not built yet: one-click CV tailoring to a specific listing, and any AI beyond
the skill-overlap matching.

## Why it is not public yet

The interface does not meet Rafal's bar — rough edges, and CV creation is
awkward on a phone. The current work is a UI refactor. Security has no known
hole, but there has been no audit yet; that is planned as the last step before
launch, along with a finished legal layer. Privacy and cookie pages already
exist. The domain (flowjob.it) is public and easy to find on its own, so
there's no attempt to hide that it's unfinished — the honest framing is "live,
but not yet launched."

## Traction

Zero real users so far — expected, given it's deliberately unannounced. At AWS
Summit Warsaw, Amazon backed the project with USD 1,000, with a path to more
funding after launch once there is real traffic.

The honest summary: the hardest problem already solved was making skill names
from messy job ads consistent enough to match on; the hardest current fight is
the UI.
