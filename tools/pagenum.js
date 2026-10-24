/* Page numbers: stamps a number on every page, upright even on rotated pages. Uses pdf-lib only. */
'use strict';
App.register('pagenum', {
  libs: ['pdflib'],
  tip: 'Bottom center is the classic spot. Hit GO! and every page gets its number.',

  setup(ctx) {
    const { h } = App, ui = ctx.ui = {};
    ui.start = h('input', { type: 'number', min: '0', value: '1' });
    ui.size = App.slider('Text size', 8, 24, 1, 12, v => v + ' pt');
    ctx.el.opts.append(
      h('label', null, 'Where'),
      App.choice('pn-pos', [['tl', 'Top left'], ['tc', 'Top center'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['bc', 'Bottom center'], ['br', 'Bottom right']], 'bc'),
      h('label', null, 'Style'),
      App.choice('pn-fmt', [['n', '1'], ['of', 'Page 1 of 9'], ['slash', '1 / 9']], 'n'),
      h('details', { class: 'more' }, h('summary', { text: 'More options' }), h('label', null, 'First number', ui.start), ui.size.el));
  },

  options(ctx) {
    const start = parseInt(ctx.ui.start.value, 10);
    if (!(start >= 0)) App.fail('"First number" must be 0 or more.');
    return { pos: App.picked(ctx.el.opts, 'pn-pos'), format: App.picked(ctx.el.opts, 'pn-fmt'), start, size: +ctx.ui.size.input.value };
  },

  async run(files, opts, progress) {
    const doc = await App.loadPdf(files[0].bytes), font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const pages = doc.getPages(), total = pages.length + opts.start - 1, size = opts.size, m = 24;
    for (let i = 0; i < pages.length; i++) {
      const n = i + opts.start;
      const text = opts.format === 'of' ? `Page ${n} of ${total}` : opts.format === 'slash' ? `${n} / ${total}` : String(n);
      const v = App.pageView(pages[i]), tw = font.widthOfTextAtSize(text, size);
      const sx = opts.pos[1] === 'l' ? m : opts.pos[1] === 'r' ? v.vw - m - tw : (v.vw - tw) / 2;
      const sy = opts.pos[0] === 't' ? m + size : v.vh - m;
      const p = v.toPdf(sx, sy);
      pages[i].drawText(text, { x: p.x, y: p.y, size, font, color: PDFLib.rgb(0, 0, 0), rotate: v.rot });
      if (i % 25 === 24) await progress(i + 1, pages.length);
    }
    return { files: [{ name: App.base(files[0].name) + '-numbered.pdf', data: await doc.save() }] };
  },
});
