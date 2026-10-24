/* Compress (lossy): redraws every page as a JPEG picture, one page at a time. pdf.js draws, pdf-lib writes. */
'use strict';
App.register('compress', {
  libs: ['pdflib', 'pdfjs'],
  tip: 'Lower quality = smaller file. Big PDFs take a while on this PC.',

  setup(ctx) {
    const { h } = App, ui = ctx.ui = {};
    ui.quality = App.slider('Quality', 0.3, 0.9, 0.05, 0.6, v => Math.round(v * 100) + '%');
    ui.scale = App.slider('Sharpness', 1, 2, 0.25, 1.5, v => v + '×');
    ctx.el.opts.append(
      h('p', { class: 'note' },h('b', { text: 'Lossy — slow on big files. ' }), 'Every page becomes a picture, so text can no longer be selected or searched. Keep your original.'),
      ui.quality.el,
      h('details', { class: 'more' }, h('summary', { text: 'More options' }), ui.scale.el,
        h('p', { class: 'note', text: 'Lower sharpness makes the file smaller but blurrier. 1.5× suits most documents.' })));
  },

  options(ctx) { return { quality: +ctx.ui.quality.input.value, scale: +ctx.ui.scale.input.value }; },

  async run(files, opts, progress) {
    const f = files[0], doc = await App.docOf(f), out = await PDFLib.PDFDocument.create();
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n), vp = page.getViewport({ scale: 1 });
      const canvas = await App.renderPage(doc, n, opts.scale);
      let jpg;
      try {
        jpg = new Uint8Array(await (await App.canvasBlob(canvas, 'image/jpeg', opts.quality)).arrayBuffer());
      } finally {
        App.freeCanvas(canvas);
      }
      out.addPage([vp.width, vp.height]).drawImage(await out.embedJpg(jpg), { x: 0, y: 0, width: vp.width, height: vp.height });
      await progress(n, doc.numPages, `Page ${n} of ${doc.numPages}`);
    }
    const data = await out.save(), before = f.bytes.length, after = data.length;
    const message = after < before
      ? `DONE! ${App.size(before)} → ${App.size(after)} (${Math.round((1 - after / before) * 100)}% smaller).`
      : `Done, but the result is bigger (${App.size(before)} → ${App.size(after)}). This PDF was already small, so keep the original.`;
    return { files: [{ name: App.base(f.name) + '-compressed.pdf', data }], message };
  },
});
