/* Compare: two PDFs side by side. Only the page you are looking at is drawn, on both sides. Uses pdf.js only. */
'use strict';
App.register('compare', {
  libs: ['pdfjs'],
  multiple: true,
  max: 2,
  tip: 'Drop two PDFs. Use Prev / Next (or ← →) to flip both together.',

  setup(ctx) {
    ctx.ui = { n: 1, docs: null };
    ctx.el.go.hidden = true;
    ctx.el.go.insertAdjacentElement('afterend', App.h('p', { class: 'note', text: 'Nothing to download here. The two PDFs appear side by side below.' }));
    ctx.el.opts.append(App.h('p', { class: 'note', text: 'Nothing to set. The left side is the first file in step 1, the right side is the second (swap them with ↑ ↓).' }));
  },

  ready: () => false,

  async onFiles(ctx) {
    const ui = ctx.ui;
    ctx.el.preview.querySelectorAll('canvas').forEach(App.freeCanvas);
    ctx.el.preview.textContent = '';
    ui.docs = null;
    if (ctx.files.length < 2) {
      if (ctx.files.length === 1) App.tip('Now drop the second PDF.');
      return;
    }
    const files = ctx.files.slice(0, 2);
    let docs;
    try { docs = await Promise.all(files.map(App.docOf)); } catch (e) { return ctx.status(App.friendly(e), true); }
    if (ctx.files[0] !== files[0] || ctx.files[1] !== files[1]) return;
    const { h } = App;
    ui.docs = docs;
    ui.max = Math.max(docs[0].numPages, docs[1].numPages);
    ui.n = 1;
    ui.label = h('b');
    ui.prev = h('button', { type: 'button', class: 'mini', text: '◀ Prev page', onclick: () => this.go(ctx, ui.n - 1) });
    ui.next = h('button', { type: 'button', class: 'mini', text: 'Next page ▶', onclick: () => this.go(ctx, ui.n + 1) });
    ui.sides = files.map(f => {
      const canvas = h('canvas', { width: 0, height: 0 }), none = h('div', { class: 'none', hidden: true });
      return { canvas, none, el: h('figure', null, h('figcaption', { text: f.name, title: f.name }), canvas, none) };
    });
    const grid = h('div', { class: 'compare' }, ui.sides.map(s => s.el));
    const panel = h('div', { class: 'panel', tabindex: '0', 'aria-label': 'Side by side view. Left and right arrow keys flip pages.' },
      h('div', { class: 'panel-bar', style: 'justify-content:center' }, ui.prev, ui.label, ui.next), grid);
    panel.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(ctx, ui.n - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.go(ctx, ui.n + 1); }
    });
    ctx.el.preview.append(panel);
    ui.chain = Promise.resolve();
    App.tip('Flip with Prev / Next, or click the view and use ← →.');
    await this.go(ctx, 1);
  },

  go(ctx, n) {
    const ui = ctx.ui;
    if (!ui.docs || n < 1 || n > ui.max) return ui.chain;
    ui.n = n;
    ui.label.textContent = `Page ${n} of ${ui.max}`;
    ui.prev.disabled = n === 1;
    ui.next.disabled = n === ui.max;
    ui.chain = ui.chain.then(async () => {
      if (ui.n !== n) return; // a newer flip is waiting
      for (let i = 0; i < 2; i++) {
        const doc = ui.docs[i], side = ui.sides[i];
        const missing = n > doc.numPages;
        side.canvas.hidden = missing;
        side.none.hidden = !missing;
        if (missing) {
          App.freeCanvas(side.canvas);
          side.none.textContent = `No page ${n}: this PDF has ${App.plural(doc.numPages, 'page')}.`;
          continue;
        }
        const page = await doc.getPage(n), vp = page.getViewport({ scale: 1 });
        const avail = Math.max(200, side.el.clientWidth - 10);
        await App.renderPage(doc, n, Math.min(avail / vp.width, 1.5), side.canvas);
      }
    }).catch(e => ctx.status(App.friendly(e), true));
    return ui.chain;
  },
});
