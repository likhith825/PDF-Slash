/* Split: by page ranges, every page, or picked pages. Uses pdf-lib; pdf.js loads only if you ask to see the pages. */
'use strict';
(() => {
  const { h } = App;

  // [2,4,5,6] → "2, 4-6"
  function compact(nums) {
    const s = [...new Set(nums)].sort((a, b) => a - b), parts = [];
    for (let i = 0; i < s.length; i++) {
      let j = i;
      while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
      parts.push(i === j ? String(s[i]) : s[i] + '-' + s[j]);
      i = j;
    }
    return parts.join(', ');
  }

  App.register('split', {
    libs: ['pdflib'],
    tip: 'Pick how to cut it. The default splits the PDF in half.',

    setup(ctx) {
      const ui = ctx.ui = {};
      ui.mode = App.choice('split-mode', [['ranges', 'By page ranges'], ['each', 'Every page'], ['pick', 'Pick pages']], 'ranges', () => this.showMode(ctx));
      ui.ranges = h('input', { type: 'text', placeholder: 'e.g. 1-3, 4-6' });
      ui.pick = h('input', { type: 'text', placeholder: 'e.g. 2, 5-7' });
      ui.pick.addEventListener('input', () => this.syncTiles(ctx));
      ui.show = h('button', { type: 'button', class: 'btn', text: 'Show pages to click', onclick: () => this.showPages(ctx) });
      ui.rangesBox = h('div', null, h('label', null, 'Page ranges (each range becomes its own PDF)', ui.ranges));
      ui.eachBox = h('p', { class: 'note', text: 'Every page becomes its own PDF. With more than one page you get a ZIP file.' });
      ui.pickBox = h('div', null, h('label', null, 'Pages to pull out into one new PDF', ui.pick), ui.show);
      ctx.el.opts.append(h('label', null, 'How to split'), ui.mode, ui.rangesBox, ui.eachBox, ui.pickBox);
      this.showMode(ctx);
    },

    showMode(ctx) {
      const mode = App.picked(ctx.el.opts, 'split-mode'), ui = ctx.ui;
      ui.rangesBox.hidden = mode !== 'ranges';
      ui.eachBox.hidden = mode !== 'each';
      ui.pickBox.hidden = mode !== 'pick';
      ctx.el.preview.hidden = mode !== 'pick';
    },

    onFiles(ctx) {
      const f = ctx.files[0], ui = ctx.ui;
      ctx.el.preview.textContent = '';
      ui.tiles = null;
      ui.show.disabled = !f;
      ui.show.textContent = 'Show pages to click';
      if (!f) return;
      const half = Math.ceil(f.pages / 2);
      ui.ranges.value = f.pages > 1 ? `1-${half}, ${half + 1}-${f.pages}` : '1';
      ui.pick.value = '';
    },

    async showPages(ctx) {
      const f = ctx.files[0], ui = ctx.ui;
      if (!f || ui.tiles) return;
      ui.show.disabled = true;
      ui.show.textContent = 'Loading pages…';
      try {
        const doc = await App.docOf(f);
        if (ctx.files[0] !== f) return;
        const grid = h('div', { class: 'pages' });
        ui.tiles = [];
        for (let n = 1; n <= f.pages; n++) {
          const canvas = h('canvas', { width: 0, height: 0 }); // drawn later, when scrolled into view
          const tile = h('div', { class: 'page', tabindex: '0', role: 'checkbox', 'aria-checked': 'false', 'aria-label': 'Page ' + n },
            h('div', { class: 'pc' }, canvas), h('span', { class: 'pn', text: 'Page ' + n }));
          const toggle = () => { tile.classList.toggle('sel'); this.syncText(ctx); };
          tile.addEventListener('click', toggle);
          tile.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
          ui.tiles.push(tile);
          grid.append(tile);
          App.thumb(canvas, doc, n);
        }
        const all = h('button', { type: 'button', class: 'mini', text: 'Select all', onclick: () => { ui.tiles.forEach(t => t.classList.add('sel')); this.syncText(ctx); } });
        const none = h('button', { type: 'button', class: 'mini', text: 'Clear', onclick: () => { ui.tiles.forEach(t => t.classList.remove('sel')); this.syncText(ctx); } });
        ctx.el.preview.append(h('div', { class: 'panel' }, h('div', { class: 'panel-bar' }, 'Click pages to pick them (or press Space).', all, none), grid));
        this.syncTiles(ctx);
        ui.show.textContent = 'Pages shown below';
      } catch (e) {
        ctx.status(App.friendly(e), true);
        ui.show.disabled = false;
        ui.show.textContent = 'Show pages to click';
      }
    },

    // Tiles → text box
    syncText(ctx) {
      const ui = ctx.ui;
      ui.pick.value = compact(ui.tiles.map((t, i) => t.classList.contains('sel') ? i + 1 : 0).filter(Boolean));
      ui.tiles.forEach(t => t.setAttribute('aria-checked', String(t.classList.contains('sel'))));
    },
    // Text box → tiles (ignores half-typed input)
    syncTiles(ctx) {
      const ui = ctx.ui, f = ctx.files[0];
      if (!ui.tiles || !f) return;
      let set = new Set();
      try { set = new Set(App.rangePages(App.parseRanges(ui.pick.value, f.pages))); } catch (e) { /* still typing */ }
      ui.tiles.forEach((t, i) => { t.classList.toggle('sel', set.has(i + 1)); t.setAttribute('aria-checked', String(set.has(i + 1))); });
    },

    options(ctx) {
      const mode = App.picked(ctx.el.opts, 'split-mode'), n = ctx.files[0].pages;
      if (mode === 'ranges') return { mode, ranges: App.parseRanges(ctx.ui.ranges.value, n) };
      if (mode === 'pick') return { mode, pages: [...new Set(App.rangePages(App.parseRanges(ctx.ui.pick.value, n)))] };
      return { mode };
    },

    async run(files, opts, progress) {
      const f = files[0], stem = App.base(f.name);
      const src = await App.loadPdf(f.bytes), n = src.getPageCount();
      let groups;
      if (opts.mode === 'each') {
        const width = String(n).length;
        groups = Array.from({ length: n }, (_, i) => ({ pages: [i + 1], name: `${stem}-page-${App.pad(i + 1, width)}.pdf` }));
      } else if (opts.mode === 'pick') {
        groups = [{ pages: opts.pages, name: `${stem}-picked.pdf` }];
      } else {
        groups = opts.ranges.map(([a, b]) => ({ pages: App.rangePages([[a, b]]), name: a === b ? `${stem}-page-${a}.pdf` : `${stem}-pages-${a}-${b}.pdf` }));
      }
      const used = {}, out = [];
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        used[g.name] = (used[g.name] || 0) + 1;
        const name = used[g.name] > 1 ? g.name.replace(/\.pdf$/, `-${used[g.name]}.pdf`) : g.name;
        const doc = await PDFLib.PDFDocument.create();
        (await doc.copyPages(src, g.pages.map(p => p - 1))).forEach(p => doc.addPage(p));
        out.push({ name, data: await doc.save() });
        await progress(i + 1, groups.length, `Part ${i + 1} of ${groups.length}`);
      }
      return { files: out, zip: `${stem}-split.zip` };
    },
  });
})();
