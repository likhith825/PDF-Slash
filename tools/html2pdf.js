/* HTML → PDF: paste HTML, preview it safely, and use the browser's own print to save a PDF. No library. */
'use strict';
App.register('html2pdf', {
  libs: [],
  goLabel: 'PRINT!',
  tip: 'Paste HTML, check the preview, then pick "Save as PDF" in the print window.',

  // The preview page: a strict CSP blocks every download and the sandbox blocks scripts.
  buildDoc(html, o) {
    const margin = o.margin === 'none' ? '0' : '15mm';
    return '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:">' +
      `<style>@page { size: ${o.paper} ${o.orient}; margin: ${margin}; } body { font-family: Arial, sans-serif; }</style>` +
      '</head><body>' + html + '</body></html>';
  },

  setup(ctx) {
    const { h } = App, ui = ctx.ui = {};
    ctx.el.s1Title.textContent = 'Paste HTML';
    ctx.el.s1.textContent = '';
    ui.input = h('textarea', { class: 'html-in', spellcheck: 'false', 'aria-label': 'HTML to turn into a PDF',
      placeholder: '<h1>Hello!</h1>\n<p>Paste or type HTML here.</p>' });
    ctx.el.s1.append(ui.input, h('p', { class: 'note', text: 'Scripts in the HTML do not run, and nothing is fetched from the internet. Pictures must be built in (data: links).' }));
    const changed = () => this.preview(ctx);
    ctx.el.opts.append(
      h('label', null, 'Paper'), App.choice('h-paper', [['A4', 'A4'], ['letter', 'Letter']], 'A4', changed),
      h('label', null, 'Direction'), App.choice('h-orient', [['portrait', 'Portrait'], ['landscape', 'Landscape']], 'portrait', changed),
      h('label', null, 'Margins'), App.choice('h-margin', [['normal', 'Normal'], ['none', 'None']], 'normal', changed));
    ui.frame = h('iframe', { class: 'html-frame', sandbox: 'allow-same-origin allow-modals', title: 'Preview' });
    ctx.el.preview.append(h('div', { class: 'panel' }, h('div', { class: 'panel-bar', text: 'Preview' }), ui.frame));
    let timer = 0;
    ui.input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(changed, 400); ctx.refresh(); });
    this.preview(ctx);
  },

  opts(ctx) {
    return { paper: App.picked(ctx.el.opts, 'h-paper'), orient: App.picked(ctx.el.opts, 'h-orient'), margin: App.picked(ctx.el.opts, 'h-margin') };
  },
  preview(ctx) {
    const ui = ctx.ui, doc = this.buildDoc(ui.input.value || '<p style="color:#888">Your preview appears here.</p>', this.opts(ctx));
    if (doc === ui.lastDoc) return; // already showing this
    ui.lastDoc = doc;
    ui.loaded = new Promise(ok => { ui.frame.onload = ok; });
    ui.frame.srcdoc = doc;
  },

  ready: ctx => !!ctx.ui.input.value.trim(),

  options(ctx) {
    this.preview(ctx);
    return { frame: ctx.ui.frame, loaded: ctx.ui.loaded };
  },

  async run(files, opts) {
    await opts.loaded;
    opts.frame.contentWindow.focus();
    opts.frame.contentWindow.print();
    return { message: 'In the print window, choose "Save as PDF" as the printer, then press Save.' };
  },
});
