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
      addEventListener(name, fn) { listeners.set(name, fn); }, fire(name, event = {}) { return listeners.get(name)?.({ type: name, target: el, preventDefault() {}, ...event }); },
      removeEventListener(name) { listeners.delete(name); }, hasListener(name) { return listeners.has(name); }, setPointerCapture(id) { this.capture=id; }, releasePointerCapture() { this.capture=null; }, setAttribute(name, value) { this[name] = value; }, appendChild(child) { (this.children ||= []).push(child); }, remove() {}, focus() {},
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
  run(`globalThis.renderRealPages=renderPages; renderPages=()=>{}; resetEditorView=()=>{}; detectDocument=c=>({corners:defaultCorners(c.width,c.height),confidence:.8}); fileToBitmap=async file=>{if(file.bad)throw Error('decode');return {width:1000,height:700,close(){}}};`);
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

test('Language switching refreshes existing page labels and camera-error details', () => {
  const h=harness();h.state.pages=[page('a')];h.run('renderPages=renderRealPages; navigator.mediaDevices={getUserMedia(){}}; globalThis.isSecureContext=true; showCameraError({name:"NotFoundError"}); renderPages()');
  assert.match(h.$('#cameraErrorText').textContent,/No usable camera/);
  h.run('toggleLanguage()');const ja=h.$('#pageGrid').children.at(-1);assert.equal(ja['aria-label'],'ページ 1');assert.match(ja.innerHTML,/aria-label="プレビュー"/);assert.match(ja.innerHTML,/aria-label="回転"/);assert.match(ja.innerHTML,/aria-label="削除"/);assert.equal(h.$('#cameraErrorText').textContent,'利用できるカメラが見つかりません。');
  h.run('toggleLanguage()');const en=h.$('#pageGrid').children.at(-1);assert.equal(en['aria-label'],'Page 1');assert.match(en.innerHTML,/aria-label="Preview"/);assert.match(h.$('#cameraErrorText').textContent,/No usable camera/);
});

function dragHarness() {
 const h=harness(); h.state.pages=[page('a'),page('b'),page('c')]; const blob=pdf(h);
 const cards=['a','b','c'].map((id,i)=>{const x=h.element();x.dataset.id=id;x.getBoundingClientRect=()=>({left:i*100,top:0,right:i*100+80,bottom:100,width:80,height:100});return x});
 h.c.document.querySelectorAll=sel=>sel==='.page-card'?cards:[];
 Object.assign(h.c,{scrollX:0,scrollY:0,innerHeight:800});
 const frames=new Map();let frameId=0;h.c.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId};h.c.cancelAnimationFrame=id=>frames.delete(id);h.c.window.scrollBy=()=>{};
 const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn())};
 h.c.card=cards[0];h.run('bindPageDrag(card)');
 const fire=(type,x=0,y=50)=>{const result=cards[0].fire(type,{type,button:0,pointerId:1,pointerType:'mouse',clientX:x,clientY:y,target:{closest:()=>null}});flush();return result};
 return {...h,cards,fire,blob,frames};
}
function order(h){return Array.from(h.state.pages,p=>p.id)}
test('BUG: canceled drag must preserve order and completed PDF',()=>{
 const h=dragHarness(); h.fire('pointerdown',20);h.fire('pointermove',120);h.fire('pointercancel',120);
 assert.deepEqual(order(h),['a','b','c']);assert.equal(h.state.lastPdf?.blob,h.blob);assert.deepEqual(h.revoked,[]);
});
test('BUG: drag returned to its origin must preserve completed PDF',()=>{
 const h=dragHarness();h.fire('pointerdown',20);h.fire('pointermove',120);h.fire('pointermove',20);h.fire('pointerup',20);
 assert.deepEqual(order(h),['a','b','c']);assert.equal(h.state.lastPdf?.blob,h.blob);assert.deepEqual(h.revoked,[]);
});
test('CONTROL: committed drag actually changes order and invalidates PDF',()=>{
 const h=dragHarness();h.fire('pointerdown',20);h.fire('pointermove',120);h.fire('pointerup',120);
 assert.deepEqual(order(h),['b','a','c']);assert.equal(h.state.lastPdf,null);assert.deepEqual(h.revoked,['blob:existing']);
});
test('CONTROL: click without dragging preserves order and PDF',()=>{
 const h=dragHarness();h.fire('pointerdown',20);h.fire('pointerup',20);
 assert.deepEqual(order(h),['a','b','c']);assert.equal(h.state.lastPdf.blob,h.blob);assert.deepEqual(h.revoked,[]);
});
test('CONTROL: keyboard boundary no-op preserves PDF and valid move changes it',()=>{
 const h=dragHarness();h.cards[0].fire('keydown',{altKey:true,key:'ArrowLeft'});
 assert.deepEqual(order(h),['a','b','c']);assert.equal(h.state.lastPdf.blob,h.blob);
 h.cards[0].fire('keydown',{altKey:true,key:'ArrowRight'});assert.deepEqual(order(h),['b','a','c']);assert.equal(h.state.lastPdf,null);
});
test('CONTROL: page edit uses detached corners, Cancel leaves original untouched',async()=>{
 const h=harness(),a=page('a'),b=page('b');h.state.pages=[a,b];const original=plain(a.corners);
 h.c.a=a;const editing=h.run('openEditorFromPage(a)');await tick();h.state.editor.corners[0].x=55;h.state.editor.filter='gray';
 h.$('#editorCloseBtn').fire('click');await editing;
 assert.equal(h.state.pages[0],a);assert.deepEqual(plain(a.corners),original);assert.equal(a.filter,'none');assert.deepEqual(order(h),['a','b']);
});

