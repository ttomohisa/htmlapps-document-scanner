'use strict';
const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const url = process.env.SCANNER_TEST_URL || pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href;
let browser;
before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
});
after(async () => { await browser?.close(); });

async function openWorkspace(t, width, height, locale) {
  const context = await browser.newContext({ viewport: {width, height}, locale });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  page.setDefaultTimeout(5000);
  await page.goto(url);
  return page;
}

test('Desktop workspace keeps file import, pages and PDF output in the first viewport', async t => {
  const page = await openWorkspace(t, 1024, 700, 'en');
  const [scan, pages, pdf, generate] = await Promise.all(['#scanSection', '#pagesSection', '#exportSection', '#generateBtn'].map(s => page.locator(s).boundingBox()));
  assert.ok(pdf.x >= scan.x + scan.width, 'PDF settings should be beside the scan area');
  assert.ok(pages.y < 700 && generate.y + generate.height <= 700);
  assert.ok(await page.locator('#desktopStartCameraBtn').isVisible());
  const picker = page.waitForEvent('filechooser');
  await page.locator('#importBtn').click();
  assert.ok((await picker).isMultiple());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('Starting and stopping the desktop camera returns keyboard focus to the visible controls', async t => {
  const page = await openWorkspace(t, 1280, 720, 'ja');
  if (url.startsWith('file:')) {
    await page.route('https://scanner.test/', route => route.fulfill({ path: fileURLToPath(url), contentType: 'text/html' }));
    await page.goto('https://scanner.test/');
  }
  await page.context().grantPermissions(['camera'], { origin: new URL(page.url()).origin });
  await page.locator('#desktopStartCameraBtn').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement.id === 'shutterBtn');
  const track = await page.locator('#video').evaluateHandle(video => video.srcObject.getVideoTracks()[0]);
  assert.equal(await track.evaluate(t => t.readyState), 'live');
  await page.keyboard.press('Enter');
  await page.locator('#editorDialog[open]').waitFor();
  await page.locator('#addPageBtn').click();
  await page.locator('#editorDialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#pageCount').innerText(), '1');
  await page.locator('#desktopCameraPowerBtn').focus();
  await page.keyboard.press('Enter');
  assert.equal(await track.evaluate(t => t.readyState), 'ended');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'desktopStartCameraBtn');
});

test('Dropped images can be cropped by keyboard, added in order and saved to PDF', async t => {
  const page = await openWorkspace(t, 1366, 768, 'ja');
  const transfer = await page.evaluateHandle(async () => {
    const canvas = document.createElement('canvas'); canvas.width=400; canvas.height=540;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle='white'; ctx.fillRect(0,0,400,540); ctx.fillStyle='black'; ctx.fillText('Page',16,20);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const dt = new DataTransfer();
    for (const file of ['first.png','second.png']) dt.items.add(new File([blob],file,{type:'image/png'}));
    return dt;
  });
  const drop = page.locator('#desktopDropArea');
  const missedDrop = await page.locator('#pagesSection').evaluate((section, dataTransfer) =>
    section.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer})), transfer);
  assert.equal(missedDrop, false, 'Dropping outside the import area should keep the current document open');
  await drop.dispatchEvent('dragover',{dataTransfer:transfer});
  await drop.dispatchEvent('drop',{dataTransfer:transfer});
  await page.locator('#editorDialog[open]').waitFor();
  assert.match(await page.locator('#importProgress').innerText(), /first\.png/);
  await page.locator('[data-editor-view=corners]').click();
  const corner = page.locator('.corner-handle').first();
  const x = () => corner.evaluate(el => parseFloat(el.style.left) / Number(el.dataset.scale));
  const initial = await x();
  await corner.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowRight');
  assert.ok(Math.abs((await x()) - initial - 11) < .1);
  await page.keyboard.press('ArrowLeft');
  assert.ok(Math.abs((await x()) - initial - 10) < .1);
  await page.locator('#addPageBtn').click();
  await page.waitForFunction(() => document.querySelector('#importProgress').textContent.includes('second.png'));
  await page.locator('#addPageBtn').click();
  await page.locator('#editorDialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('#pageCount').innerText(),'2');
  await page.locator('#generateBtn').click();
  await page.locator('#resultCard').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'previewPdfLink');
  assert.match(await page.locator('#pdfFacts').innerText(), /2ページ/);
  const downloaded = page.waitForEvent('download'); await page.locator('#downloadBtn').click();
  assert.match((await downloaded).suggestedFilename(), /\.pdf$/);
});
