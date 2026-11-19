// 5階のダンジョン（2026-11-20）：入る・鍵がないと扉が開かない・鍵で開く・階段で下りる・一番深い階が残る・5階にその単元のボス
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
const SHOT = process.env.SHOTS || 'test-results/shots';
const DIRS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
test.setTimeout(180000);

const dg = (p) => p.evaluate(() => window.__dg());
// (tx,ty) のとなりの床へ飛んで（魔物は消す）、そこから1歩でそのマスへ入る
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
async function login(p) {
  await p.goto('quest.html?emu=1');
  await p.locator('#segG button[data-v="2"]').click(); await p.locator('#segC button', { hasText: '3' }).first().click();
  await p.locator('#nums button', { hasText: /^9$/ }).click();
  await p.locator('input[aria-label="合言葉"]').fill('abc839'); await p.getByRole('button', { name: 'OK' }).click();
  await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
}
async function goLife(p) {
  await p.locator('#goMenu').click(); await p.getByRole('button', { name: '地図' }).click();
  await p.locator('[data-wm]', { hasText: 'いのちの大樹' }).click(); await p.locator('#wmGo').click();
  await expect(p.locator('#s-town.dg-on')).toBeVisible({ timeout: 15000 }); await p.waitForTimeout(600);
}
// 今の階の鍵を全部とって、扉を開けて、階段へ（5階はボスの手前まで）
async function clearFloor(p) {
  let d = await dg(p);
  const goal = d.items[0], inRoom = (x, y) => Math.abs(x - goal.x) <= 2 && Math.abs(y - goal.y) <= 2;
  if (d.keys < d.need) await p.evaluate((n) => window.__dgGiveKeys(n), d.need - d.keys);   // 鍵の魔物を倒したことにする
  d = await dg(p); expect(d.keys).toBe(d.need);
  const dy = d.g.findIndex((r) => r.includes('D')), dx = d.g[dy].indexOf('D');
  await stepInto(p, dx, dy, inRoom);   // 外側から扉へ
  d = await dg(p); expect(d.g[dy][dx]).toBe('k');
  return goal;
}

