/* Crop: drag the yellow box on the page, then trim the current page or all pages. pdf.js shows the page, pdf-lib writes. */
'use strict';
App.register('crop', {
  libs: ['pdflib', 'pdfjs'],
  tip: 'Drag the box to move it, drag its yellow corner to resize. Everything outside is cut off.',

  setup(ctx) {
    const { h } = App;
    ctx.ui = { st: null };
    ctx.el.opts.append(
      h('label', null, 'Crop which pages'),
      App.choice('crop-which', [['all', 'All pages'], ['this', 'Only the page shown']], 'all'),
      h('p', { class: 'note', text: 'The same area (as a share of the page) is cut from every page. Arrow keys move the box, Shift + arrows resize it.' }),
      h('button', { type: 'button', class: 'btn', text: 'Reset box', onclick: () => this.reset(ctx) }));
  },

  ready: ctx => ctx.files.length > 0 && !!ctx.ui.st,

  async onFiles(ctx) {
    if (ctx.ui.st) ctx.ui.st.destroy();
    ctx.ui.st = null;
    ctx.el.preview.textContent = '';
    const f = ctx.files[0];
    if (!f) return ctx.refresh();
    let doc;
    try { doc = await App.docOf(f); } catch (e) { return ctx.status(App.friendly(e), true); }
    if (ctx.files[0] !== f) return;
    const panel = App.h('div', { class: 'panel' });
    ctx.el.preview.append(panel);
    ctx.ui.st = App.stage(panel, doc, { fixed: true });
    await ctx.ui.st.show(1);
    this.reset(ctx);
    ctx.refresh();
  },

  reset(ctx) {
    const st = ctx.ui.st;
    if (!st) return;
    st.boxes.slice().forEach(b => st.remove(b));
    ctx.ui.box = st.add({ type: 'crop', label: 'Crop area', page: '*', x: 0.08, y: 0.08, w: 0.84, h: 0.84 });
  },

  options(ctx) {
    const b = ctx.ui.box, st = ctx.ui.st;
    return { x: b.x, y: b.y, w: b.w, h: b.h, pages: App.picked(ctx.el.opts, 'crop-which') === 'this' ? [st.n] : null };
  },

  async run(files, opts, progress) {
    const doc = await App.loadPdf(files[0].bytes), pages = doc.getPages();
    for (let i = 0; i < pages.length; i++) {
      if (opts.pages && !opts.pages.includes(i + 1)) continue;
      const v = App.pageView(pages[i]), r = v.rect(opts.x * v.vw, opts.y * v.vh, opts.w * v.vw, opts.h * v.vh);
      pages[i].setMediaBox(r.x, r.y, r.width, r.height);
      pages[i].setCropBox(r.x, r.y, r.width, r.height);
      if (i % 25 === 24) await progress(i + 1, pages.length);
    }
    return { files: [{ name: App.base(files[0].name) + '-cropped.pdf', data: await doc.save() }] };
  },
});
