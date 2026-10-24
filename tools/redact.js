/* Redact: black boxes are burned into a picture of each marked page, so the hidden text is really gone.
   Pages without boxes are copied unchanged. pdf.js draws, pdf-lib writes. */
'use strict';
App.register('redact', {
  libs: ['pdflib', 'pdfjs'],
  tip: 'Drag across anything private to black it out. Check every page before you hit GO!',

  setup(ctx) {
    const { h } = App, ui = ctx.ui = { st: null };
    ui.scale = App.slider('Sharpness of marked pages', 1, 2, 0.25, 1.5, v => v + '×');
    ui.count = h('p', { class: 'note' });
    ctx.el.opts.append(
      h('p', { class: 'note', text: 'Drag on the page to draw a black box. Use Prev / Next page to mark other pages.' }),
      h('p', { class: 'note' }, h('b', { text: 'Pages with boxes become pictures: ' }), 'their text can no longer be selected or searched. That is what makes the redaction safe.'),
      ui.count,
      h('details', { class: 'more' }, h('summary', { text: 'More options' }), ui.scale.el));
  },

  ready: ctx => ctx.files.length > 0 && !!ctx.ui.st && ctx.ui.st.boxes.length > 0,

  async onFiles(ctx) {
    if (ctx.ui.st) ctx.ui.st.destroy();
    ctx.ui.st = null;
    ctx.el.preview.textContent = '';
    this.count(ctx);
    const f = ctx.files[0];
    if (!f) return ctx.refresh();
    let doc;
    try { doc = await App.docOf(f); } catch (e) { return ctx.status(App.friendly(e), true); }
    if (ctx.files[0] !== f) return;
    const panel = App.h('div', { class: 'panel' });
    ctx.el.preview.append(panel);
    ctx.ui.st = App.stage(panel, doc, {
      drawNew: () => ({ type: 'redact', label: 'Black box' }),
      onSelect: () => { this.count(ctx); ctx.refresh(); },
    });
    panel.querySelector('.layer').classList.add('drawing');
    await ctx.ui.st.show(1);
    ctx.refresh();
  },

  count(ctx) {
    const st = ctx.ui.st, n = st ? st.boxes.length : 0;
    const pages = st ? new Set(st.boxes.map(b => b.page)).size : 0;
    ctx.ui.count.textContent = n ? `${App.plural(n, 'box')} on ${App.plural(pages, 'page')}.` : 'No boxes yet.';
  },

  options(ctx) {
    return { boxes: ctx.ui.st.boxes.map(({ page, x, y, w, h }) => ({ page, x, y, w, h })), scale: +ctx.ui.scale.input.value };
  },

  async run(files, opts, progress) {
    const src = await App.loadPdf(files[0].bytes), view = await App.docOf(files[0]);
    const out = await PDFLib.PDFDocument.create(), total = src.getPageCount();
    const marked = new Map();
    opts.boxes.forEach(b => { if (!marked.has(b.page)) marked.set(b.page, []); marked.get(b.page).push(b); });
    for (let n = 1; n <= total; n++) {
      const boxes = marked.get(n);
      if (!boxes) {
        const [copy] = await out.copyPages(src, [n - 1]);
        out.addPage(copy);
        continue;
      }
      const page = await view.getPage(n), vp = page.getViewport({ scale: 1 });
      const canvas = await App.renderPage(view, n, opts.scale || 1.5);
      let jpg;
      try {
        const g = canvas.getContext('2d');
        g.fillStyle = '#000';
        boxes.forEach(b => g.fillRect(Math.floor(b.x * canvas.width), Math.floor(b.y * canvas.height), Math.ceil(b.w * canvas.width) + 1, Math.ceil(b.h * canvas.height) + 1));
        jpg = new Uint8Array(await (await App.canvasBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
      } finally {
        App.freeCanvas(canvas);
      }
      out.addPage([vp.width, vp.height]).drawImage(await out.embedJpg(jpg), { x: 0, y: 0, width: vp.width, height: vp.height });
      await progress(n, total, `Page ${n} of ${total}`);
    }
    return {
      files: [{ name: App.base(files[0].name) + '-redacted.pdf', data: await out.save() }],
      message: `DONE! ${App.plural(marked.size, 'page')} blacked out for good. Open the file and check it before you share it.`,
    };
  },
});
