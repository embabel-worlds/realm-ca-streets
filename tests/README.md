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
