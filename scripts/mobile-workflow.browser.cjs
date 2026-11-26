'use strict';
const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const url = process.env.SCANNER_TEST_URL || pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href;
let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
after(async () => { await browser?.close(); });

async function start(t, width, height, locale) {
  const context = await browser.newContext({ viewport: { width, height }, locale });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(url);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 540;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black'; ctx.fillText('Sample form', 14, 22);
    return canvas.toDataURL().split(',')[1];
  });
  const sample = { name: 'form.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
  await page.locator('#fileInput').setInputFiles([sample, { ...sample, name: 'second.png' }]);
  await page.locator('#editorDialog[open]').waitFor();
  return page;
}

test('Mobile crop keeps save visible and shows the loupe only while dragging a corner', async t => {
  const page = await start(t, 320, 568, 'ja-JP');
  const save = page.locator('#addPageBtn');
  const inView = await save.evaluate(el => {
    const box = el.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight;
  });
  assert.ok(inView, 'Save should be visible before scrolling, even in a batch');
  const handle = page.locator('.corner-handle').first();
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 12, y + 12);
  assert.ok(await page.locator('#cornerLoupe').isVisible());
  await page.mouse.up();
  assert.equal(await page.locator('#cornerLoupe').isVisible(), false);
  await page.locator('[data-editor-view=preview]').click();
  await page.locator('[data-filter=gray]').click();
  await save.click();
  await page.waitForFunction(() => document.querySelector('#importProgress').textContent.includes('second.png'));
  await page.locator('#stopImportBtn').click();
  await page.locator('#mobileNav [data-target=pagesSection]').click();
  await page.locator('[data-action=preview]').click();
  await page.locator('#saveAsNewPageBtn').click();
  await page.locator('#editorDialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('#pageCount').innerText(), '2');
});

test('Mobile PDF choices stay in sync with desktop settings and the measured PDF', async t => {
  const page = await start(t, 390, 844, 'en');
  await page.locator('#addPageBtn').click();
  await page.waitForFunction(() => document.querySelector('#importProgress').textContent.includes('second.png'));
  await page.locator('#addPageBtn').click();
  await page.locator('#editorDialog').waitFor({state:'hidden'});
  await page.locator('#mobileNav [data-target=exportSection]').click();
  const group = page.locator('fieldset.pdf-choices');
  assert.equal(await group.count(), 3);
  await page.getByRole('radio', {name:'B&W',exact:true}).check();
  await page.getByRole('radio', {name:'1 MB',exact:true}).check();
  await page.setViewportSize({width:1100,height:800});
  assert.equal(await page.locator('#limitSelect').inputValue(), '1048576');
  assert.equal(await page.locator('#colorSelect').inputValue(), 'bw');
  await page.locator('#paperSelect').selectOption('original');
  await page.locator('#langBtn').click();
  await page.setViewportSize({width:320,height:568});
  assert.ok(await page.getByRole('radio',{name:'元の比率',exact:true}).isChecked());
  await page.locator('#generateBtn').click();
  await page.locator('#resultCard').waitFor();
  const facts = await page.locator('#pdfFacts').innerText();
  assert.match(facts, /2ページ/);
  assert.match(facts, /上限 1 MB/);
  assert.ok(facts.includes(await page.locator('#resultSize').textContent()));
  assert.ok(await page.locator('#previewPdfLink').isVisible());
  await page.getByRole('radio', {name:'指定なし',exact:true}).check();
  assert.equal(await page.locator('#resultCard').isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
