/* Rotate: turn all pages, or only some, by 90 / 180 / 270 degrees. Uses pdf-lib only. */
'use strict';
App.register('rotate', {
  libs: ['pdflib'],
  tip: 'Choose a direction. Use "Only these pages" to fix just the sideways ones.',

  setup(ctx) {
    const { h } = App;
    ctx.ui = { pages: h('input', { type: 'text', placeholder: 'e.g. 2, 5-7' }) };
    ctx.ui.pagesBox = h('label', null, 'Pages to turn', ctx.ui.pages);
    ctx.el.opts.append(
      h('label', null, 'Turn by'),
      App.choice('rot-angle', [['90', '↻ Right 90°'], ['180', 'Upside down 180°'], ['270', '↺ Left 90°']], '90'),
      h('label', null, 'Which pages'),
      App.choice('rot-which', [['all', 'All pages'], ['some', 'Only these pages']], 'all', () => this.showWhich(ctx)),
      ctx.ui.pagesBox);
    this.showWhich(ctx);
  },

  showWhich(ctx) { ctx.ui.pagesBox.hidden = App.picked(ctx.el.opts, 'rot-which') !== 'some'; },

  options(ctx) {
    const o = { angle: +App.picked(ctx.el.opts, 'rot-angle'), pages: null };
    if (App.picked(ctx.el.opts, 'rot-which') === 'some') o.pages = App.rangePages(App.parseRanges(ctx.ui.pages.value, ctx.files[0].pages));
    return o;
  },

  async run(files, opts, progress) {
    const doc = await App.loadPdf(files[0].bytes), pages = doc.getPages();
    const which = opts.pages ? new Set(opts.pages) : null;
    for (let i = 0; i < pages.length; i++) {
      if (!which || which.has(i + 1)) pages[i].setRotation(PDFLib.degrees((pages[i].getRotation().angle + opts.angle) % 360));
      if (i % 25 === 24) await progress(i + 1, pages.length);
    }
    return { files: [{ name: App.base(files[0].name) + '-rotated.pdf', data: await doc.save() }] };
  },
});
