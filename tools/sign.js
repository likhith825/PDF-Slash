/* Sign: draw or type a signature, then place it on any page as a picture. pdf.js shows the page, pdf-lib writes. */
'use strict';
App.register('sign', {
  libs: ['pdflib', 'pdfjs'],
  tip: 'Make your signature, press "Place on page", then drag it where it belongs.',

  setup(ctx) {
    const { h } = App, ui = ctx.ui = { st: null, urls: [], inked: false };
    ui.pad = h('canvas', { class: 'pad', width: '800', height: '260', 'aria-label': 'Signature pad: draw with the mouse' });
    ui.name = h('input', { type: 'text', placeholder: 'Your name', maxlength: '40' });
    ui.preview = h('div', { class: 'sig-preview', 'aria-hidden': 'true' });
    ui.name.addEventListener('input', () => { ui.preview.textContent = ui.name.value; });
    ui.drawBox = h('div', null, ui.pad, h('p', null, h('button', { type: 'button', class: 'mini', text: 'Clear', onclick: () => this.clearPad(ctx) })));
    ui.typeBox = h('div', null, h('label', null, 'Type your name', ui.name), ui.preview);
    ctx.el.opts.append(
      App.choice('sig-mode', [['draw', 'Draw'], ['type', 'Type']], 'draw', () => this.showMode(ctx)),
      ui.drawBox, ui.typeBox,
      h('label', null, 'Ink'), App.choice('sig-ink', [['black', 'Black'], ['blue', 'Blue']], 'black', () => this.inkChanged(ctx)),
      h('button', { type: 'button', class: 'btn red', text: 'Place on page', onclick: () => this.place(ctx) }),
      h('p', { class: 'note', text: 'You can place it more than once. Select a signature and press Delete to remove it.' }));
    this.initPad(ctx);
    this.showMode(ctx);
  },

  showMode(ctx) {
    const draw = App.picked(ctx.el.opts, 'sig-mode') === 'draw';
    ctx.ui.drawBox.hidden = !draw;
    ctx.ui.typeBox.hidden = draw;
  },
  inkChanged(ctx) { ctx.ui.preview.style.color = App.cssColor(App.picked(ctx.el.opts, 'sig-ink')); },

  initPad(ctx) {
    const pad = ctx.ui.pad, g = pad.getContext('2d');
    g.lineCap = g.lineJoin = 'round';
    g.lineWidth = 5;
    let last = null;
    const at = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
    pad.addEventListener('pointerdown', e => {
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* keep drawing without capture */ }
      last = at(e);
    });
    pad.addEventListener('pointermove', e => {
      if (!last) return;
      const p = at(e);
      g.strokeStyle = App.cssColor(App.picked(ctx.el.opts, 'sig-ink'));
      g.beginPath();
      g.moveTo(last[0], last[1]);
      g.lineTo(p[0], p[1]);
      g.stroke();
      last = p;
      ctx.ui.inked = true;
    });
    const end = () => { last = null; };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  },
  clearPad(ctx) {
    ctx.ui.pad.getContext('2d').clearRect(0, 0, ctx.ui.pad.width, ctx.ui.pad.height);
    ctx.ui.inked = false;
  },

  // The signature as a PNG trimmed to the ink.
  async makeImage(ctx) {
    const ink = App.cssColor(App.picked(ctx.el.opts, 'sig-ink'));
    let src;
    if (App.picked(ctx.el.opts, 'sig-mode') === 'type') {
      const name = ctx.ui.name.value.trim();
      if (!name) App.fail('Type your name first.');
      src = document.createElement('canvas');
      const g = src.getContext('2d'), font = '96px "Segoe Script", "Brush Script MT", cursive';
      g.font = font;
      src.width = Math.ceil(g.measureText(name).width) + 40;
      src.height = 170;
      g.font = font;
      g.fillStyle = ink;
      g.fillText(name, 20, 120);
    } else {
      if (!ctx.ui.inked) App.fail('Draw your signature on the pad first.');
      src = ctx.ui.pad;
    }
    // Trim empty space around the ink.
    const g = src.getContext('2d'), { width: w, height: hgt } = src, px = g.getImageData(0, 0, w, hgt).data;
    let x0 = w, y0 = hgt, x1 = -1, y1 = -1;
    for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) App.fail('The signature is empty.');
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 9;
    out.height = y1 - y0 + 9;
    out.getContext('2d').drawImage(src, x0 - 4, y0 - 4, out.width, out.height, 0, 0, out.width, out.height);
    const blob = await App.canvasBlob(out, 'image/png');
    const ratio = out.height / out.width;
    App.freeCanvas(out);
    if (src !== ctx.ui.pad) App.freeCanvas(src);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: 'png', url: URL.createObjectURL(blob), ratio };
  },

  async place(ctx) {
    if (!ctx.ui.st) return ctx.status('Drop a PDF first.', true);
    try {
      const img = await this.makeImage(ctx);
      ctx.ui.urls.push(img.url);
      const k = ctx.ui.st.boxes.length % 4;
      ctx.ui.st.add({ type: 'image', label: 'Signature', img: { bytes: img.bytes, kind: 'png', url: img.url }, ratio: img.ratio, x: 0.55 - k * 0.05, y: 0.75 - k * 0.05, w: 0.3, h: 0.1 });
      ctx.status('');
      ctx.refresh();
    } catch (e) {
      ctx.status(App.friendly(e), true);
    }
  },

  ready: ctx => ctx.files.length > 0 && !!ctx.ui.st && ctx.ui.st.boxes.length > 0,

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
    ctx.ui.st = App.stage(panel, doc, { paint: App.paintBox, onSelect: () => ctx.refresh() });
    await ctx.ui.st.show(1);
    ctx.refresh();
  },

  options(ctx) { return { boxes: App.plainBoxes(ctx.ui.st.boxes) }; },

  async run(files, opts, progress) {
    const doc = await App.loadPdf(files[0].bytes);
    await App.stampBoxes(doc, opts.boxes, progress);
    return { files: [{ name: App.base(files[0].name) + '-signed.pdf', data: await doc.save() }] };
  },

  cleanup(ctx) { ctx.ui.urls.forEach(u => URL.revokeObjectURL(u)); },
});
