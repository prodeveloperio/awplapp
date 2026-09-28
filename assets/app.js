/* Shared helpers. No dependencies. */
(function (global) {
  'use strict';

  var TOOLS = [
    {
      id: 'word-counter',
      name: 'Word Counter',
      file: 'word-counter.html',
      category: 'Text',
      keywords: 'text word count characters letters sentences paragraphs reading time words chars characters count',
      description: 'Count words, characters, sentences and reading time.'
    },
    {
      id: 'json-formatter',
      name: 'JSON Formatter',
      file: 'json-formatter.html',
      category: 'Developer',
      keywords: 'json format beautify pretty minify validate error lint sort keys tree stats developer',
      description: 'Format, validate and minify JSON with error detection.'
    },
    {
      id: 'text-cleaner',
      name: 'Text Cleaner',
      file: 'text-cleaner.html',
      category: 'Text',
      keywords: 'text clean whitespace spaces blank lines duplicates trim sort reverse case html url special characters',
      description: 'Remove extra spaces, blank lines and duplicates from text.'
    },
    {
      id: 'unit-converter',
      name: 'Unit Converter',
      file: 'unit-converter.html',
      category: 'Utility',
      keywords: 'unit converter length weight mass temperature area volume time data bytes swap convert',
      description: 'Convert length, weight, temperature, area, volume, time and data.'
    }
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function copyText(text, btn, okMsg) {
    var done = function () {
      if (!btn) return;
      var old = btn.getAttribute('data-label') || btn.textContent;
      btn.setAttribute('data-label', old);
      btn.textContent = okMsg || 'Copied';
      setTimeout(function () {
        btn.textContent = old;
      }, 1200);
    };
    var fail = function () {
      if (!btn) return;
      var old = btn.getAttribute('data-label') || btn.textContent;
      btn.setAttribute('data-label', old);
      btn.textContent = 'Copy failed';
      setTimeout(function () {
        btn.textContent = old;
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText && global.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {
        legacyCopy(text) ? done() : fail();
      });
    } else {
      legacyCopy(text) ? done() : fail();
    }
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* Reads a picked file as UTF-8 text. Calls onDone(text) or onError(message). */
  function readFile(file, onDone, onError) {
    if (!file) return;
    if (file.size > 64 * 1024 * 1024) {
      if (onError) onError('File is too large (max 64 MB).');
      return;
    }
    var fr = new FileReader();
    fr.onload = function () {
      onDone(String(fr.result));
    };
    fr.onerror = function () {
      if (onError) onError('Could not read the file.');
    };
    fr.readAsText(file);
  }

  function fmt(n) {
    if (n === Infinity) return '∞';
    if (n === -Infinity) return '-∞';
    if (n !== n) return 'NaN';
    return String(n);
  }

  function num(n, digits) {
    if (!isFinite(n)) return fmt(n);
    var d = digits === undefined ? 4 : digits;
    var s = String(Math.round(n * Math.pow(10, d)) / Math.pow(10, d));
    return s;
  }

  function isInt(n) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n;
  }

  function formatNumber(n, maxDigits) {
    if (typeof n !== 'number' || !isFinite(n)) return num(n);
    if (isInt(n) && Math.abs(n) < 1e15) return n.toLocaleString('en-US');
    var s = n.toFixed(maxDigits === undefined ? 6 : maxDigits);
    s = s.replace(/0+$/, '').replace(/\.$/, '');
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function setMsg(node, type, text) {
    if (!node) return;
    if (!type) {
      node.hidden = true;
      node.textContent = '';
      node.className = 'msg';
      return;
    }
    node.hidden = false;
    node.className = 'msg ' + type;
    node.textContent = text;
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        t = null;
        fn.apply(self, args);
      }, ms);
    };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* Renders the shared header nav, marking the current page active. */
  function renderNav(currentId) {
    var host = document.querySelector('[data-nav]');
    if (!host) return;
    var html = '<a href="index.html"' + (currentId === 'home' ? ' class="active"' : '') + '>Home</a>';
    for (var i = 0; i < TOOLS.length; i++) {
      var t = TOOLS[i];
      html += '<a href="' + t.file + '"' + (currentId === t.id ? ' class="active"' : '') + '>' + t.name + '</a>';
    }
    host.innerHTML = html;
  }

  function renderFooter() {
    var host = document.querySelector('[data-footer-year]');
    if (host) host.textContent = String(new Date().getFullYear());
  }

  global.App = {
    TOOLS: TOOLS,
    el: el,
    copyText: copyText,
    download: download,
    readFile: readFile,
    fmt: fmt,
    num: num,
    formatNumber: formatNumber,
    setMsg: setMsg,
    debounce: debounce,
    escapeHtml: escapeHtml,
    renderNav: renderNav,
    renderFooter: renderFooter
  };

  document.addEventListener('DOMContentLoaded', function () {
    var current = document.body.getAttribute('data-page') || '';
    renderNav(current);
    renderFooter();
  });
})(window);
