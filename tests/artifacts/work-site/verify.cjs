'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/rust/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = path.join(__dirname, process.env.CHECK_DIR || 'checks-final');
fs.mkdirSync(output, { recursive: true });
const report = { testedAt: new Date().toISOString(), url: process.env.TEST_URL || pathToFileURL(path.join(__dirname, 'index.html')).href, httpPreview: 'http://127.0.0.1:4173', httpLimitation: 'Chrome localhost navigation returned ERR_NETWORK_ACCESS_DENIED; Node fetch also failed. Rendering and interactions are checked using the authorized local file.', runtime: process.execPath, browser: null, checks: [], console: [], failedRequests: [], requests: [], hashes: {} };
for (const file of ['index.html', 'styles.css', 'app.js', 'server.cjs']) report.hashes[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, file))).digest('hex');
async function test(name, fn) { try { const result = await fn(); report.checks.push({ name, status: 'PASS', result }); } catch (error) { report.checks.push({ name, status: 'FAIL', error: error.message }); } }
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome', timeout: 15000 });
    report.browser = browser.version();
    const context = await browser.newContext({ locale: 'ru-RU' });
    const page = await context.newPage();
    page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) report.console.push({ type: msg.type(), text: msg.text() }); });
    page.on('pageerror', error => report.console.push({ type: 'pageerror', text: error.message }));
    page.on('requestfailed', req => report.failedRequests.push({ url: req.url(), error: req.failure()?.errorText }));
    page.on('request', req => report.requests.push({ url: req.url(), method: req.method() }));
    for (const [label, width, height] of [['desktop',1440,960],['laptop',1280,720],['mobile',390,844],['narrow',320,568],['tablet',768,1024],['short',844,390],['wide',2560,1440]]) {
      await test(`Layout ${label} ${width}x${height}`, async () => {
        await page.setViewportSize({ width, height }); await page.goto(report.url); await page.waitForLoadState('networkidle');
        const metrics = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, root: document.documentElement.scrollWidth, h1: document.querySelector('h1').textContent, cta: (() => { const b = document.querySelector('.hero .button').getBoundingClientRect(); return { x:b.x,y:b.y,width:b.width,height:b.height }; })() }));
        assert.ok(metrics.body <= width && metrics.root <= width, JSON.stringify(metrics));
        await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: true });
        if (['desktop','mobile','narrow','short'].includes(label)) await page.screenshot({ path: path.join(output, `${label}-hero.png`) });
        return metrics;
      });
    }
    await page.setViewportSize({ width:390, height:844 }); await page.goto(report.url);
    await test('CTA opens demo form', async () => { await page.locator('.hero .button').click(); await page.waitForFunction(() => location.hash === '#contact'); assert.equal(new URL(page.url()).hash, '#contact'); return { hash: '#contact', formVisible: await page.locator('#contact-form').isVisible() }; });
    await test('Empty form: inline errors and first error focused', async () => { await page.locator('#demo-button').click(); assert.equal(await page.locator('#name').getAttribute('aria-invalid'), 'true'); assert.equal(await page.locator('#email').getAttribute('aria-invalid'), 'true'); assert.equal(await page.evaluate(() => document.activeElement.id), 'name'); await page.screenshot({ path:path.join(output,'form-errors.png') }); return { nameError:await page.locator('#name-error').innerText(),emailError:await page.locator('#email-error').innerText() }; });
    await test('Malformed email rejected; name retained', async () => { await page.locator('#name').fill('Тест'); await page.locator('#email').fill('invalid-email'); await page.locator('#demo-button').click(); assert.equal(await page.locator('#name').inputValue(), 'Тест'); assert.equal(await page.evaluate(() => document.activeElement.id), 'email'); assert.equal(await page.locator('#email').getAttribute('aria-invalid'), 'true'); });
    await test('Valid form + Enter + no request/storage', async () => { const before = report.requests.length; await page.locator('#name').fill('  Тест  '); await page.locator('#email').fill('test@example.com'); await page.locator('#email').press('Enter'); assert.match(await page.locator('#form-status').innerText(), /Заявка не отправлена/); assert.equal(await page.locator('#name').inputValue(),'Тест'); assert.equal(report.requests.length,before); const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })); assert.deepEqual(storage,{local:0,session:0}); await page.screenshot({path:path.join(output,'form-success.png')}); return {requestsDuringSubmit:report.requests.length-before,storage}; });
    await test('Editing clears success; repeat validation works', async () => { await page.locator('#email').fill(''); assert.equal(await page.locator('#form-status').innerText(),''); await page.locator('#demo-button').click(); assert.equal(await page.locator('#email').getAttribute('aria-invalid'),'true'); });
    await test('FAQ mouse and keyboard', async () => { const faq=page.locator('details').first(); await faq.locator('summary').click(); assert.ok(await faq.getAttribute('open') !== null); await faq.locator('summary').focus(); await page.keyboard.press('Enter'); assert.equal(await faq.getAttribute('open'),null); await page.keyboard.press('Space'); assert.ok(await faq.getAttribute('open') !== null); });
    await test('All anchors resolve', async () => { const anchors=await page.locator('a[href^="#"]').evaluateAll(nodes=>nodes.map(n=>({href:n.getAttribute('href'),exists:!!document.getElementById(n.getAttribute('href').slice(1))}))); assert.ok(anchors.every(a=>a.exists)); return anchors; });
    await test('Keyboard skip link and visible focus', async () => { await page.goto(report.url); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(()=>document.activeElement.className),'skip-link'); const focus = await page.evaluate(()=>({outline:getComputedStyle(document.activeElement).outlineStyle,width:getComputedStyle(document.activeElement).outlineWidth})); assert.equal(focus.outline,'solid'); await page.keyboard.press('Enter'); assert.equal(new URL(page.url()).hash,'#main'); return focus; });
    await test('Reduced motion', async () => { await page.emulateMedia({reducedMotion:'reduce'}); const actual=await page.evaluate(()=>({scroll:getComputedStyle(document.documentElement).scrollBehavior,transition:getComputedStyle(document.querySelector('.button span')).transitionDuration})); assert.equal(actual.scroll,'auto'); assert.equal(actual.transition,'0s'); return actual; });
    await test('200 percent text enlargement at 390px', async () => { await page.goto(report.url); await page.evaluate(()=>{for(const node of document.querySelectorAll('p,h1,h2,h3,a,button,label,summary,.eyebrow')) node.style.fontSize=(parseFloat(getComputedStyle(node).fontSize)*2)+'px'}); const width=await page.evaluate(()=>document.documentElement.scrollWidth); assert.ok(width<=390,`Document width ${width}`); await page.screenshot({path:path.join(output,'text-200.png'),fullPage:true}); return {width}; });
    await test('No JavaScript: content/FAQ available, form cannot submit', async () => { const ctx=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}); const p=await ctx.newPage(); const reqs=[];p.on('request',r=>reqs.push(r.url()));await p.goto(report.url);assert.ok(await p.locator('#demo-button').isDisabled());assert.equal(await p.locator('#demo-button').getAttribute('type'),'button');await p.locator('details summary').first().click();assert.ok(await p.locator('details').first().getAttribute('open')!==null);await p.locator('#email').fill('test@example.com');const before=reqs.length;await p.locator('#email').press('Enter');assert.equal(reqs.length,before);await p.screenshot({path:path.join(output,'no-js.png'),fullPage:true});await ctx.close();return {requestsOnEnter:0}; });
    await test('No console warnings/errors or failed network', async () => { assert.deepEqual(report.console,[]);assert.deepEqual(report.failedRequests,[]);const base=report.url.slice(0,report.url.lastIndexOf('/')+1);assert.ok(report.requests.every(r=>r.url.startsWith(base)&&r.method==='GET')); });
    await page.goto(report.url);
    const text = (await page.locator('body').textContent()).replace(/\s+/g,' ').trim();fs.writeFileSync(path.join(output,'site-copy.txt'),text,'utf8');
    await context.close();
  } catch (error) { report.blocker = error.message; }
  finally { if(browser)await browser.close(); report.summary={pass:report.checks.filter(c=>c.status==='PASS').length,fail:report.checks.filter(c=>c.status==='FAIL').length};fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({summary:report.summary,blocker:report.blocker,failed:report.checks.filter(c=>c.status==='FAIL')},null,2));if(report.blocker||report.summary.fail)process.exitCode=1; }
})();
