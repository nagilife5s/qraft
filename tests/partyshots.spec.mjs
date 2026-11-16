// 目で確かめる用（ふだんのテストには入れない）：なかまと冒険の画面を撮る
//   SHOTS=<フォルダ> npx playwright test -c shots.config.mjs partyshots.spec.mjs
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
const SHOT = process.env.SHOTS || 'test-results/shots';
test.setTimeout(180000);
async function loginAndMake(browser, vp, g, c, n, key, name) {
  await rest('PUT', `quest/${Y}/keys/${g}-${c}-${n}`, key);
  await rest('DELETE', `quest/${Y}/chars/${g}-${c}-${n}`); await rest('DELETE', `quest/${Y}/owners/${g}-${c}-${n}`);
  const ctx = await browser.newContext({ viewport: vp }), p = await ctx.newPage();
  await p.goto('quest.html?emu=1');
  await p.locator(`#segG button[data-v="${g}"]`).click(); await p.locator('#segC button', { hasText: String(c) }).first().click();
  await p.locator('#nums button', { hasText: new RegExp('^' + n + '$') }).click();
  await p.locator('input[aria-label="合言葉"]').fill(key); await p.getByRole('button', { name: 'OK' }).click();
  await expect(p.locator('#s-make')).toBeVisible({ timeout: 15000 });
  await p.locator('.jobcard[data-job="warrior"]').click(); await p.locator('#cname').fill(name); await p.locator('#btnMake').click();
  await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
  return { ctx, p };
}
for (const vp of [{ width: 1366, height: 657 }, { width: 1920, height: 950 }]) {
  test('なかまと冒険の画面 ' + vp.width, async ({ browser }) => {
    const W = vp.width;
    const A = await loginAndMake(browser, vp, 1, 5, 31, 'aaa531', 'ホスト'), B = await loginAndMake(browser, vp, 2, 5, 32, 'bbb532', 'なかま');
    await A.p.keyboard.press('m'); await A.p.getByRole('button', { name: 'なかまと冒険' }).click();
    await expect(A.p.locator('#s-entry')).toBeVisible({ timeout: 15000 });
    await A.p.screenshot({ path: `${SHOT}/pt1-entry-${W}.png`, animations: 'disabled' });
    await A.p.locator('#btnNew').click(); await expect(A.p.locator('#selUnit option').first()).toBeAttached({ timeout: 15000 }); await A.p.waitForTimeout(600);
    await A.p.screenshot({ path: `${SHOT}/pt2-setup-${W}.png`, animations: 'disabled' });
    await A.p.locator('#btnCreate').scrollIntoViewIfNeeded(); await A.p.screenshot({ path: `${SHOT}/pt2b-setup-bottom-${W}.png`, animations: 'disabled' });
    await A.p.locator('#btnCreate').click(); await expect(A.p.locator('#s-room')).toBeVisible({ timeout: 20000 });
    const pin = (await A.p.locator('#pin').textContent()).replace(/\s/g, '');
    await expect(A.p.frameLocator('#pf').locator('#s-prep')).toBeVisible({ timeout: 30000 }); await A.p.waitForTimeout(800);
    await A.p.screenshot({ path: `${SHOT}/pt3-lobby-alone-${W}.png`, animations: 'disabled' });
    await B.p.keyboard.press('m'); await B.p.getByRole('button', { name: 'なかまと冒険' }).click();
    await B.p.locator('#joinPin').fill(pin); await B.p.screenshot({ path: `${SHOT}/pt4-join-entry-${W}.png`, animations: 'disabled' });
    await B.p.locator('#btnJoin').click(); await expect(B.p.locator('#s-prep')).toBeVisible({ timeout: 30000 }); await B.p.waitForTimeout(1000);
    await B.p.screenshot({ path: `${SHOT}/pt5-join-prep-${W}.png`, animations: 'disabled' });
    await expect(A.p.locator('#btnStart')).toBeEnabled({ timeout: 15000 }); await A.p.waitForTimeout(500);
    await A.p.screenshot({ path: `${SHOT}/pt6-lobby-two-${W}.png`, animations: 'disabled' });
    await A.p.frameLocator('#pf').locator('#ppReady').click(); await B.p.locator('#ppReady').click();
    await A.p.locator('#btnStart').click();
    await expect(A.p.frameLocator('#pf').locator('#s-field')).toBeVisible({ timeout: 30000 }); await A.p.waitForTimeout(1500);
    await A.p.screenshot({ path: `${SHOT}/pt7-run-host-${W}.png`, animations: 'disabled' });
    await expect(B.p.locator('#s-prac')).toBeVisible({ timeout: 30000 }); await B.p.waitForTimeout(1000);
    await B.p.screenshot({ path: `${SHOT}/pt8-run-player-${W}.png`, animations: 'disabled' });
    A.p.once('dialog', d => d.accept()); await A.p.locator('#btnQuit').click();
    await expect(B.p.locator('#s-result')).toBeVisible({ timeout: 30000 }); await B.p.waitForTimeout(1500);
    await A.p.screenshot({ path: `${SHOT}/pt9-end-host-${W}.png`, animations: 'disabled' }); await B.p.screenshot({ path: `${SHOT}/pt10-end-player-${W}.png`, animations: 'disabled' });
  });
}
