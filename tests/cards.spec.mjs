// 理科用語カード（2026-11-23）：正解でカードが落ちる → アルバムに出る → 単元を集めきるとごほうび。ルールはにせのしるし・しるしの消去を断る
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
const SHOT = process.env.SHOTS || 'test-results/shots';
test.setTimeout(150000);

async function setup(n, ch) {
  const sid = `2-5-${n}`;
  await rest('PUT', `quest/${Y}/keys/${sid}`, 'card' + n);
  await rest('DELETE', `quest/${Y}/owners/${sid}`);
  await rest('PUT', `quest/${Y}/classes/2-5`, { stage: 10 });
  await rest('PUT', `quest/${Y}/chars/${sid}`, Object.assign({ n: 'カード', j: 'warrior', lk: 'a', lv: 20, exp: 0, gold: 100, sp: 19, spt: 19 }, ch || {}));
  return sid;
}
async function open(browser, n, phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } : { viewport: { width: 1366, height: 800 } });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e))); p.on('dialog', (d) => d.accept());
  await p.goto('quest.html?emu=1');
  await p.locator('#segG button[data-v="2"]').click(); await p.locator('#segC button', { hasText: '5' }).first().click();
  await p.locator('#nums button', { hasText: new RegExp('^' + n + '$') }).click();
  await p.locator('input[aria-label="合言葉"]').fill('card' + n); await p.getByRole('button', { name: 'OK' }).click();
  await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
  return p;
}
const charOf = (sid) => rest('GET', `quest/${Y}/chars/${sid}`);
const bitsOf = (o) => Object.values(o || {}).reduce((n, v) => { let c = 0; for (let b = 0; b < 26; b++) if (Math.floor(v / 2 ** b) % 2) c++; return n + c; }, 0);

for (const [W, n] of [[1366, 31], [375, 32]]) {
  test(`単元の問題に正解するとカードが落ち、アルバムに出る（${W}px）`, async ({ browser }) => {
    const sid = await setup(n, { cd: { life: { a: 1 } } });
    const p = await open(browser, n, W < 600);
    await p.locator('#goMenu').click(); await p.getByRole('button', { name: '地図' }).click();
    await p.locator('[data-wm]', { hasText: 'いのちの大樹' }).click(); await p.locator('#wmGo').click();
    await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 }); await p.waitForTimeout(800);
    await p.evaluate(() => window.__rareBattle(0));
    await expect(p.locator('#s-battle')).toBeVisible({ timeout: 15000 });
    const g = p.getByRole('button', { name: 'わかった' }); if (await g.isVisible().catch(() => false)) await g.click();
    await expect(p.locator('#cmd .qbox')).toBeVisible({ timeout: 8000 });
    await p.evaluate(() => window.__cardR(0));   // 必ず落ちる
    await p.evaluate(() => window.__okNow());
    await expect(p.locator('.cd-pop')).toContainText('📇 カードを手に入れた！', { timeout: 5000 });
    await p.waitForTimeout(400); await p.screenshot({ path: `${SHOT}/cards-drop-${W}.png` });
    await expect.poll(async () => bitsOf(((await charOf(sid)).cd || {}).life), { timeout: 10000 }).toBe(2);
    expect((await charOf(sid)).cd.life.a % 2).toBe(1);   // 前のカードは残る
    expect(p.errs).toEqual([]);
    await p.locator('.cd-pop').click();
    await p.evaluate(() => window.__openCards());
    await expect(p.locator('.cd-album')).toContainText('2年のカード：2 / 214');
    await expect(p.locator('.cd-album [data-cdu="life"]')).toContainText('植物と動物（2/78）');
    await p.locator('.cd-album [data-cdu="life"]').click();
    await expect(p.locator('.cd-card:not(.no)')).toHaveCount(2);
    await expect(p.locator('.cd-card.no')).toHaveCount(76);
    await expect(p.locator('.cd-card:not(.no)').first()).toContainText('単細胞生物');
    await p.screenshot({ path: `${SHOT}/cards-album-${W}.png` });
    if (W < 600) expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await p.locator('.cd-album [data-cdg="1"]').click();
    await expect(p.locator('.cd-album')).toContainText('1年のカード：0 /');
    await expect(p.locator('.cd-card.no').first()).toContainText('？');
    expect(p.errs).toEqual([]);
    await p.context().close();
  });
}

test('単元を集めきると ゴールド＋100 と「博士」の称号（1回きり）', async ({ browser }) => {
  const sid = await setup(33);
  const p = await open(browser, 33);
  await p.evaluate(() => { window.__cardGive('ion', 38); window.__cardR(0); });   // イオン39枚のうち38枚
  expect(await p.evaluate(() => window.__cardDrop('ion', []))).toBe(38);
  await expect(p.locator('.cd-pop')).toContainText('イオンのカードを全部集めた！');
  await expect.poll(async () => (await charOf(sid)).cdc, { timeout: 10000 }).toEqual({ ion: true });
  const c = await charOf(sid);
  expect(c.gold).toBe(200); expect(bitsOf(c.cd.ion)).toBe(39);
  await p.screenshot({ path: `${SHOT}/cards-bonus-1366.png` });
  expect(await p.evaluate(() => window.__cardDrop('ion', []))).toBe(-1);   // もう落ちない・2回目のごほうびもない
  await p.evaluate(() => window.__openCards());
  await p.locator('.cd-album [data-cdg="3"]').click(); await p.locator('.cd-album [data-cdu="ion"]').click();
  await expect(p.locator('.cd-album')).toContainText('🏅 イオン博士');
  await expect(p.locator('.cd-card.no')).toHaveCount(0);
  await p.locator('#cdClose').click();
  // 称号の一覧（城）にも出る
  await p.evaluate(() => window.__shop(5));
  await expect(p.locator('.titles')).toContainText('イオン博士');
  expect(p.errs).toEqual([]);
  await p.context().close();
});

test('ルール：枚数の外のしるし・しるしを消す・ごほうびだけの書き込みは断られる', async ({ browser }) => {
  const sid = await setup(34, { cd: { matter: { a: 3 } } });
  const p = await open(browser, 34);
  const w = (path, v) => p.evaluate(async ([sid, path, v]) => { const m = await import('./lib.js?v=20261123120000'); const y = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1; try { await m.set(m.ref(m.db, 'quest/' + y + '/chars/' + sid + '/' + path), v); return 'ok'; } catch (e) { return 'denied'; } }, [sid, path, v]);
  expect(await w('cd/matter/b', 2 ** 21)).toBe('denied');      // 物質は47枚：48枚目のしるし
  expect(await w('cd/matter/c', 1)).toBe('denied');            // 3つ目の数はない
  expect(await w('cd/matter/a', 2 ** 26)).toBe('denied');      // 1つの数に26枚まで
  expect(await w('cd/nature/a', 1)).toBe('denied');            // エリアのない単元
  expect(await w('cd/matter/a', 1)).toBe('denied');            // しるしを消す
  expect(await w('cd/matter', null)).toBe('denied');
  expect(await w('cdc/matter', true)).toBe('denied');          // 集めていないのに印だけ
  expect(await w('cd/matter/a', 7)).toBe('ok');                // ふつうに1枚足すのは通る
  expect((await charOf(sid)).cd.matter).toEqual({ a: 7 });
  await p.context().close();
});
