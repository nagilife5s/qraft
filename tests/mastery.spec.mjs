// 単元マスターの称号・裏ダンジョン・昇格（2026-11-23）
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
const SHOT = process.env.SHOTS || 'test-results/shots';
const DIRS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
let SID = '3-4-9', KEY = 'abc949', NO = '9';   // テストごとに番号を変える（並んで動くため）
function who(n) { SID = '3-4-' + n; KEY = 'abc94' + n; NO = String(n); }
test.setTimeout(180000);

async function setup(ch) {
  await rest('PUT', `quest/${Y}/keys/${SID}`, KEY);
  await rest('DELETE', `quest/${Y}/owners/${SID}`);
  await rest('PUT', `quest/${Y}/classes/3-4`, { stage: 10 });
  await rest('PUT', `quest/${Y}/chars/${SID}`, Object.assign({ n: 'ますたー', j: 'warrior', lk: 'a', lv: 40, exp: 0, gold: 500, sp: 39, spt: 39 }, ch));
}
async function login(p) {
  await p.goto('quest.html?emu=1');
  await p.locator('#segG button[data-v="3"]').click(); await p.locator('#segC button', { hasText: '4' }).first().click();
  await p.locator('#nums button', { hasText: new RegExp('^' + NO + '$') }).click();
  await p.locator('input[aria-label="合言葉"]').fill(KEY); await p.getByRole('button', { name: 'OK' }).click();
  await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
}
async function page(browser, phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } : { viewport: { width: 1366, height: 800 } });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e))); p.on('dialog', (d) => d.accept()); return p;
}
async function mapIon(p) {
  await p.locator('#goMenu').click(); await p.getByRole('button', { name: '地図' }).click();
  await p.locator('[data-wm]', { hasText: '水晶の電解湖' }).click();
  await expect(p.locator('#wmUd')).toBeVisible();
}
const charNow = () => rest('GET', `quest/${Y}/chars/${SID}`);

