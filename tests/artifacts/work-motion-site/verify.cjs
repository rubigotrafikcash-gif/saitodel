'use strict';
const { chromium } = require('C:/Users/rust/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = __dirname;
const source = path.resolve(root, '../work-site');
const out = path.join(root, 'evidence');
const files = ['index.html', 'styles.css', 'app.js', 'favicon.svg', 'social-preview.svg'];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hashes = dir => Object.fromEntries(files.map(file => [file, hash(path.join(dir, file))]));
const report = { createdAt: new Date().toISOString(), mode: 'file://, existing Chrome, no browser security overrides', sourceBefore: hashes(source), candidate: hashes(root), checks: [], matrix: [], screenshots: [] };
function check(name, actual, expected = true) {
  report.checks.push({ name, status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL', expected, actual });
}
async function snapshot(page, file) {
  const target = path.join(out, file);
  await page.screenshot({ path: target, animations: 'allow' });
  report.screenshots.push({ file, sha256: hash(target), capturedAt: new Date().toISOString(), visuallyInspected: false });
}
async function metrics(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    width: innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    animationCount: document.getAnimations().filter(a => a.playState === 'running').length,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    h1Transform: getComputedStyle(document.querySelector('h1')).transform,
    h1Opacity: getComputedStyle(document.querySelector('h1')).opacity,
    ctaOpacity: getComputedStyle(document.querySelector('.hero-action')).opacity,
    formsEnabled: !document.querySelector('#demo-button').disabled,
    titles: [...document.querySelectorAll('h1,h2,h3')].map(x => x.textContent),
    links: [...document.querySelectorAll('a')].map(x => x.getAttribute('href')),
    fonts: document.fonts.status,
  }));
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  report.browser = await browser.version();
  const dimensions = [ ['desktop',1280,900], ['mobile',390,844], ['narrow',320,568], ['short',667,375], ['tablet',768,1024], ['wide',1920,1080] ];
  let baseline;
  for (const [label,width,height] of dimensions.slice(0,2)) {
    const context = await browser.newContext({ viewport:{width,height}, reducedMotion:'no-preference', colorScheme:'light' });
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(source,'index.html')).href);
    await page.evaluate(() => document.fonts.ready);
    const result = await metrics(page);
    if (label === 'desktop') baseline = result;
    await snapshot(page, `before-${label}.png`);
    await context.close();
  }
  for (const [label,width,height] of dimensions) {
    for (const reducedMotion of ['no-preference','reduce']) {
      const context = await browser.newContext({ viewport:{width,height}, reducedMotion, colorScheme:'light' });
      const page = await context.newPage();
      const errors = [], requests = [], failedRequests = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
      page.on('request', r => { if (!r.url().startsWith('file:')) requests.push(r.url()); });
      page.on('requestfailed', r => failedRequests.push({url:r.url(),failure:r.failure()}));
      await page.goto(pathToFileURL(path.join(root,'index.html')).href, {waitUntil:'domcontentloaded'});
      const early = await metrics(page);
      const prefix = `${label}-${reducedMotion}`;
      check(`${prefix}: no horizontal overflow`, early.scrollWidth <= width);
      check(`${prefix}: full text contrast during entrance`, [early.h1Opacity,early.ctaOpacity], ['1','1']);
      check(`${prefix}: existing headings preserved`, early.titles, baseline.titles);
      check(`${prefix}: links preserved`, early.links, baseline.links);
      check(`${prefix}: form immediately available`, early.formsEnabled);
      if (reducedMotion === 'reduce') {
        check(`${prefix}: zero running entrance animations`, early.animationCount, 0);
        check(`${prefix}: no smooth scrolling`, early.scrollBehavior, 'auto');
        check(`${prefix}: static heading`, early.h1Transform, 'none');
      } else check(`${prefix}: hero animation runs`, early.animationCount > 0);
      if (label === 'desktop') await snapshot(page, `early-${prefix}.png`);
      await page.waitForTimeout(800);
      const settled = await metrics(page);
      check(`${prefix}: settled animation count`, settled.animationCount, 0);
      if (['desktop','mobile','short'].includes(label)) await snapshot(page, `after-${prefix}.png`);

      // Capture and measure an actual viewport-triggered section entrance.
      await page.evaluate(() => document.querySelector('.idea-section').scrollIntoView({behavior:'instant',block:'start'}));
      await page.waitForTimeout(40);
      const section = await page.evaluate(() => ({ animations: document.getAnimations().filter(a => a.playState === 'running').length, opacity: getComputedStyle(document.querySelector('.idea-layout')).opacity }));
      check(`${prefix}: section stays readable`, section.opacity, '1');
      check(`${prefix}: section motion follows preference`, reducedMotion === 'reduce' ? section.animations === 0 : section.animations > 0);
      await page.waitForTimeout(700);
      if (label === 'desktop') await snapshot(page, `section-${prefix}.png`);

      // Warm each actual section, then check all four directional navigation links.
      for (const id of ['services','process','faq','contact']) {
        await page.evaluate(id => document.getElementById(id).scrollIntoView({behavior:'instant'}), id);
        await page.waitForTimeout(700);
      }
      check(`${prefix}: no overflow after reveals`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('.hero-action .button').click();
      await page.waitForTimeout(900);
      check(`${prefix}: CTA reaches contact`, new URL(page.url()).hash, '#contact');
      await page.locator('#demo-button').click();
      check(`${prefix}: empty form focuses name`, await page.evaluate(() => document.activeElement.id), 'name');
      check(`${prefix}: errors are visible`, await page.locator('#name-error').innerText() !== '' && await page.locator('#email-error').innerText() !== '');
      await page.locator('#name').fill('Тест');
      await page.locator('#email').fill('test@example.com');
      await page.locator('#email').press('Enter');
      check(`${prefix}: valid form shows local outcome`, (await page.locator('#form-status').innerText()).includes('Заявка не отправлена'));
      check(`${prefix}: success gets focus`, await page.evaluate(() => document.activeElement.id), 'form-status');
      const summary = page.locator('summary').first();
      await summary.focus();
      await summary.press('Enter');
      check(`${prefix}: keyboard opens FAQ`, await page.locator('details').first().getAttribute('open') !== null);
      await summary.press('Enter');
      check(`${prefix}: keyboard closes FAQ`, await page.locator('details').first().getAttribute('open') === null);
      await page.locator('.hero-action .button').focus();
      const focusStyle = await page.locator('.hero-action .button').evaluate(el => ({ width: getComputedStyle(el).outlineWidth, style: getComputedStyle(el).outlineStyle }));
      check(`${prefix}: visible keyboard focus`, focusStyle, {width:'3px',style:'solid'});
      await page.waitForTimeout(250);
      await page.locator('.hero-action .button').hover();
      await page.waitForTimeout(250);
      const hover = await page.locator('.hero-action .button').evaluate(el => ({button:getComputedStyle(el).transform,arrow:getComputedStyle(el.querySelector('span')).transform}));
      check(`${prefix}: hover follows motion preference`, reducedMotion === 'reduce' ? hover.button === 'none' && hover.arrow === 'none' : hover.button !== 'none' && hover.arrow !== 'none');
      if (label === 'desktop') await snapshot(page, `focus-hover-${prefix}.png`);
      check(`${prefix}: no browser errors`, errors, []);
      check(`${prefix}: no failed resources`, failedRequests, []);
      check(`${prefix}: no external requests or data sends`, requests, []);
      report.matrix.push({ label, viewport:{width,height}, reducedMotion, url:page.url(), early, settled, section, hover, errors, failedRequests, requests });
      await context.close();
    }
  }

  const context = await browser.newContext({ viewport:{width:1280,height:900}, reducedMotion:'no-preference' });
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(60);
  check('live preference switch cancels motion', (await metrics(page)).animationCount, 0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(() => document.querySelector('#process').scrollIntoView({behavior:'instant'}));
  await page.waitForTimeout(40);
  check('live preference switch restores future section motion', (await metrics(page)).animationCount > 0);
  await context.close();

  const noJS = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  const noJSPage = await noJS.newPage();
  await noJSPage.goto(pathToFileURL(path.join(root,'index.html')).href);
  check('no-JS: heading visible', await noJSPage.locator('h1').isVisible());
  check('no-JS: form stays disabled and no send enabled', await noJSPage.locator('#demo-button').isDisabled());
  check('no-JS: all sections present', await noJSPage.locator('main section').count(), 6);
  await snapshot(noJSPage,'no-js-mobile.png');
  await noJS.close();
  await browser.close();
  report.sourceAfter = hashes(source);
  check('original source unchanged', report.sourceAfter, report.sourceBefore);
  for (const file of ['index.html','favicon.svg','social-preview.svg']) check(`protected file byte-identical: ${file}`, report.candidate[file], report.sourceBefore[file]);
  report.summary = {passed:report.checks.filter(x=>x.status==='PASS').length,failed:report.checks.filter(x=>x.status==='FAIL').length};
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({summary:report.summary,failures:report.checks.filter(x=>x.status==='FAIL')},null,2));
})().catch(e=>{fs.writeFileSync(path.join(out,'verification-failure.txt'),e.stack);console.error(e);process.exitCode=1;});
