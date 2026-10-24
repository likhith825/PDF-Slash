/* Merge: join several PDFs into one, in the order shown in step 1. Uses pdf-lib only. */
'use strict';
App.register('merge', {
  libs: ['pdflib'],
  multiple: true,
  min: 2,
  tip: 'Drop 2 or more PDFs, put them in order with ↑ ↓ or by dragging, then hit GO!',

  setup(ctx) {
    ctx.el.opts.append(App.h('p', { class: 'note', text: 'Nothing to set. The files are joined top to bottom, in the order shown in step 1.' }));
  },

  onFiles(ctx) {
    const pages = ctx.files.reduce((s, f) => s + f.pages, 0);
    if (ctx.files.length === 1) App.tip('Add at least one more PDF to merge.');
    else if (ctx.files.length > 1) App.tip(`Ready: ${App.plural(pages, 'page')} in total. Hit GO!`);
  },

  async run(files, opts, progress) {
    const out = await PDFLib.PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      const src = await App.loadPdf(files[i].bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
      await progress(i + 1, files.length, `File ${i + 1} of ${files.length}`);
    }
    return { files: [{ name: App.base(files[0].name) + '-merged.pdf', data: await out.save() }] };
  },
});
