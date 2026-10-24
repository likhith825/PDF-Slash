/* Edit: put text, boxes, circles, lines and pictures on top of pages. pdf.js shows the page, pdf-lib writes. */
'use strict';
App.register('edit', {
  libs: ['pdflib', 'pdfjs'],
  tip: 'Add something with the buttons, then drag it into place. The yellow corner resizes.',

  setup(ctx) {
    const { h } = App, ui = ctx.ui = { st: null, urls: [] };
    const add = (label, make) => h('button', { type: 'button', class: 'btn', text: label, onclick: () => this.add(ctx, make()) });
    ui.pick = h('input', { type: 'file', accept: 'image/png,image/jpeg,.png,.jpg,.jpeg', hidden: true });
    ui.pick.addEventListener('change', () => this.addPicture(ctx));
    ui.text = h('textarea', { rows: '2' });
    ui.size = App.slider('Text size', 8, 72, 1, 18, v => v + ' pt');
    ui.fill = h('input', { type: 'checkbox' });
    ui.textBox = h('div', null, h('label', null, 'Text', ui.text), ui.size.el);
    ui.colorBox = h('div', null, h('label', null, 'Color'),
      App.choice('ed-color', [['black', 'Black'], ['red', 'Red'], ['blue', 'Blue'], ['yellow', 'Yellow'], ['white', 'White']], 'black', () => this.apply(ctx)));
    ui.fillBox = h('label', null, ui.fill, ' Filled in');
    ui.dirBox = h('div', null, h('label', null, 'Line direction'),
      App.choice('ed-dir', [['h', '—'], ['v', '|'], ['down', '↘'], ['up', '↗']], 'h', () => this.apply(ctx)));
    ui.sel = h('div', { class: 'sel-opts', hidden: true }, h('b', { text: 'Selected item' }), ui.textBox, ui.colorBox, ui.fillBox, ui.dirBox,
      h('button', { type: 'button', class: 'mini', text: 'Delete item', onclick: () => { if (ui.st && ui.st.sel) ui.st.remove(ui.st.sel); } }));
    ui.text.addEventListener('input', () => this.apply(ctx));
    ui.size.input.addEventListener('input', () => this.apply(ctx));
    ui.fill.addEventListener('change', () => this.apply(ctx));
    ctx.el.opts.append(
      h('div', { class: 'toolrow' },
        add('+ Text', () => ({ type: 'text', text: 'Your text', size: 18, color: 'black', w: 0.35, h: 0.05 })),
        add('+ Box', () => ({ type: 'rect', color: 'red', w: 0.3, h: 0.12 })),
        add('+ Circle', () => ({ type: 'ellipse', color: 'red', w: 0.2, h: 0.14 })),
        add('+ Line', () => ({ type: 'line', color: 'black', dir: 'h', w: 0.3, h: 0.03 })),
        h('button', { type: 'button', class: 'btn', text: '+ Picture', onclick: () => { if (this.needPage(ctx)) ui.pick.click(); } }), ui.pick),
      h('p', { class: 'note', text: 'Click an item to change it. Arrow keys move it, Shift + arrows resize, Delete removes.' }),
      ui.sel);
  },

  needPage(ctx) {
    if (ctx.ui.st) return true;
    ctx.status('Drop a PDF first.', true);
    return false;
  },

  add(ctx, box) {
    if (!this.needPage(ctx)) return;
    const k = ctx.ui.st.boxes.length % 5;
    ctx.ui.st.add(Object.assign({ x: 0.1 + k * 0.05, y: 0.1 + k * 0.05 }, box));
    ctx.refresh();
  },

  async addPicture(ctx) {
    const file = ctx.ui.pick.files[0];
    ctx.ui.pick.value = '';
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer()), kind = App.imageKind(bytes);
    if (!kind) return ctx.status(`"${file.name}" isn't a JPG or PNG.`, true);
    const url = URL.createObjectURL(file);
    ctx.ui.urls.push(url);
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch (e) { return ctx.status(`"${file.name}" could not be opened.`, true); }
    // ratio is in points: height/width of the picture
    this.add(ctx, { type: 'image', img: { bytes, kind, url }, w: 0.3, h: 0.2, ratio: img.naturalHeight / img.naturalWidth, label: file.name });
  },

  // Show the settings that fit the selected item.
  select(ctx, b) {
    const ui = ctx.ui;
    ui.sel.hidden = !b;
    if (!b) return;
    ui.textBox.hidden = b.type !== 'text';
    ui.colorBox.hidden = b.type === 'image';
    ui.fillBox.hidden = b.type !== 'rect' && b.type !== 'ellipse';
    ui.dirBox.hidden = b.type !== 'line';
    if (b.type === 'text') { ui.text.value = b.text; ui.size.input.value = b.size; ui.size.input.dispatchEvent(new Event('input')); }
    if (b.color) ctx.el.opts.querySelector(`input[name="ed-color"][value="${b.color}"]`).checked = true;
    if (b.dir) ctx.el.opts.querySelector(`input[name="ed-dir"][value="${b.dir}"]`).checked = true;
    ui.fill.checked = !!b.fill;
  },

  // Settings → selected item
  apply(ctx) {
    const st = ctx.ui.st, b = st && st.sel, ui = ctx.ui;
    if (!b) return;
    if (b.type === 'text') { b.text = ui.text.value; b.size = +ui.size.input.value; }
    if (b.type !== 'image') b.color = App.picked(ctx.el.opts, 'ed-color');
    if (b.type === 'rect' || b.type === 'ellipse') b.fill = ui.fill.checked;
    if (b.type === 'line') b.dir = App.picked(ctx.el.opts, 'ed-dir');
    st.update(b);
  },

  ready: ctx => ctx.files.length > 0 && !!ctx.ui.st,

  async onFiles(ctx) {
    if (ctx.ui.st) ctx.ui.st.destroy();
    ctx.ui.st = null;
    ctx.ui.sel.hidden = true;
    ctx.el.preview.textContent = '';
    const f = ctx.files[0];
    if (!f) return ctx.refresh();
    let doc;
    try { doc = await App.docOf(f); } catch (e) { return ctx.status(App.friendly(e), true); }
    if (ctx.files[0] !== f) return;
    const panel = App.h('div', { class: 'panel' });
    ctx.el.preview.append(panel);
    ctx.ui.st = App.stage(panel, doc, { paint: App.paintBox, onSelect: b => this.select(ctx, b) });
    await ctx.ui.st.show(1);
    ctx.refresh();
  },

  options(ctx) {
    const boxes = App.plainBoxes(ctx.ui.st.boxes);
    if (!boxes.length) App.fail('Add something first: text, a box, a circle, a line or a picture.');
    return { boxes };
  },

  async run(files, opts, progress) {
    const doc = await App.loadPdf(files[0].bytes);
    await App.stampBoxes(doc, opts.boxes, progress);
    return { files: [{ name: App.base(files[0].name) + '-edited.pdf', data: await doc.save() }] };
  },

  cleanup(ctx) { ctx.ui.urls.forEach(u => URL.revokeObjectURL(u)); },
});
