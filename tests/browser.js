/* Real-browser checks: rendering, responsiveness, console errors, interactions.
   Run: node tests/browser.js  (requires: npx playwright install chromium) */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function ok(cond, label, extra) {
  if (cond) pass++;
  else { fail++; failures.push(label + (extra ? ' :: ' + extra : '')); }
}

const PAGES = ['index.html', 'word-counter.html', 'json-formatter.html', 'text-cleaner.html', 'unit-converter.html'];
const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 640 },
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 900 },
  { name: 'desktop-1920', width: 1920, height: 1080 }
];

(async () => {
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

    for (const p of PAGES) {
      consoleErrors.length = 0;
      await page.goto('file://' + path.join(ROOT, p), { waitUntil: 'load' });
      await page.waitForTimeout(150);

      ok(consoleErrors.length === 0, p + ' @' + vp.name + ': no console errors', consoleErrors.join(' | '));

      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const wide = [];
        document.querySelectorAll('body *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1)) {
            const style = window.getComputedStyle(el);
            if (style.overflowX === 'auto' || style.overflowX === 'scroll') return;
            let p = el.parentElement, scrollable = false;
            while (p) {
              const ps = window.getComputedStyle(p);
              if (ps.overflowX === 'auto' || ps.overflowX === 'scroll' || ps.overflow === 'auto') { scrollable = true; break; }
              p = p.parentElement;
            }
            if (scrollable) return;
            wide.push(el.tagName + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : ''));
          }
        });
        return {
          scrollW: de.scrollWidth,
          clientW: de.clientWidth,
          wide: wide.slice(0, 6)
        };
      });
      ok(overflow.scrollW <= overflow.clientW + 1,
        p + ' @' + vp.name + ': no horizontal page overflow',
        'scrollW=' + overflow.scrollW + ' clientW=' + overflow.clientW + ' els=' + overflow.wide.join(','));

      const tappable = await page.evaluate(() => {
        const small = [];
        document.querySelectorAll('button, .btn, a[href]').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.height > 0 && (r.height < 24 || r.width < 24)) small.push((el.id || el.textContent || '').trim().slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
        });
        return small;
      });
      ok(tappable.length === 0, p + ' @' + vp.name + ': interactive elements are big enough', tappable.join(', '));
    }
    await context.close();
  }

  /* ---- functional smoke tests in a real browser ---- */
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // home search navigates
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.fill('#toolSearch', 'unit');
  await page.waitForTimeout(200);
  ok((await page.textContent('.tool-card h3')).includes('Unit'), 'browser: home search finds Unit Converter');
  await page.click('.tool-card');
  await page.waitForLoadState('load');
  ok(page.url().endsWith('unit-converter.html'), 'browser: search result navigates to the tool');

  // nav works from a tool page
  await page.click('[data-nav] a:has-text("Word Counter")');
  await page.waitForLoadState('load');
  ok(page.url().endsWith('word-counter.html'), 'browser: header nav navigates');
  ok((await page.textContent('.page-head h1')).includes('Word Counter'), 'browser: word counter page loaded');

  // word counter live counting
  await page.fill('#text', 'Hello world. Hello again!');
  await page.waitForTimeout(200);
  ok((await page.textContent('#s-words')) === '4', 'browser: word counter updates live');
  ok((await page.textContent('#s-unique')) === '3', 'browser: word counter unique words');

  // json formatter
  await page.click('[data-nav] a:has-text("JSON Formatter")');
  await page.waitForLoadState('load');
  await page.fill('#input', '{"b":2,"a":1,}');
  await page.waitForTimeout(400);
  ok((await page.getAttribute('#status', 'class')).includes('err'), 'browser: json invalid detected while typing');
  ok((await page.textContent('#status')).includes('line'), 'browser: json error mentions line');
  await page.fill('#input', '{"b":2,"a":[1,2]}');
  await page.click('#formatBtn');
  await page.waitForTimeout(100);
  const out = await page.inputValue('#output');
  ok(out.split('\n').length > 3, 'browser: json formatted output is multi-line');
  ok(JSON.parse(out).a[1] === 2, 'browser: json output is valid');
  await page.click('#minifyBtn');
  await page.waitForTimeout(100);
  ok((await page.inputValue('#output')) === '{"b":2,"a":[1,2]}', 'browser: json minify works');

  // text cleaner
  await page.click('[data-nav] a:has-text("Text Cleaner")');
  await page.waitForLoadState('load');
  await page.fill('#input', '  a   b  \n\n\n  a   b  \n');
  await page.click('#cleanAllBtn');
  await page.waitForTimeout(200);
  const cleaned = await page.inputValue('#output');
  ok(cleaned === 'a b\na b', 'browser: text cleaner works end to end', JSON.stringify(cleaned));
  await page.click('button[data-act="dedupe"]');
  await page.waitForTimeout(100);
  ok((await page.inputValue('#output')) === 'a b', 'browser: duplicate lines removed after cleaning');
  await page.fill('#input', '<b>bold</b> https://x.test/a');
  await page.click('button[data-act="urls"]');
  await page.waitForTimeout(100);
  ok(!(await page.inputValue('#output')).includes('https'), 'browser: text cleaner strips URLs');

  // unit converter
  await page.click('[data-nav] a:has-text("Unit Converter")');
  await page.waitForLoadState('load');
  await page.selectOption('#category', 'temperature');
  await page.selectOption('#fromUnit', 'C');
  await page.selectOption('#toUnit', 'F');
  await page.fill('#fromValue', '100');
  await page.waitForTimeout(100);
  ok((await page.inputValue('#toValue')) === '212', 'browser: 100C = 212F');
  await page.click('#swapBtn');
  await page.waitForTimeout(100);
  ok((await page.inputValue('#toValue')) === '100', 'browser: swap works');
  await page.selectOption('#category', 'data');
  await page.waitForTimeout(100);
  ok((await page.$$('#allBody tr')).length === 10, 'browser: data table lists 10 units');

  // clipboard button must not throw when the API is unavailable
  await page.click('#copyBtn');
  await page.waitForTimeout(100);
  ok(errors.length === 0, 'browser: no console errors during interactions', errors.join(' | '));

  /* ---- large input performance in a real engine ---- */
  const bigText = 'lorem ipsum dolor sit amet consectetur '.repeat(20000);
  await page.goto('file://' + path.join(ROOT, 'word-counter.html'));
  const t0 = Date.now();
  await page.fill('#text', bigText);
  await page.waitForTimeout(600);
  ok((await page.textContent('#s-words')).replace(/,/g, '') === '120000', 'browser: large text counted');
  ok(Date.now() - t0 < 6000, 'browser: large text handled quickly', (Date.now() - t0) + 'ms');

  await page.goto('file://' + path.join(ROOT, 'json-formatter.html'));
  const items = Array.from({ length: 5000 }, (_, i) => ({ id: i, tag: 'x' + i, nested: { a: i, b: [i, i + 1] } }));
  const bigJson = JSON.stringify({ list: items });
  const t1 = Date.now();
  await page.fill('#input', bigJson);
  await page.click('#formatBtn');
  await page.waitForTimeout(500);
  const fmtMs = Date.now() - t1;
  ok((await page.getAttribute('#status', 'class')).includes('ok'), 'browser: large json formats');
  ok(fmtMs < 8000, 'browser: large json formats quickly', fmtMs + 'ms');
  const parsed = JSON.parse(await page.inputValue('#output'));
  ok(parsed.list.length === 5000, 'browser: large json output re-parses');

  /* ---- offline: no network requests ---- */
  const reqs = [];
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  p2.on('request', (r) => { if (!r.url().startsWith('file://')) reqs.push(r.url()); });
  for (const p of PAGES) await p2.goto('file://' + path.join(ROOT, p), { waitUntil: 'load' });
  ok(reqs.length === 0, 'browser: pages make zero external requests', reqs.join(', '));

  await browser.close();
  console.log('\nPassed: ' + pass + '   Failed: ' + fail);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('All browser tests passed.');
})();
