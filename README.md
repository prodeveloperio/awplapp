# Toolbox

A small, dependency-free collection of web tools. Plain HTML, CSS and JavaScript —
no frameworks, no build step, no backend, no network calls. Open any page and it
works, including offline.

## Tools

| Tool | File | What it does |
| --- | --- | --- |
| Word Counter | `word-counter.html` | Live word / character / sentence / paragraph counts, unique words, reading & speaking time, import and export |
| JSON Formatter | `json-formatter.html` | Format, minify and validate JSON, error detection with line + column and a caret, recursive key sorting, HTML escaping, statistics, file import (also via drag & drop) |
| Text Cleaner | `text-cleaner.html` | 30+ cleaning actions (spaces, blank lines, duplicates, trim, tabs, sort, reverse, shuffle, wrap, case conversion, strip URLs / emails / phones / HTML / entities / markdown / emoji / punctuation / special characters), statistics, copy, download, import |
| Unit Converter | `unit-converter.html` | Length, weight, temperature, area, volume, time and data size. Instant conversion, swap, all-units table, copy and clear |

Start at `index.html` — it lists every tool and has a live search box (press
Enter to open the top result).

## Design notes

- Everything runs in the browser. No data is uploaded, stored or sent anywhere.
- No dependencies, no fonts, no images, no animations. The whole site is a few
  tens of kilobytes and loads instantly on slow connections and low-end phones.
- Written in ES5-style JavaScript (plus the widely supported `\uXXXX` escapes) so
  it runs in older browsers too.
- Responsive down to 320 px: two-column editor panes stack vertically, the
  button rows wrap, and the unit table scrolls horizontally.
- The JSON formatter ships its own parser instead of `JSON.parse` so it can
  report the exact line and column of a syntax error, detect trailing commas and
  non-standard tokens, keep large numbers byte-for-byte identical, and report
  duplicate keys and nesting depth.

## Repository layout

```
index.html            home page + tool search
word-counter.html     word counter
json-formatter.html   JSON formatter / validator
text-cleaner.html     text cleaner
unit-converter.html   unit converter
assets/style.css      shared styles
assets/app.js         shared helpers (copy, download, import, nav, formatting)
tests/run.js          headless DOM test suite (jsdom)
tests/browser.js      real-browser tests (Playwright: layout, console, flows)
```

## Tests

The tests are optional — the site itself has no dependencies.

```bash
cd tests
npm install jsdom                       # for the DOM suite
npm install playwright && npx playwright install chromium   # for the browser suite

node run.js       # 344 checks: logic, invalid input, edge cases, large input
node browser.js   #  99 checks: 5 viewports, console errors, overflow, flows
```

`run.js` covers every tool's behaviour including invalid input, empty input,
malformed JSON (20 cases), deep nesting, huge documents, round-trip conversion
of all 685 unit pairs, and confirms the pages load no external resources.
`browser.js` renders each page at 320 / 375 / 768 / 1280 / 1920 px in headless
Chromium and fails on console errors, horizontal overflow, undersized tap
targets, or any network request.
