'use strict';
const { chromium } = require('C:/Users/rust/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = __dirname, out = path.join(root,'evidence'), url = pathToFileURL(path.join(root,'index.html')).href;
const report = {createdAt:new Date().toISOString(),checks:[],captures:[]};
const check = (name,ok,observed) => report.checks.push({name,status:ok?'PASS':'FAIL',observed});
async function capture(page,name) {
  const file=path.join(out,name);
  await page.screenshot({path:file,animations:'allow'});
  report.captures.push({file:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),visuallyInspected:false});
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  for(const [name,width,height] of [['narrow',320,568],['tablet',768,1024],['wide',1920,1080]]){
    const page=await browser.newPage({viewport:{width,height}});
    await page.goto(url); await page.waitForTimeout(800);
    await capture(page,`after-${name}.png`);
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(url); await page.waitForTimeout(800);
  await page.evaluate(()=>document.querySelector('#process').scrollIntoView({behavior:'instant'}));
  await page.waitForTimeout(40);
  const first=await page.evaluate(()=>document.querySelector('.steps li').getAnimations().length);
  check('first entry runs step motion',first>0,first);
  await page.waitForTimeout(700);
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'})); await page.waitForTimeout(60);
  await page.evaluate(()=>document.querySelector('#process').scrollIntoView({behavior:'instant'})); await page.waitForTimeout(60);
  const repeat=await page.evaluate(()=>document.querySelector('.steps li').getAnimations().length);
  check('repeat entry does not replay',repeat===0,repeat);
  await capture(page,'process-desktop.png');
  await page.goto(url); await page.locator('.hero-action .button').focus();
  const focus=await page.evaluate(()=>({transform:getComputedStyle(document.querySelector('.hero-bottom')).transform,opacity:getComputedStyle(document.querySelector('.hero-action')).opacity}));
  check('focus interrupts ancestor entrance',focus.transform==='none'&&focus.opacity==='1',focus);
  await page.goto(url+'#contact'); await page.waitForTimeout(900);
  const anchor=await page.evaluate(()=>({count:document.querySelector('#contact-form').getAnimations().length,top:document.querySelector('#contact').getBoundingClientRect().top}));
  check('direct anchor contact is static',anchor.count===0,anchor);
  check('direct anchor reaches visible contact section',anchor.top>=-2&&anchor.top<450,anchor);
  await page.locator('#demo-button').click(); await capture(page,'form-errors-desktop.png');
  await page.locator('#name').fill('Тест');await page.locator('#email').fill('test@example.com');await page.locator('#demo-button').click();await capture(page,'form-success-desktop.png');
  await page.close();
  for(const kind of ['no-animate','no-observer']){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.addInitScript(kind=>{if(kind==='no-animate')Element.prototype.animate=undefined;else window.IntersectionObserver=undefined;},kind);
    const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url);await p.waitForTimeout(800);
    const state=await p.evaluate(()=>({opacity:getComputedStyle(document.querySelector('h1')).opacity,heading:getComputedStyle(document.querySelector('h1')).transform,enabled:!document.querySelector('#demo-button').disabled}));
    check(`${kind}: visible static fallback and form`,state.opacity==='1'&&state.heading==='none'&&state.enabled,state);
    check(`${kind}: no errors`,errors.length===0,errors);
    await context.close();
  }
  await browser.close();
  report.summary={passed:report.checks.filter(x=>x.status==='PASS').length,failed:report.checks.filter(x=>x.status==='FAIL').length};
  fs.writeFileSync(path.join(out,'edge-verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
