# realm-ca-streets

**Street-level Canada, joined at a place.** Keyless official and open sources —
the sitting MP for the riding (and the MPP, mayor and councillors at the same
postal code), Census 2021 population, median age, household income, dwelling
values and unemployment for the municipality, live Air Quality Health Index,
real-time river gauges, active Environment Canada weather alerts and current
conditions — queryable as ONE graph, anchored on `CaPlace`s you watch by
postal code **or place name**. Bilingual wherever the source is: Environment
Canada's own English and French wording, never a re-translation.

```cypher
MATCH (p:CaPlace)-[:HAS_SEAT]->(s:CaSeat)
MATCH (p)-[:HAS_HOUSEHOLD_INCOME]->(i:CaHouseholdIncome)
RETURN s.party, round(avg(toFloat(i.value))) AS avgMedianHouseholdIncome
ORDER BY avgMedianHouseholdIncome DESC
```

…is "what does a Liberal place earn vs a Conservative one", answered live from
Statistics Canada and the House of Commons record. No single public source
serves that join; every row of it is public data.

## The idea: the geo IS the join

A watched `CaPlace` resolves its geography once when it is added — from
Represent for a postal code, or NRCan geolocation + Represent point lookups
for a bare name — and each stored field keys a different national dataset:

| Key on the place | Dataset | Edge → type |
|---|---|---|
| `latlon` | House of Commons sitting MP (Represent) | `HAS_SEAT → CaSeat` |
| `postalCode` | ALL elected reps — MP, MPP/MLA, mayor, councillors (Represent) | `HAS_REP → ElectedRep` |
| `dguid` (`2021A0005`+CSD) | StatCan Census Profile 2021 — five figures | `HAS_POPULATION` `HAS_MEDIAN_AGE` `HAS_HOUSEHOLD_INCOME` `HAS_DWELLING_VALUE` `HAS_UNEMPLOYMENT` |
| `bboxWide` (±0.7°) | Environment Canada AQHI, latest per station | `HAS_AIR → AirQualityObs` |
| `bbox` (±0.2°) | Water Survey river gauges, real-time | `HAS_RIVER → RiverReading` |
| `bbox` | Environment Canada ACTIVE weather alerts | `HAS_ALERT → CaWeatherAlert` |
| `bbox` | weather.gc.ca current conditions | `HAS_WEATHER → LocalWeather` |

Everything except `CaPlace` is **virtual** — fetched per query, cached at each
source's cadence (live feeds 30 minutes with negative caching, political and
census axes a week), gone at rollback.

## What ships

- **`apps/maple-lens.html`** — the bilingual (EN ⇄ FR toggle) map of Canada:
  watched places as dots on a vendored Natural Earth outline, a dossier per
  dot (MP with photo and party colour, census tiles, affordability, live air /
  weather / alerts / rivers), the cross-source join panels, add-a-place by
  postal code or name — and a common loon on the water, so nobody mistakes
  the country.
- **15 saved views** — `CaPlaceDossier`, `CaIncomeByParty`, `PartyLedger`,
  `SeatsAndFortunes`, `SplitRepresentation` (places whose federal and
  provincial reps come from different political families), `AffordabilityGap`
  (years of income per home), `AirVsIncome`, `AlertsAtMyMPs`, `MorningCanada`,
  `CensusLeague`, `WhoRepresentsMe` and more — each a cross-source question no
  single register answers.
- **`apps/crime-predictors.html`** — the crime-PREDICTION instrument, the
  realm-uk-streets pattern rebuilt for Canada: each CMA's Crime Severity
  Index fitted on six predictors (T1FF family income, LFS unemployment, the
  20-24 share, growth, the weighted clearance rate, population) with
  toggleable predictors, standardized betas, alone-vs-in-model bars, named
  residuals and the full ranked cross-section. Driven by
  `CaCrimeModelWithPredictors` / `CaCrimePredictorsOneByOne` / `CaCmasRanked`,
  with `WhatBestPredictsCanadianCrime` as the one-call full model,
  `WhatForetoldCanadianCrime` as the LAGGED alternative (2018-2021 vintages
  predicting 2025 severity, so the crude reverse story cannot produce a
  coefficient) and `ClearanceLeadsOrLags` as the cross-lagged direction test
  (`views/predictors.yml` — the same ~39-CMA sample in every view, so a beta
  that moves moved because the model changed, not the sample).
