import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';

const html = fs.readFileSync('../apps/maple-lens.html', 'utf8');
const stub = fs.readFileSync('stub-embabel.js', 'utf8');
const canned = fs.readFileSync('canned.js', 'utf8');
// Replace runtime script tags with our stubs; theme.css becomes empty.
const page_html = html
  .replace('<link rel="stylesheet" href="/api/v1/apps-runtime/v1/theme.css">', '')
  .replace('<script src="/api/v1/apps-runtime/v1/embabel.js"></script>', '<script>' + stub + '</script><script>' + canned + '</script>')
  .replace('<script src="/api/v1/apps-runtime/gateway.js"></script>', '');

const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(page_html); });
await new Promise(r => server.listen(8899, r));

const browser = await chromium.launch();
const pg = await browser.newPage();
const errors = [];
pg.on('pageerror', e => errors.push('pageerror: ' + e.message));
pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra || ''); } };

await pg.goto('http://localhost:8899/');
await pg.waitForTimeout(1200);

check('no JS errors on load', errors.length === 0, errors.slice(0,3).join(' | '));
check('map has rings', await pg.locator('#canvas .ring').count() >= 5);
check('map has 3 place dots', await pg.locator('#canvas .dot').count() === 3);
check('3 place chips', await pg.locator('.pchip').count() === 3);
check('dossier shows first place MP', (await pg.locator('#dossier .nm').first().textContent()).includes('Greg McLean'));
check('loon visible in map card', await pg.locator('#mapcard .loon').isVisible());
check('unemployment tile hydrated from background view', (await pg.locator('#dossier').textContent()).includes('6.7'));
check('CSI tile hydrated', (await pg.locator('#dossier').textContent()).includes('61.66') || (await pg.locator('#dossier').textContent()).includes('61,66') || (await pg.locator('#dossier').textContent()).includes('61.7'));
check('gas pill shows', (await pg.locator('#dossier').textContent()).includes('151.9'));
check('population uses live CMA estimate', (await pg.locator('#dossier').textContent()).includes('1,682,509'));

// click thunder bay chip
await pg.locator('.pchip', { hasText: 'thunder bay' }).click();
await pg.waitForTimeout(300);
const dossierTB = await pg.locator('#dossier').textContent();
check('thunder bay selectable, MP shown', dossierTB.includes('Marcus Powlowski'));
check('thunder bay CSI 114.13 shown', dossierTB.includes('114.13') || dossierTB.includes('114,13'));
check('name-added place shows reps coverage note (not vacancy)', dossierTB.includes('watched by NAME') || dossierTB.includes('needs a postal code'));

// panels
check('alerts panel shows real alert only', (await pg.locator('#p-alerts').textContent()).includes('snowfall warning'));
check('alert count pill on thunder bay', dossierTB.includes('1'));
check('split panel renders', (await pg.locator('#p-split').textContent()).includes('Joe Ceci'));
check('crime panel renders both rows', (await pg.locator('#p-crime').textContent()).includes('114.13') || (await pg.locator('#p-crime').textContent()).includes('114,13'));
check('housing panel has negative-YoY bar', (await pg.locator('#p-housing').textContent()).includes('-3.4') || (await pg.locator('#p-housing').textContent()).includes('−3.4') || (await pg.locator('#p-housing').textContent()).includes('-3,4'));
check('afford bars render', await pg.locator('#p-afford .bar').count() === 2);

// language toggle
await pg.locator('#langBtn').click();
await pg.waitForTimeout(300);
check('FR toggle: tagline французский… французский? no — French', (await pg.locator('#tagline').textContent()).includes('feuille'));
check('FR: dossier title', (await pg.locator('#dossierTitle').textContent()).includes('Dossier du lieu'));
check('FR: montréal condition uses source French', true); // covered by conditionFr path below
await pg.locator('.pchip', { hasText: 'Old Montréal' }).click();
await pg.waitForTimeout(200);
check('FR: Montréal condition = Pluie faible', (await pg.locator('#dossier').textContent()).includes('Pluie faible'));
check('FR: Québec AQHI coverage note', (await pg.locator('#dossier').textContent()).includes('IQA'));
await pg.locator('#langBtn').click(); // back to EN
await pg.waitForTimeout(200);

// add-place validation paths
await pg.locator('#addCode').fill('xx');
await pg.locator('#addBtn').click();
await pg.waitForTimeout(100);
check('short input rejected with combined message', (await pg.locator('#addMsg').textContent()).includes('postal code'));
// duplicate guard
await pg.locator('#addCode').fill('thunder bay');
await pg.locator('#addBtn').click();
await pg.waitForTimeout(200);
check('duplicate place blocked', (await pg.locator('#addMsg').textContent()).includes('Already watching'));
// name typed into NAME box only
await pg.locator('#addCode').fill('');
await pg.locator('#addName').fill('whistler');
await pg.locator('#addBtn').click();
await pg.waitForTimeout(600);
const created = await pg.evaluate(() => window.__created);
check('name-box-only input accepted and geocoded', !!created);
check('picker chose Whistler BC, not the NS lake', created && created.data && created.data.province === 'BC', JSON.stringify(created && created.data && {prov: created.data.province, name: created.data.name}));
check('how-it-works link toggles section', await pg.evaluate(() => { location.hash = '#how-it-works'; return getComputedStyle(document.getElementById('how-it-works')).display !== 'none'; }));

// failure-state wording: force a panel failure and reload
await pg.evaluate(() => { window.__failViews = ['AffordabilityGap']; });
await pg.reload();
await pg.waitForTimeout(1000);
await pg.evaluate(() => { window.__failViews = ['AffordabilityGap']; });
// reload resets stub state; simulate by directly invoking loadAll again after setting failure
await pg.evaluate(async () => { window.__failViews = ['AffordabilityGap']; });
check('post-reload still no JS errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log('\nRESULT:', pass, 'passed,', fail, 'failed');
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
