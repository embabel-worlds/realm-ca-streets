---
name: ca-streets
description: Street-level Canada — the sitting MP (and MPP, mayor, councillor) for any postal code or place name, Census 2021 population, income, dwelling values and unemployment for the municipality, live AQHI air quality, real-time river gauges, active weather alerts and current conditions, bilingual where the source is (English/French). Activate for "who represents X", "who is the MP for X", "is the air bad in X", "how expensive is X", "brief me on X" questions about Canadian places, or Canadian postal-code lookups. Every source is keyless — never tell the user this needs an API key.
---

# CA Streets

Keyless official and open sources joined at the places the user watches. All
calls go through `gateway.<ns>.<method>(args)` from inside `code_mode` — never
as top-level tools.

## The one idea

A watched `CaPlace` stores its geography ONCE (resolved when it is added) and
every stored field is a JOIN KEY into a different national dataset:

| Stored on the place | Joins to | Edge |
|---|---|---|
| `latlon` (`45.42,-75.69`) | House of Commons sitting MP (via Represent) | `HAS_SEAT` |
| `postalCode` (UPPERCASE, no space; null for name-added places) | ALL elected reps — MP, MPP/MLA, mayor, councillors | `HAS_REP` |
| `dguid` (`2021A0005` + CSD) | StatCan Census Profile 2021 — population, median age, household income, dwelling value | `HAS_POPULATION` `HAS_MEDIAN_AGE` `HAS_HOUSEHOLD_INCOME` `HAS_DWELLING_VALUE` |
| `lfsVector` (WDS vector id, CMA or province) | StatCan Labour Force Survey — CURRENT monthly unemployment rate, seasonally adjusted 3-month moving average | `HAS_UNEMPLOYMENT_NOW` |
| `csiVector` (WDS, CMA) | Crime Severity Index — ANNUAL, latest 2025, Canada-2006=100, comparable across areas | `HAS_CRIME_SEVERITY` |
| `nhpiVector` (WDS, CMA) | New Housing Price Index — monthly; the CHANGE is the story | `HAS_NHPI` |
| `gasVector` (WDS, 18 cities) | Average pump price, regular self-serve, ¢/L, monthly | `HAS_GAS` |
| `popVector` (WDS, CMA/CA) | July-1 population ESTIMATE — annual, latest 2025; CMA is WIDER than the census-subdivision population | `HAS_POP_NOW` |
| `bboxWide` (±0.7°) | Environment Canada AQHI, latest per station | `HAS_AIR` |
| `bbox` (±0.2°) | Water Survey river gauges, real-time | `HAS_RIVER` |
| `bbox` | Environment Canada ACTIVE weather alerts | `HAS_ALERT` |
| `bbox` | weather.gc.ca current conditions | `HAS_WEATHER` |

**Caching and speed**: producers carry TTL caches (live feeds 30 min,
political and census axes a week). The engine runs a view's per-place fan-out
serially and the Represent producers are paced to 1 call/second, so a COLD
read over N places costs ~N seconds per Represent producer — warm reads are
~0.2s. The `warmLiveFeeds` verb re-traverses EVERY join in one call: run it
after adding places, and before a demo. (Its 9-minute schedule is installed
but adoption-gated on this host — embabel/me#1152 — so it does not fire on
its own.) `CaPlaceDossier` deliberately excludes the alert join so the app's
first paint never pays the alert fan-out; `AlertsAtMyMPs` owns that cost.

**Bilingual**: where the source publishes both official languages
(Environment Canada), types carry both — `station/stationFr`,
`condition/conditionFr`, `alertName/alertNameFr`, `text/textFr` — official
wording in each language, never a re-translation. Answer in the language the
user asked in, using the matching column.

## Saved views — reach for these first

The CROSS-SOURCE joins are the product — each one puts two registers side by
side that never meet officially: `CaPlaceDossier` (everything, one row per
place) · `CaIncomeByParty` (StatCan income under Parliament's colours) ·
`PartyLedger` · `SeatsAndFortunes` (riding and MP beside census fortunes) ·
`SplitRepresentation` (places whose federal and provincial reps come from
different political families) · `AffordabilityGap` (years of income per home) ·
`AirVsIncome` · `AlertsAtMyMPs` (live alerts joined to sitting MPs, bilingual) ·
`CaCrimeVsIncome` (crime severity beside income and the MP's party) ·
`CaCrimeByParty` · `HousingHeat` (new-home price index with year-over-year
change, beside dwelling values and party) · `GasAtMyPlaces`.
Single-source: `MorningCanada` (the live face of every place at one instant —
the morning briefing) · `CensusLeague` (every census measure, one table) ·
`WhoRepresentsMe` · `SeatsAtMyPlaces` · `AirQualityNow` · `RiversNearMe` ·
`WeatherAcrossMyPlaces`. Run via `gateway.view.run({ name, params })`.

## Watching a place

Resolve geography FIRST, store it all — the keys are the realm. By postal code:

```javascript
const code = 'M5V 3L9'.toUpperCase().replace(/\s+/g, '')
const r = await gateway.represent.representPostcode({ code })
const [lon, lat] = r.centroid.coordinates
const csd = (r.boundaries_centroid.find(b => b.boundary_set_name === 'Census subdivision') || {}).external_id
const mp = (r.representatives_centroid || []).find(x => x.elected_office === 'MP')
const d = 0.2, dw = 0.7
await gateway.repository.createEntry({ type: 'CaPlace', data: {
  name: 'The Annex', postalCode: code,
  latitude: lat, longitude: lon, latlon: lat + ',' + lon,
  city: r.city, province: r.province,
  riding: mp ? mp.district_name : null,
  csd: csd || null, dguid: csd ? '2021A0005' + csd : null,
  bbox: (lon-d)+','+(lat-d)+','+(lon+d)+','+(lat+d),
  bboxWide: (lon-dw)+','+(lat-dw)+','+(lon+dw)+','+(lat+dw),
}})
```

By NAME ("Brantford"): `gateway.nrcanGeolocator.nrcanGeolocate({ q })` → take
the best `qualifier === 'LOCATION'` match's `geometry.coordinates` ([lon,
lat]), then `gateway.represent.csdForPoint({ contains: lat+','+lon })` for the
CSD and `gateway.represent.mpForPoint({ point: lat+','+lon })` for the riding;
store `postalCode: null`. Such a place gets everything EXCEPT the full
representative slate (postal-keyed) — say so, never call it a vacancy.

