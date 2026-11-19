// レアな敵（2026-11-20）：ひとりで冒険でレア・超レアと戦う → おたからと図鑑のしるしが保存される → 図鑑は1単元20体
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
const SHOT = process.env.SHOTS || 'test-results/shots';
test.setTimeout(150000);
for (const [W, H, n, k, bit] of [[1366, 800, 21, 14, 19], [375, 812, 22, 12, 17]]) {
  test(`レアな敵と戦い、おたからと図鑑のしるしが残る（${W}px）`, async ({ browser }) => {
    const errs = [], sid = `2-3-${n}`;
    const p = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    await rest('PUT', `quest/${Y}/keys/${sid}`, 'rare' + n);
    await rest('DELETE', `quest/${Y}/owners/${sid}`);
    await rest('PUT', `quest/${Y}/classes/2-3`, { stage: 10 });
    await rest('PUT', `quest/${Y}/chars/${sid}`, { n: 'レアハント', j: 'warrior', lk: 'a', lv: 20, exp: 0, gold: 100, sp: 19, spt: 19, zk: { life: 1 + 2048 + 1024 } });
    await p.goto('quest.html?emu=1');
    await p.locator('#segG button[data-v="2"]').click(); await p.locator('#segC button', { hasText: '3' }).first().click();
    await p.locator('#nums button', { hasText: new RegExp('^' + n + '$') }).click();
    await p.locator('input[aria-label="合言葉"]').fill('rare' + n); await p.getByRole('button', { name: 'OK' }).click();
    await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
    await p.locator('#goMenu').click(); await p.getByRole('button', { name: '地図' }).click();
    await p.locator('[data-wm]', { hasText: 'いのちの大樹' }).click(); await p.locator('#wmGo').click();
    await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 }); await p.waitForTimeout(800);
    await p.evaluate((kk) => window.__rareBattle(kk), k);
    await expect(p.locator('#s-battle')).toBeVisible({ timeout: 15000 });
    const g = p.getByRole('button', { name: 'わかった' }); if (await g.isVisible().catch(() => false)) await g.click();
    await expect(p.locator('#enemy')).toHaveClass(k === 14 ? /rare r2/ : /rare r1/);
    await expect(p.locator('#ename')).toContainText(k === 14 ? '★超レア' : '★レア');
    await expect(p.locator('#cmd')).toContainText('レアな敵があらわれた');
    await p.screenshot({ path: `${SHOT}/rare-battle-${W}.png` });
    await expect(p.locator('#cmd .qbox')).toBeVisible({ timeout: 5000 });
    await p.evaluate(() => window.__winNow());
    await expect(p.locator('#cmd')).toContainText('を落とした', { timeout: 40000 });
    const ch = await rest('GET', `quest/${Y}/chars/${sid}`);
    const inv = ch.inv || {}, got = k === 14 ? (inv.potion3 || 0) + (inv.ether3 || 0) : inv.potion2 || 0;
    expect(got).toBe(1);
    expect(Math.floor(ch.zk.life / 2 ** bit) % 2).toBe(1);
    expect(ch.zk.life % 4096).toBe(1 + 2048 + 1024);   // 前のしるしはそのまま
    await expect.poll(async () => rest('GET', `quest/${Y}/czk/2-3/life/${n}`)).toBe(ch.zk.life);   // クラスの図鑑にも
    await p.getByRole('button', { name: 'フィールドにもどる' }).click();
    await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
    // 図鑑：植物と動物は20体。倒したレアは名前つき、まだのレアは「？？？」
    await p.locator('#goMenu').click(); await p.getByRole('button', { name: '図鑑' }).click();
    await expect(p.locator('.pk.zk')).toContainText('2年の図鑑：4 / 80');
    await expect(p.locator('.pk.zk .zk-card')).toHaveCount(20);
    await expect(p.locator('.pk.zk .zk-card.rare')).toHaveCount(3);
    await expect(p.locator('.pk.zk .zk-card.rare:not(.no)')).toHaveCount(1);
    await expect(p.locator('.pk.zk .zk-card.rare.no').first()).toContainText('？？？');
    await p.locator('.pk.zk .zk-card.rare').first().scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${SHOT}/rare-zukan-${W}.png` });
    expect(errs).toEqual([]);
  });
}