function smallPage(h,id) {
  const p=page(id);p.canvas=h.element('canvas');p.canvas.width=40;p.canvas.height=32;
  p.label=id+'.png';p.confidence=.73;p.rotation=0;p.thumb='original-'+id;
  p.corners=[{x:0,y:0},{x:40,y:0},{x:40,y:32},{x:0,y:32}];return p;
}
function smallDecode(h) { h.run('fileToBitmap=async()=>({width:40,height:32,close(){}})'); }
async function edit(h,p) { h.c.editPage=p; const done=h.run('openEditorFromPage(editPage)'); await tick();return {ed:h.state.editor,done}; }
test('Copy action is localized and appears only when editing a saved page', async()=>{
  assert.match(html,/<button[^>]*id="saveAsNewPageBtn"[^>]*type="button"[^>]*data-i18n="saveAsNewPage"/);
  const h=harness();smallDecode(h);const p=smallPage(h,'a');h.state.pages=[p];
  for(const lang of ['ja','en']) { h.state.lang=lang;const e=await edit(h,p);
    assert.equal(h.$('#saveAsNewPageBtn').classList.contains('hidden'),false);
    assert.equal(h.$('#saveAsNewPageBtn').textContent,lang==='ja'?'別ページとして保存':'Save as new page');
    h.$('#editorCloseBtn').fire('click');await e.done;
  }
  h.c.source=p.canvas;const adding=h.run('openEditorFromSource(source,"capture")');
  assert.equal(h.$('#saveAsNewPageBtn').classList.contains('hidden'),true);await h.$('#saveAsNewPageBtn').fire('click');assert.equal(h.state.pages.length,1);
  h.$('#editorCloseBtn').fire('click');await adding;
});
test('Save as new page preserves original object and inserts independent edited output immediately after it',async()=>{
  const h=harness();smallDecode(h);const [a,b,c]=['a','b','c'].map(id=>smallPage(h,id));h.state.pages=[a,b,c];const old={...b},before=plain(b.corners),blob=pdf(h);
  const {ed,done}=await edit(h,b);ed.corners=[{x:5,y:4},{x:35,y:4},{x:35,y:28},{x:5,y:28}];ed.filter='gray';ed.rotation=1;
  await h.$('#saveAsNewPageBtn').fire('click');assert.equal(h.state.pages.length,4);await done;
  const copy=h.state.pages[2];assert.deepEqual(Array.from(h.state.pages,p=>p.id),['a','b',copy.id,'c']);assert.ok(!['a','b','c'].includes(copy.id));
  assert.equal(h.state.pages[1],b);for(const k of Object.keys(old))assert.equal(b[k],old[k]);assert.deepEqual(plain(b.corners),before);
  assert.equal(copy.canvas.width,24);assert.equal(copy.canvas.height,30);assert.notEqual(copy.canvas,b.canvas);assert.notEqual(copy.canvas,ed.source);
  assert.equal(copy.filter,'gray');assert.equal(copy.rotation,1);assert.equal(copy.label,'b.png');assert.equal(copy.confidence,.73);assert.equal(copy.sourceBlob,b.sourceBlob);
  assert.notEqual(copy.corners,ed.corners);assert.notEqual(copy.corners[0],ed.corners[0]);assert.notEqual(copy.corners[0],b.corners[0]);
  ed.corners[0].x=19;assert.equal(copy.corners[0].x,5);assert.equal(b.corners[0].x,0);assert.equal(h.state.lastPdf,null);assert.deepEqual(h.revoked,['blob:existing']);assert.ok(blob);
});
test('Original and copy can be reopened, changed, rotated, deleted and restored independently',async()=>{
  const h=harness();smallDecode(h);const a=smallPage(h,'a'),b=smallPage(h,'b');h.state.pages=[a,b];let e=await edit(h,a);
  await h.$('#saveAsNewPageBtn').fire('click');assert.equal(h.state.pages.length,3);await e.done;const copy=h.state.pages[1],originalCanvas=a.canvas;
  e=await edit(h,copy);assert.equal(e.ed.source.width,40);assert.equal(e.ed.source.height,32);e.ed.corners[0].x=3;await h.$('#addPageBtn').fire('click');await e.done;
  assert.equal(a.canvas,originalCanvas);assert.equal(a.corners[0].x,0);assert.equal(copy.corners[0].x,3);const copyCanvas=copy.canvas;
  await pageAction(h,'a','rotate');assert.equal(copy.canvas,copyCanvas);assert.equal(copy.rotation,0);assert.equal(a.rotation,1);
  e=await edit(h,a);e.ed.filter='bw';await h.$('#addPageBtn').fire('click');await e.done;assert.equal(copy.filter,'none');assert.equal(a.filter,'bw');
  for(const target of [copy,a]) { const deleting=pageAction(h,target.id,'delete');h.run('confirmUI.finish(true)');await deleting;assert.ok(!h.state.pages.includes(target));h.$('#toastAction').fire('click');assert.deepEqual(Array.from(h.state.pages),[a,copy,b]); }
});
test('Copy resolves its source position by ID after asynchronous work and preserves pending Undo',async()=>{
  const h=harness();smallDecode(h);const a=smallPage(h,'a'),b=smallPage(h,'b'),c=smallPage(h,'c');h.state.pages=[a,b,c];const undo={page:smallPage(h,'deleted'),index:0};h.state.lastDeleted=undo;
  const e=await edit(h,b);h.run('canvasToDataURLThumb=()=>new Promise(resolve=>globalThis.finishThumb=resolve)');const saving=h.$('#saveAsNewPageBtn').fire('click');await tick();
  h.state.pages=[b,a,c];h.run('finishThumb("copy-thumb")');await saving;assert.equal(h.state.pages.length,4);await e.done;
  assert.equal(h.state.pages[0],b);assert.equal(h.state.pages[2],a);assert.equal(h.state.pages[3],c);assert.equal(h.state.lastDeleted,undo);
});
test('Copy does not turn the 30-image import batch limit into a document page limit',async()=>{
  const h=harness();smallDecode(h);h.state.pages=Array.from({length:30},(_,i)=>smallPage(h,'p'+i));const e=await edit(h,h.state.pages[29]);await h.$('#saveAsNewPageBtn').fire('click');assert.equal(h.state.pages.length,31);await e.done;
});
test('Copy without a compressed source encodes its own editable source without changing original',async()=>{
  const h=harness(),a=smallPage(h,'a');a.sourceBlob=null;h.state.pages=[a];const e=await edit(h,a);await h.$('#saveAsNewPageBtn').fire('click');assert.equal(h.state.pages.length,2);await e.done;
  const copy=h.state.pages[1];assert.ok(copy.sourceBlob instanceof Blob);assert.equal(copy.sourceBlob.type,'image/jpeg');assert.equal(a.sourceBlob,null);assert.notEqual(copy.canvas,a.canvas);
});
for(const first of ['saveAsNewPageBtn','addPageBtn'])test(`${first} shares a single-flight latch with both save controls`,async()=>{
  const h=harness();smallDecode(h);const a=smallPage(h,'a');h.state.pages=[a];const e=await edit(h,a);
  h.run('canvasToDataURLThumb=()=>new Promise(resolve=>globalThis.finishThumb=resolve)');const saving=h.$('#'+first).fire('click');await tick();
  assert.equal(e.ed.saving,true);assert.equal(h.$('#addPageBtn').disabled,true);assert.equal(h.$('#saveAsNewPageBtn').disabled,true);
  await h.$('#saveAsNewPageBtn').fire('click');await h.$('#addPageBtn').fire('click');h.run('finishThumb("thumb")');await saving;await e.done;
  assert.equal(h.state.pages.length,first==='saveAsNewPageBtn'?2:1);
});
for(const action of ['editorCloseBtn','Escape'])test(`Pending copy canceled with ${action} preserves PDF and cannot close a newer editor`,async()=>{
  const h=harness();smallDecode(h);const a=smallPage(h,'a'),b=smallPage(h,'b');h.state.pages=[a,b];const blob=pdf(h),e=await edit(h,a);
  h.run('canvasToDataURLThumb=()=>new Promise(resolve=>globalThis.finishThumb=resolve)');const saving=h.$('#saveAsNewPageBtn').fire('click');await tick();assert.equal(e.ed.saving,true);
  if(action==='Escape')h.$('#editorDialog').fire('cancel');else h.$('#'+action).fire('click');await e.done;const replacement=await edit(h,b);
  h.run('finishThumb("stale")');await saving;assert.equal(h.state.editor,replacement.ed);assert.equal(h.$('#editorDialog').open,true);assert.deepEqual(Array.from(h.state.pages),[a,b]);assert.equal(h.state.lastPdf.blob,blob);assert.deepEqual(h.revoked,[]);
  h.$('#editorCloseBtn').fire('click');await replacement.done;
});
test('Failed copy retains original and ready PDF, then retry succeeds',async()=>{
  const h=harness(),a=smallPage(h,'a');a.sourceBlob=null;h.state.pages=[a];const original=a.canvas,blob=pdf(h),e=await edit(h,a);
  h.run('canvasToBlob=async()=>{throw Error("encode")}');await h.$('#saveAsNewPageBtn').fire('click');assert.equal(h.state.editor,e.ed);assert.equal(e.ed.saving,false);assert.equal(h.$('#saveAsNewPageBtn').disabled,false);assert.equal(h.$('#addPageBtn').disabled,false);assert.equal(h.$('#editorError').classList.contains('hidden'),false);assert.equal(h.state.lastPdf.blob,blob);assert.equal(a.canvas,original);assert.deepEqual(h.revoked,[]);
  h.run('canvasToBlob=async()=>new Blob(["encoded"],{type:"image/jpeg"})');await h.$('#saveAsNewPageBtn').fire('click');assert.equal(h.state.pages.length,2);await e.done;assert.equal(a.canvas,original);
});
test('Removing the source during a pending copy prevents insertion',async()=>{
  const h=harness();smallDecode(h);const a=smallPage(h,'a'),b=smallPage(h,'b');h.state.pages=[a,b];const blob=pdf(h),e=await edit(h,a);
  h.run('canvasToDataURLThumb=()=>new Promise(resolve=>globalThis.finishThumb=resolve)');const saving=h.$('#saveAsNewPageBtn').fire('click');await tick();assert.equal(e.ed.saving,true);h.state.pages=[b];h.run('finishThumb("stale")');await saving;await e.done;
  assert.deepEqual(Array.from(h.state.pages),[b]);assert.equal(h.state.lastPdf.blob,blob);assert.deepEqual(h.revoked,[]);
});
for(const [caseName,firstId,lastId,copyId] of [
  ['random ID','a','b',null],
  ['b-prefixed UUID','a','b','b1111111-1111-4111-8111-111111111111'],
  ['ba-prefixed UUID','a','b','baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
  ['shared ID prefixes','page','page-long','page-longer']
])test(`Generated PDF preserves exact original/copy order (${caseName}) and filename readiness`,async()=>{
  const h=harness();smallDecode(h);if(copyId)h.c.crypto={randomUUID:()=>copyId};
  const a=smallPage(h,firstId),b=smallPage(h,lastId);h.state.pages=[a,b];const e=await edit(h,a);await h.$('#saveAsNewPageBtn').fire('click');assert.equal(h.state.pages.length,3);await e.done;const copy=h.state.pages[1];
  h.run('compressPage=async p=>({blob:new Blob(["page-"+p.id]),width:p.canvas.width,height:p.canvas.height})');await h.run('generatePdf()');const blob=h.state.lastPdf.blob,text=await blob.text();assert.match(text,/\/Count 3/);
  // Compare complete fake image-stream payloads: a UUID starting with b also contains the marker 'page-b'.
  const images=Array.from(text.matchAll(/\/Subtype \/Image[^\n]*\nstream\n([^\n]*)\nendstream/g),match=>match[1]);
  assert.deepEqual(images,['page-'+firstId,'page-'+copy.id,'page-'+lastId]);
  h.$('#filenameInput').value='two-crops';h.$('#filenameInput').fire('input');assert.equal(h.state.lastPdf.blob,blob);assert.equal(h.state.lastPdf.name,'two-crops.pdf');
});

for(const end of ['pointercancel','pointerup'])test(`${end} no-op clears drag state, capture, paint and listeners without altering Undo`,()=>{
  const h=dragHarness(),undo={page:page('deleted'),index:0};h.state.lastDeleted=undo;h.fire('pointerdown',20);h.fire('pointermove',120);if(end==='pointerup')h.fire('pointermove',20);h.fire(end,20);
  assert.deepEqual(order(h),['a','b','c']);assert.equal(h.state.lastDeleted,undo);assert.equal(h.state.drag,null);assert.equal(h.cards[0].capture,null);assert.equal(h.cards[0].style.transform,'');assert.equal(h.cards[0].classList.contains('dragging'),false);assert.ok(h.cards.every(c=>!c.classList.contains('drop-target')));assert.equal(h.frames.size,0);for(const name of ['pointermove','pointerup','pointercancel'])assert.equal(h.cards[0].hasListener(name),false);
});
test('Drop uses final pointer location rather than an earlier painted target',()=>{
  const h=dragHarness();h.fire('pointerdown',20);h.fire('pointermove',120);h.fire('pointerup',20);assert.deepEqual(order(h),['a','b','c']);assert.equal(h.state.lastPdf.blob,h.blob);
});
test('Returning to the edge of the original card cannot snap to a nearby card',()=>{
  const h=dragHarness();h.fire('pointerdown',70);h.fire('pointermove',120);h.fire('pointermove',70);h.fire('pointerup',70);
  assert.deepEqual(order(h),['a','b','c']);assert.equal(h.state.lastPdf.blob,h.blob);assert.deepEqual(h.revoked,[]);
});
test('Copy snapshots crop, filter, rotation and label before async work',async()=>{
  const h=harness();smallDecode(h);const a=smallPage(h,'a');h.state.pages=[a];const e=await edit(h,a);
  e.ed.corners=[{x:4,y:4},{x:36,y:4},{x:36,y:28},{x:4,y:28}];e.ed.filter='gray';e.ed.rotation=1;e.ed.label='first.png';
  h.run('canvasToDataURLThumb=()=>new Promise(resolve=>globalThis.finishThumb=resolve)');const saving=h.$('#saveAsNewPageBtn').fire('click');await tick();
  e.ed.corners[0].x=9;e.ed.filter='bw';e.ed.rotation=3;e.ed.label='later.png';h.run('finishThumb("thumb")');await saving;await e.done;
  const copy=h.state.pages[1];assert.equal(copy.corners[0].x,4);assert.equal(copy.filter,'gray');assert.equal(copy.rotation,1);assert.equal(copy.label,'first.png');assert.equal(copy.canvas.width,24);assert.equal(copy.canvas.height,32);assert.equal(a.corners[0].x,0);
});

for (const [language, label, accessible, help] of [
  ['ja', 'EN', '英語に切り替え', '使い方と注意事項'],
  ['en', 'JA', 'Switch to Japanese', 'How to use & notes']
]) test(`Header uses localized target-language controls in ${language}`, () => {
  const h = harness();
  const helpButtons = ['#helpBtn', '#mobileHelpBtn'].map(id => h.$(id));
  helpButtons.forEach(button => { button.dataset.i18nAria = 'help'; });
  const badge = h.element();
  badge.dataset.i18n = 'localOnly';
  h.c.document.querySelectorAll = selector => selector === '[data-i18n-aria]' ? helpButtons : selector === '[data-i18n]' ? [badge] : [];
  const savedPage = page('kept-page');
  h.state.pages = [savedPage];
  const completedPdf = pdf(h);
  h.state.lang = language;
  h.run('applyI18n()');
  for (const id of ['#langBtn', '#mobileLangBtn']) {
    assert.equal(h.$(id).textContent, label);
    assert.equal(h.$(id)['aria-label'], accessible);
    assert.equal(h.$(id).title, accessible);
  }
  for (const button of helpButtons) {
    assert.equal(button['aria-label'], help);
    assert.equal(button.title, help);
  }
  assert.equal(badge.textContent, language === 'ja' ? '完全ローカル処理' : 'Fully local processing');
  assert.equal(h.state.pages[0], savedPage);
  assert.equal(h.state.lastPdf.blob, completedPdf);
});

function bootWithoutRealCamera(h) {
  const timers = [];
  let cameraRequests = 0;
  h.c.navigator.mediaDevices = { getUserMedia() { cameraRequests++; return new Promise(() => {}); } };
  h.c.setTimeout = callback => { timers.push(callback); return timers.length; };
  const startup = html.slice(html.indexOf('\napplyI18n();'), html.indexOf('// APP:END'));
  h.run(startup);
  return { requests: () => cameraRequests, flushTimers() { while (timers.length) timers.shift()(); } };
}

test('Startup, language switching and image import keep the camera off until explicitly requested', async () => {
  const h = harness(), boot = bootWithoutRealCamera(h);
  boot.flushTimers();
  assert.equal(boot.requests(), 0, 'loading the app must not request camera access');
  h.$('#langBtn').fire('click');
  h.$('#mobileLangBtn').fire('click');
  const importing = h.$('#fileInput').fire('change', { target: { files: files(1) } });
  await tick();
  assert.ok(h.state.editor, 'image import remains available with the camera off');
  h.$('#editorCloseBtn').fire('click');
  await importing;
  boot.flushTimers();
  assert.equal(boot.requests(), 0);
  assert.equal(h.state.stream, null);
  assert.equal(h.state.cameraError, null);
});

for (const id of ['#desktopCameraPowerBtn', '#mobileCameraPowerBtn', '#mobileStartCameraBtn']) {
  test(`${id} explicitly starts a camera request from the initial off state`, () => {
    const h = harness(), boot = bootWithoutRealCamera(h);
    boot.flushTimers();
    assert.equal(boot.requests(), 0);
    h.$(id).fire('click');
    assert.equal(boot.requests(), 1, 'the explicit camera action still reaches getUserMedia');
  });
}

// CSS contracts complement native geometry checks; this harness does not perform layout.
const auditCss = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const mobileAuditCss = auditCss.slice(auditCss.indexOf('@media(max-width:600px)'), auditCss.indexOf('@media(max-width:360px)'));
function auditRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{([^}]+)\\}'));
  assert.ok(match, `Missing scoped rule: ${selector}`);
  return match[1];
}
test('Modal dialogs lock both root and body scrolling only while modal', () => {
  const rule = auditRule(auditCss, 'html:has(dialog:modal),body:has(dialog:modal)');
  assert.match(rule, /overflow\s*:\s*hidden/);
});
test('Mobile camera-off content can grow and keeps ordinary vertical scrolling', () => {
  const rule = auditRule(mobileAuditCss, '.camera-preview-shell.camera-off');
  assert.match(rule, /height\s*:\s*auto/);
  assert.match(rule, /touch-action\s*:\s*pan-y/);
  const empty = auditRule(mobileAuditCss, '.camera-preview-shell.camera-off .camera-empty');
  assert.match(empty, /position\s*:\s*relative/);
  assert.match(empty, /min-height\s*:\s*inherit/);
});
test('Mobile camera-off dock exposes the existing Image action without live-camera controls', () => {
  const rule = auditRule(mobileAuditCss, '.camera-preview-shell.camera-off .camera-bottom');
  assert.match(rule, /opacity\s*:\s*1/);
  assert.match(rule, /pointer-events\s*:\s*auto/);
  assert.match(rule, /grid-template-columns\s*:\s*1fr/);
  for (const id of ['torchBtn','shutterBtn','mobileAutoBtn','switchCameraBtn']) {
    assert.match(mobileAuditCss, new RegExp('\\.camera-preview-shell\\.camera-off #' + id));
  }
  assert.doesNotMatch(mobileAuditCss, /camera-off #importRoundBtn[^}]*display\s*:\s*none/);
  assert.match(auditCss, /\.camera-preview-shell\.camera-off \.camera-bottom[^}]*opacity:0/,
    'desktop camera-off dock remains hidden; its separate import control is unchanged');
});
test('Mobile off-state Image button reaches the existing picker without requesting a camera', () => {
  const h=harness(), boot=bootWithoutRealCamera(h); boot.flushTimers();
  let picks=0; h.$('#fileInput').click=()=>{picks++;};
  for(let i=0;i<3;i++) h.$('#importRoundBtn').fire('click');
  assert.equal(picks,3); assert.equal(boot.requests(),0); assert.equal(h.state.stream,null);
});
test('Local-processing badge retains the existing shield artwork and truthful labels', () => {
  assert.match(html, /class="privacy-pill"><svg[^>]*><path d="M12 3 5\.5 6v5\.3c0 4\.1 2\.7 7\.8 6\.5 9\.2/);
  assert.ok(html.includes('完全ローカル処理')); assert.ok(html.includes('Fully local processing'));
});

// Minimal rendered-card/focus DOM double. Saves still execute real renderPages and editor handlers.
function editorFocusHarness() {
  const h=harness(); smallDecode(h);
  const d=h.c.document, grid=h.$('#pageGrid'), create=d.createElement, query=d.querySelector;
  const focusable=el=>Object.assign(el,{isConnected:true,rendered:true,getClientRects(){return this.rendered?[{}]:[];},focus(options){if(this.isConnected&&this.rendered&&!this.disabled){d.activeElement=this;this.focusOptions=options;}}});
  const disconnect=card=>{card.isConnected=false;if(card.preview)card.preview.isConnected=false;};
  Object.defineProperty(grid,'innerHTML',{set(){(grid.children||[]).forEach(disconnect);grid.children=[];},get(){return '';}});
  d.createElement=tag=>{const el=focusable(create(tag));if(tag==='article')el.querySelector=selector=>{if(selector!=='[data-action="preview"]'||!el.innerHTML.includes('data-action="preview"'))return null;if(!el.preview){el.preview=focusable(create('button'));el.preview.dataset.action='preview';el.preview.card=el;}return el.preview;};return el;};
  d.querySelectorAll=selector=>selector==='.page-card'?(grid.children||[]):[];
  d.querySelector=selector=>selector==='dialog:modal'?(['#editorDialog','#confirmDialog','#helpDialog'].map(query).find(el=>el.open)||null):query(selector);
  for(const selector of ['#mobileNav button.active','#importBtn','#importRoundBtn'])focusable(query(selector));
  query('#mobileNav button.active').rendered=false;
  const dialog=query('#editorDialog');dialog.close=()=>{dialog.open=false;d.activeElement=d.body;dialog.fire('close');};
  h.run('renderPages=renderRealPages');
  h.preview=id=>(grid.children||[]).find(el=>el.dataset.id===id)?.querySelector('[data-action="preview"]');
  h.render=()=>h.run('renderPages()'); h.doc=d; return h;
}
for(const save of ['addPageBtn','saveAsNewPageBtn'])test(`${save} restores the original page's replacement Preview after real card rerender`,async()=>{
  const h=editorFocusHarness(),a=smallPage(h,'a'),b=smallPage(h,'b');h.state.pages=[a,b];h.render();const old=h.preview('b');old.focus();const e=await edit(h,b);
  await h.$('#'+save).fire('click');await e.done;
  const current=h.preview('b');assert.notEqual(current,old);assert.equal(old.isConnected,false);assert.equal(h.doc.activeElement,current);assert.equal(current.focusOptions.preventScroll,true);
  assert.equal(h.state.pages[1],b);assert.equal(h.state.pages.length,save==='addPageBtn'?2:3);
});
test('Ordinary edited-page Close restores the existing Preview and preserves the PDF',async()=>{
  const h=editorFocusHarness(),a=smallPage(h,'a');h.state.pages=[a];h.render();const opener=h.preview('a');opener.focus();const blob=pdf(h),e=await edit(h,a);
  h.$('#editorCloseBtn').fire('click');await e.done;assert.equal(h.doc.activeElement,opener);assert.equal(h.state.lastPdf.blob,blob);
});
for(const unavailable of ['hidden','removed','disabled','disconnected'])test(`Edited-page ${unavailable} opener falls back to visible active navigation without changing views`,async()=>{
  const h=editorFocusHarness(),a=smallPage(h,'a');h.state.pages=[a];h.state.mobileView='exportSection';h.render();const e=await edit(h,a);
  const target=h.preview('a');if(unavailable==='hidden')target.rendered=false;if(unavailable==='disabled')target.disabled=true;if(unavailable==='disconnected')target.isConnected=false;if(unavailable==='removed'){h.state.pages=[];h.render();}
  const nav=h.$('#mobileNav button.active');nav.rendered=true;h.$('#editorCloseBtn').fire('click');await e.done;
  assert.equal(h.doc.activeElement,nav);assert.equal(h.state.mobileView,'exportSection');assert.equal(h.state.pages.length,unavailable==='removed'?0:1);assert.equal(nav.focusOptions.preventScroll,true);
});
test('Desktop fallback skips hidden or unsuccessful targets and reaches a visible import action',async()=>{
  const h=editorFocusHarness(),a=smallPage(h,'a');h.state.pages=[a];h.render();const e=await edit(h,a);h.preview('a').rendered=false;
  h.$('#importBtn').focus=()=>{};h.$('#editorCloseBtn').fire('click');await e.done;assert.equal(h.doc.activeElement,h.$('#importRoundBtn'));
});
test('Finishing an edited page does not steal focus from another modal opened during close',async()=>{
  const h=editorFocusHarness(),a=smallPage(h,'a');h.state.pages=[a];h.render();const e=await edit(h,a),other=h.$('#confirmDialog');
  h.$('#editorDialog').close=()=>{h.$('#editorDialog').open=false;other.open=true;h.doc.activeElement=other;};
  h.$('#editorCloseBtn').fire('click');await e.done;assert.equal(h.doc.activeElement,other);
});
test('A stale editor completion cannot restore focus over a newer editor',async()=>{
  const h=editorFocusHarness(),a=smallPage(h,'a'),b=smallPage(h,'b');h.state.pages=[a,b];h.render();const first=await edit(h,a);h.$('#editorCloseBtn').fire('click');await first.done;
  const second=await edit(h,b);h.doc.activeElement=h.$('#addPageBtn');h.c.stale=first.ed;h.run('finishEditor("updated",stale)');
  assert.equal(h.state.editor,second.ed);assert.equal(h.doc.activeElement,h.$('#addPageBtn'));assert.equal(h.$('#editorDialog').open,true);h.$('#editorCloseBtn').fire('click');await second.done;
});
test('A newer editor started during close retains focus ownership',async()=>{
  const h=editorFocusHarness(),a=smallPage(h,'a');h.state.pages=[a];h.render();const e=await edit(h,a),newer={mode:'edit',pageId:'newer'};
  h.$('#editorDialog').close=()=>{h.$('#editorDialog').open=false;h.state.editor=newer;h.doc.activeElement=h.$('#addPageBtn');};
  h.run('finishEditor("updated")');await e.done;assert.equal(h.state.editor,newer);assert.equal(h.doc.activeElement,h.$('#addPageBtn'));
});
test('Import editor closure does not apply saved-page focus restoration',async()=>{
  const h=editorFocusHarness();h.c.source=smallPage(h,'a').canvas;const done=h.run('openEditorFromSource(source,"capture")');h.$('#editorCloseBtn').fire('click');await done;assert.equal(h.doc.activeElement,h.doc.body);
});