test('単元マスターの称号：条件を満たすともらえて、名前の横に出せる', async ({ browser }) => {
  who(7);
  // 植物と動物（life＝4番目）：あと1問正解で 30問・正解率 29/30・10問連続
  await setup({ mt: { life: { a: 29, c: 28, b: 9, s: 9 }, matter: { a: 40, c: 30, b: 12, s: 0 } } });
  const p = await page(browser);
  await login(p);
  expect(await p.evaluate(() => window.__ans('life', true))).toBe(true);
  expect(await p.evaluate(() => window.__save())).toBe(true);
  await expect.poll(async () => (await charNow()).tb).toBe(16);
  expect((await charNow()).mt.life).toEqual({ a: 30, c: 29, b: 10, s: 10 });
  // 正解率が足りない単元（matter 75%）のしるしは、ルールで書けない
  expect(await p.evaluate(() => { const c = window.__ch(); return c.tb; })).toBe(16);
  // 手で tb に matter のしるしを足して保存 → 断られる
  const r = await p.evaluate(async (sid) => { const m = await import('./lib.js?v=20261123120000'); try { await m.set(m.ref(m.db, 'quest/' + (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1) + '/chars/' + sid + '/tb'), 17); return 'ok'; } catch (e) { return 'denied'; } }, SID);
  expect(r).toBe('denied');
  // ステータス：称号の一覧。押すと名前の横に出る
  await p.locator('#goMenu').click(); await p.getByRole('button', { name: 'ステータス' }).click();
  const row = p.locator('.mt-row', { hasText: '植物と動物マスター' });
  await expect(row).toBeEnabled();
  await expect(p.locator('.mt-row', { hasText: '物質マスター' })).toBeDisabled();
  await row.click();
  await expect(p.locator('#stTtl')).toHaveText('〈植物と動物マスター〉');
  await expect.poll(async () => (await charNow()).tc).toBe('life');
  await p.waitForTimeout(400); await p.screenshot({ path: `${SHOT}/mastery-pc-stat.png` });
  await p.getByRole('button', { name: 'もどる' }).click();
  await expect(p.locator('#hudName')).toContainText('〈植物と動物マスター〉');
  expect(p.errs).toEqual([]);
  // スマホ
  const q = await page(browser, true); await login(q);
  await q.locator('#goMenu').click(); await q.getByRole('button', { name: 'ステータス' }).click(); await q.waitForTimeout(500);
  await expect(q.locator('#stTtl')).toHaveText('〈植物と動物マスター〉');
  await q.screenshot({ path: `${SHOT}/mastery-phone-stat.png`, fullPage: true });
  expect(await q.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(q.errs).toEqual([]);
  await p.context().close(); await q.context().close();
});

const dg = (p) => p.evaluate(() => window.__dg());
async function stepInto(p, tx, ty, avoid) {
  const d = await dg(p);
  for (const [k, [dx, dy]] of Object.entries(DIRS)) {
    const x = tx - dx, y = ty - dy, c = d.g[y] && d.g[y][x];
    if (c !== 'k' || (avoid && avoid(x, y))) continue;
    await p.evaluate(([a, b]) => window.__dgWarp(a, b, true), [x, y]);
    await p.waitForTimeout(350); await p.keyboard.press(k); await p.waitForTimeout(450);
    return;
  }
  throw new Error('となりに床がない ' + tx + ',' + ty);
}

test('裏ダンジョン：称号3つで入れる・10階・敵が強い・1階を下りる', async ({ browser }) => {
  who(8);
  await setup({});
  let p = await page(browser);
  await login(p); await mapIon(p);
  await expect(p.locator('#wmUd')).toHaveClass(/lock/);
  await expect(p.locator('.ud-note')).toContainText('いま 0つ');
  await p.screenshot({ path: `${SHOT}/ura-pc-locked.png` });
  // 称号3つ（matter・classify・force）
  await p.context().close();
  await setup({ tb: 7 });
  p = await page(browser);
  await login(p); await mapIon(p);
  await expect(p.locator('#wmUd')).not.toHaveClass(/lock/);
  await expect(p.locator('#wmUd')).toContainText('裏ダンジョンへ');
  await p.screenshot({ path: `${SHOT}/ura-pc-open.png` });
  await p.locator('#wmUd').click();
  await expect(p.locator('#s-town.dg-on')).toBeVisible({ timeout: 15000 }); await p.waitForTimeout(800);
  await expect(p.locator('#fdTimer')).toContainText('裏 1階 / 10');
  let u = await p.evaluate(() => window.__ud());
  expect([u.ud, u.fl, u.max, u.x]).toEqual([true, 1, 10, 1.5]);
  await expect.poll(async () => (await p.evaluate(() => window.__ud())).mix).toBeGreaterThan(0);   // 3年：入試の重要語句がまざる
  // ふつうの5階のダンジョンとは別の迷路
  await p.screenshot({ path: `${SHOT}/ura-pc-1f.png` });
  // 戦闘：敵が強い（見出しに「裏」）
  await p.evaluate(() => window.__dgBeat());
  await expect(p.locator('#s-battle')).toBeVisible({ timeout: 15000 });
  const guide = p.getByRole('button', { name: 'わかった' }); if (await guide.isVisible().catch(() => false)) await guide.click();
  await expect(p.locator('#bArea')).toContainText('裏 1階');
  await p.waitForTimeout(1200); await p.screenshot({ path: `${SHOT}/ura-pc-battle.png` });
  await p.evaluate(() => window.__winNow());
  await p.getByRole('button', { name: 'フィールドにもどる' }).click({ timeout: 40000 });
  await expect(p.locator('#dgToast')).toContainText('鍵を手に入れた');
  // 扉を開けて階段で2階へ。進み具合は uf に残る（df とは別）
  let d = await dg(p); const goal = d.items[0], inRoom = (x, y) => Math.abs(x - goal.x) <= 2 && Math.abs(y - goal.y) <= 2;
  if (d.keys < d.need) await p.evaluate((n) => window.__dgGiveKeys(n), d.need - d.keys);
  d = await dg(p); const dy = d.g.findIndex((r) => r.includes('D')), dx = d.g[dy].indexOf('D');
  await stepInto(p, dx, dy, inRoom);
  await stepInto(p, goal.x, goal.y);
  await expect.poll(async () => (await dg(p)).fl).toBe(2);
  await expect.poll(async () => ((await charNow()).uf || {}).ion).toBe(2);
  expect((await charNow()).df).toBeUndefined();
  u = await p.evaluate(() => window.__ud()); expect(u.x).toBeGreaterThan(1.5);
  expect(p.errs).toEqual([]);
  // スマホ（入口）
  const q = await page(browser, true); await login(q); await mapIon(q);
  await q.screenshot({ path: `${SHOT}/ura-phone-open.png` });
  expect(await q.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(q.errs).toEqual([]);
  await p.context().close(); await q.context().close();
});

test('昇格：Lv100 で教会から上級職に。技・SP・レベルはそのまま', async ({ browser }) => {
  who(9);
  await setup({ lv: 99, sp: 83, spt: 98, sr: { 0: 2, 1: 2 }, ld: { a: [0, 1, 2, 3], u: 14 }, ms: { 90: true, 100: true } });
  let p = await page(browser);
  await login(p);
  await p.evaluate(() => window.__shop(2));
  await expect(p.getByRole('button', { name: /昇格する（戦士 → 聖騎士）/ })).toBeDisabled();
  await expect(p.locator('#fdMsg')).toContainText('Lv100から');
  // Lv100
  await p.context().close();
  await setup({ lv: 100, sp: 84, spt: 99, sr: { 0: 2, 1: 2 }, ld: { a: [0, 1, 2, 3], u: 14 }, ms: { 90: true, 100: true } });
  p = await page(browser);
  await login(p);
  const hp0 = await p.locator('#hudHpT').textContent();
  await p.evaluate(() => window.__shop(2));
  await p.screenshot({ path: `${SHOT}/promo-pc-church.png` });
  await p.getByRole('button', { name: /昇格する（戦士 → 聖騎士）/ }).evaluate((b) => b.click());
  await expect.poll(async () => (await charNow()).pr).toBe(true);
  const c = await charNow();
  expect([c.j, c.lv, c.sp, c.spt, c.sr]).toEqual(['warrior', 100, 84, 99, [2, 2]]);
  await expect(p.locator('#fdMsg')).toContainText('聖騎士 になった');
  const hp1 = await p.locator('#hudHpT').textContent();
  expect(Number(hp1.split('/')[1])).toBeGreaterThan(Number(hp0.split('/')[1]));
  await p.screenshot({ path: `${SHOT}/promo-pc-done.png` });
  await p.locator('#fdMsg .btn').last().click().catch(() => {});
  // ステータス：上級職の名前と必殺技。持っていく必殺技にできる（ld.u＝15 がルールで通る）
  await p.locator('#goMenu').click(); await p.getByRole('button', { name: 'ステータス' }).click();
  await expect(p.locator('#stJob')).toContainText('聖騎士 Lv.100');
  const ult = p.locator('#skills .skill', { hasText: 'ホーリーセイバー' });
  await expect(ult).toBeVisible(); await ult.click();
  await expect.poll(async () => ((await charNow()).ld || {}).u).toBe(15);
  await ult.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOT}/promo-pc-stat.png` });
  // 昇格したあともレベルは上がる（Lv200まで）。pr は消せない
  const r = await p.evaluate(async (sid) => { const m = await import('./lib.js?v=20261123120000'); const y = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1; try { await m.set(m.ref(m.db, 'quest/' + y + '/chars/' + sid + '/pr'), null); return 'ok'; } catch (e) { return 'denied'; } }, SID);
  expect(r).toBe('denied');
  expect(p.errs).toEqual([]);
  const q = await page(browser, true); await login(q);
  await q.evaluate(() => window.__shop(2)); await q.waitForTimeout(400);
  await q.screenshot({ path: `${SHOT}/promo-phone-church.png` });
  await q.locator('#fdMsg .btn.sub').last().click();
  await q.locator('#goMenu').click(); await q.getByRole('button', { name: 'ステータス' }).click(); await q.waitForTimeout(500);
  await q.screenshot({ path: `${SHOT}/promo-phone-stat.png`, fullPage: true });
  expect(await q.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(q.errs).toEqual([]);
  await p.context().close(); await q.context().close();
});