The riding comes from the MP record, NOT from `boundaries_centroid` — the
boundary list carries several representation-order vintages and the MP's
`district_name` is the current one. **Never invent coordinates or codes** — a
wrong key returns a confident answer about the wrong place.

## Rules that keep answers honest

- **Census figures describe the WHOLE MUNICIPALITY** (census subdivision).
  Toronto's median household income covers 2.8M people — say "the
  municipality's median", never "this street earns". Incomes are 2020 (the
  census asks about the prior year).
- **Unemployment is LIVE, not census.** The 2021 census unemployment figure
  (May-2021 pandemic reference week) was removed; HAS_UNEMPLOYMENT_NOW carries
  the LFS monthly rate for the place's census metropolitan area — or its
  PROVINCE where no CMA covers it (`lfsCma` says which) — seasonally adjusted,
  three-month moving average. Always state the month and the geography.
  Resolve a new place's `lfsVector` from table 14-10-0459: WDS
  getSeriesInfoFromCubePidCoord, coordinate `{geoMemberId}.5.1.1.0.0.0.0.0.0`
  (the Maple Lens app carries the full CMA→vector map).
- **The other StatCan vectors follow the same pattern** — csiVector (35-10-0026
  coord `{geo}.1.0…`), nhpiVector (18-10-0205 `{geo}.1.0…`), gasVector
  (18-10-0001 `{geo}.2.0…`), popVector (17-10-0148 `{geo}.1.1.0…`); the app
  carries all the maps. CSI is an index (Canada 2006 = 100) and IS comparable
  across areas; NHPI is an index whose change matters; the population estimate
  covers the WHOLE CMA — label which geography every figure describes.
- **AQHI absence is coverage, not clean air.** Stations exist near cities and
  larger towns — and the federal AQHI network does NOT include Québec, which
  runs its own IQA network. A Montréal place with no AQHI rows is correct.
- **River levels are metres on each station's OWN datum.** Compare a station
  against itself over time; never rank rivers by level. A null discharge is
  unmeasured, not zero flow.
- **Provincial parties are separate organisations from their federal
  namesakes.** `SplitRepresentation`'s `aligned` flag matches NAME families
  (Liberal/Conservative/New Democratic/Green) and nothing more; the BC Liberal
  precedent and Québec's CAQ/PQ make this a heuristic — present it as one.
- **Municipal party is usually empty** — most Canadian councils are
  non-partisan. Empty is correct, not missing.
- **Dwelling values are owner-estimated census medians**, not sale prices —
  Canada publishes no national price-paid register (that is a provincial gap,
  stated in the realm's Deliberately-not-here list).
- **Projected values arrive as STRINGS** — `toFloat()`/`toInteger()` before
  ordering or arithmetic, always.
- **Slow fan-outs must narrate, never freeze.** A whole-watchlist question
  fires one producer call per place per source; say what is fanning out before
  running ("checking N places against the census…"), and prefer running
  `warmLiveFeeds` first.
- Represent is Open North civic infrastructure republishing official data, not
  a government API — attribute it as such when citing.

## Briefing like a local journalist (the subjective layer)

```javascript
const dossier = await gateway.view.run({ name: 'CaPlaceDossier' })
const reps = await gateway.view.run({ name: 'WhoRepresentsMe' })
const brief = await gateway.ai.complete({ prompt:
  'Write a five-sentence local-affairs brief for each place below. Use ONLY ' +
  'these figures; attribute each claim to its dataset; no speculation.\n' +
  JSON.stringify({ dossier: dossier.rows, reps: reps.rows }) })
```

Never let the model add facts the rows don't carry — the whole value of this
realm is that every claim traces to an official register. When the user asks
in French, brief in French and use the `*Fr` columns for official wording.

## Deliberately not here (asked and answered)

- **Street-level crime**: Canada has no national analog of data.police.uk;
  city police services publish separately (Toronto, Vancouver, Calgary) and
  StatCan publishes annual rates by police service, not incidents. Say so
  rather than improvise.
- **Sale prices**: land registries are provincial and mostly closed; the
  census dwelling value is the honest national substitute.
- **School ratings**: provincial (EQAO, Fraser Institute) — downloads, not
  keyless APIs.
