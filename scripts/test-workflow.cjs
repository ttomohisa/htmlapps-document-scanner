'use strict';
// Dependency-free regression tests run the actual inline app in an isolated DOM/canvas harness.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { webcrypto } = require('node:crypto');
let html = fs.readFileSync(process.argv[2] || require('node:path').join(__dirname, '../src/index.template.html'), 'utf8');
if (!html.includes('// APP:BEGIN')) {
  const payload = html.match(/const b='([^']+)'/);
  assert.ok(payload, 'Self-extract variant contains a gzip payload');
  html = require('node:zlib').gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
}
const app = html.slice(html.indexOf('// APP:BEGIN'), html.indexOf('\napplyI18n();'));
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const elements = new Map(), revoked = [], downloads = [], shared = [];
  function element(tag = '') {
    const classes = new Set(), listeners = new Map();
    const el = { tag, dataset: {}, style: {}, value: '', textContent: '', innerHTML: '', disabled: false, open: false,
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle(x, on = !classes.has(x)) { on ? classes.add(x) : classes.delete(x); } },
      addEventListener(name, fn) { listeners.set(name, fn); }, fire(name, event = {}) { return listeners.get(name)?.({ target: el, preventDefault() {}, ...event }); },
      setAttribute(name, value) { this[name] = value; }, appendChild() {}, remove() {}, focus() {},
      click() { if (tag === 'a') downloads.push({ url: this.href, name: this.download }); return this.fire('click'); },
      showModal() { this.open = true; }, close() { this.open = false; this.fire('close'); },
      getBoundingClientRect() { return { width: 900, height: 600, top: 0, left: 0 }; }
    };
    if (tag === 'canvas') {
      el.width = 0; el.height = 0;
      const ctx = { drawImage() {}, translate() {}, rotate() {},
        getImageData() { return { data: el.pixels || new Uint8ClampedArray(el.width * el.height * 4) }; },
        createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData(data) { el.pixels = data.data; }
      };
      el.getContext = kind => kind === 'webgl' ? null : ctx;
      el.toBlob = (fn, type) => fn(new Blob([new Uint8Array([255,216,255,217])], { type }));
      el.toDataURL = () => 'data:image/jpeg;base64,/9j/2Q==';
    }
    return el;
  }
  const $ = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const document = { querySelector: $, querySelectorAll: () => [], createElement: element, addEventListener() {}, documentElement: {}, body: element() };
  const c = vm.createContext({ document, window: { addEventListener() {} }, addEventListener() {},
    navigator: { language: 'en', canShare: () => true, share: async x => shared.push(x) },
    localStorage: { getItem: () => null }, crypto: webcrypto, innerWidth: 1200, matchMedia: () => ({ matches: false }),
    requestAnimationFrame() {}, cancelAnimationFrame() {}, performance, Blob, File, Uint8Array, Uint8ClampedArray,
    URL: { revokeObjectURL: url => revoked.push(url), createObjectURL: () => 'blob:generated' },
    console: { ...console, warn() {} }, setTimeout(fn, ms) { if (ms <= 30) queueMicrotask(fn); return 1; }, clearTimeout() {}
  });
  vm.runInContext(app, c);
  const run = code => vm.runInContext(code, c);
  run(`renderPages=()=>{}; resetEditorView=()=>{}; detectDocument=c=>({corners:defaultCorners(c.width,c.height),confidence:.8}); fileToBitmap=async file=>{if(file.bad)throw Error('decode');return {width:1000,height:700,close(){}}};`);
  $('#paperSelect').value = 'a4'; $('#colorSelect').value = 'page'; $('#limitSelect').value = '0';
  return { $, c, run, state: run('state'), revoked, downloads, shared, element };
}
function pdf(h) { const blob = new Blob(['existing-pdf'], { type: 'application/pdf' }); h.state.lastPdf = { blob, url: 'blob:existing', name: 'document.pdf', limit: 0 }; h.$('#filenameInput').value = 'document.pdf'; return blob; }
function page(id) { return { id, canvas: { width: 1000, height: 700 }, filter: 'none', rotation: 1, sourceBlob: new Blob(['source']), corners: [{x:0,y:0},{x:1000,y:0},{x:1000,y:700},{x:0,y:700}] }; }
const files = n => Array.from({ length: n }, (_, i) => ({ name: `page-${i + 1}.png` }));

