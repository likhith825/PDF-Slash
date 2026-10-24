/* Watermark: text or an image, in the center or tiled, see-through. Uses pdf-lib only. */
'use strict';
App.register('watermark', {
  libs: ['pdflib'],
  tip: 'Type your stamp text, or switch to Image and choose a logo.',

  setup(ctx) {
    const { h } = App, ui = ctx.ui = { img: null };
    ui.text = h('input', { type: 'text', value: 'CONFIDENTIAL', maxlength: '60' });
    ui.size = App.slider('Text size', 20, 120, 5, 60, v => v + ' pt');
    ui.opacity = App.slider('See-through', 0.1, 1, 0.05, 0.25, v => Math.round(v * 100) + '% ink');
    ui.scale = App.slider('Image width', 10, 100, 5, 40, v => v + '% of page');
    ui.pick = h('input', { type: 'file', accept: 'image/png,image/jpeg,.png,.jpg,.jpeg', hidden: true });
    ui.pickBtn = h('button', { type: 'button', class: 'btn', text: 'Choose image…', onclick: () => ui.pick.click() });
    ui.pickName = h('span', { class: 'note', text: ' No image yet' });
    ui.pick.addEventListener('change', async () => {
      const file = ui.pick.files[0];
      ui.pick.value = '';
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer()), kind = App.imageKind(bytes);
      if (!kind) { ctx.status(`"${file.name}" isn't a JPG or PNG.`, true); return; }
      ui.img = { bytes, kind, name: file.name };
      ui.pickName.textContent = ' ' + file.name;
      ctx.status('');
      ctx.refresh();
    });
    ui.textBox = h('div', null, h('label', null, 'Text', ui.text), ui.size.el,
      h('label', null, 'Angle'), App.choice('wm-angle', [['45', 'Diagonal'], ['0', 'Flat']], '45'),
      h('label', null, 'Color'), App.choice('wm-color', [['gray', 'Gray'], ['red', 'Red'], ['black', 'Black'], ['blue', 'Blue']], 'gray'));
    ui.imgBox = h('div', null, h('p', null, ui.pickBtn, ui.pickName, ui.pick), ui.scale.el);
    ctx.el.opts.append(
      App.choice('wm-type', [['text', 'Text'], ['image', 'Image']], 'text', () => this.showType(ctx)),
      ui.textBox, ui.imgBox,
      h('label', null, 'Layout'), App.choice('wm-layout', [['center', 'Once, in the center'], ['tile', 'Tiled all over']], 'center'),
      ui.opacity.el);
    this.showType(ctx);
  },

  showType(ctx) {
    const isText = App.picked(ctx.el.opts, 'wm-type') === 'text';
    ctx.ui.textBox.hidden = !isText;
    ctx.ui.imgBox.hidden = isText;
    ctx.refresh();
  },

  ready: ctx => ctx.files.length > 0 && (App.picked(ctx.el.opts, 'wm-type') === 'text' || !!ctx.ui.img),

  options(ctx) {
    const ui = ctx.ui, type = App.picked(ctx.el.opts, 'wm-type');
    const o = { type, layout: App.picked(ctx.el.opts, 'wm-layout'), opacity: +ui.opacity.input.value };
    if (type === 'text') {
      o.text = ui.text.value.trim();
      if (!o.text) App.fail('Type the watermark text first.');
      Object.assign(o, { size: +ui.size.input.value, angle: +App.picked(ctx.el.opts, 'wm-angle'), color: App.picked(ctx.el.opts, 'wm-color') });
    } else {
      Object.assign(o, { img: ui.img, scale: +ui.scale.input.value / 100 });
    }
    return o;
  },

  async run(files, opts, progress) {
    const doc = await App.loadPdf(files[0].bytes), pages = doc.getPages();
    const isText = opts.type === 'text';
    const font = isText ? await doc.embedFont(PDFLib.StandardFonts.HelveticaBold) : null;
    const img = isText ? null : opts.img.kind === 'png' ? await doc.embedPng(opts.img.bytes) : await doc.embedJpg(opts.img.bytes);
    const a = (opts.angle || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i], v = App.pageView(page);
      let iw, ih, tw, ch, stepX, stepY;
      if (isText) {
        tw = font.widthOfTextAtSize(opts.text, opts.size);
        ch = opts.size * 0.7;
        stepX = tw + opts.size * 2;
        stepY = opts.size * 4;
      } else {
        iw = v.vw * opts.scale;
        ih = iw * img.height / img.width;
        stepX = iw * 1.5;
        stepY = ih * 1.5;
      }
      // Centers in screen points (origin top-left of the page as displayed).
      const centers = [];
      if (opts.layout === 'tile') {
        for (let row = 0, y = stepY / 2; y < v.vh + stepY; row++, y += stepY) {
          for (let x = (row % 2 ? 0 : stepX / 2); x < v.vw + stepX; x += stepX) centers.push([x, y]);
        }
      } else {
        centers.push([v.vw / 2, v.vh / 2]);
      }
      for (const [cx, cy] of centers) {
        if (isText) {
          // Start of the baseline so the turned text is centered on (cx, cy); math in a y-up frame.
          const ox = cx - cos * tw / 2 + sin * ch / 2, oyUp = (v.vh - cy) - sin * tw / 2 - cos * ch / 2;
          const p = v.toPdf(ox, v.vh - oyUp);
          page.drawText(opts.text, { x: p.x, y: p.y, size: opts.size, font, color: App.pdfColor(opts.color), opacity: opts.opacity, rotate: PDFLib.degrees(v.r + opts.angle) });
        } else {
          const p = v.toPdf(cx - iw / 2, cy + ih / 2);
          page.drawImage(img, { x: p.x, y: p.y, width: iw, height: ih, opacity: opts.opacity, rotate: v.rot });
        }
      }
      if (i % 10 === 9) await progress(i + 1, pages.length);
    }
    return { files: [{ name: App.base(files[0].name) + '-watermarked.pdf', data: await doc.save() }] };
  },
});
