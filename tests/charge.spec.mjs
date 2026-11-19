// ひとりで冒険の「ため」「バリア」（2026-11-21）：ため → 打ち消す技で消える、バリア → つらぬく技で こわれる。技の説明にも出る
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
const SHOT = process.env.SHOTS || 'test-results/shots';
test.setTimeout(150000);
for (const [W, H, n] of [[1366, 800, 35], [375, 812, 36]]) {
  test(`ひとりで冒険：ため → 打ち消す、バリア → つらぬく（${W}px）`, async ({ browser }) => {
    const errs = [], sid = `2-3-${n}`;
    const p = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    await rest('PUT', `quest/${Y}/keys/${sid}`, 'chg' + n);
    await rest('DELETE', `quest/${Y}/owners/${sid}`);
    await rest('PUT', `quest/${Y}/classes/2-3`, { stage: 10 });
    await rest('PUT', `quest/${Y}/chars/${sid}`, { n: 'タメケシ', j: 'warrior', lk: 'a', lv: 32, exp: 0, gold: 100, sp: 0, spt: 0, ld: { a: [7, 8], u: -1 } });
    await p.goto('quest.html?emu=1');
    await p.locator('#segG button[data-v="2"]').click(); await p.locator('#segC button', { hasText: '3' }).first().click();
    await p.locator('#nums button', { hasText: new RegExp('^' + n + '$') }).click();
    await p.locator('input[aria-label="合言葉"]').fill('chg' + n); await p.getByRole('button', { name: 'OK' }).click();
    await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
    await p.locator('#goMenu').click(); await p.getByRole('button', { name: '地図' }).click();
    await p.locator('[data-wm]', { hasText: 'いのちの大樹' }).click(); await p.locator('#wmGo').click();
    await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 }); await p.waitForTimeout(800);
    await p.evaluate(() => { window.__noRoll = 1; window.__bossBattle(); });
    await expect(p.locator('#s-battle')).toBeVisible({ timeout: 15000 });
    const g = p.getByRole('button', { name: 'わかった' }); if (await g.isVisible().catch(() => false)) await g.click();
    await expect(p.locator('#cmd .qbox')).toBeVisible({ timeout: 5000 });
    // ため
    await p.evaluate(() => window.__foeChg());
    await expect(p.locator('#eweak')).toContainText('ためている');
    await expect(p.locator('#enemy')).toHaveClass(/chg/);
    await p.screenshot({ path: `${SHOT}/charge-boss-${W}.png` });
    await p.evaluate(() => window.__okNow());
    const cancel = p.locator('#cmd button.act', { hasText: 'ためを打ち消す' });
    await expect(cancel).toBeVisible({ timeout: 5000 });
    await expect(p.locator('#cmd button.act', { hasText: 'バリアをつらぬく' })).toContainText('バリアに ×2');
    await cancel.click();
    await expect(p.locator('#cmd')).toContainText('ためを打ち消した');
    expect((await p.evaluate(() => window.__foe())).chg).toBe(0);
    await expect(p.locator('#enemy')).not.toHaveClass(/chg/);
    // バリア：ふつうのこうげきは減り、つらぬく技は こわす
    await expect(p.locator('#cmd .qbox')).toBeVisible({ timeout: 8000 });
    await p.evaluate(() => { window.__foeBar(); });
    await expect(p.locator('#eweak')).toContainText('バリア');
    await expect(p.locator('#enemy')).toHaveClass(/barrier/); await expect(p.locator('#enemy .epop')).toHaveCount(0, { timeout: 4000 });
    await p.screenshot({ path: `${SHOT}/barrier-boss-${W}.png` });
    await p.evaluate(() => window.__okNow());
    await p.locator('#cmd button.act', { hasText: 'こうげき' }).click();
    await expect(p.locator('#cmd')).toContainText('バリアでダメージが減った');
    expect((await p.evaluate(() => window.__foe())).bar).toBeGreaterThan(0);
    await expect(p.locator('#cmd .qbox')).toBeVisible({ timeout: 8000 });
    await p.evaluate(() => { window.__foeBar(); });
    await p.evaluate(() => window.__okNow());
    await p.locator('#cmd button.act', { hasText: 'バリアをつらぬく' }).click();
    await expect(p.locator('#cmd')).toContainText('バリアをこわした');
    expect((await p.evaluate(() => window.__foe())).bar).toBe(0);
    expect(errs).toEqual([]);
  });
}
