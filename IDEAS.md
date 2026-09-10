# Ideas — edges, functions, and joins worth building next

Brainstormed 2026-09-10 after the Atlantic views. Ordered by how much new
journalism each unlocks per unit of engine work. Items marked SHIPPED exist;
items marked TODAY need no engine change; the rest are recommended
capabilities (filed as embabel/me issues where noted).

## A. Already possible, just undocumented — use these now

- **`percentileCont` / `percentileDisc` WORK in scoped Cypher** (probed
  2026-09-10). Medians and P90s today — no capability request needed. The
  query_guide never mentions them; means mislead on every skewed register we
  carry (income, prices, signatures).
- **Pareto concentration via collect + reduce** — SHIPPED as
  `WhereCrimeConcentrates`: 8–13% of streets carry half of each UK place's
  crime. The same reduce-accumulator pattern computes any "how few X hold
  half of Y" — signatures per constituency, contract value per supplier.
- **`correlate()` and `regress()`** — the campaign's workhorses
  (CanadaCrimeFactorBattery, WhatTracksCanadianCrime).

## B. Deterministic verbs the engine should grow (→ embabel/me issue)

- **`correlateAll([s1..sn])`** → pairwise r-matrix with CIs. The factor
  battery hand-writes five correlate() calls; a matrix is one call and reads
  as a table.
- **`gini(x)`** — one number for inequality of anything. Pairs with the
  concentration view; lets AtlanticCrimeGeography say "Britain's crime is
  more unequal" with the canonical statistic instead of CV.
- **`trend(values, dates)`** → slope, direction, r² — and
  **`changepoint(series)`** → the month a series broke. The Kelowna
  violent-clearance collapse (59.8→28.7) has a WHEN nobody has published.
- **`cluster([x,y..], k)`** — k-means over rows: "which Canadian CMAs move
  together" would have found the BC violent-clearance bloc mechanically.
- **Weighted aggregates** — `wavg(x, w)`: national means weighted by CMA
  population instead of one-CMA-one-vote.
- **Producer-level `latest` projection for monthly series** — the standing
  blocker on national LFS/NHPI factor joins (a per-vector "newest point"
  instead of a fixed reference range).

## C. LLM functions on rows and edges (→ embabel/me issue)

The rule stays — deterministic registers stay deterministic. LLM functions
belong where the DATA is text:

- **`llmClassify(text, categories)`** as a scoped-Cypher function, cached by
  input hash, temperature 0. Immediate uses — theme-tag the UK petition feed
  and Canada's e-petitions into one taxonomy (what does each nation ask
  for?); classify weather-alert texts by hazard; tag contract award titles
  by sector.
- **`llmScore(text, rubric)` → number** — a score is correlate()-able:
  urgency of flood alerts vs river gauge levels; specificity of petition
  demands vs signature velocity.
- **`llmMatch(a, b)` → boolean/confidence** — fuzzy entity resolution as an
  edge: UK contract supplier free-text names against any registry; CA riding
  names against news mentions.
- **`llmSummarize(collect(...), instruction)`** — an aggregate that returns
  a paragraph per group. The journalist brief becomes a COLUMN of a view
  instead of an app-side afterthought.

## D. Search as an edge (→ embabel/me issue)

A producer `kind: search` — web/news search mounted as a virtual join:

    HAS_NEWS: keyTemplate "{name} crime", TTL 1h,
    rows {title, url, source, date}

The Saint John / Sudbury / Thunder Bay outlier explanations were found by
hand-run searches; with this edge, `CanadaCrimeOutliers` could carry its own
"what locals say" column. Cost-controlled by maxAnchors and TTL like any
producer.

## E. New keyless joins for ca-streets (verified targets, unbuilt)

- **Bank of Canada Valet API** (keyless JSON) — FX and policy rates on the
  national anchor. Unlocks honest common-currency columns in Atlantic views
  (today everything must stay dimensionless).
- **House of Commons e-petitions** — Canada's petition register beside the
  UK's: `AtlanticPetitions`, theme-classified both sides (needs C).
- **OpenParliament.ca** — votes and Hansard mentions per MP: HAS_VOTES on
  the seat; "how my MP voted on bail reform vs the local clearance trend".
- **Earthquakes Canada** GeoJSON feed — HAS_QUAKE in bbox (BC places).
- **Health Canada recalls** — HAS_RECALL by province.

## F. Patterns to hold onto

Dimensionless cross-country numbers with per-side basis columns; two-step
collect-concatenate (no UNION); national literal-seeded anchors so views
work with zero watched places; negativeTtlSeconds everywhere; a realm
dependency declaration is still missing (embabel/me#1168).
