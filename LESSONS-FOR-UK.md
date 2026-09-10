# Lessons for realm-uk-streets, from the ca-streets journalist campaign

Everything below was learned building and interrogating ca-streets in Sept 2026
and is reproducible from this repo's views. The realms share one graph and one
global label space, so the two can also be queried TOGETHER — see
`views/atlantic.yml` and the Cross-realm section at the bottom.

## 1. Change in clearance is the strongest crime signal — the UK can test it better

Across 35 Canadian CMAs, the change in the severity-weighted clearance rate
2018→2025 was the strongest correlate of severity change (r = −0.588,
CI [−0.777, −0.301]) — stronger than growth, income, or any level variable.
Clearance LEVEL was noise; only its CHANGE carried signal. The 4-factor
regression (`CanadaCrimeFactorBattery`) reaches R² = 0.568.

The UK's outcomes data is richer than Canada's — data.police.uk publishes
per-incident outcomes monthly, where StatCan publishes one annual weighted
rate. A `districtOutcomes` producer (outcome shares by force/district, two
vintages) would let realm-uk-streets run the same battery with monthly
resolution. Prediction to test — districts where "no suspect identified"
shares GREW should be the districts where crime rose.

## 2. Express the analysis IN Virtual Cypher

The engine's `correlate(x, y)` returns {r, n, ci, detectable} and
`regress([x1,x2,…], y, label)` returns a fitted model with named
above/below-prediction outliers. Every finding above is a saved view, not a
notebook — reproducible by anyone with `view_run`, and the residuals SELECT
the places worth reporting on (Thunder Bay's +22.6 unexplained residual led
straight to the homelessness coverage). `WhatTracksDistrictCrime` already
exists in the UK realm; the upgrade is a factor battery view with several
`correlate()` calls side by side plus one `regress()`.

## 3. The 2021 census midpoint is a trap

Any 2021-anchored change metric spans the pandemic trough — Canadian crime
momentum flipped sign in 8 of 41 CMAs depending on whether the baseline was
2018 or 2021. The UK's Census 2021 (taken in lockdown March) is the same trap.
Prefer 2018/2019 baselines for change; use 2021 only as a midpoint with the
caveat stated in the view description.

## 4. Cache posture decides whether the realm survives its sources

- **negativeTtlSeconds on every remote producer.** An empty result is not
  cached without it, and the fan-out is re-paid on every read (alerts went
  6s → 21ms). During a source outage it also stops error-hammering.
- **StatCan hard-throttles by IP (HTTP 430) with a multi-hour window** and the
  engine has no backoff (embabel/me#1159). Weekly-TTL national producers meant
  every already-fetched view kept serving warm (252ms, 0 API calls) through a
  2+ hour outage. Design so a demo NEVER needs a cold national fetch.
- **The producer cache key ignores args** — changing args means renaming the
  producer.

## 5. Scoped-Cypher patterns that matter

- kg_query's parameter is `cypher` (the schema mismatch and its hang are
  embabel/me#1164/#1165).
- No UNION. Two label sets in one result = collect both halves and
  concatenate in TWO steps — `WITH a, collect(…) AS b` then `WITH a + b AS
  rows UNWIND` — never `WITH a + collect(…)` (illegal implicit grouping;
  the engine's own hint text gets this wrong, embabel/me#1166, and with
  virtual joins present the failure is misreported as a quota error, #1167).
- Anchor on a stored label first; a literal-seeded anchor reached only
  through a chained virtual hop misses the shared producer cache (#1157).

## 6. Cross-realm views — Canada beside the UK

Because labels, views and operationIds are GLOBAL across installed realms,
one scoped-Cypher statement can traverse `(p:UkPlace)-[:HAS_INCOME]->…` and
`(c:CaPlace)-[:HAS_HOUSEHOLD_INCOME]->…` together. Three shipped examples in
`views/atlantic.yml`:

- `AtlanticAffordability` — years-of-income per home at every watched place
  in both countries (Clacton's 6.6 landed between Brantford 6.9 and Ottawa 6.1).
- `AtlanticCrimeGeography` — is crime more geographically unequal in Britain
  or Canada, from both national literal-seeded anchors, zero watched places.
- `AtlanticImpunity` — share of crime with nobody held to account, UK
  street-level outcomes beside Canada's weighted clearance.

The discipline that keeps them honest — every cross-country number is
DIMENSIONLESS (ratio, percentage, CV), and each side carries a `basis`/
`metric` column naming its own register, because the registers are cousins,
not twins. There is no way to DECLARE the dependency on the other realm
(a realm.yml gap); the views degrade to one-country rows when the partner
realm is absent.
