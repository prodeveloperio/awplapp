/* Headless test suite using jsdom. Run: node tests/run.js */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, label, extra) {
  if (cond) { pass++; } else { fail++; failures.push(label + (extra ? ' :: ' + extra : '')); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}
function near(actual, expected, label, tol) {
  tol = tol || 1e-9;
  ok(typeof actual === 'number' && Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)), label,
    'expected ~' + expected + ', got ' + actual);
}

function load(page) {
  const file = path.join(ROOT, page);
  const html = fs.readFileSync(file, 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.stack || e.message)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://example.test/' + page,
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const { window } = dom;
  // Execute assets/app.js first, then the page's inline script, in document order.
  window.eval(fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8'));
  Array.from(window.document.querySelectorAll('script:not([src])')).forEach((s) => {
    if (s.textContent.trim()) window.eval(s.textContent);
  });
  if (window.document.readyState === 'complete' || window.document.readyState === 'interactive') {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  }
  return { dom, window, errors };
}

function fire(window, el, type) {
  el.dispatchEvent(new window.Event(type, { bubbles: true }));
}
function click(window, el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}
function setValue(window, el, value) {
  el.value = value;
  fire(window, el, 'input');
  fire(window, el, 'change');
}
function flush(window) {
  return new Promise((r) => window.setTimeout(r, 0));
}
function flushTimers(window, ms) {
  return new Promise((r) => window.setTimeout(r, ms));
}
function byId(window, id) {
  return window.document.getElementById(id);
}

/* ---------------- index.html ---------------- */
async function testIndex() {
  const { window, errors } = load('index.html');
  await flush(window);
  const doc = window.document;
  eq(doc.querySelectorAll('.tool-card').length, 4, 'index: 4 tool cards render');
  const hrefs = Array.from(doc.querySelectorAll('.tool-card')).map((a) => a.getAttribute('href'));
  ['word-counter.html', 'json-formatter.html', 'text-cleaner.html', 'unit-converter.html']
    .forEach((h) => ok(hrefs.indexOf(h) > -1, 'index: card links to ' + h));
  const search = byId(window, 'toolSearch');
  setValue(window, search, 'json');
  await flushTimers(window, 200);
  eq(doc.querySelectorAll('.tool-card').length, 1, 'index: search "json" -> 1 card');
  eq(doc.querySelector('.tool-card').getAttribute('href'), 'json-formatter.html', 'index: json search result');

  setValue(window, search, 'zzzz');
  await flushTimers(window, 200);
  eq(doc.querySelectorAll('.tool-card').length, 0, 'index: no-match search -> 0 cards');
  ok(byId(window, 'noResults').hidden === false, 'index: "no results" message shown');

  setValue(window, search, '  CONVERT  ');
  await flushTimers(window, 200);
  eq(doc.querySelectorAll('.tool-card').length, 1, 'index: search is case/whitespace insensitive');

  setValue(window, search, 'text');
  await flushTimers(window, 200);
  ok(doc.querySelectorAll('.tool-card').length >= 2, 'index: keyword search "text" matches >= 2');

  setValue(window, search, '');
  await flushTimers(window, 200);
  eq(doc.querySelectorAll('.tool-card').length, 4, 'index: clearing search restores all cards');

  ok(errors.length === 0, 'index: no console errors', errors.join(' | '));
  ok(doc.querySelectorAll('[data-nav] a').length === 5, 'index: nav has home + 4 tools');
  ok(doc.querySelector('[data-footer-year]').textContent.length === 4, 'index: footer year rendered');
}

/* ---------------- word-counter.html ---------------- */
async function testWordCounter() {
  const { window, errors } = load('word-counter.html');
  await flush(window);
  const doc = window.document;
  const text = byId(window, 'text');
  eq(byId(window, 's-words').textContent, '0', 'wc: initial words 0');

  setValue(window, text, 'Hello world. This is a test!');
  await flushTimers(window, 200);
  eq(byId(window, 's-words').textContent, '6', 'wc: word count (whitespace tokens)');
  eq(byId(window, 's-chars').textContent, '28', 'wc: character count');
  eq(byId(window, 's-sentences').textContent, '2', 'wc: sentence count');
  eq(byId(window, 's-paragraphs').textContent, '1', 'wc: paragraph count');
  eq(byId(window, 's-unique').textContent, '6', 'wc: unique words ignore punctuation and case');

  setValue(window, text, 'one two one\n\nthree');
  await flushTimers(window, 200);
  eq(byId(window, 's-words').textContent, '4', 'wc: multi-line word count');
  eq(byId(window, 's-paragraphs').textContent, '2', 'wc: paragraph split on blank line');
  eq(byId(window, 's-unique').textContent, '3', 'wc: unique ignores case');

  click(window, byId(window, 'demoBtn'));
  await flushTimers(window, 200);
  ok(text.value.length > 100, 'wc: sample text loaded');
  ok(Number(byId(window, 's-words').textContent.replace(/,/g, '')) > 20, 'wc: sample word count > 20');

  click(window, byId(window, 'clearBtn'));
  await flushTimers(window, 200);
  eq(byId(window, 's-words').textContent, '0', 'wc: clear resets counts');

  // Live toggle
  setValue(window, text, 'alpha beta gamma');
  await flushTimers(window, 200);
  const wordsBefore = byId(window, 's-words').textContent;
  byId(window, 'liveUpdate').checked = false;
  fire(window, byId(window, 'liveUpdate'), 'change');
  setValue(window, text, 'x');
  await flushTimers(window, 200);
  eq(byId(window, 's-words').textContent, wordsBefore, 'wc: live update off keeps old count');
  byId(window, 'liveUpdate').checked = true;
  fire(window, byId(window, 'liveUpdate'), 'change');
  await flushTimers(window, 200);
  eq(byId(window, 's-words').textContent, '1', 'wc: live update on resumes counting');

  // Large input performance
  const big = 'lorem ipsum dolor sit amet '.repeat(20000);
  const t0 = Date.now();
  setValue(window, text, big);
  await flushTimers(window, 400);
  const elapsed = Date.now() - t0;
  eq(byId(window, 's-words').textContent, '100,000', 'wc: large input word count');
  ok(elapsed < 4000, 'wc: large input processed quickly', elapsed + 'ms');

  setValue(window, text, '   ');
  await flushTimers(window, 200);
  eq(byId(window, 's-words').textContent, '0', 'wc: whitespace-only input');

  ok(errors.length === 0, 'wc: no console errors', errors.join(' | '));
}

/* ---------------- json-formatter.html ---------------- */
async function testJson() {
  const { window, errors } = load('json-formatter.html');
  await flush(window);
  const doc = window.document;
  const input = byId(window, 'input');
  const output = byId(window, 'output');
  const status = byId(window, 'status');

  setValue(window, input, '{"b":1,"a":[1,2,{"z":true,"y":null}],"c":"x"}');
  click(window, byId(window, 'formatBtn'));
  await flushTimers(window, 50);
  eq(status.className, 'msg ok', 'json: valid input shows ok status');
  ok(output.value.indexOf('\n') > -1, 'json: format adds line breaks');
  eq(byId(window, 'j-keys').textContent, '5', 'json: total key count (incl. nested)');
  eq(byId(window, 'j-arrays').textContent, '1', 'json: array count');
  eq(byId(window, 'j-objects').textContent, '2', 'json: object count');
  eq(byId(window, 'j-numbers').textContent, '3', 'json: number count');
  eq(byId(window, 'j-booleans').textContent, '2', 'json: bool+null count');
  eq(byId(window, 'j-depth').textContent, '4', 'json: max depth');
  ok(JSON.parse(output.value).a[2].z === true, 'json: formatted output re-parses');
  ok(/^  "b": 1,$/m.test(output.value), 'json: nested lines are indented per level');
  ok(/\n      "z": true/m.test(output.value), 'json: third level indented correctly');

  click(window, byId(window, 'minifyBtn'));
  await flushTimers(window, 50);
  eq(output.value, '{"b":1,"a":[1,2,{"z":true,"y":null}],"c":"x"}', 'json: minify is compact and correct');

  byId(window, 'sortOrder').value = 'az';
  click(window, byId(window, 'sortBtn'));
  await flushTimers(window, 50);
  ok(output.value.indexOf('"a"') < output.value.indexOf('"b"'), 'json: sort keys ascending');
  ok(output.value.indexOf('"b"') < output.value.indexOf('"c"'), 'json: sort keys ascending (2)');
  byId(window, 'sortOrder').value = 'za';
  click(window, byId(window, 'sortBtn'));
  await flushTimers(window, 50);
  ok(output.value.indexOf('"c"') < output.value.indexOf('"b"'), 'json: sort keys descending');
  ok(output.value.indexOf('"b"') < output.value.indexOf('"a"'), 'json: sort keys descending (2)');

  // Tab indent
  byId(window, 'indent').value = 'tab';
  setValue(window, input, '{"a":1}');
  click(window, byId(window, 'formatBtn'));
  await flushTimers(window, 50);
  ok(output.value.indexOf('\t') > -1, 'json: tab indentation used');
  byId(window, 'indent').value = '2';

  // HTML escaping
  byId(window, 'escapeMode').value = 'html';
  setValue(window, input, '{"t":"<b> & \\"x\\" </b>"}');
  click(window, byId(window, 'formatBtn'));
  await flushTimers(window, 50);
  ok(output.value.indexOf('\\u003c') > -1, 'json: escapes < for HTML');
  ok(JSON.parse(output.value).t === '<b> & "x" </b>', 'json: escaped output re-parses to original');
  byId(window, 'escapeMode').value = 'none';

  /* --- error cases --- */
  const badCases = [
    ['{"a":1,}', 'trailing comma'],
    ['{"a" 1}', 'missing colon'],
    ['{a:1}', 'unquoted key'],
    ["{'a':1}", 'single quotes'],
    ['[1,2', 'unclosed array'],
    ['{"a":1}}', 'trailing content'],
    ['undefined', 'undefined literal'],
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['01', 'leading zero'],
    ['.5', 'leading dot'],
    ['1.', 'trailing dot'],
    ['1e', 'bad exponent'],
    ['"unterminated', 'unterminated string'],
    ['"bad\\qescape"', 'bad escape'],
    ['"raw\ncontrol"', 'control char'],
    ['{"a":,}', 'missing value'],
    ['{,}', 'empty key position'],
    ['[1,,2]', 'double comma']
  ];
  for (const [bad, label] of badCases) {
    setValue(window, input, bad);
    byId(window, 'liveCheck').checked = false;
    click(window, byId(window, 'validateBtn'));
    await flushTimers(window, 30);
    ok(status.className === 'msg err', 'json: invalid input flagged -> ' + label,
      'got: ' + status.className + ' for ' + JSON.stringify(bad));
    ok(byId(window, 'errorBox').hidden === false, 'json: error box shown -> ' + label);
    ok(status.textContent.indexOf('line') > -1, 'json: error mentions line -> ' + label);
  }
  byId(window, 'liveCheck').checked = true;

  setValue(window, input, '');
  click(window, byId(window, 'validateBtn'));
  await flushTimers(window, 30);
  eq(status.className, 'msg warn', 'json: empty input warns gracefully');
  ok(byId(window, 'errorBox').hidden === true, 'json: empty input shows no error box');

  // Error caret/position accuracy for a known document
  setValue(window, input, '{\n  "a": 1,\n  "b": 2,\n  "c": ,x\n}');
  click(window, byId(window, 'validateBtn'));
  await flushTimers(window, 30);
  ok(/line 4/.test(status.textContent), 'json: error reports the correct line number', status.textContent);

  // Valid edge cases
  const goodCases = [
    ['{}', 'empty object'],
    ['[]', 'empty array'],
    ['[[[[1]]]]', 'nested arrays'],
    ['"\\u00e9\\n\\t\\"x\\""', 'escapes'],
    ['-0.5e+10', 'scientific notation'],
    ['12345678901234567890123', 'big number'],
    ['﻿{"a":1}', 'BOM prefix'],
    ['  \n {"a":1}  \n ', 'surrounding whitespace'],
    ['[1,2,3]', 'simple array'],
    ['"plain"', 'top level string']
  ];
  for (const [good, label] of goodCases) {
    setValue(window, input, good);
    byId(window, 'liveCheck').checked = false;
    click(window, byId(window, 'validateBtn'));
    await flushTimers(window, 30);
    ok(status.className === 'msg ok', 'json: valid input accepted -> ' + label,
      'got: ' + status.textContent);
  }
  byId(window, 'liveCheck').checked = true;

  // Big numbers keep precision (not turned into exponent form)
  setValue(window, input, '{"n":12345678901234567890}');
  click(window, byId(window, 'formatBtn'));
  await flushTimers(window, 30);
  ok(output.value.indexOf('12345678901234567890') > -1, 'json: large number preserved verbatim', output.value);
  click(window, byId(window, 'minifyBtn'));
  await flushTimers(window, 30);
  ok(output.value.indexOf('1.2345678901234567e+19') === -1, 'json: minified number not converted to exponent');

  // Deep nesting
  let deep = '';
  for (let i = 0; i < 400; i++) deep += '[';
  deep += '1';
  for (let i = 0; i < 400; i++) deep += ']';
  setValue(window, input, deep);
  click(window, byId(window, 'validateBtn'));
  await flushTimers(window, 50);
  ok(status.className === 'msg ok', 'json: 400-level nesting is accepted', status.textContent);

  setValue(window, input, '[' .repeat(2000) + ']'.repeat(2000));
  click(window, byId(window, 'validateBtn'));
  await flushTimers(window, 100);
  ok(status.className === 'msg err', 'json: excessive nesting rejected gracefully', status.textContent);

  // Large valid document
  const arr = [];
  for (let i = 0; i < 20000; i++) arr.push({ id: i, name: 'item' + i, tags: ['a', 'b'], ok: i % 2 === 0 });
  const bigJson = JSON.stringify({ items: arr });
  const t0 = Date.now();
  setValue(window, input, bigJson);
  byId(window, 'liveCheck').checked = false;
  click(window, byId(window, 'formatBtn'));
  const elapsed = Date.now() - t0;
  await flushTimers(window, 50);
  eq(byId(window, 'j-keys').textContent.replace(/,/g, ''), '80001', 'json: large doc key count');
  eq(byId(window, 'j-objects').textContent.replace(/,/g, ''), '20001', 'json: large doc object count');
  ok(elapsed < 5000, 'json: large document formatted quickly', elapsed + 'ms');
  ok(JSON.parse(output.value).items.length === 20000, 'json: large document output re-parses');
  byId(window, 'liveCheck').checked = true;

  // Sample / clear / swap
  click(window, byId(window, 'sampleBtn'));
  await flushTimers(window, 30);
  ok(status.className === 'msg ok', 'json: sample loads valid JSON', status.textContent);
  click(window, byId(window, 'swapBtn'));
  await flushTimers(window, 30);
  ok(status.className === 'msg ok', 'json: swap result back to input works');
  click(window, byId(window, 'clearBtn'));
  await flushTimers(window, 30);
  eq(input.value, '', 'json: clear empties input');
  eq(output.value, '', 'json: clear empties output');
  ok(status.hidden === true, 'json: clear hides status');

  // Empty input guard
  click(window, byId(window, 'formatBtn'));
  await flushTimers(window, 30);
  eq(status.className, 'msg warn', 'json: empty input warns instead of throwing');

  ok(errors.length === 0, 'json: no console errors', errors.join(' | '));
}

/* ---------------- text-cleaner.html ---------------- */
async function testTextCleaner() {
  const { window, errors } = load('text-cleaner.html');
  await flush(window);
  const doc = window.document;
  const input = byId(window, 'input');
  const output = byId(window, 'output');
  const status = byId(window, 'status');

  function act(name) {
    click(window, doc.querySelector('button[data-act="' + name + '"]'));
  }

  setValue(window, input, 'hello     world    test');
  act('spaces');
  eq(output.value, 'hello world test', 'tc: collapse spaces');

  setValue(window, input, '  a  \n  b  \n');
  act('trim');
  eq(output.value, 'a\nb\n', 'tc: trim lines');

  setValue(window, input, 'a\tb');
  act('tabs');
  eq(output.value, 'a  b', 'tc: tabs to spaces');

  setValue(window, input, 'a\n\n\n\nb\n\n');
  act('blankAll');
  eq(output.value, 'a\nb', 'tc: remove all blank lines');

  setValue(window, input, 'a\n\n\n\nb');
  act('blankDup');
  eq(output.value, 'a\n\nb', 'tc: collapse multiple blank lines');

  setValue(window, input, '\n\n\na\nb\n\n\n');
  act('blankEdge');
  eq(output.value, 'a\nb', 'tc: trim blank lines at edges');

  setValue(window, input, 'x\ny\nx\nz\ny');
  act('dedupe');
  eq(output.value, 'x\ny\nz', 'tc: remove duplicate lines keeps first');

  setValue(window, input, 'banana\napple\nCherry');
  act('sortAsc');
  eq(output.value, 'apple\nbanana\nCherry', 'tc: sort A-Z case-insensitive');

  act('sortDesc');
  eq(output.value, 'Cherry\nbanana\napple', 'tc: sort Z-A');

  setValue(window, input, 'bb\na\nccc');
  act('sortLen');
  eq(output.value, 'a\nbb\nccc', 'tc: sort by length');

  setValue(window, input, '1\n2\n3');
  act('reverse');
  eq(output.value, '3\n2\n1', 'tc: reverse lines');

  act('numbers');
  eq(output.value, '1. 3\n2. 2\n3. 1', 'tc: number lines');
  act('unnumber');
  eq(output.value, '3\n2\n1', 'tc: remove line numbers');

  setValue(window, input, 'aa bb\n\ncc dd');
  act('join');
  eq(output.value, 'aa bb\n\ncc dd', 'tc: join lines within paragraph');
  setValue(window, input, 'aa bb\ncc dd');
  act('join');
  eq(output.value, 'aa bb cc dd', 'tc: join lines makes single paragraph');

  setValue(window, input, 'The quick brown fox jumps over the lazy dog and keeps running for a while until it finally stops');
  act('wrap76');
  ok(output.value.split('\n').length > 1, 'tc: wrap at 76 creates multiple lines', JSON.stringify(output.value));
  ok(output.value.split('\n').every((l) => l.length <= 76), 'tc: wrapped lines are <= 76 chars');
  ok(output.value.replace(/\n/g, ' ') === 'The quick brown fox jumps over the lazy dog and keeps running for a while until it finally stops',
    'tc: wrapping preserves the text');
  setValue(window, input, 'short line');
  act('wrap100');
  eq(output.value, 'short line', 'tc: wrap leaves short text untouched');
  act('wrap76');
  eq(output.value, 'short line', 'tc: wrap leaves short text untouched (76)');

  setValue(window, input, 'Hello World Foo');
  act('lower');
  eq(output.value, 'hello world foo', 'tc: lowercase');
  act('upper');
  eq(output.value, 'HELLO WORLD FOO', 'tc: uppercase');
  act('title');
  eq(output.value, 'Hello World Foo', 'tc: title case');
  act('sentence');
  eq(output.value, 'Hello world foo', 'tc: sentence case');
  act('toggle');
  eq(output.value, 'hELLO WORLD FOO', 'tc: toggle case flips every letter of the current text');

  setValue(window, input, 'Hello World Foo');
  act('camel');
  eq(output.value, 'helloWorldFoo', 'tc: camelCase');
  setValue(window, input, 'Hello World Foo');
  act('snake');
  eq(output.value, 'hello_world_foo', 'tc: snake_case');
  setValue(window, input, 'Hello World Foo');
  act('kebab');
  eq(output.value, 'hello-world-foo', 'tc: kebab-case');
  setValue(window, input, '  Hello   big  World  ');
  act('camel');
  eq(output.value, 'helloBigWorld', 'tc: camelCase normalises spacing and case');
  setValue(window, input, 'a, b; c? d! e');
  act('snake');
  eq(output.value, 'a_b_c_d_e', 'tc: snake_case drops punctuation');

  setValue(window, input, 'Title: <b>Bold</b> and <i>italic</i> <script>bad()</script> end');
  act('html');
  ok(output.value.indexOf('<b>') === -1 && output.value.indexOf('bold') === -1 && /b/i.test(output.value), 'tc: strips HTML tags');

  setValue(window, input, 'Tom &amp; Jerry &lt;3 &#65; &#x42; &nbsp;end');
  act('entities');
  eq(output.value.replace(/ +/g, ' ').trim(), 'Tom & Jerry <3 A B end', 'tc: decode HTML entities');

  setValue(window, input, 'go to https://example.com/x?a=1 and www.test.org or foo.com now');
  act('urls');
  ok(output.value.indexOf('http') === -1 && output.value.indexOf('www.test.org') === -1 && output.value.indexOf('foo.com') === -1,
    'tc: removes URLs', JSON.stringify(output.value));
  ok(output.value.indexOf('go to') > -1, 'tc: keeps surrounding text');

  setValue(window, input, 'mail me at jane.doe@example.com please');
  act('emails');
  ok(output.value.indexOf('@') === -1, 'tc: removes emails');

  setValue(window, input, 'call +1 (555) 123-4567 now');
  act('phone');
  ok(!/123-4567/.test(output.value), 'tc: removes phone numbers', JSON.stringify(output.value));

  setValue(window, input, 'a1b2c3');
  act('digits');
  eq(output.value, 'abc', 'tc: removes digits');

  setValue(window, input, 'Hi #@$%^* there');
  act('special');
  eq(output.value, 'Hi there', 'tc: removes special characters but keeps words separated');
  setValue(window, input, 'Hello, world! (test) 50% $9');
  act('special');
  eq(output.value, 'Hello, world! (test) 50 9', 'tc: keeps sentence punctuation, strips symbols like % and $');

  setValue(window, input, 'Ünïcödé têxt — ok');
  act('special');
  eq(output.value, 'Ünïcödé têxt — ok', 'tc: keeps accented letters and dashes');

  setValue(window, input, 'a"b\'c!d?e');
  act('punct');
  eq(output.value.replace(/ /g, ''), 'abcde', 'tc: removes punctuation');

  setValue(window, input, 'Nice 🎉 emoji ✨ here');
  act('emoji');
  ok(!/[🎉✨]/.test(output.value), 'tc: removes emoji', JSON.stringify(output.value));
  ok(output.value.indexOf('Nice') > -1 && output.value.indexOf('here') > -1, 'tc: keeps text around emoji');
  setValue(window, input, 'one 🎉\n\ntwo ✨');
  act('emoji');
  ok(output.value.indexOf('\n') > -1, 'tc: emoji removal keeps line breaks', JSON.stringify(output.value));
  setValue(window, input, 'a🎉   b');
  act('emoji');
  ok(output.value === 'a b', 'tc: emoji removal collapses leftover spaces', JSON.stringify(output.value));

  setValue(window, input, '# Title\n**bold** and `code` and [link](http://x.com)\n- item');
  act('md');
  ok(output.value.indexOf('**') === -1 && output.value.indexOf('`') === -1 && output.value.indexOf('](') === -1,
    'tc: strips markdown syntax', JSON.stringify(output.value));
  ok(output.value.indexOf('Title') > -1, 'tc: keeps markdown text content');

  setValue(window, input, 'a\n   \nb');
  act('emptyLines');
  eq(output.value, 'a\nb', 'tc: remove empty lines only');
  setValue(window, input, 'a\n  \nb');
  act('emptyChars');
  eq(output.value, 'a\nb', 'tc: remove whitespace-only lines');

  // Clean everything
  setValue(window, input, '<h1>Title</h1>\n\nVisit https://a.com   now\n\n\n\n**bold**  text  here!!\nJANE@x.com');
  click(window, byId(window, 'cleanAllBtn'));
  await flushTimers(window, 30);
  ok(output.value.indexOf('<h1>') === -1, 'tc: clean everything removes HTML');
  ok(output.value.indexOf('https') === -1, 'tc: clean everything removes URLs');
  ok(output.value.indexOf('@') === -1, 'tc: clean everything removes emails');
  ok(output.value.indexOf('**') === -1, 'tc: clean everything removes markdown');
  ok(!/\n{3,}/.test(output.value), 'tc: clean everything collapses blank lines');
  ok(/Title/.test(output.value) && /now/.test(output.value), 'tc: clean everything keeps the content');
  ok(output.value.split('\n').length >= 2, 'tc: clean everything keeps line structure', JSON.stringify(output.value));
  ok(status.className === 'msg ok', 'tc: clean everything reports status');

  // Empty input guards
  input.value = '';
  output.value = '';
  act('spaces');
  eq(status.className, 'msg warn', 'tc: action on empty input warns');
  click(window, byId(window, 'cleanAllBtn'));
  eq(status.className, 'msg warn', 'tc: cleanAll on empty input warns');
  click(window, byId(window, 'copyBtn'));
  eq(status.className, 'msg warn', 'tc: copy with no result warns');
  click(window, byId(window, 'downloadBtn'));
  eq(status.className, 'msg warn', 'tc: download with no result warns');
  click(window, byId(window, 'undoBtn'));
  eq(status.className, 'msg warn', 'tc: undo with no import warns');

  // Sample + move back
  click(window, byId(window, 'sampleBtn'));
  await flushTimers(window, 30);
  ok(input.value.length > 50, 'tc: sample loaded');
  setValue(window, input, 'test  text');
  act('spaces');
  click(window, byId(window, 'toInputBtn'));
  await flushTimers(window, 30);
  eq(input.value, 'test text', 'tc: move result back to input');
  eq(output.value, '', 'tc: output cleared after move');

  // Shuffle keeps the same multiset of lines
  setValue(window, input, 'a\nb\nc\nd');
  act('shuffle');
  eq(output.value.split('\n').sort().join(','), 'a,b,c,d', 'tc: shuffle preserves all lines');

  // Large text
  const bigLines = [];
  for (let i = 0; i < 30000; i++) bigLines.push('line ' + i + '    with   spaces');
  const big = bigLines.join('\n');
  const t0 = Date.now();
  setValue(window, input, big);
  click(window, byId(window, 'cleanAllBtn'));
  const elapsed = Date.now() - t0;
  await flushTimers(window, 400);
  eq(byId(window, 't-lines').textContent.replace(/,/g, ''), '30000', 'tc: large input line count');
  ok(output.value.indexOf('    ') === -1, 'tc: large input spaces collapsed');
  ok(elapsed < 8000, 'tc: large text processed quickly', elapsed + 'ms');

  ok(errors.length === 0, 'tc: no console errors', errors.join(' | '));
}

/* ---------------- unit-converter.html ---------------- */
async function testConverter() {
  const { window, errors } = load('unit-converter.html');
  await flush(window);
  const doc = window.document;
  const category = byId(window, 'category');
  const fromValue = byId(window, 'fromValue');
  const fromUnit = byId(window, 'fromUnit');
  const toUnit = byId(window, 'toUnit');
  const toValue = byId(window, 'toValue');

  /* The page formats results for humans, so compare numerically with a
     tolerance instead of matching the exact string. */
  function eqNum(actualStr, expected, label, tol) {
    const v = parseFloat(String(actualStr).replace(/,/g, ''));
    ok(isFinite(v) && Math.abs(v - expected) <= (tol || 1e-9) * Math.max(1, Math.abs(expected)),
      label, 'expected ' + expected + ', got ' + actualStr);
  }

  function convert(v, f, t) {
    if (f) { fromUnit.value = f; toUnit.value = t; }
    setValue(window, fromValue, String(v));
    return toValue.value;
  }

  function cat(c) {
    category.value = c;
    fire(window, category, 'change');
  }

  cat('length');
  eqNum(convert(1, 'm', 'ft'), 3.280839895013123, 'uc: 1 m = 3.280839895013123 ft');
  eqNum(convert(1, 'km', 'm'), 1000, 'uc: 1 km = 1000 m');
  eq(convert(1, 'km', 'm'), '1,000', 'uc: large results use thousand separators');
  eqNum(convert(1, 'mi', 'km'), 1.609344, 'uc: 1 mile = 1.609344 km');
  eqNum(convert(100, 'cm', 'm'), 1, 'uc: 100 cm = 1 m');
  eqNum(convert(1, 'in', 'cm'), 2.54, 'uc: 1 in = 2.54 cm');
  eq(convert(0, 'm', 'ft'), '0', 'uc: zero value');
  eqNum(convert(-5, 'm', 'ft'), -16.40419947506561, 'uc: negative value');
  eqNum(convert(1, 'm', 'm'), 1, 'uc: identity conversion');
  ok(/^1(\.0*)?e-0?9$/.test(convert(1, 'nm', 'm')), 'uc: tiny values use exponential form', convert(1, 'nm', 'm'));
  ok(/e\+/.test(convert(1, 'ly', 'nm')), 'uc: huge values use exponential form', convert(1, 'ly', 'nm'));

  cat('weight');
  eqNum(convert(1, 'kg', 'lb'), 2.2046226218487757, 'uc: 1 kg = 2.2046226218487757 lb');
  eqNum(convert(1, 'lb', 'g'), 453.59237, 'uc: 1 lb = 453.59237 g');
  eqNum(convert(1, 'oz', 'g'), 28.349523125, 'uc: 1 oz = 28.349523125 g');
  eqNum(convert(1, 't', 'kg'), 1000, 'uc: 1 tonne = 1000 kg');
  eqNum(convert(1, 'st', 'lb'), 14, 'uc: 1 stone = 14 lb');

  cat('temperature');
  eq(convert(0, 'C', 'F'), '32', 'uc: 0C = 32F');
  eq(convert(100, 'C', 'F'), '212', 'uc: 100C = 212F');
  eq(convert(32, 'F', 'C'), '0', 'uc: 32F = 0C');
  eq(convert(-40, 'C', 'F'), '-40', 'uc: -40C = -40F');
  eqNum(convert(0, 'C', 'K'), 273.15, 'uc: 0C = 273.15K');
  eqNum(convert(0, 'K', 'C'), -273.15, 'uc: 0K = -273.15C');
  eqNum(convert(98.6, 'F', 'C'), 37, 'uc: 98.6F = 37C');
  eqNum(convert(0, 'C', 'R'), 491.67, 'uc: 0C = 491.67R');
  eqNum(convert(37, 'C', 'F'), 98.6, 'uc: 37C = 98.6F');
  eqNum(convert(25, 'C', 'K'), 298.15, 'uc: 25C = 298.15K');

  cat('area');
  eqNum(convert(1, 'ha', 'm2'), 10000, 'uc: 1 hectare = 10000 m2');
  eqNum(convert(1, 'ac', 'm2'), 4046.8564224, 'uc: 1 acre = 4046.8564224 m2');
  eqNum(convert(1, 'ft2', 'm2'), 0.09290304, 'uc: 1 ft2 = 0.09290304 m2');
  eqNum(convert(1, 'mi2', 'km2'), 2.589988110336, 'uc: 1 mi2 = 2.589988110336 km2');
  eqNum(convert(100, 'm2', 'ha'), 0.01, 'uc: 100 m2 = 0.01 ha');

  cat('volume');
  eqNum(convert(1, 'l', 'ml'), 1000, 'uc: 1 l = 1000 ml');
  eqNum(convert(1, 'gal', 'l'), 3.785411784, 'uc: 1 US gal = 3.785411784 l');
  eqNum(convert(1, 'gal_uk', 'l'), 4.54609, 'uc: 1 UK gal = 4.54609 l');
  eqNum(convert(1, 'tbsp', 'ml'), 14.78676478125, 'uc: 1 tbsp = 14.78676478125 ml');
  eqNum(convert(1, 'cup', 'floz'), 8, 'uc: 1 cup = 8 fl oz');
  eqNum(convert(1, 'm3', 'l'), 1000, 'uc: 1 m3 = 1000 l');

  cat('time');
  eq(convert(1, 'h', 'min'), '60', 'uc: 1 h = 60 min');
  eq(convert(1, 'd', 'h'), '24', 'uc: 1 day = 24 h');
  eq(convert(1, 'wk', 'd'), '7', 'uc: 1 week = 7 days');
  eq(convert(1, 'y', 'd'), '365', 'uc: 1 year = 365 days');
  eqNum(convert(90, 'min', 'h'), 1.5, 'uc: 90 min = 1.5 h');
  eq(convert(1, 's', 'ms'), '1,000', 'uc: 1 s = 1000 ms');
  eq(convert(1, 'ms', 'ns'), '1,000,000', 'uc: 1 ms = 1000000 ns');

  cat('data');
  eq(convert(1, 'KB', 'B'), '1,000', 'uc: 1 KB = 1000 B');
  eq(convert(1, 'KiB', 'B'), '1,024', 'uc: 1 KiB = 1024 B');
  eqNum(convert(1, 'MB', 'KB'), 1000, 'uc: 1 MB = 1000 KB');
  eqNum(convert(1, 'MiB', 'KB'), 1048.576, 'uc: 1 MiB = 1048.576 decimal KB');
  eqNum(convert(1, 'MB', 'KiB'), 976.5625, 'uc: 1 MB = 976.5625 KiB');
  eqNum(convert(1, 'GB', 'MiB'), 953.67431640625, 'uc: 1 GB = 953.67431640625 MiB');
  eq(convert(8, 'bit', 'B'), '1', 'uc: 8 bit = 1 B');
  eqNum(convert(1, 'TB', 'GB'), 1000, 'uc: 1 TB = 1000 GB');
  eqNum(convert(1, 'TiB', 'GB'), 1099.511627776, 'uc: 1 TiB = 1099.511627776 GB');

  // Round-trip check for every category/unit pair: a -> b -> a must return the start value.
  const ids = ['length', 'weight', 'temperature', 'area', 'volume', 'time', 'data'];
  let roundTripFailures = 0;
  let pairs = 0;
  for (const c of ids) {
    cat(c);
    const names = Array.from(fromUnit.options).map((o) => o.value);
    for (const a of names) {
      for (const b of names) {
        fromUnit.value = a;
        toUnit.value = b;
        setValue(window, fromValue, '7.25');
        const direct = parseFloat(toValue.value.replace(/,/g, ''));
        fromUnit.value = b;
        toUnit.value = a;
        setValue(window, fromValue, String(direct));
        const back = parseFloat(toValue.value.replace(/,/g, ''));
        pairs++;
        if (!isFinite(direct) || !isFinite(back) || Math.abs(back - 7.25) > 1e-9 * 7.25) {
          roundTripFailures++;
        }
      }
    }
  }
  eq(roundTripFailures, 0, 'uc: all ' + pairs + ' unit pairs round-trip correctly');

  // Input validation
  cat('length');
  setValue(window, fromValue, 'abc');
  await flushTimers(window, 30);
  eq(byId(window, 'errorBox').className, 'msg err', 'uc: non-numeric input flagged');
  eq(toValue.value, '', 'uc: no result for invalid input');
  setValue(window, fromValue, '12,5');
  await flushTimers(window, 30);
  eqNum(toValue.value, 41.01049868766404, 'uc: comma decimal separator handled');
  ok(byId(window, 'errorBox').hidden === true, 'uc: no error for valid comma decimal');
  setValue(window, fromValue, '1,000');
  await flushTimers(window, 30);
  eqNum(toValue.value, 3280.839895013123, 'uc: thousands separator accepted');
  setValue(window, fromValue, '1e3');
  await flushTimers(window, 30);
  eqNum(toValue.value, 3280.839895013123, 'uc: scientific notation accepted');
  setValue(window, fromValue, '+12');
  await flushTimers(window, 30);
  eqNum(toValue.value, 39.37007874015748, 'uc: leading plus accepted');
  setValue(window, fromValue, '12px');
  await flushTimers(window, 30);
  eq(byId(window, 'errorBox').className, 'msg err', 'uc: trailing units are rejected');
  setValue(window, fromValue, '  ');
  await flushTimers(window, 30);
  eq(toValue.value, '', 'uc: blank input gives empty result');
  setValue(window, fromValue, '-');
  await flushTimers(window, 30);
  eq(byId(window, 'errorBox').className, 'msg err', 'uc: lone minus is invalid');

  cat('temperature');
  setValue(window, fromValue, '-273.15');
  await flushTimers(window, 30);
  eq(byId(window, 'errorBox').className, 'msg warn', 'uc: absolute zero warning shown');

  // Swap
  cat('length');
  fromUnit.value = 'km';
  toUnit.value = 'm';
  setValue(window, fromValue, '5');
  await flushTimers(window, 20);
  eq(toValue.value, '5,000', 'uc: 5 km in m before swap');
  click(window, byId(window, 'swapBtn'));
  await flushTimers(window, 20);
  eq(fromUnit.value, 'm', 'uc: swap exchanges units');
  eq(toUnit.value, 'km', 'uc: swap exchanges units (2)');
  eq(fromValue.value, '5,000', 'uc: swap moves result into input');
  eq(toValue.value, '5', 'uc: swap recomputes');

  // Clear
  click(window, byId(window, 'clearBtn'));
  await flushTimers(window, 20);
  eq(fromValue.value, '', 'uc: clear empties input');
  eq(toValue.value, '', 'uc: clear empties output');
  eq(doc.getElementById('allBody').innerHTML, '', 'uc: clear empties table');

  // Quick field
  cat('length');
  fromUnit.value = 'm';
  toUnit.value = 'ft';
  byId(window, 'quick').value = '12';
  fire(window, byId(window, 'quick'), 'input');
  await flushTimers(window, 20);
  eqNum(toValue.value, 39.37007874015748, 'uc: quick value converts');
  eq(fromValue.value, '12', 'uc: quick value fills the input');

  // All-units table
  eq(doc.querySelectorAll('#allBody tr').length, fromUnit.options.length, 'uc: table lists every unit');
  const firstBtn = doc.querySelector('#allBody button[data-unit]');
  click(window, firstBtn);
  await flushTimers(window, 20);
  ok(fromUnit.value === firstBtn.getAttribute('data-unit'), 'uc: clicking table row sets from unit');

  // Extreme values do not throw
  cat('length');
  setValue(window, fromValue, '1e18');
  await flushTimers(window, 20);
  ok(toValue.value.length > 0, 'uc: very large value handled');
  setValue(window, fromValue, '1e-18');
  await flushTimers(window, 20);
  ok(toValue.value.length > 0, 'uc: very small value handled');

  ok(errors.length === 0, 'uc: no console errors', errors.join(' | '));
}

/* ---------------- cross-page ---------------- */
async function testShared() {
  const pages = ['index.html', 'word-counter.html', 'json-formatter.html', 'text-cleaner.html', 'unit-converter.html'];
  for (const p of pages) {
    const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
    ok(/<meta name="viewport"/.test(html), p + ': has viewport meta');
    ok(/<title>/.test(html), p + ': has title');
    ok(html.indexOf('<link rel="stylesheet" href="assets/style.css">') > -1, p + ': links shared stylesheet');
    ok(html.indexOf('assets/app.js') > -1, p + ': loads shared script');
    ok(!/<script src="http/.test(html) && !/<link href="http/.test(html), p + ': no external resources');
    ok(!/cdn\.|googleapis|unpkg|jsdelivr/.test(html), p + ': no CDN dependencies');
  }
  // every internal link resolves
  for (const p of pages) {
    const html = fs.readFileSync(path.join(ROOT, p), 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, '');   // ignore JS string literals
    const links = html.match(/(?:href|src)="([^"]+)"/g) || [];
    for (const l of links) {
      const m = l.match(/"([^"]+)"/);
      const target = m[1];
      if (target.indexOf('http') === 0 || target.indexOf('#') === 0) continue;
      ok(fs.existsSync(path.join(ROOT, target)), p + ': link target exists -> ' + target);
    }
  }
  // shared file syntax
  new Function(fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8'));
  ok(true, 'shared: app.js parses');
}

(async function main() {
  await testShared();
  await testIndex();
  await testWordCounter();
  await testJson();
  await testTextCleaner();
  await testConverter();

  console.log('\nPassed: ' + pass + '   Failed: ' + fail);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('All tests passed.');
})();
