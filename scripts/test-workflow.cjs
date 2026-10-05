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
