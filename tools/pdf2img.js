/* PDF → JPG/PNG: draws one page at a time with pdf.js, frees it, and zips the images. */
'use strict';
App.register('pdf2img', {
  libs: ['pdfjs'],
  tip: 'JPG files are small, PNG files are sharper. More sharpness means slower.',

  setup(ctx) {
    const { h } = App, ui = ctx.ui = {};
    ui.quality = App.slider('JPG quality', 0.5, 0.95, 0.05, 0.85, v => Math.round(v * 100) + '%');
    ui.scale = App.slider('Sharpness', 1, 2, 0.25, 1.5, v => v + '×');
    ui.pages = h('input', { type: 'text', placeholder: 'e.g. 1-3, 5' });
    ui.pagesBox = h('label', null, 'Pages to save', ui.pages);
    ctx.el.opts.append(
      h('label', null, 'Image type'),
      App.choice('img-type', [['jpg', 'JPG'], ['png', 'PNG']], 'jpg', () => { ui.quality.el.hidden = App.picked(ctx.el.opts, 'img-type') !== 'jpg'; }),
      ui.quality.el,
      h('label', null, 'Which pages'),
      App.choice('img-which', [['all', 'All pages'], ['some', 'Only these pages']], 'all', () => { ui.pagesBox.hidden = App.picked(ctx.el.opts, 'img-which') !== 'some'; }),
      ui.pagesBox,
      h('details', { class: 'more' }, h('summary', { text: 'More options' }), ui.scale.el,
        h('p', { class: 'note', text: '1.5× is right for most uses. 2× looks better when zoomed but takes longer and needs more memory.' })));
    ui.pagesBox.hidden = true;
  },

  options(ctx) {
    const ui = ctx.ui, type = App.picked(ctx.el.opts, 'img-type');
    const pages = App.picked(ctx.el.opts, 'img-which') === 'some'
      ? [...new Set(App.rangePages(App.parseRanges(ui.pages.value, ctx.files[0].pages)))] : null;
    return { type, quality: +ui.quality.input.value, scale: +ui.scale.input.value, pages };
  },

  async run(files, opts, progress) {
    const f = files[0], stem = App.base(f.name);
    const doc = await App.docOf(f);
    const list = opts.pages || Array.from({ length: doc.numPages }, (_, i) => i + 1);
    const width = String(doc.numPages).length, ext = opts.type === 'png' ? 'png' : 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg', out = [];
    for (let k = 0; k < list.length; k++) {
      const canvas = await App.renderPage(doc, list[k], opts.scale || 1.5);
      try {
        out.push({ name: `${stem}-page-${App.pad(list[k], width)}.${ext}`, type: mime, data: await App.canvasBlob(canvas, mime, opts.quality) });
      } finally {
        App.freeCanvas(canvas);
      }
      await progress(k + 1, list.length, `Page ${k + 1} of ${list.length}`);
    }
    return { files: out, zip: `${stem}-images.zip` };
  },
});
