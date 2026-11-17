// 記録画面のタブ（記録・問題・設定）・問題の手直し（qedits）が家庭練習に出る・ひとりで冒険の記録（2026-11-17）
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
const SHOT = process.env.SHOTS || '';
test.setTimeout(120000);

async function asTeacher(page) {
  await page.goto('records.html?emu=1');
  const id = page.locator('#myUid'); await expect(id).not.toBeEmpty({ timeout: 15000 });
  await rest('PUT', 'admins/' + (await id.textContent()).trim(), true);
  await page.reload(); await expect(page.locator('#body')).toBeVisible({ timeout: 15000 });
}

test('記録画面：3つのタブ・最後のタブを覚える・問題を直すと家庭練習に出る・元にもどす', async ({ browser }) => {
  const errs = [];
  await rest('DELETE', 'qedits');
  const t = await (await browser.newContext({ viewport: { width: 1366, height: 657 } })).newPage();
  t.on('pageerror', e => errs.push('T ' + e));
  await asTeacher(t);
  await expect(t.locator('#tab-rec')).toHaveAttribute('aria-selected', 'true');
  await expect(t.locator('#p-rec')).toBeVisible(); await expect(t.locator('#p-set')).toBeHidden();
  if (SHOT) await t.screenshot({ path: SHOT + '/rec-1-records.png' });
  await t.locator('#tab-set').click();
  await expect(t.locator('#btnKeys')).toBeVisible(); await expect(t.locator('#p-rec')).toBeHidden();
  if (SHOT) await t.screenshot({ path: SHOT + '/rec-3-settings.png' });
  // 問題タブ：セットをえらぶと問題が出る
  await t.locator('#tab-q').click();
  await t.locator('#qPicker .pkq').fill('塩化銅水溶液の電気分解');
  await t.locator('#qPicker .pcard', { hasText: /^塩化銅水溶液の電気分解/ }).first().click();
  await expect(t.locator('#qc-1')).toBeVisible({ timeout: 15000 });
  await expect(t.locator('#qc-1 li.ok')).toHaveCount(1);   // 選択問題は正解に印
  // 2問目（選択）を直す：問題文と正解の番号
  await t.locator('#qc-1').getByRole('button', { name: '直す' }).click();
  await t.locator('#qc-1 textarea[aria-label="問題文"]').fill('てすと：直した問題');
  const radios = t.locator('#qc-1 input[type=radio]'), was = await radios.evaluateAll(rs => rs.findIndex(r => r.checked));
  const nw = (was + 1) % (await radios.count());
  await radios.nth(nw).check();
  await t.locator('#qc-1').getByRole('button', { name: /保存する/ }).click();
  await expect(t.locator('#qc-1 .badge-ed')).toBeVisible();
  await expect(t.locator('#qc-1 .qt')).toContainText('てすと：直した問題');
  const x = await rest('GET', 'qedits/06147353/1');
  expect(x.q).toBe('てすと：直した問題'); expect(x.a).toBe(nw); expect(x.c).toBeUndefined();   // 変えた項目だけ
  await expect(t.locator('#edSum')).toContainText('手で直した問題 1問');
  if (SHOT) await t.screenshot({ path: SHOT + '/rec-2-questions.png' });
  if (SHOT) { await t.setViewportSize({ width: 1920, height: 950 }); await t.screenshot({ path: SHOT + '/rec-2-questions-1920.png' }); await t.setViewportSize({ width: 1366, height: 657 }); }
  // 最後のタブを覚える
  await t.reload(); await expect(t.locator('#tab-q')).toHaveAttribute('aria-selected', 'true', { timeout: 15000 });

  // 家庭練習：ほかの問題もすべて直したことにして、出る問題文が直したものになるかを見る
  for (const i of [0, 2, 3, 4, 5]) await rest('PUT', `qedits/06147353/${i}`, { q: 'てすと：' + i, t: Date.now() });
  await rest('PUT', `quest/${Y}/keys/3-1-2`, 'abc345');
  const s = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  s.on('pageerror', e => errs.push('S ' + e));
  await s.goto('home.html?emu=1&sess=1');
  await s.evaluate(() => { const c = (id, t) => [...document.getElementById(id).querySelectorAll('*')].find((e) => e.textContent.trim() === t && !e.children.length).click(); c('idG', '3年'); c('idC', '1組'); });
  await s.selectOption('#idN', '2'); await s.click('#btnId');
  await s.fill('form input', 'abc345'); await s.click('form button[type=submit]');
  await s.locator('#s-pick button', { hasText: /^塩化銅水溶液の電気分解\s*3年/ }).click();
  await expect(s.locator('#sqtext')).toContainText('てすと：', { timeout: 15000 });

  // 元にもどす（読みこみ直したので、セットをえらび直す）
  await t.locator('#qPicker .pkq').fill('塩化銅水溶液の電気分解');
  await t.locator('#qPicker .pcard', { hasText: /^塩化銅水溶液の電気分解/ }).first().click();
  await expect(t.locator('#qc-1 .badge-ed')).toBeVisible({ timeout: 15000 });
  t.once('dialog', d => d.accept());
  await t.locator('#qc-1').getByRole('button', { name: '元にもどす' }).click();
  await expect(t.locator('#qc-1 .badge-ed')).toHaveCount(0);
  expect(await rest('GET', 'qedits/06147353/1')).toBeNull();
  await rest('DELETE', 'qedits');
  expect(errs).toEqual([]);
});

