/* PDF Slash! shared code: home grid, routing, file handling, library loading and small helpers.
   Each tool lives in tools/<id>.js and calls App.register(id, {...}). No PDF library loads until a tool needs it. */
'use strict';

const App = (() => {
  // Most-used tools first. accept: 'pdf' | 'img' | 'none'
  const TOOLS = [
    { id: 'merge', name: 'Merge', desc: 'Join PDFs into one file', accept: 'pdf', icon: 'M5 3v6l7 5 7-5V3M12 14v7M9 18l3 3 3-3' },
    { id: 'split', name: 'Split', desc: 'Cut a PDF into parts', accept: 'pdf', icon: 'M12 3v7l-7 5v6M12 10l7 5v6M9 5l3-3 3 3' },
    { id: 'compress', name: 'Compress', desc: 'Make a PDF smaller (lossy)', accept: 'pdf', icon: 'M4 12h16M12 3v6M9 6l3 3 3-3M12 21v-6M9 18l3-3 3 3' },
    { id: 'img2pdf', name: 'JPG → PDF', desc: 'Turn JPG/PNG images into a PDF', accept: 'img', icon: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M16 9h.01' },
    { id: 'pdf2img', name: 'PDF → JPG', desc: 'Save pages as JPG or PNG', accept: 'pdf', icon: 'M6 2h9l4 4v16H6zM9 17l3-4 2 2 1-1 2 3zM10 9h.01' },
    { id: 'organize', name: 'Organize', desc: 'Reorder, rotate, delete pages', accept: 'pdf', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
    { id: 'rotate', name: 'Rotate', desc: 'Turn pages the right way up', accept: 'pdf', icon: 'M20 12a8 8 0 1 1-2.3-5.7M20 3v5h-5' },
    { id: 'pagenum', name: 'Page Numbers', desc: 'Stamp numbers on pages', accept: 'pdf', icon: 'M6 2h12v20H6zM11 8l2-1.5V16M10 16h4' },
    { id: 'watermark', name: 'Watermark', desc: 'Stamp text or a logo on pages', accept: 'pdf', icon: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z' },
    { id: 'edit', name: 'Edit', desc: 'Add text, shapes and pictures', accept: 'pdf', icon: 'M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3' },
    { id: 'sign', name: 'Sign', desc: 'Draw or type your signature', accept: 'pdf', icon: 'M3 16c3-7 5-7 6-2s3 4 5 0 3-3 7 1M3 21h18' },
    { id: 'crop', name: 'Crop', desc: 'Trim the edges of pages', accept: 'pdf', icon: 'M6 2v16h16M2 6h16v16' },
    { id: 'redact', name: 'Redact', desc: 'Black out private info for good', accept: 'pdf', icon: 'M3 5h18v4H3zM3 11h11v4H3zM3 17h18v3H3z' },
    { id: 'compare', name: 'Compare', desc: 'View two PDFs side by side', accept: 'pdf', icon: 'M3 4h7v16H3zM14 4h7v16h-7zM12 1v22' },
    { id: 'html2pdf', name: 'HTML → PDF', desc: 'Paste HTML, save as PDF', accept: 'none', icon: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16' },
  ];
  const HOME_TIP = 'Pick a tool, rookie! Everything stays on this PC.';
  const META = Object.fromEntries(TOOLS.map(t => [t.id, t]));
  const BIG_BYTES = 50 * 1024 * 1024, BIG_PAGES = 200;
  const THUMB_SCALE = 0.2;
  const ROOT = window.APP_ROOT || ''; // test pages in test-files/ set this to '../'

  const $ = (sel, root = document) => root.querySelector(sel);
  const registry = {};
  let cur = null;        // the open tool's context
  let pending = null;    // files dropped on the home page, handed to the next tool opened
  let lastId = null;

  // ---------- tiny DOM helper ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  const icon = d => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

  // ---------- small helpers ----------
  const size = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
  const base = name => name.replace(/\.[^.]+$/, '');
  const kindOf = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? 'pdf'
    : /\.(jpe?g|png)$/i.test(f.name) || /^image\/(jpeg|png)$/.test(f.type) ? 'img' : null;
  // Let the browser paint between pages so the tab never freezes. The timeout covers windows where frames are paused.
  const tick = () => new Promise(r => {
    let done = false;
    const next = () => { if (!done) { done = true; setTimeout(r, 0); } };
    if (!document.hidden) requestAnimationFrame(next);
    setTimeout(next, 50);
  });
  const freeCanvas = c => { if (c) { c.width = 0; c.height = 0; } };
  const pad = (n, width) => String(n).padStart(width, '0');
  const canvasBlob = (canvas, type, quality) => new Promise((ok, no) =>
    canvas.toBlob(b => b ? ok(b) : no(new Error('Could not make the image')), type, quality));

  // "1-3, 5, 8-" → [[1,3],[5,5],[8,max]]. Throws a plain-language message on bad input.
  function parseRanges(text, max) {
    const out = [];
    for (const part of String(text).split(',')) {
      const p = part.trim();
      if (!p) continue;
      const m = p.match(/^(\d+)\s*(?:-\s*(\d*))?$/);
      if (!m) fail(`"${p}" is not a page or range. Write pages like 1-3, 5.`);
      const a = +m[1], b = m[2] === undefined ? a : m[2] === '' ? max : +m[2];
      if (a < 1 || a > b) fail(`"${p}" is backwards or starts at 0. Write ranges low to high, like 2-5.`);
      if (b > max) fail(`"${p}" goes past the end. This PDF has ${plural(max, 'page')}.`);
      out.push([a, b]);
    }
    if (!out.length) fail('Type which pages to use, like 1-3, 5.');
    return out;
  }
  const rangePages = ranges => ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));

  // ---------- form bits shared by tools ----------
  function choice(name, items, value, onchange) {
    return h('div', { class: 'choice', role: 'radiogroup' }, items.map(([v, label]) =>
      h('label', null, h('input', { type: 'radio', name, value: v, checked: v === value, onchange }), h('span', { text: label }))));
  }
  const picked = (root, name) => root.querySelector(`input[name="${name}"]:checked`).value;
  function slider(label, min, max, step, value, fmt = v => v) {
    const shown = h('b', { text: fmt(value) });
    const input = h('input', { type: 'range', min, max, step, value });
    input.addEventListener('input', () => { shown.textContent = fmt(+input.value); });
    return { el: h('label', null, label + ': ', shown, input), input };
  }

  // ---------- page drawing (pdf.js) ----------
  // Draws one page into a canvas (new or reused). extraRot turns it on top of the page's own rotation.
  async function renderPage(doc, n, scale, canvas, extraRot = 0) {
    const page = await doc.getPage(n);
    try {
      const vp = page.getViewport({ scale, rotation: (page.rotate + extraRot) % 360 });
      canvas = canvas || document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const g = canvas.getContext('2d', { alpha: false });
      g.fillStyle = '#fff';
      g.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      return canvas;
    } finally {
      page.cleanup();
    }
  }
  // Thumbnails: drawn at ~0.2 scale, one at a time, only when they scroll into view.
  let thumbObs = null, thumbChain = Promise.resolve();
  const thumbJobs = new Map();
  function thumb(canvas, doc, n) {
    if (!thumbObs) {
      thumbObs = new IntersectionObserver(entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const c = e.target, job = thumbJobs.get(c);
          thumbObs.unobserve(c);
          thumbJobs.delete(c);
          if (job) thumbChain = thumbChain.then(() => c.isConnected && renderPage(job.doc, job.n, THUMB_SCALE, c)).catch(() => {});
        }
      }, { rootMargin: '150px' });
    }
    thumbJobs.set(canvas, { doc, n });
    thumbObs.observe(canvas);
  }
  function clearThumbs() {
    if (thumbObs) thumbObs.disconnect();
    thumbObs = null;
    thumbJobs.clear();
  }

  // ---------- page stage: one page drawn large, with boxes you drag, resize, nudge and delete ----------
  // Boxes are fractions (0–1) of the page as displayed, so they fit any zoom, page size or rotation.
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function stage(host, doc, { paint, onSelect, drawNew, fixed } = {}) {
    const canvas = h('canvas', { width: 0, height: 0 });
    const layer = h('div', { class: 'layer' });
    const label = h('b');
    const sheet = h('div', { class: 'sheet' }, canvas, layer);
    const s = { n: 1, boxes: [], sel: null, scale: 1, pt: { w: 1, h: 1 } };
    const prev = h('button', { type: 'button', class: 'mini', text: '◀ Prev page', onclick: () => s.show(s.n - 1) });
    const next = h('button', { type: 'button', class: 'mini', text: 'Next page ▶', onclick: () => s.show(s.n + 1) });
    s.el = h('div', { class: 'stage' }, h('div', { class: 'panel-bar' }, prev, label, next), sheet);
    host.append(s.el);
    let chain = Promise.resolve();

    function place(b) {
      const st = b.el.style;
      st.left = b.x * 100 + '%';
      st.top = b.y * 100 + '%';
      st.width = b.w * 100 + '%';
      st.height = b.h * 100 + '%';
    }
    function select(b) {
      if (s.sel && s.sel.el) s.sel.el.classList.remove('sel');
      s.sel = b;
      if (b) b.el.classList.add('sel');
      if (onSelect) onSelect(b);
    }
    // Images keep their shape: height follows width.
    function fitRatio(b) { if (b.ratio) b.h = clamp(b.w * s.pt.w / s.pt.h * b.ratio, 0.01, 1 - b.y); }
    function drag(e, b, mode) {
      e.preventDefault();
      e.stopPropagation();
      b.el.focus();
      if (s.sel !== b) select(b);
      const r = layer.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, o = { x: b.x, y: b.y, w: b.w, h: b.h };
      const move = ev => {
        const dx = (ev.clientX - x0) / r.width, dy = (ev.clientY - y0) / r.height;
        if (mode === 'move') {
          b.x = clamp(o.x + dx, 0, 1 - b.w);
          b.y = clamp(o.y + dy, 0, 1 - b.h);
        } else {
          b.w = clamp(o.w + dx, 0.02, 1 - b.x);
          b.h = clamp(o.h + dy, 0.01, 1 - b.y);
          fitRatio(b);
        }
        place(b);
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }
    function mount(b) {
      b.el = h('div', { class: 'box ' + b.type, tabindex: '0', 'aria-label': b.label || b.type }, h('div', { class: 'handle' }));
      place(b);
      if (paint) paint(b, b.el, s);
      b.el.addEventListener('pointerdown', e => drag(e, b, e.target.classList.contains('handle') ? 'size' : 'move'));
      b.el.addEventListener('focus', () => { if (s.sel !== b) select(b); });
      b.el.addEventListener('keydown', e => {
        const step = 0.005, k = e.key;
        if ((k === 'Delete' || k === 'Backspace') && !fixed) { e.preventDefault(); s.remove(b); return; }
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
        if (!d) return;
        e.preventDefault();
        if (e.shiftKey) { b.w = clamp(b.w + d[0], 0.02, 1 - b.x); b.h = clamp(b.h + d[1], 0.01, 1 - b.y); fitRatio(b); }
        else { b.x = clamp(b.x + d[0], 0, 1 - b.w); b.y = clamp(b.y + d[1], 0, 1 - b.h); }
        place(b);
      });
      return b.el;
    }
    // Drag on an empty spot of the page to draw a new box (tools that pass drawNew).
    layer.addEventListener('pointerdown', e => {
      if (e.target !== layer || !drawNew) return;
      const r = layer.getBoundingClientRect();
      const b = s.add(Object.assign(drawNew(), { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, w: 0.02, h: 0.01 }));
      drag(e, b, 'size');
    });

    s.show = n => (chain = chain.then(async () => {
      if (n < 1 || n > doc.numPages) return;
      s.n = n;
      const page = await doc.getPage(n), vp = page.getViewport({ scale: 1 });
      s.pt = { w: vp.width, h: vp.height }; // page size in points, as displayed
      const avail = Math.max(300, Math.min(host.clientWidth - 40, 820));
      s.scale = Math.min(avail / vp.width, 900 / vp.height, 2);
      await renderPage(doc, n, s.scale, canvas);
      label.textContent = `Page ${n} of ${doc.numPages}`;
      prev.disabled = n === 1;
      next.disabled = n === doc.numPages;
      sheet.style.width = canvas.width + 'px';
      sheet.style.height = canvas.height + 'px';
      layer.textContent = '';
      s.boxes.filter(b => b.page === n || b.page === '*').forEach(b => layer.append(mount(b))); // '*' = on every page
      select(null);
    }).catch(() => {}));
    s.add = b => {
      b.page = b.page || s.n;
      s.boxes.push(b);
      layer.append(mount(b));
      fitRatio(b);
      place(b);
      b.el.focus();
      select(b); // don't rely on the focus event alone (it doesn't fire when the window is in the background)
      return b;
    };
    s.remove = b => {
      s.boxes.splice(s.boxes.indexOf(b), 1);
      b.el.remove();
      select(null);
    };
    s.update = b => { place(b); if (paint) paint(b, b.el, s); };
    s.destroy = () => { freeCanvas(canvas); s.el.remove(); };
    return s;
  }

  // Colors shared by the drawing tools: [r, g, b] 0–1.
  const COLORS = { black: [0, 0, 0], red: [0.9, 0.22, 0.27], blue: [0.1, 0.3, 0.8], yellow: [1, 0.84, 0.04], white: [1, 1, 1], gray: [0.55, 0.55, 0.55] };
  const cssColor = name => 'rgb(' + COLORS[name].map(v => Math.round(v * 255)).join(',') + ')';
  const pdfColor = name => PDFLib.rgb(...COLORS[name]);
  const lineEnds = (b, X, Y, W, H) => ({ down: [X, Y, X + W, Y + H], up: [X, Y + H, X + W, Y], v: [X + W / 2, Y, X + W / 2, Y + H] })[b.dir] || [X, Y + H / 2, X + W, Y + H / 2];

  // Shows a box's content in the stage, sized like it will be in the PDF.
  function paintBox(b, el, s) {
    [...el.children].forEach(c => { if (!c.classList.contains('handle')) c.remove(); });
    el.style.background = '';
    el.style.border = '';
    if (b.type === 'text') {
      const t = h('div', { class: 'btext', text: b.text });
      t.style.fontSize = b.size * s.scale + 'px';
      t.style.color = cssColor(b.color);
      el.prepend(t);
    } else if (b.type === 'rect' || b.type === 'ellipse') {
      if (b.fill) el.style.background = cssColor(b.color);
      else el.style.border = Math.max(1, 2 * s.scale) + 'px solid ' + cssColor(b.color);
    } else if (b.type === 'line') {
      const [x1, y1, x2, y2] = lineEnds(b, 0, 0, 100, 100);
      el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${cssColor(b.color)}" stroke-width="${Math.max(1, 2 * s.scale)}" vector-effect="non-scaling-stroke"/></svg>`);
    } else if (b.type === 'image') {
      el.prepend(h('img', { src: b.img.url, alt: '', draggable: 'false' }));
    }
  }

  // Geometry for a pdf-lib page in "screen" points (origin top-left, as displayed, rotation applied).
  function pageView(page) {
    const r = ((page.getRotation().angle % 360) + 360) % 360, box = page.getCropBox();
    const W = box.width, H = box.height, vw = r % 180 ? H : W, vh = r % 180 ? W : H;
    const toPdf = (sx, sy) => {
      const fx = sx / vw, fy = sy / vh;
      if (r === 90) return { x: box.x + fy * W, y: box.y + fx * H };
      if (r === 180) return { x: box.x + (1 - fx) * W, y: box.y + fy * H };
      if (r === 270) return { x: box.x + (1 - fy) * W, y: box.y + (1 - fx) * H };
      return { x: box.x + fx * W, y: box.y + (1 - fy) * H };
    };
    const rect = (sx, sy, sw, sh) => {
      const a = toPdf(sx, sy), b = toPdf(sx + sw, sy + sh);
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
    };
    return { r, vw, vh, toPdf, rect, rot: PDFLib.degrees(r) };
  }

  // Writes stage boxes (text, rect, ellipse, line, image) onto a pdf-lib document.
  async function stampBoxes(doc, boxes, progress) {
    const pages = doc.getPages(), images = new Map();
    const font = boxes.some(b => b.type === 'text') ? await doc.embedFont(PDFLib.StandardFonts.Helvetica) : null;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i], page = pages[b.page - 1];
      if (!page) continue;
      const v = pageView(page), X = b.x * v.vw, Y = b.y * v.vh, W = b.w * v.vw, H = b.h * v.vh;
      const color = b.color ? pdfColor(b.color) : undefined, ink = b.fill ? { color } : { borderColor: color, borderWidth: 2 };
      if (b.type === 'text') {
        b.text.split('\n').forEach((line, k) => {
          const p = v.toPdf(X, Y + b.size * (0.95 + 1.2 * k));
          page.drawText(line, { x: p.x, y: p.y, size: b.size, font, color, rotate: v.rot });
        });
      } else if (b.type === 'rect') {
        page.drawRectangle(Object.assign(v.rect(X, Y, W, H), ink));
      } else if (b.type === 'ellipse') {
        const c = v.toPdf(X + W / 2, Y + H / 2);
        page.drawEllipse(Object.assign({ x: c.x, y: c.y, xScale: (v.r % 180 ? H : W) / 2, yScale: (v.r % 180 ? W : H) / 2 }, ink));
      } else if (b.type === 'line') {
        const [x1, y1, x2, y2] = lineEnds(b, X, Y, W, H);
        page.drawLine({ start: v.toPdf(x1, y1), end: v.toPdf(x2, y2), thickness: 2, color });
      } else if (b.type === 'image') {
        if (!images.has(b.img.bytes)) images.set(b.img.bytes, b.img.kind === 'png' ? await doc.embedPng(b.img.bytes) : await doc.embedJpg(b.img.bytes));
        const p = v.toPdf(X, Y + H);
        page.drawImage(images.get(b.img.bytes), { x: p.x, y: p.y, width: W, height: H, rotate: v.rot });
      }
      if (progress && i % 10 === 9) await progress(i + 1, boxes.length);
    }
  }
  // JPG or PNG from the file's first bytes, else null.
  const imageKind = b => b[0] === 0xFF && b[1] === 0xD8 ? 'jpg' : b[0] === 0x89 && b[1] === 0x50 ? 'png' : null;
  // Plain copy of stage boxes for run(): no DOM elements.
  const plainBoxes = boxes => boxes.map(({ el, ...rest }) => rest);

  function fail(msg) { const e = new Error(msg); e.userMessage = msg; throw e; }
  function friendly(e) {
    if (e && e.userMessage) return e.userMessage;
    const m = String(e && (e.name + ' ' + e.message) || e);
    if (/encrypt|password/i.test(m)) return 'This PDF is password-protected. Unlock it first, then try again.';
    if (/WinAnsi|cannot encode/i.test(m)) return "Some characters can't be written with the built-in font. Use plain English letters, numbers and common symbols.";
    if (/Invalid ?PDF|PDF header|Failed to parse|Expected instance|xref|trailer|MissingPDF|Unexpected/i.test(m)) return DAMAGED;
    if (/Could not load/i.test(m)) return 'A part of the app is missing: ' + e.message + '. Check the vendor folder.';
    return 'Something went wrong: ' + (e && e.message || m);
  }

  // ---------- library loading (each file once, only when a tool asks) ----------
  const LIBS = { pdflib: ['vendor/pdf-lib.min.js'], pdfjs: ['vendor/pdf.worker.min.js', 'vendor/pdf.min.js'] };
  const libPromises = {};
  function loadScript(src) {
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => { s.remove(); no(new Error('Could not load ' + src)); };
      document.head.append(s);
    });
  }
  function need(name) {
    if (!libPromises[name]) {
      libPromises[name] = (async () => {
        for (const src of LIBS[name]) await loadScript(ROOT + src);
        // The worker file is already loaded as a normal script, so pdf.js runs on the main thread (works from file://).
        if (name === 'pdfjs') pdfjsLib.GlobalWorkerOptions.workerSrc = ROOT + 'vendor/pdf.worker.min.js';
      })().catch(e => { delete libPromises[name]; throw e; });
    }
    return libPromises[name];
  }
  // Any read failure that isn't a password problem means the file is damaged.
  const DAMAGED = "This file doesn't look like a working PDF. It may be damaged.";
  const readError = e => /encrypt|password/i.test(String(e && (e.name + ' ' + e.message))) ? e : Object.assign(new Error(DAMAGED), { userMessage: DAMAGED });
  async function loadPdf(bytes, opts) {
    await need('pdflib');
    try {
      const doc = await PDFLib.PDFDocument.load(bytes, Object.assign({ updateMetadata: false }, opts));
      doc.getPageCount(); // pdf-lib parses junk leniently; this throws if there is no page tree
      return doc;
    } catch (e) { throw readError(e); }
  }
  async function openPdfjs(bytes) {
    await need('pdfjs');
    // pdf.js may take ownership of the buffer, so hand it a copy.
    try {
      return await pdfjsLib.getDocument({ data: bytes.slice(), verbosity: 0, isEvalSupported: false }).promise;
    } catch (e) { throw readError(e); }
  }
  // pdf.js document for a file entry, opened once and cached on the entry.
  function docOf(entry) {
    if (!entry.doc) entry.doc = openPdfjs(entry.bytes).catch(e => { entry.doc = null; throw e; });
    return entry.doc;
  }
  function release(entry) {
    if (entry.doc) entry.doc.then(d => d.destroy(), () => {});
    entry.doc = null;
    entry.bytes = null;
  }

  // ---------- downloads and ZIP (store only: JPG/PNG/PDF are already compressed) ----------
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  let crcTable = null;
  function crc32(u8) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    let c = ~0;
    for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return ~c >>> 0;
  }
  async function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let offset = 0, cenSize = 0;
    for (const f of files) {
      const data = f.data instanceof Blob ? new Uint8Array(await f.data.arrayBuffer()) : f.data;
      const name = enc.encode(f.name), crc = crc32(data);
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true);
      loc.setUint16(4, 20, true);
      loc.setUint16(6, 0x0800, true);          // UTF-8 names
      loc.setUint16(10, time, true);
      loc.setUint16(12, date, true);
      loc.setUint32(14, crc, true);
      loc.setUint32(18, data.length, true);
      loc.setUint32(22, data.length, true);
      loc.setUint16(26, name.length, true);
      parts.push(loc, name, data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(12, time, true);
      cen.setUint16(14, date, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(cen, name);
      offset += 30 + name.length + data.length;
      cenSize += 46 + name.length;
      await tick();
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cenSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }
  async function deliver(out) {
    const files = out.files;
    if (files.length === 1) {
      const f = files[0];
      download(f.data instanceof Blob ? f.data : new Blob([f.data], { type: f.type || 'application/pdf' }), f.name);
    } else {
      download(await zip(files), out.zip || 'files.zip');
    }
  }

  // ---------- burst, modal, mascot ----------
  let burstTimer = 0;
  function burst(kind) {
    const b = $('#burst');
    b.classList.remove('show');
    b.classList.toggle('error', kind === 'error');
    $('#burst-text').textContent = kind === 'error' ? 'ERROR!' : 'DONE!';
    void b.offsetWidth; // restart the one-shot scale
    b.classList.add('show');
    sound(kind === 'error' ? 'error' : 'done');
    clearTimeout(burstTimer);
    burstTimer = setTimeout(() => b.classList.remove('show'), 1200);
  }
  function ask(msg) {
    return new Promise(resolve => {
      const m = $('#modal'), back = document.activeElement;
      $('#modal-msg').textContent = msg;
      m.hidden = false;
      $('#modal-yes').focus();
      const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
      const done = v => {
        m.hidden = true;
        document.removeEventListener('keydown', key, true);
        if (back && back.focus) back.focus();
        resolve(v);
      };
      $('#modal-yes').onclick = () => done(true);
      $('#modal-no').onclick = () => done(false);
      document.addEventListener('keydown', key, true);
    });
  }
  // Restart a one-shot CSS animation class on an element.
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function tip(text) {
    if ($('#tip').textContent === text) return;
    $('#tip').textContent = text;
    replay($('#mascot'), 'talk'); // the hero hops and the bubble pops when there's a new tip
  }
  function setTips(on) {
    $('#mascot').hidden = !on;
    $('#tips-btn').setAttribute('aria-pressed', String(on));
    try { localStorage.setItem('pdfslash-tips', on ? 'on' : 'off'); } catch (e) { /* storage blocked: fine */ }
  }

  // ---------- sound effects: made on the fly with Web Audio (no sound files), only when something happens ----------
  let audio = null, soundOn = true, audioNap = 0;
  // Inside PDF Slash.exe (opened as index.html?app) sound may start right away, even on the first hover.
  const IN_APP = /[?&]app\b/.test(location.search);
  function audioCtx() {
    // In a normal browser tab, sound is only allowed after the user has clicked or pressed a key.
    if (!soundOn || !(IN_APP || (navigator.userActivation && navigator.userActivation.hasBeenActive))) return null;
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    clearTimeout(audioNap);
    audioNap = setTimeout(() => { audio.suspend().catch(() => {}); }, 1500); // audio engine sleeps between sounds: no idle CPU
    return audio;
  }
  // One note that slides from f0 to f1 and fades out.
  function tone(a, type, f0, f1, at, dur, vol) {
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  // A "whoosh": filtered noise whose pitch sweeps from f0 to f1.
  function whoosh(a, f0, f1, at, dur, vol) {
    const n = Math.ceil(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + at;
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.buffer = buf;
    src.connect(bp).connect(g).connect(a.destination);
    src.start(t);
  }
  const SOUNDS = {
    click: a => tone(a, 'square', 900, 500, 0, 0.04, 0.04),
    hover: a => tone(a, 'sine', 2200, 1700, 0, 0.025, 0.07),                                                    // soft tick
    open: a => { whoosh(a, 300, 5000, 0, 0.22, 0.35); tone(a, 'triangle', 220, 440, 0.02, 0.15, 0.06); },
    back: a => whoosh(a, 4000, 300, 0, 0.18, 0.25),
    file: a => { tone(a, 'square', 160, 60, 0, 0.12, 0.12); tone(a, 'sine', 500, 1200, 0.03, 0.1, 0.12); },     // BAM!
    go: a => { tone(a, 'square', 180, 900, 0, 0.2, 0.07); whoosh(a, 500, 6000, 0.05, 0.2, 0.2); },             // power-up
    done: a => {                                                                                                // ta-da!
      [523, 659, 784].forEach((f, i) => tone(a, 'triangle', f, f, i * 0.08, 0.12, 0.14));
      tone(a, 'triangle', 1047, 1047, 0.24, 0.4, 0.16);
      whoosh(a, 6000, 9000, 0.24, 0.35, 0.08);
    },
    error: a => { tone(a, 'sawtooth', 220, 80, 0, 0.32, 0.09); tone(a, 'square', 140, 60, 0.12, 0.25, 0.07); }, // bzzt-bonk
  };
  function sound(name) {
    const a = audioCtx();
    if (a) try { SOUNDS[name](a); } catch (e) { /* sound is a bonus; never break a job over it */ }
  }
  function setSound(on) {
    soundOn = on;
    const b = $('#sound-btn');
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? 'Sound on' : 'Sound off';
    if (!on && audio) audio.suspend().catch(() => {});
    try { localStorage.setItem('pdfslash-sound', on ? 'on' : 'off'); } catch (e) { /* storage blocked: fine */ }
  }
  // Comic "BAM!" on the drop zone when files land.
  function bam(ctx) {
    const el = h('span', { class: 'bam', 'aria-hidden': 'true', text: 'BAM!' });
    ctx.el.pick.append(el);
    setTimeout(() => el.remove(), 800);
  }

  // ---------- home ----------
  function buildHome() {
    $('#grid').innerHTML = TOOLS.map((t, i) =>
      `<a class="card ${'roy'[i % 3]}" style="--i:${i}" href="#/${t.id}" data-id="${t.id}" data-accept="${t.accept}">${icon(t.icon)}<h3>${t.name}</h3><p>${t.desc}</p></a>`).join('');
  }
  function filterHome(files) {
    const kinds = new Set(files.map(kindOf));
    if (kinds.size !== 1 || kinds.has(null)) {
      tip('Drop PDFs or JPG/PNG images, one kind at a time.');
      burst('error');
      return;
    }
    const kind = files.length ? kindOf(files[0]) : null;
    pending = files;
    for (const card of $('#grid').children) card.hidden = card.dataset.accept !== kind;
    $('#filter-name').textContent = files.length === 1 ? files[0].name : plural(files.length, 'file');
    $('#filter').hidden = false;
    tip('Nice! Now pick what to do with ' + (files.length === 1 ? 'it.' : 'them.'));
    const first = $('#grid a:not([hidden])');
    if (first) first.focus();
  }
  function clearFilter() {
    pending = null;
    $('#filter').hidden = true;
    for (const card of $('#grid').children) card.hidden = false;
  }

  // ---------- tool page ----------
  function skeleton(ctx) {
    const root = $('#tool');
    root.innerHTML = `
      <div class="tool-head"><a class="btn" href="#/">← Back</a><h1 class="tool-title"></h1></div>
      <div class="steps">
        <section class="step"><h2><span class="num">1</span><span class="s1-title">Drop files</span></h2>
          <div class="s1">
            <button type="button" class="drop"><b>Choose files</b>or drop them anywhere on this page</button>
            <input type="file" hidden>
            <ul class="files"></ul>
          </div></section>
        <section class="step"><h2><span class="num">2</span>Check options</h2><div class="opts"><p class="note">Loading…</p></div></section>
        <section class="step"><h2><span class="num">3</span>Go!</h2>
          <button type="button" class="go" disabled>GO!</button>
          <div class="prog" hidden><progress></progress><span></span></div>
          <p class="status" role="status"></p></section>
        <section class="preview"></section>
      </div>`;
    ctx.el = {
      title: $('.tool-title', root), s1: $('.s1', root), s1Title: $('.s1-title', root),
      pick: $('.drop', root), input: $('input[type=file]', root), files: $('.files', root),
      opts: $('.opts', root), go: $('.go', root), prog: $('.prog', root), status: $('.status', root),
      preview: $('.preview', root),
    };
    ctx.status = (msg, isErr) => setStatus(ctx, msg, isErr);
    ctx.refresh = () => updateGo(ctx);
    ctx.el.title.textContent = ctx.meta.name;
    ctx.el.pick.onclick = () => ctx.el.input.click();
    ctx.el.input.onchange = () => { const f = [...ctx.el.input.files]; ctx.el.input.value = ''; addFiles(ctx, f); };
    ctx.el.go.onclick = () => go(ctx);
  }
  function setStatus(ctx, msg, isErr) {
    if (!ctx.el) return;
    ctx.el.status.textContent = msg || '';
    ctx.el.status.classList.toggle('err', !!isErr);
  }
  function updateGo(ctx) {
    const t = ctx.tool, was = ctx.el.go.disabled;
    ctx.el.go.disabled = !t || ctx.busy || ctx.loading > 0 || !(t.ready ? t.ready(ctx) : ctx.files.length >= (t.min || 1));
    if (was && !ctx.el.go.disabled) replay(ctx.el.go, 'ready'); // little pulse: "you can press me now"
  }
  function filesChanged(ctx) {
    renderFiles(ctx);
    if (ctx.tool.onFiles) ctx.tool.onFiles(ctx);
    updateGo(ctx);
  }
  function renderFiles(ctx) {
    const ul = ctx.el.files, multi = ctx.tool.multiple;
    ul.textContent = '';
    ctx.files.forEach((f, i) => {
      const li = h('li', { draggable: multi ? 'true' : null, class: f.fresh ? 'new' : null },
        h('span', { class: 'fname', title: f.name, text: f.name }),
        h('span', { class: 'fmeta', text: (f.kind === 'pdf' ? plural(f.pages, 'page') + ' · ' : '') + size(f.size) }),
        multi && h('button', { type: 'button', class: 'mini', 'aria-label': 'Move ' + f.name + ' up', disabled: i === 0, onclick: () => move(ctx, i, i - 1), text: '↑' }),
        multi && h('button', { type: 'button', class: 'mini', 'aria-label': 'Move ' + f.name + ' down', disabled: i === ctx.files.length - 1, onclick: () => move(ctx, i, i + 1), text: '↓' }),
        h('button', { type: 'button', class: 'mini', 'aria-label': 'Remove ' + f.name, onclick: () => removeFile(ctx, i), text: '×' }));
      if (multi) {
        li.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-row', String(i)); e.dataTransfer.effectAllowed = 'move'; });
        li.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-row')) { e.preventDefault(); li.classList.add('drag-over'); } });
        li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
        li.addEventListener('drop', e => {
          if (!e.dataTransfer.types.includes('text/x-row')) return;
          e.preventDefault();
          e.stopPropagation();
          move(ctx, +e.dataTransfer.getData('text/x-row'), i);
        });
      }
      ul.append(li);
      f.fresh = false; // only newly added files slide in
    });
  }
  function move(ctx, from, to) {
    if (ctx.busy || to < 0 || to >= ctx.files.length || from === to) return;
    ctx.files.splice(to, 0, ctx.files.splice(from, 1)[0]);
    filesChanged(ctx);
  }
  function removeFile(ctx, i) {
    if (ctx.busy) return;
    release(ctx.files.splice(i, 1)[0]);
    setStatus(ctx, '');
    filesChanged(ctx);
  }
  async function countPages(entry, tool) {
    let n;
    if ((tool.libs || []).includes('pdflib')) n = (await loadPdf(entry.bytes)).getPageCount();
    else n = (await docOf(entry)).numPages;
    if (!n) fail("This PDF has no pages, or it's damaged.");
    return n;
  }
  async function addFiles(ctx, list) {
    const t = ctx.tool;
    if (!t || t.accept === 'none' || ctx.busy) return;
    // GO! stays off while files are read, so a job never runs on a file that is about to be swapped out.
    ctx.loading = (ctx.loading || 0) + 1;
    updateGo(ctx);
    try {
      await readFiles(ctx, t, list);
    } finally {
      ctx.loading--;
      if (cur === ctx) filesChanged(ctx);
    }
  }
  async function readFiles(ctx, t, list) {
    if (!t.multiple) list = list.slice(0, 1);
    const before = ctx.files.filter(f => f.fresh).length;
    try { await readEach(ctx, t, list); } finally {
      if (cur === ctx && ctx.files.filter(f => f.fresh).length > before) { sound('file'); bam(ctx); }
    }
  }
  async function readEach(ctx, t, list) {
    for (const file of list) {
      const kind = kindOf(file);
      if (kind !== t.accept) {
        setStatus(ctx, `"${file.name}" is not ${t.accept === 'pdf' ? 'a PDF' : 'a JPG or PNG image'}, so it was skipped.`, true);
        continue;
      }
      if (t.max && ctx.files.length >= t.max) {
        setStatus(ctx, `This tool takes ${t.max} files. Remove one (×) to swap in "${file.name}".`, true);
        continue;
      }
      if (file.size > BIG_BYTES && !await ask(`"${file.name}" is ${size(file.size)}. Big files are slow on this PC and use a lot of memory. Continue?`)) continue;
      setStatus(ctx, 'Reading ' + file.name + '…');
      const entry = { name: file.name, size: file.size, kind, pages: 1, bytes: new Uint8Array(await file.arrayBuffer()), doc: null };
      try {
        if (kind === 'pdf') entry.pages = await countPages(entry, t);
      } catch (e) {
        release(entry);
        if (cur !== ctx) return;
        setStatus(ctx, `"${file.name}": ` + friendly(e), true);
        burst('error');
        continue;
      }
      if (cur !== ctx) { release(entry); return; }
      if (entry.pages > BIG_PAGES && !await ask(`"${file.name}" has ${entry.pages} pages. That's a lot for this PC and may be slow. Continue?`)) { release(entry); continue; }
      if (!t.multiple) ctx.files.splice(0).forEach(release);
      entry.fresh = true;
      ctx.files.push(entry);
      setStatus(ctx, '');
    }
  }

  const CANCEL = new Error('cancelled');
  async function go(ctx) {
    const t = ctx.tool;
    if (ctx.busy || ctx.el.go.disabled) return;
    let opts;
    try {
      opts = t.options ? t.options(ctx) : {};
    } catch (e) {
      setStatus(ctx, friendly(e), true);
      burst('error');
      return;
    }
    const job = ctx.job = { cancelled: false };
    const bar = $('progress', ctx.el.prog), label = $('span', ctx.el.prog);
    ctx.busy = true;
    updateGo(ctx);
    sound('go');
    setStatus(ctx, 'Working…');
    bar.removeAttribute('value');
    label.textContent = '';
    const showBar = setTimeout(() => { ctx.el.prog.hidden = false; }, 1000);
    // Tools call this after every page: updates the bar, yields to the browser, stops if the user left.
    const progress = async (done, total, text) => {
      if (job.cancelled) throw CANCEL;
      bar.max = total;
      bar.value = done;
      label.textContent = text || `${done} / ${total}`;
      await tick();
      if (job.cancelled) throw CANCEL;
    };
    try {
      const out = await t.run(ctx.files, opts, progress);
      if (job.cancelled) return;
      if (out && out.files && out.files.length) await deliver(out);
      setStatus(ctx, out && out.message || 'DONE! Your file is downloading.');
      burst('done');
      if (t.after) t.after(ctx, out);
    } catch (e) {
      if (e === CANCEL || job.cancelled) return;
      setStatus(ctx, friendly(e), true);
      burst('error');
    } finally {
      clearTimeout(showBar);
      ctx.busy = false;
      if (cur === ctx) { ctx.el.prog.hidden = true; updateGo(ctx); }
    }
  }

  async function openTool(id) {
    const meta = META[id];
    const ctx = cur = { id, meta, files: [], tool: null, busy: false, el: null };
    lastId = id;
    showView('tool', meta.name);
    sound('open');
    skeleton(ctx);
    tip('Loading the ' + meta.name + ' tool…');
    try {
      if (!registry[id]) await loadScript(ROOT + 'tools/' + id + '.js');
      const t = registry[id];
      for (const lib of t.libs || []) await need(lib);
      if (cur !== ctx) return;
      ctx.tool = t;
      ctx.el.opts.textContent = '';
      if (t.accept === 'pdf') ctx.el.input.accept = 'application/pdf,.pdf';
      if (t.accept === 'img') ctx.el.input.accept = 'image/jpeg,image/png,.jpg,.jpeg,.png';
      ctx.el.input.multiple = !!t.multiple;
      if (t.goLabel) ctx.el.go.textContent = t.goLabel;
      if (t.setup) t.setup(ctx);
      tip(t.tip || HOME_TIP);
      updateGo(ctx);
      if (pending) {
        const files = pending;
        clearFilter();
        if (t.accept !== 'none') await addFiles(ctx, files);
      }
    } catch (e) {
      if (cur !== ctx) return;
      ctx.el.opts.textContent = '';
      setStatus(ctx, registry[id] ? friendly(e) : 'This tool is not built yet. It arrives in a later phase.', true);
      tip('That one is still in training!');
    }
  }
  function closeTool() {
    const ctx = cur;
    if (!ctx) return;
    cur = null;
    if (ctx.job) ctx.job.cancelled = true;
    if (ctx.tool && ctx.tool.cleanup) { try { ctx.tool.cleanup(ctx); } catch (e) { /* ignore */ } }
    clearThumbs();
    ctx.files.forEach(release);
    ctx.files = [];
    $('#tool').querySelectorAll('canvas').forEach(freeCanvas);
    $('#tool').textContent = '';
  }
  function showView(view, title) {
    const isTool = view === 'tool';
    $('#home').hidden = isTool;
    $('#tool').hidden = !isTool;
    $('#speed').toggleAttribute('hidden', !isTool); // SVG elements have no .hidden property
    document.title = isTool ? title + ' — PDF Slash!' : 'PDF Slash!';
    window.scrollTo(0, 0);
  }
  function route() {
    const id = location.hash.replace(/^#\/?/, '');
    const wasTool = !!cur;
    closeTool();
    if (META[id]) return openTool(id);
    if (wasTool) sound('back');
    showView('home');
    tip(pending ? 'Nice! Now pick what to do with it.' : HOME_TIP);
    const back = lastId && $(`#grid a[data-id="${lastId}"]`);
    if (back && !back.hidden) back.focus();
  }

  // ---------- global events ----------
  function init() {
    buildHome();
    let tipsOn = true;
    try { tipsOn = localStorage.getItem('pdfslash-tips') !== 'off'; } catch (e) { /* storage blocked */ }
    setTips(tipsOn);
    $('#tips-btn').onclick = () => setTips($('#mascot').hidden);
    let soundPref = true;
    try { soundPref = localStorage.getItem('pdfslash-sound') !== 'off'; } catch (e) { /* storage blocked */ }
    setSound(soundPref);
    $('#sound-btn').onclick = () => { setSound(!soundOn); sound('click'); };
    // A light tick for ordinary buttons and choices (GO! and file drops have their own sounds).
    document.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT') return; // the second click a label sends to its radio button
      const b = e.target.closest('button, .choice label');
      if (b && !b.matches('.go, #sound-btn')) sound('click');
    });
    // A soft click when the mouse moves onto a tool card or a button (at most one every 60 ms when sweeping across).
    let lastHover = 0;
    document.addEventListener('mouseover', e => {
      const el = e.target.closest('a.card, a.btn, button');
      if (!el || el.disabled || (e.relatedTarget && el.contains(e.relatedTarget))) return; // still inside the same one
      const now = performance.now();
      if (now - lastHover < 60) return;
      lastHover = now;
      sound('hover');
    });
    $('#mascot-x').onclick = () => setTips(false);
    $('#filter-clear').onclick = () => { clearFilter(); tip(HOME_TIP); };

    const hasFiles = e => e.dataTransfer && e.dataTransfer.types.includes('Files');
    let depth = 0;
    document.addEventListener('dragenter', e => { if (hasFiles(e)) { depth++; document.body.classList.add('dragging'); } });
    document.addEventListener('dragleave', e => { if (hasFiles(e) && --depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
      e.preventDefault();
      depth = 0;
      document.body.classList.remove('dragging');
      if (!hasFiles(e)) return;
      const files = [...e.dataTransfer.files];
      if (cur) addFiles(cur, files);
      else filterHome(files);
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !cur || !$('#modal').hidden) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      location.hash = '#/';
    });
    window.addEventListener('hashchange', route);
    route();
  }

  function register(id, def) { registry[id] = Object.assign({ accept: META[id].accept }, def); }

  if (document.getElementById('grid')) init(); // test pages load app.js without the home page
  return {
    register, tool: id => registry[id], need, tick, loadPdf, openPdfjs, docOf, renderPage, thumb, canvasBlob,
    stage, paintBox, pageView, stampBoxes, imageKind, plainBoxes, COLORS, cssColor, pdfColor, clamp,
    parseRanges, rangePages, choice, picked, slider, h, $, fail, friendly, download, zip, crc32,
    size, plural, base, pad, burst, ask, tip, freeCanvas, sound, TOOLS,
  };
})();
