// ひとりで冒険の技エフェクト（2026-11-20）：正解 → 技 → 敵の上に .fximg。押せるボタンをふさがない
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
const SHOT = process.env.SHOTS || 'test-results/shots';
test.setTimeout(120000);
for (const [W, H, n] of [[1366, 800, 31], [375, 812, 32]]) {
  test(`ひとりで冒険：技のエフェクトが敵の上に出る（${W}px）`, async ({ browser }) => {
    const errs = [], sid = `2-3-${n}`;
    const p = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    await rest('PUT', `quest/${Y}/keys/${sid}`, 'fx' + n);
    await rest('DELETE', `quest/${Y}/owners/${sid}`);
    await rest('PUT', `quest/${Y}/classes/2-3`, { stage: 10 });
    await rest('PUT', `quest/${Y}/chars/${sid}`, { n: 'エフェクト', j: 'warrior', lk: 'a', lv: 20, exp: 0, gold: 100, sp: 19, spt: 19 });
    await p.goto('quest.html?emu=1');
    await p.locator('#segG button[data-v="2"]').click(); await p.locator('#segC button', { hasText: '3' }).first().click();
    await p.locator('#nums button', { hasText: new RegExp('^' + n + '$') }).click();
    await p.locator('input[aria-label="合言葉"]').fill('fx' + n); await p.getByRole('button', { name: 'OK' }).click();
    await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
    await p.locator('#goMenu').click(); await p.getByRole('button', { name: '地図' }).click();
    await p.locator('[data-wm]', { hasText: 'いのちの大樹' }).click(); await p.locator('#wmGo').click();
    await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 }); await p.waitForTimeout(800);
    await p.evaluate(() => window.__rareBattle(0));
    await expect(p.locator('#s-battle')).toBeVisible({ timeout: 15000 });
    const g = p.getByRole('button', { name: 'わかった' }); if (await g.isVisible().catch(() => false)) await g.click();
    await expect(p.locator('#cmd .qbox')).toBeVisible({ timeout: 5000 });
    await p.evaluate(() => window.__okNow());
    const sk = p.locator('#cmd .act:not([disabled])', { hasNotText: 'こうげき' }).first();
    await expect(sk).toBeVisible({ timeout: 5000 });
    await sk.click();
    const fx = p.locator('#enemy .fximg');
    await expect(fx).toHaveCount(1);
    expect(await fx.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${SHOT}/fx-skill-${W}.png` });
    await expect(fx).toHaveCount(0, { timeout: 3000 });
    // ふつうの攻撃も小さなエフェクト
    await expect(p.locator('#cmd .qbox')).toBeVisible({ timeout: 5000 });
    await p.evaluate(() => window.__okNow());
    await p.locator('#cmd .act', { hasText: 'こうげき' }).click();
    await expect(p.locator('#enemy .fximg.small')).toHaveCount(1);
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${SHOT}/fx-attack-${W}.png` });
    expect(errs).toEqual([]);
  });
}
