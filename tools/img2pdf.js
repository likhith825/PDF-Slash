/* JPG/PNG → PDF: one image per page, in the order shown in step 1. Uses pdf-lib only (no image decoding in the page). */
'use strict';
App.register('img2pdf', {
  libs: ['pdflib'],
  multiple: true,
  tip: 'Drop your JPG or PNG images. Each one becomes a page, top to bottom.',

  setup(ctx) {
    const { h } = App;
    ctx.el.opts.append(
      h('label', null, 'Page size'),
      App.choice('img-size', [['fit', 'Same as image'], ['a4', 'A4'], ['letter', 'Letter']], 'fit'),
      h('label', null, 'Margin'),
      App.choice('img-margin', [['0', 'None'], ['20', 'Small'], ['40', 'Big']], '0'),
      h('p', { class: 'note', text: 'A4 and Letter pages turn sideways automatically for wide images.' }));
  },

  options(ctx) {
    return { size: App.picked(ctx.el.opts, 'img-size'), margin: +App.picked(ctx.el.opts, 'img-margin') };
  },

  async run(files, opts, progress) {
    const SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
    const doc = await PDFLib.PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      const b = files[i].bytes;
      let img;
      try {
        // Trust the file's first bytes, not its name.
        if (b[0] === 0xFF && b[1] === 0xD8) img = await doc.embedJpg(b);
        else if (b[0] === 0x89 && b[1] === 0x50) img = await doc.embedPng(b);
        else throw new Error('type');
      } catch (e) {
        App.fail(`"${files[i].name}" isn't a JPG or PNG this tool can read. Try saving it again as JPG.`);
      }
      const m = opts.margin;
      let pw, ph;
      if (opts.size === 'fit') {
        pw = img.width * 0.75 + 2 * m; // 96 dpi pixels → points
        ph = img.height * 0.75 + 2 * m;
      } else {
        [pw, ph] = SIZES[opts.size];
        if (img.width > img.height) [pw, ph] = [ph, pw];
      }
      const scale = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
      const w = img.width * scale, hgt = img.height * scale;
      doc.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - hgt) / 2, width: w, height: hgt });
      await progress(i + 1, files.length, `Image ${i + 1} of ${files.length}`);
    }
    const name = App.base(files[0].name) + (files.length > 1 ? '-combined' : '') + '.pdf';
    return { files: [{ name, data: await doc.save() }] };
  },
});
