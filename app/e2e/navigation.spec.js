import { test, expect } from '@playwright/test';

// All requests and receipts are local/synthetic. These tests never contact The Ring.
async function prepare(page, { language = 'en', theme = 'light', font = 'normal', noAnimations = false } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /Cannot update|flushSync was called|Maximum update depth/.test(message.text())) errors.push(message.text()); });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('blob:')) return route.continue();
    if (url.startsWith('http://127.0.0.1:5174')) return route.continue();
    if (url.endsWith('/health')) return route.fulfill({ json: { status: 'ok', provider: 'mock', clientKeyRequired: false, limits: { acceptedTypes: ['image/png'], maxImageBytes: 20971520, maxPdfBytes: 10485760 } } });
    if (url.endsWith('/usage')) return route.fulfill({ status: 204, body: '' });
    return route.abort();
  });
  await page.addInitScript(({ language, theme, font, noAnimations }) => {
    localStorage.setItem('dhamantaha.appearance.v1', JSON.stringify({ language, theme, font }));
    if (noAnimations) Element.prototype.animate = undefined;

  }, { language, theme, font, noAnimations });
  await page.goto('/');
  await expect(page.locator('#main-content .home-empty')).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('dhamantaha-receipts', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 40;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#08766d'; ctx.fillRect(0, 0, 40, 40);
    const file = new File([await new Promise(resolve => canvas.toBlob(resolve))], 'sample.png', { type: 'image/png' });
    const receipt = { merchantName: 'Example store', purchaseDate: '2026-10-01', total: 100, currency: 'SAR',
      returnPolicy: { returnDurationValue: 7, returnDurationUnit: 'days', exchangeDurationValue: 14, exchangeDurationUnit: 'days', sourceText: 'Sample: refund 7 days, exchange 14 days.' } };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['receipts', 'files'], 'readwrite');
      for (let index = 0; index < 35; index++) {
        const id = `sample-${index}`;
        tx.objectStore('receipts').put({ id, name: `sample-${index}.png`, mime: 'image/png', size: file.size, createdAt: Date.now() - index,
          analysis: { receipt: { ...receipt, merchantName: index === 0 ? 'Example store' : `Other store ${index}` },
            items: [{ description: 'Example product', quantity: 1, totalPrice: 100, warranty: { expirationDate: '2027-10-01', sourceText: 'Sample one-year warranty' } }],
            review: { missingFields: [], uncertainties: [] }, requestId: 'sample-only' } });
        tx.objectStore('files').put(file, id);
      }
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    }); db.close();
  });
  await page.reload();
  await expect(page.locator('#main-content .stats')).toBeVisible();
  return errors;
}
const tab = (page, index) => page.locator('.nav button').nth(index);
const route = page => page.locator('#main-content [data-route]:not([hidden])');
const settled = async page => { await expect(page.locator('.navigation-snapshot')).toHaveCount(0); };
async function frames(page, kind, duration) {
  await expect(page.locator('#main-content')).toHaveAttribute('data-navigation', kind);
  const result = await page.evaluate(() => {
    const incoming = document.getElementById('main-content');
    const outgoing = document.querySelector('.navigation-snapshot');
    const first = incoming.getAnimations()[0]; const second = outgoing?.getAnimations()[0];
    if (!first || !second) throw new Error('Both the incoming and outgoing screen must animate');
    first.pause(); second.pause();
    const duration = first.effect.getTiming().duration;
    const samples = [0, duration / 2, duration].map(time => {
      first.currentTime = time; second.currentTime = time;
      return { incoming: getComputedStyle(incoming).transform, outgoing: getComputedStyle(outgoing).transform, opacity: getComputedStyle(incoming).opacity };
    });
    return { samples, duration: first.effect.getTiming().duration, incoming: first.effect.getKeyframes(), outgoing: second.effect.getKeyframes(), hidden: outgoing.getAttribute('aria-hidden'), ids: outgoing.querySelectorAll('[id]').length, indicator: document.querySelector('.tab-indicator').getAnimations().map(a => a.effect.getTiming().duration) };
  });
  expect(result.duration).toBe(duration); expect(result.hidden).toBe('true'); expect(result.ids).toBe(0);
  expect(result.samples[1].incoming).not.toBe(result.samples[0].incoming);
  expect(result.samples[1].incoming).not.toBe(result.samples[2].incoming);
  expect(result.samples[1].outgoing).not.toBe(result.samples[0].outgoing);
  expect(result.samples[1].outgoing).not.toBe(result.samples[2].outgoing);
  expect(Number(result.samples[1].opacity)).toBeGreaterThan(Number(result.samples[0].opacity));
  expect(Number(result.samples[1].opacity)).toBeLessThan(Number(result.samples[2].opacity));
  await page.evaluate(() => { for (const node of [document.getElementById('main-content'), document.querySelector('.navigation-snapshot')]) node.getAnimations().forEach(animation => animation.finish()); });
  await settled(page);
  return result;
}

