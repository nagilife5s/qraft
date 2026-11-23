// 上級職の技（昇格で覚える）と隠し技（昇格して Lv150）（2026-11-24）
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
const SHOT = process.env.HIDSHOTS || 'test-results/shots';
const SID = '3-5-8', KEY = 'hid858', NO = '8';
test.setTimeout(180000);

async function setup(ch) {
  await rest('PUT', `quest/${Y}/keys/${SID}`, KEY);
  await rest('DELETE', `quest/${Y}/owners/${SID}`);
  await rest('PUT', `quest/${Y}/classes/3-5`, { stage: 10 });
  await rest('PUT', `quest/${Y}/chars/${SID}`, Object.assign({ n: 'かくし', j: 'warrior', lk: 'a', exp: 0, gold: 500, pr: true, ms: { 90: true, 100: true, 110: true, 120: true, 150: true } }, ch));
}
async function page(browser, phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } : { viewport: { width: 1366, height: 800 } });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e))); p.on('dialog', (d) => d.accept()); return p;
}
async function login(p) {
  await p.goto('quest.html?emu=1');
  await p.locator('#segG button[data-v="3"]').click(); await p.locator('#segC button', { hasText: '5' }).first().click();
  await p.locator('#nums button', { hasText: new RegExp('^' + NO + '$') }).click();
  /* この端末で一度入っていれば、合言葉なしで町に入る */
  const pw = p.locator('input[aria-label="合言葉"]');
  await expect.poll(async () => (await pw.isVisible()) || (await p.locator('#s-town').isVisible()), { timeout: 15000 }).toBe(true);
  if (await pw.isVisible()) { await pw.fill(KEY); await p.getByRole('button', { name: 'OK' }).click(); }
  await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
}
/* 2回目は、前の番号・合言葉が残っていて自動で町に入ることがある */
async function relogin(p) { const ok = await p.locator('#s-town').waitFor({ timeout: 5000 }).then(() => true, () => false); if (!ok) await login(p); await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 }); }
async function status(p) { await p.locator('#goMenu').click(); await p.getByRole('button', { name: 'ステータス' }).click(); await expect(p.locator('#skills .skill').first()).toBeVisible(); }
const charNow = () => rest('GET', `quest/${Y}/chars/${SID}`);

test('Lv149：隠し技はどこにも出ない。上級職の技（聖盾ホーリーウォール）はひとりで冒険で使える', async ({ browser }) => {
  await setup({ lv: 149, sp: 148, spt: 148, ld: { a: [0, 1, 2, 3], u: 15 } });
  const p = await page(browser); await login(p);
  await expect(p.locator('.hid-pop')).toHaveCount(0);
  await status(p);
  await expect(p.locator('#skills')).toContainText('聖盾ホーリーウォール');
  await expect(p.locator('#skills')).not.toContainText('ラストクルセイド');
  await expect(p.locator('#skills')).not.toContainText('隠し技');
  await expect(p.locator('#skills')).not.toContainText('？？？');
  await p.locator('#fdMsg .btn').last().click({ timeout: 2000 }).catch(() => {});
  // 技の一覧（どの職業にも隠し技は出ない。上級職の技は出る）
  const g = p; await g.goto('rikaria-skills.html');
  await expect(g.locator('#pages')).toContainText('聖盾ホーリーウォール');
  for (const j of ['warrior', 'mage', 'priest', 'hunter', 'monk', 'summoner']) { await g.locator(`#jobs button[data-j="${j}"]`).click(); await expect(g.locator('#p-' + j + ' tr.pro')).toHaveCount(1); }
  const txt = await g.locator('#pages').textContent();
  for (const n of ['ラストクルセイド', '万象の理', '天地創造の祈り', '星墜とし', '無限連撃', '精霊界の扉', '隠し技']) expect(txt).not.toContain(n);
  // ひとりで冒険：正解 → 聖盾ホーリーウォール → まちがい：半分にして はね返す
  await p.goto('quest.html?emu=1'); await relogin(p);
  await p.locator('#goMenu').click(); await p.getByRole('button', { name: '地図' }).click();
  await p.locator('[data-wm]', { hasText: '水晶の電解湖' }).click(); await p.locator('#wmGo').click();
  await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 }); await p.waitForTimeout(800);
  await p.evaluate(() => { window.__noRoll = true; window.__rareBattle(0); });
  await expect(p.locator('#s-battle')).toBeVisible({ timeout: 15000 });
  const gd = p.getByRole('button', { name: 'わかった' }); if (await gd.isVisible().catch(() => false)) await gd.click();
  await expect(p.locator('#cmd .qbox')).toBeVisible({ timeout: 8000 });
  await p.evaluate(() => window.__okNow());
  const btn = p.locator('#cmd .act', { hasText: '聖盾ホーリーウォール' });
  await expect(btn).toBeEnabled({ timeout: 5000 }); await btn.click();
  await expect(p.locator('#cmd')).toContainText('ホーリーウォール！');
  expect((await p.evaluate(() => window.__bfx())).fx.wall).toBe(1);
  await expect(p.locator('#bfx')).toContainText('ホーリーウォール');
  await expect(p.locator('#cmd .qbox')).toBeVisible({ timeout: 8000 });
  const hp0 = (await p.evaluate(() => window.__foe())).hp;
  await p.evaluate(() => window.__ngNow());
  await expect(p.locator('#cmd .banner.ng')).toContainText('はね返した', { timeout: 5000 });
  expect((await p.evaluate(() => window.__foe())).hp).toBeLessThan(hp0);
  expect((await p.evaluate(() => window.__bfx())).fx.wall).toBe(0);
  expect(p.errs).toEqual([]);
  await p.context().close();
});

