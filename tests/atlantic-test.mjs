// Browser test for apps/atlantic-ledger.html — real app HTML in headless
// Chromium against canned envelopes captured live 2026-09-15 (Toronto 10.7yrs,
// Calgary 4.7, UK CV 41.1 vs CA 30.8, gradients: money null both / youth UK-only
// / size flips sign). Run: node atlantic-test.mjs
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';

const html = fs.readFileSync('../apps/atlantic-ledger.html', 'utf8');

const stub = `
window.__viewCalls = [];
window.gateway = { view: { run: async ({ name }) => {
  window.__viewCalls.push(name);
  const rows = {
    AtlanticAffordability: [
      {country:'CA',place:'Downtown Toronto',yearsOfIncome:10.7,home:900000,income:84000,period:'Census 2021',basis:'owner-estimated dwelling value vs median household income (Census 2021)'},
      {country:'UK',place:'SE10',yearsOfIncome:10.3,home:465132,income:45274,period:'2026-06',basis:'avg sale price (HM Land Registry HPI) vs median FT individual pay (ONS ASHE)'},
      {country:'UK',place:'clacton',yearsOfIncome:6.6,home:261717,income:39799,period:'2026-06',basis:'avg sale price (HM Land Registry HPI) vs median FT individual pay (ONS ASHE)'},
      {country:'CA',place:'Downtown Calgary',yearsOfIncome:4.7,home:456000,income:98000,period:'Census 2021',basis:'owner-estimated dwelling value vs median household income (Census 2021)'}],
    AtlanticCrimeGeography: [
      {series:'UK districts — total crime rate per 1,000, YE Mar 2024 (City of London excluded)',n:301,mean:82.1,spreadCvPct:41.1,highest:446.4,lowest:31.1,maxOverMin:14.4},
      {series:'Canada CMAs — Crime Severity Index, 2025',n:41,mean:76.9,spreadCvPct:30.8,highest:134.3,lowest:46.9,maxOverMin:2.9}],
    AtlanticGradients: [{
      ukMoney:{r:-0.1,n:283,detectable:false}, caMoney:{r:-0.032,n:39,detectable:false},
      ukYouth:{r:0.498,n:290,detectable:true}, caYouth:{r:-0.104,n:39,detectable:false},
      ukSize:{r:0.296,n:290,detectable:true},  caSize:{r:-0.207,n:39,detectable:false},
      ukAreas:290, caAreas:39,
      moneyBasis:'m', youthBasis:'y',
      crimeBasis:'UK: offences per 1,000 residents, year to March 2024, City of London excluded; CA: Crime Severity Index, latest year'}],
    WhatBestPredictsCrime: [{ model: { n:263, r2:0.529, coefficients:[
      {predictor:'x1',beta:0.566},{predictor:'x2',beta:0.184},{predictor:'x3',beta:0.212},
      {predictor:'x4',beta:0.221},{predictor:'x5',beta:0.063},{predictor:'x6',beta:0.115}] } }],
    WhatBestPredictsCanadianCrime: [{ model: { n:39, r2:0.401, coefficients:[
      {predictor:'clearance',beta:-0.636},{predictor:'population',beta:-0.315},
      {predictor:'income',beta:-0.07},{predictor:'growth',beta:-0.066},
      {predictor:'youngAdults',beta:0.052},{predictor:'unemployment',beta:-0.005}] } }],
    AtlanticImpunity: [
      {country:'CA',place:'All 41 CMAs, mean',pct:62.0,metric:'share of 2025 crime NOT cleared, severity-weighted (StatCan 35-10-0026)',n:41,period:'2025'},
      {country:'UK',place:'clacton',pct:18.4,metric:'share of latest-month street crimes ALREADY closed, no suspect identified — open investigations excluded',n:419,period:'2026-07'},
      {country:'UK',place:'SE10',pct:27.5,metric:'share of latest-month street crimes ALREADY closed, no suspect identified — open investigations excluded',n:690,period:'2026-07'}],
    WhereCrimeConcentrates: [
      {place:'clacton',crimes:419,distinctStreets:114,streetsCarryingHalf:13,pctOfStreets:11.4},
      {place:'SE10',crimes:690,distinctStreets:222,streetsCarryingHalf:38,pctOfStreets:17.1}],
  }[name];
  return { rows: rows || [] };
} } };
`;

const page_html = html
  .replace('<link rel="stylesheet" href="/api/v1/apps-runtime/v1/theme.css">', '')
  .replace('<script src="/api/v1/apps-runtime/v1/embabel.js"></script>', '<script>' + stub + '</script>')
  .replace('<script src="/api/v1/apps-runtime/gateway.js"></script>', '');

const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(page_html); });
await new Promise(r => server.listen(8897, r));

const browser = await chromium.launch();
const pg = await browser.newPage();
const errors = [];
pg.on('pageerror', e => errors.push('pageerror: ' + e.message));
pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra || ''); } };

await pg.goto('http://localhost:8897/');
await pg.waitForTimeout(700);

check('no JS errors on load', errors.length === 0, errors.slice(0, 3).join(' | '));
const lad = await pg.locator('#ladder').textContent();
check('ladder has 4 rungs, Toronto first', (await pg.locator('#ladder .rung').count()) === 4 && lad.indexOf('Downtown Toronto') < lad.indexOf('SE10'));
check('ladder shows years', lad.includes('10.7 yrs') && lad.includes('4.7 yrs'));
check('ladder carries both bases', lad.includes('household income') && lad.includes('individual pay'));
const geo = await pg.locator('#geo').textContent();
check('geography spread rows', geo.includes('41.1') && geo.includes('30.8') && geo.includes('14.4×'));
const gr = await pg.locator('#grads').textContent();
check('gradients: replicated null on money', gr.includes('replicated null'));
check('gradients: Britain-only youth', gr.includes('Britain only'));
check('gradients: nd marker on undetectable cells', gr.includes('∅'));
check('gradients: power footnote', gr.includes('290 UK districts vs 39 Canadian CMAs'));
const ukm = await pg.locator('#ukmodel').textContent();
check('UK model maps x1 to Deprivation, strongest first', ukm.indexOf('Deprivation') >= 0 && ukm.indexOf('Deprivation') < ukm.indexOf('Median pay') && ukm.includes('0.566'));
check('UK model R² line', ukm.includes('0.529') && ukm.includes('263'));
const cam = await pg.locator('#camodel').textContent();
check('CA model named coefficients, clearance leads', cam.indexOf('Clearance rate') >= 0 && cam.indexOf('Clearance rate') < cam.indexOf('Population') && cam.includes('0.636'));
const imp = await pg.locator('#impunity').textContent();
check('impunity rows metric-labeled, CA mean first', imp.indexOf('All 41 CMAs') < imp.indexOf('SE10') && imp.includes('62.0%') && imp.includes('severity-weighted'));
const conc = await pg.locator('#conc').textContent();
check('concentration rows plus the Canada-cannot note', conc.includes('11.4%') && conc.includes('cannot have one'));
const calls = await pg.evaluate(() => window.__viewCalls);
check('all seven views were called', new Set(calls).size === 7, JSON.stringify(calls));
check('no JS errors at end', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