for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) for (const font of ['normal', 'large']) {
  test(`${language}/${theme}/${font}: tabs, push/pop, modal lifecycle, disclosures and state retention`, async ({ page }) => {
    const errors = await prepare(page, { language, theme, font });
    const rtl = language === 'ar' ? -1 : 1;
    await tab(page, 1).click();
    const tabs = await frames(page, 'tab', 200);
    expect(tabs.incoming[0].transform).toBe(`translateX(${12 * rtl}px)`);
    expect(tabs.outgoing[1].opacity).toBe('0');
    expect(tabs.indicator).toEqual([200]);
    for (const index of [2, 3, 4, 0, 1]) {
      await tab(page, index).click(); await frames(page, 'tab', 200);
      await expect(route(page)).toHaveAttribute('data-route', ['home', 'saved', 'add', 'analyst', 'settings'][index]);
    }
    await route(page).getByRole('button', { name: language === 'en' ? 'Show more' : 'عرض المزيد', exact: true }).click();
    await expect(route(page).locator('.receipt-card')).toHaveCount(35);
    await route(page).getByRole('searchbox').fill('Example store');
    await expect(route(page).locator('.receipt-card')).toHaveCount(1);
    await route(page).getByRole('searchbox').evaluate(node => { node.dataset.retained = 'same-input'; });
    await tab(page, 3).click(); await frames(page, 'tab', 200);
    await tab(page, 1).click(); await frames(page, 'tab', 200);
    await expect(route(page).getByRole('searchbox')).toHaveValue('Example store');
    await expect(route(page).getByRole('searchbox')).toHaveAttribute('data-retained', 'same-input');
    await route(page).locator('.receipt-card').click();
    const push = await frames(page, 'push', 280);
    const width = await page.locator('#main-content').evaluate(node => node.getBoundingClientRect().width);
    expect(push.incoming[0].transform).toBe(`translateX(${width * rtl}px)`);
    await expect(route(page)).toHaveAttribute('data-route', 'details');
    await expect(route(page).locator('.policy .return-line')).toHaveCount(2);
    const terms = route(page).locator('.full-terms').first();
    await terms.locator(':scope > summary').click();
    await expect.poll(() => terms.evaluate(node => node.getAnimations().length)).toBeGreaterThan(0);
    await terms.evaluate(node => node.getAnimations().forEach(animation => animation.finish()));
    await expect(terms).toHaveAttribute('open', '');
    await terms.locator(':scope > summary').click();
    await terms.evaluate(node => node.getAnimations().forEach(animation => animation.finish()));
    await expect(terms).not.toHaveAttribute('open');
    await route(page).getByRole('button', { name: language === 'en' ? 'Delete receipt' : 'حذف الفاتورة', exact: true }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toHaveAttribute('data-modal-phase', 'opening');
    const opening = await dialog.evaluate(node => node.getAnimations().find(animation => animation.effect.target === node).effect.getKeyframes());
    expect(opening[0].transform).toBe('translateY(40px)');
    await expect(dialog).toHaveAttribute('data-modal-phase', 'open');
    await dialog.getByRole('button', { name: language === 'en' ? 'Keep receipt' : 'إبقاء الفاتورة', exact: true }).click();
    await expect(dialog).toHaveAttribute('data-modal-phase', 'closing');
    const closing = await dialog.evaluate(node => node.getAnimations().find(animation => animation.effect.target === node).effect.getKeyframes());
    expect(closing.at(-1).transform).toBe('translateY(40px)');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await route(page).getByRole('button', { name: language === 'en' ? 'Back to receipts' : 'العودة للفواتير', exact: true }).click();
    const pop = await frames(page, 'pop', 280);
    expect(pop.outgoing[1].transform).toBe(push.incoming[0].transform);
    await expect(route(page).getByRole('searchbox')).toHaveValue('Example store');
    await expect(page.locator('.navigation-snapshot')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('guards block navigation until stay/discard/save; cached Settings does not retain discarded credentials', async ({ page }) => {
  const errors = await prepare(page);
  await tab(page, 4).click(); await settled(page);
  const connection = route(page).locator('details.connection');
  await connection.locator(':scope > summary').click();
  await connection.evaluate(node => node.getAnimations().forEach(animation => animation.finish()));
  const input = connection.locator('input[name=client-key]');
  await input.fill('synthetic-test-key');
  await tab(page, 1).click();
  await expect(route(page)).toHaveAttribute('data-route', 'settings');
  await expect(page.locator('.nav [aria-current=page]')).toHaveText('Settings');
  await expect(page.locator('.navigation-snapshot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stay here', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(input).toHaveValue('synthetic-test-key');
  await tab(page, 1).click();
  await page.getByRole('button', { name: 'Leave without saving', exact: true }).click();
  await settled(page); await expect(page.locator('dialog[open]')).toHaveCount(0);
  await tab(page, 4).click(); await settled(page);
  await route(page).locator('details.connection > summary').click();
  await route(page).locator('details.connection').evaluate(node => node.getAnimations().forEach(animation => animation.finish()));
  await expect(route(page).locator('input[name=client-key]')).toHaveValue('');
  await route(page).locator('input[name=client-key]').fill('synthetic-test-key');
  await tab(page, 1).click();
  await page.getByRole('button', { name: 'Save & continue', exact: true }).click();
  await settled(page); await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(route(page)).toHaveAttribute('data-route', 'saved');
  expect(errors).toEqual([]);
});

test('rapid tab changes, reduced motion and a WebView without animations leave one usable destination', async ({ page }) => {
  const errors = await prepare(page);
  await page.evaluate(() => { for (const index of [1, 3, 4, 2, 0, 1]) document.querySelectorAll('.nav button')[index].click(); });
  await settled(page); await expect(route(page)).toHaveAttribute('data-route', 'saved');
  await expect(page.locator('#main-content [data-route]:not([hidden])')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await tab(page, 4).click();
  await expect(route(page)).toHaveAttribute('data-route', 'settings');
  await expect(page.locator('.navigation-snapshot')).toHaveCount(0);
  expect(await page.locator('#main-content').evaluate(node => node.getAnimations().length)).toBe(0);
  expect(errors).toEqual([]);
});

test('missing Web Animations is a functional immediate fallback, including modal cancellation', async ({ page }) => {
  const errors = await prepare(page, { noAnimations: true });
  await tab(page, 1).click(); await expect(route(page)).toHaveAttribute('data-route', 'saved');
  await route(page).locator('.receipt-card').first().click();
  await expect(route(page)).toHaveAttribute('data-route', 'details');
  await route(page).getByRole('button', { name: 'Delete receipt', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Keep receipt', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('editor entry/save/cancel and reanalysis dialogs use the real navigation without losing originals', async ({ page }) => {
  const errors = await prepare(page);
  await tab(page, 1).click(); await settled(page);
  await route(page).getByRole('searchbox').fill('Example store');
  await route(page).locator('.receipt-card').click(); await settled(page);
  await route(page).getByRole('button', { name: 'Edit purchase & policy durations', exact: true }).click();
  await frames(page, 'push', 280);
  const editor = route(page).locator('.editor-card');
  await editor.locator('input[name=store-name]').fill('Edited sample shop');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Stay here', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(editor.locator('input[name=store-name]')).toHaveValue('Edited sample shop');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await frames(page, 'pop', 280);
  await expect(route(page).locator('.receipt-summary h2')).toHaveText('Edited sample shop');
  await route(page).getByRole('button', { name: 'Analyze again', exact: true }).click();
  await expect(page.locator('#analysis-dialog[open]')).toBeVisible();
  await page.getByRole('button', { name: 'Keep current details', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await route(page).getByRole('button', { name: 'Edit purchase & policy durations', exact: true }).click();
  await frames(page, 'push', 280);
  await route(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await frames(page, 'pop', 280);
  const original = route(page).locator('.receipt-photo-card');
  await original.locator(':scope > summary').click();
  await original.evaluate(node => node.getAnimations().forEach(animation => animation.finish()));
  await expect(original.locator('img')).toBeVisible();
  const url = await original.locator('img').getAttribute('src');
  await route(page).getByRole('button', { name: 'Back to receipts', exact: true }).click();
  await page.evaluate(() => { for (const node of [document.getElementById('main-content'), document.querySelector('.navigation-snapshot')]) node.getAnimations().forEach(animation => animation.pause()); });
  expect(await page.evaluate(async url => (await fetch(url)).ok, url)).toBe(true);
  const retained = await page.locator('.navigation-snapshot img.receipt-photo').evaluate(node => node.complete && node.naturalWidth > 0);
  expect(retained).toBe(true);
  await frames(page, 'pop', 280);
  const released = await page.evaluate(async url => { try { await fetch(url); return false; } catch { return true; } }, url);
  expect(released).toBe(true);
  expect(errors).toEqual([]);
});

test('file import pushes details and deleting that receipt pops to the saved list', async ({ page }) => {
  const errors = await prepare(page);
  await tab(page, 2).click(); await settled(page);
  await route(page).locator('input[type=file]').setInputFiles({ name: 'new-synthetic-receipt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c2ioAAAAASUVORK5CYII=', 'base64') });
  await frames(page, 'push', 280);
  await expect(route(page)).toHaveAttribute('data-route', 'details');
  await expect(route(page).locator('.filename')).toContainText('new-synthetic-receipt.png');
  await route(page).getByRole('button', { name: 'Delete receipt', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await frames(page, 'pop', 280);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(route(page)).toHaveAttribute('data-route', 'saved');
  await expect(route(page).locator('.receipt-card')).toHaveCount(30);
  const count = await page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.open('dhamantaha-receipts', 1);
    request.onsuccess = () => { const db = request.result; const query = db.transaction('receipts').objectStore('receipts').count(); query.onsuccess = () => { resolve(query.result); db.close(); }; };
  }));
  expect(count).toBe(35);
  expect(errors).toEqual([]);
});

test('scroll positions survive receipt push/pop without replacing the receipt search input', async ({ page }) => {
  const errors = await prepare(page);
  await tab(page, 1).click(); await settled(page);
  const target = route(page).locator('.receipt-card').nth(8);
  await target.scrollIntoViewIfNeeded();
  await target.evaluate(node => node.addEventListener('click', () => { window.__departureScroll = window.scrollY; }, { capture: true, once: true }));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await target.click(); await settled(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await route(page).getByRole('button', { name: 'Back to receipts', exact: true }).click();
  await settled(page);
  expect(Math.abs(await page.evaluate(() => window.scrollY - window.__departureScroll))).toBeLessThan(3);
  expect(errors).toEqual([]);
});

for (const [language, theme, font] of [['en','light','normal'], ['ar','dark','large'], ['ar','light','normal'], ['en','dark','large']]) {
  test(`Analyst ${language}/${theme}/${font}: periods, chart, currency, merchant groups, keywords and receipts`, async ({page}) => {
    await page.clock.setFixedTime(new Date('2026-10-22T12:00:00'));
    await page.setViewportSize({width:320,height:844});
    const errors = await prepare(page, {language,theme,font});
    await page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('dhamantaha-receipts',1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      await new Promise((resolve,reject)=>{const tx=db.transaction('receipts','readwrite');const request=tx.objectStore('receipts').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const row=cursor.value;const index=Number(row.id.split('-')[1]);row.analysis.receipt={...row.analysis.receipt,merchantName:index===0?'Jarir Marketing Company':index===2?'مكتبة جرير':index===3?'Other Shop':'Jarir Bookstore',purchaseDate:index===0||index===3?'2026-10-22':index===1?'2026-10-21':index===2?'2026-09-30':'2020-01-01',total:index===0?100:index===1?20:index===2?50:index===3?5:100,currency:index===3?'USD':'SAR',branchName:'Hayat Riyadh'};row.analysis.items[0].category='Electronics';cursor.update(row);cursor.continue();};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    });
    await page.reload();await tab(page,3).click();await settled(page);
    const analyst=route(page); const periods=analyst.locator('.analyst-periods button');
    const expected=[100,120,170,170];
    for(let index=0;index<4;index++){
      await periods.nth(index).click();
      await expect(analyst.locator('.spending-total')).toContainText(new Intl.NumberFormat(language==='ar'?'ar-SA':'en-GB').format(expected[index]));
      await expect(analyst.locator('svg.analyst-chart')).toBeVisible();
    }
    await expect(analyst.locator('.analyst-store')).toHaveCount(1);
    await expect(analyst.locator('.analyst-store > button')).toContainText(language==='ar'?'جرير':'Jarir');
    const search=analyst.getByRole('searchbox');await search.fill('SKU-NO-MATCH');await expect(analyst.locator('.empty')).toBeVisible();await search.fill('Hayat');await expect(analyst.locator('.analyst-purchase')).toHaveCount(3);await search.fill('');
    await analyst.locator('.analyst-keyword-picker > summary').click();await analyst.locator('.analyst-keywords button').first().click();await expect(search).not.toHaveValue('');await analyst.locator('.analyst-keywords button').first().click();await expect(search).toHaveValue('');
    await analyst.locator('.analyst-selects select').nth(1).selectOption('USD');await expect(analyst.locator('.analyst-purchase')).toHaveCount(1);await expect(analyst.locator('.analyst-store')).toContainText('Other Shop');await analyst.locator('.analyst-selects select').nth(1).selectOption('SAR');
    const groups=analyst.locator('.analyst-aliases');await groups.locator('summary').click();
    for(const name of ['Jarir Marketing Company','Jarir Bookstore','مكتبة جرير'])await groups.getByLabel(name,{exact:false}).fill('Unified Jarir');
    await groups.getByRole('button',{name:language==='ar'?'حفظ التجميع':'Save groups',exact:true}).click();await expect(analyst.locator('.analyst-store > button')).toContainText('Unified Jarir');
    await page.reload();await tab(page,3).click();await settled(page);await expect(route(page).locator('.analyst-store > button')).toContainText('Unified Jarir');
    await route(page).locator('.analyst-purchase').first().click();await expect(route(page)).toHaveAttribute('data-route','details');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    expect(errors).toEqual([]);
  });
}
