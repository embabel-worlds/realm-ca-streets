// Browser test for apps/crime-predictors.html — the REAL app HTML in headless
// Chromium against a stubbed gateway.view.run serving canned envelopes captured
// from a live appliance on 2026-09-15 (real row shapes, real values: n=39,
// R²=0.401, clearance β=−0.636 — reconciled against raw WDS to 3 decimals).
// Run: node predictors-test.mjs   (playwright + chromium as per README)
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';

const html = fs.readFileSync('../apps/crime-predictors.html', 'utf8');

const stub = `
window.__viewCalls = [];
window.gateway = { view: { run: async ({ name, params }) => {
  window.__viewCalls.push({ name, params });
  if (name === 'CaCrimePredictorsOneByOne') return { rows: [{
    incomeVsCrime:{r:-0.032,n:39,ci:[-0.344,0.286],detectable:false},
    unemploymentVsCrime:{r:0.214,n:39,ci:[-0.109,0.496],detectable:false},
    youngAdultsVsCrime:{r:-0.104,n:39,ci:[-0.407,0.218],detectable:false},
    growthVsCrime:{r:0.119,n:39,ci:[-0.205,0.418],detectable:false},
    clearanceVsCrime:{r:-0.548,n:39,ci:[-0.736,-0.281],detectable:true},
    populationVsCrime:{r:-0.207,n:39,ci:[-0.49,0.117],detectable:false},
    cmas:39 }] };
  if (name === 'CaCrimeModelWithPredictors') {
    const on = Object.entries(params || {}).filter(([,v]) => v).map(([k]) => k);
    if (on.length === 1 && on[0] === 'unemployment') return { rows: [{ model: {
      n:39, r2:0.046, adjustedR2:0.02,
      coefficients:[{predictor:'x1',beta:0.214}],
      abovePrediction:[{label:'Chilliwack, British Columbia',actual:134.27,predicted:83.71,residual:50.56}],
      belowPrediction:[{label:'Barrie, Ontario',actual:46.93,predicted:84.52,residual:-37.59}] } }] };
    return { rows: [{ model: {
      n:39, r2:0.401, adjustedR2:0.289,
      /* the live envelope names coefficients after the Cypher variables */
      coefficients:[{predictor:'clearance',beta:-0.636},{predictor:'population',beta:-0.315},
        {predictor:'income',beta:-0.07},{predictor:'growth',beta:-0.066},
        {predictor:'youngAdults',beta:0.052},{predictor:'unemployment',beta:-0.005}],
      abovePrediction:[{label:'Thunder Bay, Ontario',actual:114.13,predicted:69.17,residual:44.96},
        {label:'Lethbridge, Alberta',actual:107.69,predicted:71.47,residual:36.22},
        {label:'Chilliwack, British Columbia',actual:134.27,predicted:104.02,residual:30.25}],
      belowPrediction:[{label:'Hamilton, Ontario',actual:54.82,predicted:81.84,residual:-27.02},
        {label:'St. Catharines-Niagara, Ontario',actual:53.84,predicted:80.85,residual:-27.01},
        {label:'Kingston, Ontario',actual:61.48,predicted:83.65,residual:-22.17}] } }] };
  }
  if (name === 'CaCmasRanked') return { rows: [
    {cma:'Chilliwack, British Columbia',crimeSeverity:134.3,medianFamilyIncome:96430,unemploymentPct:8.0,youngAdultPct:5.38,growthPct:9.8,clearancePct:22.4,population:130283},
    {cma:'Kamloops, British Columbia',crimeSeverity:126.2,medianFamilyIncome:113660,unemploymentPct:6.5,youngAdultPct:7.04,growthPct:6.8,clearancePct:24.0,population:127198},
    {cma:'Red Deer, Alberta',crimeSeverity:114.4,medianFamilyIncome:107130,unemploymentPct:7.4,youngAdultPct:7.02,growthPct:10.4,clearancePct:28.1,population:115273},
    {cma:'Thunder Bay, Ontario',crimeSeverity:114.1,medianFamilyIncome:109410,unemploymentPct:5.2,youngAdultPct:6.46,growthPct:4.5,clearancePct:47.2,population:133765},
    {cma:'Winnipeg, Manitoba',crimeSeverity:113.4,medianFamilyIncome:102140,unemploymentPct:5.9,youngAdultPct:7.62,growthPct:10.6,clearancePct:33.2,population:951758}
  ] };
  return { rows: [] };
} } };
`;

const page_html = html
  .replace('<link rel="stylesheet" href="/api/v1/apps-runtime/v1/theme.css">', '')
  .replace('<script src="/api/v1/apps-runtime/v1/embabel.js"></script>', '<script>' + stub + '</script>')
  .replace('<script src="/api/v1/apps-runtime/gateway.js"></script>', '');

const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(page_html); });
await new Promise(r => server.listen(8898, r));

const browser = await chromium.launch();
const pg = await browser.newPage();
const errors = [];
pg.on('pageerror', e => errors.push('pageerror: ' + e.message));
pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra || ''); } };

await pg.goto('http://localhost:8898/');
await pg.waitForTimeout(800);

check('no JS errors on load', errors.length === 0, errors.slice(0, 3).join(' | '));
check('six predictor rows', await pg.locator('#predbody tr').count() === 6);
const fitTxt = await pg.locator('#fit').textContent();
check('R² shown', fitTxt.includes('0.401'));
check('n=39 shown', fitTxt.includes('39'));
const bodyTxt = await pg.locator('#predbody').textContent();
check('clearance in-model beta rendered (named coefficient path)', bodyTxt.includes('0.636'));
check('clearance alone r rendered', bodyTxt.includes('0.548'));
check('residuals name Thunder Bay', (await pg.locator('#residuals').textContent()).includes('Thunder Bay'));
const rankTxt = await pg.locator('#ranked').textContent();
check('ranked table renders with Chilliwack first', rankTxt.indexOf('Chilliwack') >= 0 && rankTxt.indexOf('Chilliwack') < rankTxt.indexOf('Kamloops'));
check('ranked notes the absent CMAs', rankTxt.includes('Oshawa'));

// Toggle everything but unemployment off: the fit must be re-requested with
// only that flag true, and the solo x1 coefficient must map back to the row.
for (const key of ['income', 'youngAdults', 'growth', 'clearance', 'population']) {
  await pg.locator(`tr[data-key="${key}"] .toggle`).click();
  await pg.waitForTimeout(120);
}
await pg.waitForTimeout(500);
const calls = await pg.evaluate(() => window.__viewCalls);
const last = calls.filter(c => c.name === 'CaCrimeModelWithPredictors').pop();
check('refit sent single-flag params', last && last.params.unemployment === true && last.params.clearance === false, JSON.stringify(last && last.params));
const un = await pg.locator('tr[data-key="unemployment"]').textContent();
check('solo positional x1 maps to unemployment', un.includes('0.214'));
check('off rows marked', await pg.locator('#predbody tr.off').count() === 5);
check('solo R² shown', (await pg.locator('#fit').textContent()).includes('0.046'));

// zero predictors: refused with the note, no model call with all-false
await pg.locator('tr[data-key="unemployment"] .toggle').click();
await pg.waitForTimeout(300);
check('zero-predictor state refused in commentary', (await pg.locator('#commentary').textContent()).includes('not a model'));
check('no JS errors at end', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
