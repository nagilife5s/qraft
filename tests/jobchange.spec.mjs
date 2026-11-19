// 教会で職業を変える（2026-11-20）：学年×100G。技のランクが戻り、レベル・装備はそのまま
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
test.setTimeout(90000);
test('教会で職業を変える', async ({ browser }) => {
  const errs = [];
  const p = await (await browser.newContext({ viewport: { width: 1366, height: 800 } })).newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await rest('PUT', `quest/${Y}/keys/3-3-9`, 'abc939');
  await rest('DELETE', `quest/${Y}/owners/3-3-9`);
  await rest('PUT', `quest/${Y}/classes/3-3`, { stage: 5 });
  await rest('PUT', `quest/${Y}/chars/3-3-9`, { n: 'てんしょく', j: 'warrior', lk: 'a', lv: 40, exp: 0, gold: 500, sp: 3, spt: 39, sr: { 0: 2, 1: 2, 2: 2 }, eq: { w: 'w2' } });
  await p.goto('quest.html?emu=1');
  await p.locator('#segG button[data-v="3"]').click(); await p.locator('#segC button', { hasText: '3' }).first().click();
  await p.locator('#nums button', { hasText: /^9$/ }).click();
  await p.locator('input[aria-label="合言葉"]').fill('abc939'); await p.getByRole('button', { name: 'OK' }).click();
  await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
  await p.evaluate(() => window.__shop(2));
  await p.getByRole('button', { name: /職業を変える/ }).click();
  const dlg = p.getByRole('dialog', { name: '職業を変える' });
  await expect(dlg).toBeVisible();
  await p.screenshot({ path: 'test-results/jobchange.png' });
  await dlg.getByRole('button', { name: '僧侶（B）' }).click();
  await dlg.getByRole('button', { name: 'この職業になる' }).click();
  await expect(dlg).toHaveCount(0);
  await expect.poll(async () => (await rest('GET', `quest/${Y}/chars/3-3-9`)).j, { timeout: 10000 }).toBe('priest');
  const ch = await rest('GET', `quest/${Y}/chars/3-3-9`);
  expect([ch.lk, ch.gold, ch.sp, ch.spt, ch.lv, ch.sr, ch.eq.w]).toEqual(['b', 200, 39, 39, 40, undefined, 'w2']);
  expect(errs).toEqual([]);
});