test('Lv150：1回だけ全画面で隠し技を知らせ、そのあと一覧に「隠し技」で出て、持っていける', async ({ browser }) => {
  await setup({ lv: 150, sp: 149, spt: 149, ld: { a: [0, 1, 2, 3], u: 15 } });
  const p = await page(browser); await login(p);
  const pop = p.locator('.hid-pop');
  await expect(pop).toBeVisible({ timeout: 10000 });
  await expect(pop).toContainText('隠し技を覚えた！'); await expect(pop).toContainText('聖剣解放・ラストクルセイド');
  await expect(pop.locator('img.hid-art')).toHaveAttribute('src', /paladin|warrior/);
  await p.waitForTimeout(1300); await p.screenshot({ path: `${SHOT}/hidden-reveal-pc.png` });
  await pop.getByRole('button', { name: 'すごい！' }).click(); await expect(pop).toHaveCount(0);
  expect(await p.evaluate(() => window.__hidCheck())).toBe(false);
  await p.reload(); await relogin(p); await p.waitForTimeout(1500);
  await expect(p.locator('.hid-pop')).toHaveCount(0);   // 2回目は出ない
  await p.locator('#fdMsg .btn').last().click({ timeout: 2000 }).catch(() => {});
  await status(p);
  const hid = p.locator('#skills .skill', { hasText: 'ラストクルセイド' });
  await expect(hid).toBeVisible(); await expect(hid.locator('.tag.hid')).toHaveText('隠し技');
  await hid.click();
  await expect.poll(async () => ((await charNow()).ld || {}).u).toBe(16);
  await hid.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOT}/hidden-status-pc.png` });
  expect(p.errs).toEqual([]);
  // スマホ（375px）：別の端末なので、はじめての知らせが出る
  const q = await page(browser, true); await login(q);
  await expect(q.locator('.hid-pop')).toBeVisible({ timeout: 10000 }); await q.waitForTimeout(1300);
  await q.screenshot({ path: `${SHOT}/hidden-reveal-phone.png` });
  expect(await q.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await q.locator('.hid-pop .btn').click();
  await q.locator('#fdMsg .btn').last().click({ timeout: 2000 }).catch(() => {});
  await status(q); await q.locator('#skills .skill', { hasText: 'ラストクルセイド' }).scrollIntoViewIfNeeded(); await q.waitForTimeout(300);
  await q.screenshot({ path: `${SHOT}/hidden-status-phone.png` });
  expect(q.errs).toEqual([]);
  await p.context().close(); await q.context().close();
});

test('昇格する前から Lv150：昇格したときに隠し技の知らせが出る', async ({ browser }) => {
  await setup({ lv: 160, sp: 159, spt: 159, pr: null, ld: { a: [0, 1, 2, 3], u: 14 } });
  const p = await page(browser); await login(p);
  await expect(p.locator('.hid-pop')).toHaveCount(0);
  await p.locator('#fdMsg .btn').last().click({ timeout: 2000 }).catch(() => {});
  await p.evaluate(() => window.__shop(2));
  await p.getByRole('button', { name: /昇格する（戦士 → 聖騎士）/ }).evaluate((b) => b.click());
  await expect.poll(async () => (await charNow()).pr).toBe(true);
  await expect(p.locator('.hid-pop')).toBeVisible({ timeout: 10000 });
  await expect(p.locator('.hid-pop')).toContainText('ラストクルセイド');
  expect(p.errs).toEqual([]);
  await p.context().close();
});