test('5階のダンジョン：鍵・扉・階段・深い階の記録・5階のボス', async ({ browser }) => {
  const errs = [];
  await rest('PUT', `quest/${Y}/keys/2-3-9`, 'abc839');
  await rest('DELETE', `quest/${Y}/owners/2-3-9`);
  await rest('PUT', `quest/${Y}/classes/2-3`, { stage: 10 });
  await rest('PUT', `quest/${Y}/chars/2-3-9`, { n: 'めいきゅう', j: 'warrior', lk: 'a', lv: 30, exp: 0, gold: 0, sp: 29, spt: 29 });
  const p = await (await browser.newContext({ viewport: { width: 1366, height: 800 } })).newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await login(p); await goLife(p);
  let d = await dg(p);
  expect(d.fl).toBe(1); expect(d.need).toBe(1); expect(d.mobs).toBeGreaterThan(12); expect(d.carriers).toBe(1); expect(d.g.length).toBe(19);
  expect(d.items.filter((i) => i.k === 'key')).toHaveLength(0);
  await expect(p.locator('#mobs .mob.dg-carrier .dg-kmark')).toHaveCount(1);
  await expect(p.locator('#fdTimer')).toContainText('1階 / 5');
  await expect(p.locator('#dgMini')).toBeVisible();
  await p.screenshot({ path: `${SHOT}/v2-dg-pc-1f.png` });
  // 鍵の魔物と戦って勝つと、鍵を落とす（その魔物はもう出ない）
  const goal = d.items[0], n0 = d.mobs;
  // 鍵の魔物の見た目（2〜3マス離れた床から写す）
  { const [cx, cy] = d.cpos[0]; let spot = null;
    for (let y = 0; y < d.g.length && !spot; y++) for (let x = 0; x < d.g[0].length; x++) { const m = Math.abs(x - cx) + Math.abs(y - cy); if (m >= 2 && m <= 3 && d.g[y][x] === 'k') { spot = [x, y]; break; } }
    await p.evaluate(([a, b]) => { window.__dgWarp(a, b, false); }, spot); await p.waitForTimeout(300);
    await expect(p.locator('#mobs .mob.dg-carrier')).toBeVisible(); await p.screenshot({ path: `${SHOT}/v2-dg-pc-carrier.png` }); }
  await p.evaluate(() => window.__dgBeat());
  await expect(p.locator('#s-battle')).toBeVisible({ timeout: 15000 });
  const guide = p.getByRole('button', { name: 'わかった' }); if (await guide.isVisible().catch(() => false)) await guide.click();
  await p.waitForTimeout(1500); await p.evaluate(() => window.__winNow());
  await p.getByRole('button', { name: 'フィールドにもどる' }).click({ timeout: 40000 });
  await expect(p.locator('#dgToast')).toContainText('鍵を手に入れた');
  d = await dg(p); expect(d.keys).toBe(1); expect(d.carriers).toBe(0); expect(d.mobs).toBeLessThanOrEqual(n0 - 1);
  // 扉 → 階段で2階へ。一番深い階（df）が残る
  await clearFloor(p);
  await stepInto(p, goal.x, goal.y);
  await expect.poll(async () => (await dg(p)).fl).toBe(2);
  await expect.poll(async () => ((await rest('GET', `quest/${Y}/chars/2-3-9`)).df || {}).life).toBe(2);
  // 町にもどって入り直すと、2階から（1階からも選べる）
  await p.locator('#goHome').click(); await expect(p.locator('#s-town.dg-on')).toHaveCount(0);
  await goLife(p);
  await expect(p.locator('#fdMsg')).toContainText('2階から');
  expect((await dg(p)).fl).toBe(2);
  await p.getByRole('button', { name: 'このまま' }).click();
  // 2〜4階を下りる（4階は鍵2本。1本だけでは扉が開かない）
  for (let fl = 2; fl <= 4; fl++) {
    if (fl === 4) {
      let d4 = await dg(p); expect(d4.need).toBe(2); expect(d4.carriers).toBe(2);
      await p.evaluate(() => window.__dgGiveKeys(1));
      d4 = await dg(p); const g4 = d4.items[0], dy = d4.g.findIndex((r) => r.includes('D')), dx = d4.g[dy].indexOf('D');
      await stepInto(p, dx, dy, (x, y) => Math.abs(x - g4.x) <= 2 && Math.abs(y - g4.y) <= 2);
      await expect(p.locator('#fdMsg')).toContainText('かぎがかかっている');
      expect((await dg(p)).g[dy][dx]).toBe('D');
      await p.locator('#fdMsg .btn.sub').click();
    }
    const g = await clearFloor(p);
    await stepInto(p, g.x, g.y);
    await expect.poll(async () => (await dg(p)).fl).toBe(fl + 1);
  }
  d = await dg(p); expect(d.need).toBe(2); expect(d.items[0].k).toBe('boss');
  await expect.poll(async () => (await rest('GET', `quest/${Y}/chars/2-3-9`)).df.life).toBe(5);
  // 5階：ボスはその単元の絵
  const bsrc = await p.locator('.dg-boss img').getAttribute('src');
  expect(bsrc).toBe('img/rikaria/enemy/life-boss.webp');
  const g5 = await clearFloor(p);
  await p.screenshot({ path: `${SHOT}/v2-dg-pc-5f.png` });
  await stepInto(p, g5.x, g5.y);
  await expect(p.locator('#fdMsg')).toContainText('ちょうせんする');
  await p.getByRole('button', { name: 'ちょうせんする' }).click();
  await expect(p.locator('#s-battle')).toBeVisible({ timeout: 15000 });
  expect(await p.locator('#eimg').getAttribute('src')).toBe(bsrc);
  expect(errs).toEqual([]);
});

test('5階のダンジョン：スマホ（375px）で十字ボタンで歩ける', async ({ browser }) => {
  const errs = [];
  await rest('PUT', `quest/${Y}/keys/2-3-9`, 'abc839');
  await rest('DELETE', `quest/${Y}/owners/2-3-9`);
  await rest('PUT', `quest/${Y}/classes/2-3`, { stage: 10 });
  await rest('PUT', `quest/${Y}/chars/2-3-9`, { n: 'めいきゅう', j: 'warrior', lk: 'a', lv: 30, exp: 0, gold: 0, sp: 29, spt: 29 });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(String(e)));
  await login(p); await goLife(p);
  await expect(p.locator('#dgPad')).toBeVisible();
  await p.waitForTimeout(800); expect((await dg(p)).mobs).toBeGreaterThan(12); await p.screenshot({ path: `${SHOT}/v2-dg-phone-1f.png` });   // 十字ボタンのテストは魔物を消してから
  await p.evaluate(() => window.__dgWarp(1, 1, true));
  const d = await dg(p), right = d.g[1][2] === 'k';
  const btn = p.locator(`#dgPad button[data-d="${right ? '1,0' : '0,1'}"]`);
  const box = await btn.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(200); await p.mouse.up();
  await expect.poll(async () => (await dg(p)).pos.join(',')).not.toBe('1,1');
  const pw = await p.evaluate(() => document.documentElement.scrollWidth);
  expect(pw).toBeLessThanOrEqual(375);
  // 戦闘画面（スマホ）の見た目
  await p.evaluate(() => window.__bossAsk()); await p.getByRole('button', { name: 'ちょうせんする' }).click();
  await expect(p.locator('#s-battle')).toBeVisible({ timeout: 15000 }); await p.getByRole('button', { name: 'わかった' }).click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${SHOT}/v2-dg-phone-battle.png` });
  expect(errs).toEqual([]);
});
