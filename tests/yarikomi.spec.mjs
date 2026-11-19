// やり込み（鍛冶屋・図鑑・裏ボス。2026-11-19）：ひとりで冒険の画面から、鍛える・図鑑を見る・裏ボスに入る
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
test.setTimeout(120000);
test('鍛冶屋で ＋1、図鑑のしるし、裏ボスの入口', async ({ browser }) => {
  const errs = [];
  const p = await (await browser.newContext({ viewport: { width: 1366, height: 800 } })).newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await rest('PUT', `quest/${Y}/keys/2-3-8`, 'abc823');
  await rest('DELETE', `quest/${Y}/owners/2-3-8`);
  await rest('PUT', `quest/${Y}/classes/2-3`, { stage: 10 });
  await rest('PUT', `quest/${Y}/chars/2-3-8`, { n: 'かじや', j: 'warrior', lk: 'a', lv: 60, exp: 0, gold: 5000, sp: 59, spt: 59, eq: { w: 'w6', a: 'a6' },
    bc: { life: true }, zk: { life: 1 + 2 + 1024 } });
  await p.goto('quest.html?emu=1');
  await p.locator('#segG button[data-v="2"]').click(); await p.locator('#segC button', { hasText: '3' }).first().click();
  await p.locator('#nums button', { hasText: /^8$/ }).click();
  await p.locator('input[aria-label="合言葉"]').fill('abc823'); await p.getByRole('button', { name: 'OK' }).click();
  await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
  // 鍛冶屋：武器を ＋1（400G）
  await p.locator('#goMenu').click(); await p.getByRole('button', { name: '鍛冶屋' }).click();
  await expect(p.locator('#fdMsg .smith .gear')).toHaveCount(2);
  await p.locator('#fdMsg .smith button.go').first().click();
  await expect(p.locator('#fdMsg .smith .plus').first()).toHaveText('+1');
  let ch = await rest('GET', `quest/${Y}/chars/2-3-8`);
  expect(ch.up).toEqual({ w: 1 }); expect(ch.gold).toBe(4600);
  await p.locator('#fdMsg .btn.sub').click();
  // 図鑑：2年の「植物と動物」に3体
  await p.locator('#goMenu').click(); await p.getByRole('button', { name: '図鑑' }).click();
  await expect(p.locator('.pk.zk')).toContainText('2年の図鑑：3 / 44');
  await expect(p.locator('.pk.zk .zk-card:not(.no)')).toHaveCount(3);
  await p.locator('#zkClose').click();
  // 裏ボス：ボスを倒した単元では、ボスの前に「影の○○」が出る
  await p.locator('#goMenu').click(); await p.getByRole('button', { name: '地図' }).click();
  await p.locator('[data-wm]', { hasText: 'いのちの大樹' }).click(); await p.locator('#wmGo').click();
  await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 }); await p.waitForTimeout(600);
  await p.evaluate(() => window.__bossAsk());
  await expect(p.locator('#uraGo')).toContainText('影の生命の樹王イノチノキ');
  await p.locator('#uraGo').click();
  await expect(p.locator('#fdMsg')).toContainText('生命の樹王イノチノキ');
  await p.getByRole('button', { name: 'ちょうせんする' }).click();
  await expect(p.locator('#s-battle')).toBeVisible({ timeout: 15000 });
  await expect(p.locator('#ename')).toHaveText('影の生命の樹王イノチノキ');
  await expect(p.locator('#eimg')).toHaveClass(/ura-img/);
  expect(errs).toEqual([]);
});