- **`views/hypotheses.yml`** — six one-view hypothesis tests over the national
  cross-section: `CanadaCrimeConvergence` (beta and sigma), `WhereViolenceTookOver`
  (severity recomposed toward violence, offenders named), `ImpunityThreshold`
  (the clearance association split at the median), `TheWesternResidual` (does
  the West survive clearance?), `DidProsperityProtect` (lagged income growth and
  labour deterioration vs severity change), `TheBigCityParadox` (size vs the
  index). A seventh, CohortOrPlace, died at the source — StatCan's CMA-level
  youth-CSI vectors have never carried data — and the file documents the death.
  Round two adds `TheTriageHypothesis` (does violent-case solving get protected
  when overall clearance collapses?), `ViolentImpunityForetold` (2018 violent
  impunity vs 2018-25 violence growth), `TheTwoSolitudesOfCrime` (West premium,
  Quebec discount — region vs the whole battery), `SmallCityVolatility` (are
  the realm's own outliers small-denominator noise?), `TheCohortWave` (youth
  cohort growth vs violence — null), and `AtlanticGradients` in
  `views/atlantic.yml` — the money/youth/size crime gradients computed for
  Britain and Canada in ONE query, a cross-national replication test.
- **`apps/atlantic-ledger.html`** — the cross-country dashboard: Britain and
  Canada measured against each other from their own registers on one page —
  the affordability ladder (years of income per home, both countries' watched
  places), whose crime map is more unequal, the three-gradient replication
  test (money/youth/size vs crime, verdict per axis), each country's own
  six-predictor crime model side by side, impunity on both sides, and the
  street-concentration measurement only Britain can make. Requires
  realm-uk-streets beside this realm; degrades to Canada-only without it.
- **`skills/ca-streets/`** — the chat skill: the join table, the add-a-place
  recipes, honesty rules (a Québec AQHI blank is coverage, not clean air), and
  the grounded-briefing recipe.
- **`wasm/handlers.ts`** — the `warmLiveFeeds` verb (and 9-minute schedule):
  one call re-traverses every join so producer caches stay warm.

## Performance notes, learned the hard way

- The engine runs a view's per-place fan-out serially, and Represent producers
  are paced to 1 call/second (Open North's limit) — cold reads over N places
  cost ~N seconds per Represent producer. Warm reads are ~20-150 ms.
- **Empty producer results are only cached when `negativeTtlSeconds` is set.**
  Alerts are almost always empty; without it the "live" panels re-paid the
  full fan-out on every read. The live producers here all set it.
- `CaPlaceDossier` deliberately excludes the alert join; `AlertsAtMyMPs` owns
  that cost, and the app derives the dossier's alert pill from its rows.

## Coverage, honestly

- The federal AQHI network does **not** include Québec (its own IQA network) —
  a Montréal place with no AQHI rows is correct.
- Census figures are census-subdivision level: the WHOLE municipality.
  Incomes are 2020; unemployment is the May-2021 reference week (mid-pandemic).
- A place added by NAME has no postal code, so its full representative slate
  (postal-keyed) stays empty — only the MP is resolved by coordinates.
- No street-level crime (Canada has no data.police.uk analog) and no sale
  prices (land registries are provincial and mostly closed) — the census
  dwelling value is the honest national substitute.

No API keys, no accounts, nothing to configure — the realm works the moment it
is installed.

## License

Apache-2.0. Data: Represent (Open North, republishing official sources);
Statistics Canada (Statistics Canada Open Licence); Environment and Climate
Change Canada / MSC GeoMet and NRCan geolocation (Open Government Licence –
Canada); Natural Earth outline (public domain).