test('ひとりで冒険：答えた結果が記録になり、記録画面に「ひとりで冒険」で出る', async ({ browser }) => {
  const errs = [], sid = '1-5-21';
  await rest('PUT', `quest/${Y}/keys/${sid}`, 'qqq521');
  await rest('DELETE', `quest/${Y}/chars/${sid}`); await rest('DELETE', `quest/${Y}/owners/${sid}`); await rest('DELETE', `practice/${sid}`);
  const p = await (await browser.newContext({ viewport: { width: 1366, height: 700 } })).newPage();
  p.on('pageerror', e => errs.push('P ' + e));
  await p.goto('quest.html?emu=1');
  await p.locator('#segG button[data-v="1"]').click(); await p.locator('#segC button', { hasText: '5' }).first().click();
  await p.locator('#nums button', { hasText: /^21$/ }).click();
  await p.locator('input[aria-label="合言葉"]').fill('qqq521'); await p.getByRole('button', { name: 'OK' }).click();
  await expect(p.locator('#s-make')).toBeVisible({ timeout: 15000 });
  await p.locator('.jobcard[data-job="warrior"]').click(); await p.locator('#cname').fill('きろく'); await p.locator('#btnMake').click();
  await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
  // 地図 → 1年の最初のエリア → ダンジョンへ → ボスにちょうせん（すぐ戦闘に入れる）
  await p.locator('#goMenu').click(); await p.getByRole('button', { name: '地図' }).click();
  await p.locator('.wm-node:not(.town)').first().click(); await p.locator('#wmGo').click();
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.__bossAsk()); await p.getByRole('button', { name: 'ちょうせんする' }).click();
  await expect(p.locator('#s-battle')).toBeVisible({ timeout: 15000 });
  const g = p.getByRole('button', { name: 'わかった！' }); if (await g.isVisible({ timeout: 3000 }).catch(() => false)) await g.click();
  for (let k = 0; k < 1; k++) {   // 1問答える（選択なら最初の選択肢・入力なら x）
    await p.waitForFunction(() => document.querySelector('#cmd .choices button:not([disabled])') || document.querySelector('#cmd .tin:not([disabled])'), null, { timeout: 15000 });
    if (await p.locator('#cmd .tin').count()) { await p.locator('#cmd .tin').fill('x'); await p.locator('#cmd .tin').press('Enter'); }
    else { await p.locator('#cmd .choices button').first().click(); const sb = p.locator('#cmd > .btn', { hasText: '答える' }); if (await sb.count() && await sb.isEnabled()) await sb.click(); }   // 複数選択は「答える」も押す
    await expect.poll(() => p.evaluate(() => window.__adv.count)).toBe(k + 1);
    const nx = p.getByRole('button', { name: 'つぎへ' }); if (await nx.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) await nx.click();   // まちがえたときは「つぎへ」
  }
  expect(await p.evaluate(() => window.__adv.count)).toBe(1);
  await p.evaluate(() => window.__adv.flush());
  const recs = Object.values((await rest('GET', `practice/${sid}`)) || {});
  expect(recs.length).toBe(1);
  expect(recs[0].m).toBe('q'); expect(recs[0].n).toBe(1); expect(recs[0].u).toMatch(/^[a-z]+$/); expect(recs[0].y).toBe(String(Y));
  // 記録画面に出る
  const t = await (await browser.newContext({ viewport: { width: 1366, height: 657 } })).newPage();
  t.on('pageerror', e => errs.push('T ' + e));
  await t.goto('records.html?emu=1'); await t.evaluate(() => localStorage.setItem('qraft.records.tab', 'rec'));
  await asTeacher(t);
  await t.locator('#fm').selectOption('q');
  const row = t.locator('tr.sum', { hasText: '1年5組 21番' });
  await expect(row).toContainText('ひとりで冒険');
  await row.click(); await expect(t.locator('tr.det')).toContainText('/1');
  await expect(t.locator('#tblSet')).toContainText('ひとりで冒険');
  if (SHOT) await t.screenshot({ path: SHOT + '/rec-4-adventure.png', fullPage: true });
  expect(errs).toEqual([]);
});
