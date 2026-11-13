// 目で確かめる用（ふだんのテストには入れない）：ひとりで冒険の町を、段階を変えて写真に撮る
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const SHOT = process.env.SHOTS, Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
test.setTimeout(180000);
test('ひとりで冒険：町の育ち方と画面', async ({ browser }) => {
  const errs = [];
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await rest('PUT', `quest/${Y}/keys/2-3-7`, 'abc723');
  await rest('DELETE', `quest/${Y}/chars/2-3-7`); await rest('DELETE', `quest/${Y}/owners/2-3-7`);
  await rest('PUT', `quest/${Y}/classes/2-3`, { stage: 0, town: 'ほしぞら村' });
  await p.goto('quest.html?emu=1');
  await p.locator('#segG button[data-v="2"]').click(); await p.locator('#segC button', { hasText: '3' }).first().click();
  await p.locator('#nums button', { hasText: /^7$/ }).click();
  await p.locator('input[aria-label="合言葉"]').fill('abc723'); await p.getByRole('button', { name: 'OK' }).click();
  await expect(p.locator('#s-make')).toBeVisible({ timeout: 15000 });
  await p.screenshot({ path: SHOT + '/s0-make.png' });
  await p.locator('.jobcard[data-job="summoner"]').click(); await p.locator('#cname').fill('せいれい'); await p.locator('#btnMake').click();
  await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
  const ch = await rest('GET', `quest/${Y}/chars/2-3-7`); expect(ch.lv).toBe(16); expect(ch.sp).toBe(15);
  for (const st of [0, 2, 4, 7, 9, 12]) {
    await rest('PUT', `quest/${Y}/classes/2-3/stage`, st);
    await p.reload(); await p.locator('#segG button[data-v="2"]').click().catch(() => {});
    if (await p.locator('#s-login').isVisible()) { await p.locator('#segC button', { hasText: '3' }).first().click(); await p.locator('#nums button', { hasText: /^7$/ }).click(); }
    await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 }); await p.waitForTimeout(1500);
    await p.screenshot({ path: SHOT + '/s1-town-' + st + '.png' });
  }
  await p.locator('#goStat').click(); await p.waitForTimeout(600); await p.screenshot({ path: SHOT + '/s2-stat.png', fullPage: true });
  console.log('pageerrors', JSON.stringify(errs));
  expect(errs).toEqual([]);
});