test('Full image retains exact source boundaries and dimensions', () => {
  const h = harness(); h.state.editor = { source: { width: 1000, height: 700 } };
  h.$('#fullImageBtn').fire('click');
  assert.deepEqual(plain(h.state.editor.corners), [{x:0,y:0},{x:1000,y:0},{x:1000,y:700},{x:0,y:700}]);
  assert.deepEqual(plain(h.run('cornerDimensions(state.editor.corners)')), { w:1000, h:700 });
});
test('Canvas fallback samples every full-image pixel, including all four borders', () => {
  const h = harness(), src = h.element('canvas'); src.width = 40; src.height = 32;
  src.pixels = Uint8ClampedArray.from({ length: 40 * 32 * 4 }, (_, i) => i % 4 === 3 ? 255 : Math.floor(i / 4) % 251);
  h.c.source = src; const output = h.run('warpCanvas(source,defaultCorners(source.width,source.height,0),1000)');
  assert.equal(output.width, 40); assert.equal(output.height, 32); assert.deepEqual(output.pixels, src.pixels);
});
test('Unchanged or edited filename preserves finished PDF bytes and URL for download/share', async () => {
  const h = harness(), blob = pdf(h);
  for (const [input, expected] of [['document.pdf','document.pdf'], ['new:name','new_name.pdf'],['UPPER.PDF','UPPER.PDF'],['   ','document.pdf'],['.pdf','document.pdf']]) {
    h.$('#filenameInput').value = input; h.$('#filenameInput').fire('input'); h.$('#filenameInput').fire('blur');
    assert.equal(h.state.lastPdf?.blob, blob); assert.equal(h.state.lastPdf.url, 'blob:existing'); assert.equal(h.state.lastPdf.name, expected);
    assert.equal(h.$('#resultName').textContent, expected); assert.equal(h.$('#filenameInput').value, expected);
    h.run('downloadPdf()'); await h.run('sharePdf()');
    assert.equal(h.downloads.at(-1).name, expected); assert.equal(h.shared.at(-1).files[0].name, expected);
    assert.equal(await h.shared.at(-1).files[0].text(), 'existing-pdf');
  }
  assert.deepEqual(h.revoked, []);
});
test('Download synchronizes latest input even without a blur event', () => {
  const h = harness(); pdf(h); h.$('#filenameInput').value = 'direct/new'; h.run('downloadPdf()');
  assert.equal(h.downloads[0].name, 'direct_new.pdf');
});
test('Content settings still invalidate the generated PDF', () => {
  const h = harness(); for (const id of ['paperSelect','colorSelect','limitSelect']) { pdf(h); h.$('#'+id).fire('change'); assert.equal(h.state.lastPdf, null); }
  assert.equal(h.revoked.length, 3);
});
test('Batch shows filename/progress and Skip moves to next image', async () => {
  const h = harness(); h.c.files = files(3); const importing = h.run('importFiles(files)'); await tick();
  assert.match(h.$('#importProgress').textContent, /1\s*\/\s*3/); assert.match(h.$('#importProgress').textContent, /page-1.png/);
  assert.equal(h.$('#skipImageBtn').classList.contains('hidden'), false);
  h.$('#skipImageBtn').fire('click'); await tick(); assert.match(h.$('#importProgress').textContent, /2\s*\/\s*3/);
  h.$('#stopImportBtn').fire('click'); await importing; assert.equal(h.state.editor, null);
});
for (const action of ['stopImportBtn','editorCloseBtn','Escape']) test(`${action} stops remaining batch and preserves previously added pages`, async () => {
  const h = harness(); h.state.pages = [page('already-added')]; h.c.files = files(3);
  const importing = h.run('importFiles(files)'); await tick();
  if (action === 'Escape') h.$('#editorDialog').fire('cancel'); else h.$('#'+action).fire('click');
  await tick(); assert.equal(h.state.editor, null); await importing; assert.equal(h.state.pages[0].id, 'already-added');
  const restart = h.run('importFiles([files[0]])'); await tick(); assert.ok(h.state.editor); h.$('#editorCloseBtn').fire('click'); await restart;
});
test('Malformed files continue, queue ignores overlap, and batch is capped at 30', async () => {
  const h = harness(); h.c.files = [{ name:'bad.png',bad:true }, ...files(31)]; const importing = h.run('importFiles(files)'); await tick();
  assert.match(h.$('#importProgress').textContent, /2\s*\/\s*30/); const first = h.state.editor;
  await h.run('importFiles([{name:"overlap.png"}])'); assert.equal(h.state.editor, first);
  for (let i=2;i<=30;i++) { assert.match(h.$('#importProgress').textContent,new RegExp(`${i}\\s*\\/\\s*30`)); h.$('#skipImageBtn').fire('click'); await tick(); }
  await importing; assert.equal(h.state.editor, null);
});
test('Delete all requires confirmation and Undo restores exact editable objects in order', async () => {
  const h = harness(), a=page('a'), b=page('b'); h.state.pages=[a,b];
  let clearing=h.$('#clearAllBtn').fire('click'); assert.equal(h.state.pages.length,2); h.run('confirmUI.finish(false)'); await clearing; assert.equal(h.state.pages.length,2);
  clearing=h.$('#clearAllBtn').fire('click'); h.run('confirmUI.finish(true)'); await clearing;
  assert.equal(h.state.pages.length,0); assert.equal(h.$('#toastAction').classList.contains('hidden'),false);
  const added=page('later'); h.state.pages.push(added); h.$('#toastAction').fire('click');
  assert.deepEqual(Array.from(h.state.pages),[a,b,added]); assert.equal(h.state.pages[0],a); assert.equal(h.state.pages[1].sourceBlob,b.sourceBlob);
  h.$('#toastAction').fire('click'); assert.equal(h.state.pages.length,3);
});
test('PDF writer preserves page order and A4/original page boxes', async () => {
  const h=harness(); h.c.entries=[{blob:new Blob(['first']),width:1000,height:700},{blob:new Blob(['second']),width:700,height:1000}];
  const a4=await h.run('buildPdf(entries,"a4")'); const text=await a4.text();
  assert.ok(text.startsWith('%PDF-1.4')); assert.match(text,/\/Count 2/); assert.ok(text.indexOf('first')<text.indexOf('second'));
  assert.match(text,/\/MediaBox \[0 0 841.89 595.28\]/); assert.match(text,/\/MediaBox \[0 0 595.28 841.89\]/);
  const original=await h.run('buildPdf(entries,"original")'); assert.match(await original.text(),/\/MediaBox \[0 0 595.28 416.70\]/);
});
test('Saving is single-flight; canceling a pending save cannot add or close a later editor', async () => {
  const h=harness(); h.c.files=files(2); const importing=h.run('importFiles(files)'); await tick();
  h.run('editorOutput=ed=>ed.source; canvasToDataURLThumb=async()=>"thumb"; canvasToBlob=()=>new Promise(resolve=>globalThis.finishEncoding=resolve)');
  const saving=h.run('saveEditorPage()'); await tick(); const firstEditor=h.state.editor;
  const duplicate=h.run('saveEditorPage()'); await tick(); assert.equal(firstEditor.saving,true);
  h.$('#editorCloseBtn').fire('click'); await importing;
  const nextImport=h.run('importFiles([files[1]])'); await tick(); const nextEditor=h.state.editor;
  h.run('finishEncoding(new Blob(["encoded"]))'); await saving; await duplicate;
  assert.equal(h.state.pages.length,0); assert.equal(h.state.editor,nextEditor); h.$('#editorCloseBtn').fire('click'); await nextImport;
});
test('A delayed decode cannot overlap a new import or camera capture', async () => {
  const h=harness(); h.run('fileToBitmap=()=>new Promise(resolve=>globalThis.finishDecode=resolve)'); h.c.files=files(2);
  const importing=h.run('importFiles(files)'); await tick(); await h.run('importFiles([{name:"overlap.png"}])');
  h.state.stream={}; h.$('#video').readyState=2; h.run('videoSourceRect=()=>({sx:0,sy:0,sw:100,sh:100})');
  await h.run('captureFrame()'); assert.equal(h.state.editor,null);
  h.run('finishDecode({width:100,height:100,close(){}})'); await tick(); h.$('#editorCloseBtn').fire('click'); await importing;
});
test('All new import labels exist in Japanese and English', () => {
  const h=harness(); for(const lang of ['ja','en']) { h.state.lang=lang; for(const key of ['skipImage','stopImport','importProgress']) assert.notEqual(h.run(`t('${key}')`),key); }
});
test('Full image preserves tiny dimensions and still respects the long-edge cap', () => {
  const h=harness(); for(const [w,hh,cap,ow,oh] of [[16,12,1800,16,12],[1,1,1800,1,1],[1000,700,100,100,70]]) {
    const src=h.element('canvas');src.width=w;src.height=hh;h.c.source=src;h.c.cap=cap;
    const out=h.run('warpPerspective(source,defaultCorners(source.width,source.height,0),cap)');assert.equal(out.width,ow);assert.equal(out.height,oh);
  }
});
function pageAction(h,id,action) {
  const card={dataset:{id}},button={dataset:{action},closest:()=>card};
  return h.$('#pageGrid').fire('click',{target:{closest:()=>button}});
}
test('Add/skip/add, rotate and reopen preserve full dimensions and editable corners', async () => {
  const h=harness();h.c.files=files(3);const importing=h.run('importFiles(files)');await tick();
  h.$('#fullImageBtn').fire('click');h.state.editor.filter='none';await h.run('saveEditorPage()');await tick();
  h.$('#skipImageBtn').fire('click');await tick();h.$('#fullImageBtn').fire('click');h.state.editor.filter='none';await h.run('saveEditorPage()');await importing;
  assert.deepEqual(Array.from(h.state.pages,p=>p.label),['page-1.png','page-3.png']);
  const first=h.state.pages[0];assert.equal(first.canvas.width,1000);assert.equal(first.canvas.height,700);
  await pageAction(h,first.id,'rotate');assert.equal(first.canvas.width,700);assert.equal(first.canvas.height,1000);
  const editing=pageAction(h,first.id,'preview');await tick();assert.equal(h.state.editor.rotation,1);await h.run('saveEditorPage()');await editing;
  assert.equal(first.canvas.width,700);assert.equal(first.canvas.height,1000);assert.equal(h.state.pages.length,2);
  assert.deepEqual(plain(first.corners),[{x:0,y:0},{x:1000,y:0},{x:1000,y:700},{x:0,y:700}]);
});
test('Single deletion replaces previous Undo and repeated delete-all/Undo remains usable', async () => {
  const h=harness(),a=page('a'),b=page('b');h.state.pages=[a,b];
  for(let i=0;i<2;i++){const clearing=h.$('#clearAllBtn').fire('click');h.run('confirmUI.finish(true)');await clearing;h.$('#toastAction').fire('click');assert.equal(h.state.pages[0],a);assert.equal(h.state.pages[1],b);}
  const deleting=pageAction(h,'a','delete');h.run('confirmUI.finish(true)');await deleting;assert.equal(h.state.pages.length,1);
  const clearing=h.$('#clearAllBtn').fire('click');h.run('confirmUI.finish(true)');await clearing;h.$('#toastAction').fire('click');assert.equal(h.state.pages.length,1);assert.equal(h.state.pages[0],b);
});
test('Encoding failure releases the save latch and allows retry in the same queue', async () => {
  const h=harness();h.c.files=files(1);const importing=h.run('importFiles(files)');await tick();h.state.editor.filter='none';
  h.run('canvasToBlob=async()=>{throw Error("encode")}');await h.run('saveEditorPage()');assert.equal(h.state.editor.saving,false);assert.equal(h.$('#addPageBtn').disabled,false);assert.equal(h.state.pages.length,0);assert.equal(h.$('#editorError').classList.contains('hidden'),false);assert.match(h.$('#editorError').textContent,/try again/);
  h.run('canvasToBlob=async()=>new Blob(["encoded"])');await h.run('saveEditorPage()');await importing;assert.equal(h.state.pages.length,1);
});
test('Language change updates unedited default output names without rebuilding the PDF', () => {
  const h=harness(),blob=pdf(h);h.run('toggleLanguage()');assert.equal(h.state.lastPdf.blob,blob);assert.equal(h.state.lastPdf.name,h.$('#filenameInput').value);assert.match(h.state.lastPdf.name,/提出書類/);
});
test('Reorder invalidates PDF and every preset produces a measured PDF with expected settings', async () => {
  const h=harness();h.state.pages=[page('a'),page('b')];pdf(h);const card=h.element();card.dataset.id='a';h.c.card=card;h.run('bindPageDrag(card)');card.fire('keydown',{altKey:true,key:'ArrowRight'});
  assert.equal(h.state.pages[0].id,'b');assert.equal(h.state.lastPdf,null);
  h.run('compressPage=async page=>({blob:new Blob([page.id]),width:page.canvas.width,height:page.canvas.height})');
  for(const preset of ['standard','1mb','2mb','a4','bw']){h.run(`applyPreset('${preset}')`);await h.run('generatePdf()');const p=h.state.lastPdf;assert.ok(p.blob.size>0);assert.match(await p.blob.text(),/\/Count 2/);assert.match(await p.blob.text(),/\/MediaBox \[0 0 841.89 595.28\]/);if(p.limit)assert.ok(p.blob.size<=p.limit);}
  assert.equal(h.$('#colorSelect').value,'bw');
});
