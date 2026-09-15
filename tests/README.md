# Maple Lens browser tests (Playwright)

Runs the REAL app HTML in headless Chromium against a stubbed app runtime
(`stub-embabel.js`) serving canned envelopes captured from a live appliance
(`canned.js` — real row shapes, real values). 30 checks: map/dots/chips render,
dossier per place, background StatCan tile hydration, alerts/split/crime/
housing panels, EN⇄FR toggle with source-French data, add-place validation,
duplicate guard, the settlement-preferring geocode picker, failure-state
wording, zero console errors.

    cd tests && npm init -y && npm i playwright && npx playwright install chromium
    node test.mjs

Run after ANY app or view-contract change — the app's out-of-band regressions
(a slow view starving first paint; a picker landing "whistler" on a Nova Scotia
lake) are exactly the class these catch and unit-testing the realm never will.

## Crime-predictors app test

`predictors-test.mjs` runs `apps/crime-predictors.html` the same way: canned
envelopes captured live 2026-09-15 (n=39, R² 0.401, clearance β −0.636 —
reconciled against raw WDS to 3 decimals). 15 checks: model panel, alone
figures, named-coefficient and positional x1..xn mapping, residuals, ranked
table, toggle refit params, sample-never-moves wording, zero-predictor
refusal, zero console errors.

    node predictors-test.mjs

## Atlantic Ledger app test

`atlantic-test.mjs` — the cross-country dashboard against canned envelopes
captured live 2026-09-15. 16 checks: ladder order and bases, spread table,
gradient verdicts (replicated null / Britain-only / ∅ markers), both national
models (positional x1..xn AND named coefficients), impunity metric labels,
the Canada-cannot-measure note, all seven views called, zero console errors.

    node atlantic-test.mjs
