/* Organize: thumbnail grid to reorder (drag or keys), rotate and delete pages. pdf.js draws thumbnails, pdf-lib writes the file. */
'use strict';
App.register('organize', {
  libs: ['pdflib', 'pdfjs'],
  tip: 'Drag pages to reorder. Use the buttons under each page to turn or delete it.',

  setup(ctx) {
    ctx.ui = { items: [] };
    ctx.el.opts.append(
      App.h('p', { class: 'note', text: 'Work on the pages below: drag to reorder, ↺ ↻ to turn, × to delete.' }),
      App.h('p', { class: 'note', text: 'Keyboard: Tab to a page, then ← → to move it, R to turn it, Delete to remove it.' }));
  },

  ready: ctx => ctx.files.length > 0 && ctx.ui.items.length > 0,

  async onFiles(ctx) {
    const f = ctx.files[0], { h } = App;
    ctx.el.preview.querySelectorAll('canvas').forEach(App.freeCanvas);
    ctx.el.preview.textContent = '';
    ctx.ui.items = [];
    if (!f) return ctx.refresh();
    let doc;
    try { doc = await App.docOf(f); } catch (e) { return ctx.status(App.friendly(e), true); }
    if (ctx.files[0] !== f) return;
    const grid = h('div', { class: 'pages' });
    const count = h('span');
    const reset = h('button', { type: 'button', class: 'mini', text: 'Start over', onclick: () => this.onFiles(ctx) });
    ctx.ui.grid = grid;
    ctx.ui.count = count;
    for (let i = 0; i < f.pages; i++) ctx.ui.items.push(this.makeTile(ctx, doc, i));
    this.redraw(ctx);
    ctx.el.preview.append(h('div', { class: 'panel' }, h('div', { class: 'panel-bar' }, count, reset), grid));
    ctx.refresh();
  },

  makeTile(ctx, doc, i) {
    const { h } = App, item = { i, rot: 0 };
    const canvas = h('canvas', { width: 0, height: 0 }); // drawn later, when scrolled into view
    item.pc = h('div', { class: 'pc' }, canvas);
    const btn = (text, label, fn) => h('button', { type: 'button', class: 'mini', text, 'aria-label': label, onclick: e => { e.stopPropagation(); fn(); } });
    item.tile = h('div', { class: 'page', tabindex: '0', draggable: 'true', 'aria-label': 'Page ' + (i + 1) },
      item.pc, h('span', { class: 'pn', text: 'Page ' + (i + 1) }),
      h('div', { class: 'tbar' },
        btn('↺', 'Turn page ' + (i + 1) + ' left', () => this.turn(item, 270)),
        btn('↻', 'Turn page ' + (i + 1) + ' right', () => this.turn(item, 90)),
        btn('×', 'Delete page ' + (i + 1), () => this.remove(ctx, item))));
    const t = item.tile, pos = () => ctx.ui.items.indexOf(item);
    t.addEventListener('keydown', e => {
      if (e.target !== t) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.move(ctx, pos(), pos() - 1); t.focus(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.move(ctx, pos(), pos() + 1); t.focus(); }
      else if (e.key === 'r' || e.key === 'R') this.turn(item, 90);
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.remove(ctx, item); }
    });
    t.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-page', String(pos())); e.dataTransfer.effectAllowed = 'move'; });
    t.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-page')) { e.preventDefault(); t.classList.add('drag-over'); } });
    t.addEventListener('dragleave', () => t.classList.remove('drag-over'));
    t.addEventListener('drop', e => {
      if (!e.dataTransfer.types.includes('text/x-page')) return;
      e.preventDefault();
      e.stopPropagation();
      t.classList.remove('drag-over');
      this.move(ctx, +e.dataTransfer.getData('text/x-page'), pos());
    });
    App.thumb(canvas, doc, i + 1);
    return item;
  },

  turn(item, by) {
    item.rot = (item.rot + by) % 360;
    item.pc.className = 'pc' + (item.rot ? ' r' + item.rot : '');
  },
  move(ctx, from, to) {
    const items = ctx.ui.items;
    if (to < 0 || to >= items.length || from === to) return;
    items.splice(to, 0, items.splice(from, 1)[0]);
    this.redraw(ctx);
  },
  remove(ctx, item) {
    const items = ctx.ui.items, at = items.indexOf(item);
    items.splice(at, 1);
    App.freeCanvas(item.pc.firstChild);
    item.tile.remove();
    this.redraw(ctx);
    const next = items[Math.min(at, items.length - 1)];
    if (next) next.tile.focus();
    ctx.refresh();
  },
  redraw(ctx) {
    ctx.ui.items.forEach(it => ctx.ui.grid.append(it.tile)); // re-append in order; canvases are kept
    ctx.ui.count.textContent = App.plural(ctx.ui.items.length, 'page') + ' in the new file';
  },

  options(ctx) {
    if (!ctx.ui.items.length) App.fail('Every page was deleted. Keep at least one page.');
    return { order: ctx.ui.items.map(({ i, rot }) => ({ i, rot })) };
  },

  async run(files, opts, progress) {
    const src = await App.loadPdf(files[0].bytes), out = await PDFLib.PDFDocument.create();
    const pages = await out.copyPages(src, opts.order.map(o => o.i));
    for (let k = 0; k < pages.length; k++) {
      const p = pages[k];
      p.setRotation(PDFLib.degrees((p.getRotation().angle + opts.order[k].rot) % 360));
      out.addPage(p);
      if (k % 25 === 24) await progress(k + 1, pages.length);
    }
    return { files: [{ name: App.base(files[0].name) + '-organized.pdf', data: await out.save() }] };
  },
});
