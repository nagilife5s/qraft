// なかまと冒険（生徒が部屋を開く。2026-11-16）：ホスト（1年）と参加者（2年）の2人で、部屋づくり → 参加 → 出発 → 終了 → ごほうびの保存
//   本物の複数端末ではなく、ブラウザ2つ（別の匿名ログイン）で確かめる
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
test.setTimeout(150000);

// 「ひとりで冒険」でログインしてキャラをつくる（ここで この端末の持ち主の記録と、番号の記憶ができる）
async function loginAndMake(browser, g, c, n, key, name) {
  await rest('PUT', `quest/${Y}/keys/${g}-${c}-${n}`, key);
  await rest('DELETE', `quest/${Y}/chars/${g}-${c}-${n}`); await rest('DELETE', `quest/${Y}/owners/${g}-${c}-${n}`);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 700 } }), p = await ctx.newPage();
  await p.goto('quest.html?emu=1');
  await p.locator(`#segG button[data-v="${g}"]`).click(); await p.locator('#segC button', { hasText: String(c) }).first().click();
  await p.locator('#nums button', { hasText: new RegExp('^' + n + '$') }).click();
  await p.locator('input[aria-label="合言葉"]').fill(key); await p.getByRole('button', { name: 'OK' }).click();
  await expect(p.locator('#s-make')).toBeVisible({ timeout: 15000 });
  await p.locator('.jobcard[data-job="warrior"]').click(); await p.locator('#cname').fill(name); await p.locator('#btnMake').click();
  await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 });
  return { ctx, p };
}

test('なかまと冒険：1年のホストと2年の参加者で、部屋づくりから ごほうびの保存まで', async ({ browser }) => {
  const errs = [];
  const A = await loginAndMake(browser, 1, 4, 11, 'aaa411', 'ホスト');
  const B = await loginAndMake(browser, 2, 4, 12, 'bbb412', 'なかま');
  A.p.on('pageerror', e => errs.push('A ' + e)); B.p.on('pageerror', e => errs.push('B ' + e));
  // ホスト：メニューから「なかまと冒険」→ 部屋をつくる
  await A.p.keyboard.press('m'); await A.p.getByRole('button', { name: 'なかまと冒険' }).click();
  await expect(A.p.locator('#s-entry')).toBeVisible({ timeout: 15000 });
  await A.p.locator('#btnNew').click();
  await expect(A.p.locator('#selUnit option').first()).toBeAttached({ timeout: 15000 });
  const units = await A.p.locator('#selUnit option').allTextContents();
  expect(units.some(t => t.startsWith('3年')) && units.some(t => t.startsWith('1年'))).toBe(true);   // ほかの学年の単元もえらべる
  await expect(A.p.locator('#selInfo')).toContainText('セット');
  await A.p.locator('#btnCreate').click();
  await expect(A.p.locator('#s-room')).toBeVisible({ timeout: 20000 });
  await expect(A.p.locator('#warn')).toContainText('閉じないでね');
  const pin = (await A.p.locator('#pin').textContent()).replace(/\s/g, '');
  expect(pin).toMatch(/^\d{6}$/);
  // ホスト自身も、ふつうの参加者として準備画面に入る
  const fa = A.p.frameLocator('#pf');
  await expect(fa.locator('#s-prep')).toBeVisible({ timeout: 30000 });
  await expect(A.p.locator('#btnStart')).toBeDisabled();   // 1人では出発できない
  // 参加者（2年）：メニュー → なかまと冒険 → コードで入る
  await B.p.keyboard.press('m'); await B.p.getByRole('button', { name: 'なかまと冒険' }).click();
  await B.p.locator('#joinPin').fill(pin); await B.p.locator('#btnJoin').click();
  await expect(B.p.locator('#s-prep')).toBeVisible({ timeout: 30000 });
  await expect(B.p.locator('#ppPlace')).toContainText('なかまと冒険');
  await expect(A.p.locator('#roster')).toContainText('なかま');
  await expect(A.p.locator('#btnStart')).toBeEnabled({ timeout: 15000 });
  // 参加者の端末が、自分の強さの写し m を部屋に出している
  const pls = await rest('GET', `rooms/${pin}/players`);
  const ms = Object.values(pls).map(p => JSON.parse(p.m));
  expect(ms.map(m => m.lv).sort((a, b) => a - b)).toEqual([1, 16]);   // 1年はLv1・2年はLv16
  await fa.locator('#ppReady').click(); await B.p.locator('#ppReady').click();
  // 出発：敵のHPは平均レベル（8.5）に合わせて増える。ホストはリーダーで探索の画面、参加者は練習問題
  await A.p.locator('#btnStart').click();
  await expect(fa.locator('#s-field')).toBeVisible({ timeout: 30000 });
  await expect(B.p.locator('#s-prac')).toBeVisible({ timeout: 30000 });
  const st = await rest('GET', `rooms/${pin}/state`); expect(st.phase).toBe('run'); expect(st.gp['1'].lead).toBeTruthy();
  // 終了して保存 → 2人とも結果。ごほうびは、それぞれの端末が自分のキャラに書く（前の書き込みから20秒あけるので少し待つ）
  A.p.once('dialog', d => d.accept());
  await A.p.locator('#btnQuit').click();
  await expect(B.p.locator('#s-result')).toBeVisible({ timeout: 30000 });
  await expect(fa.locator('#s-result')).toBeVisible({ timeout: 30000 });
  await expect(B.p.locator('#rNote')).toContainText('保存しました', { timeout: 60000 });
  await expect(fa.locator('#rNote')).toContainText('保存しました', { timeout: 60000 });
  expect(await rest('GET', `quest/${Y}/chars/2-4-12/lv`)).toBe(16);
  expect(errs).toEqual([]);
});

test('なかまと冒険：ホストが画面を閉じると、参加者に「冒険はおわりました」と出る', async ({ browser }) => {
  const A = await loginAndMake(browser, 3, 4, 21, 'aaa421', 'ホスト3');
  const B = await loginAndMake(browser, 1, 4, 22, 'bbb422', 'なかま1');
  await A.p.goto('quest-party.html?emu=1'); await A.p.locator('#btnNew').click(); await A.p.locator('#btnCreate').click();
  await expect(A.p.locator('#s-room')).toBeVisible({ timeout: 20000 });
  const pin = (await A.p.locator('#pin').textContent()).replace(/\s/g, '');
  await B.p.goto(`rikaria-play.html?party=1&pin=${pin}&emu=1`);
  await expect(B.p.locator('#s-prep')).toBeVisible({ timeout: 30000 });
  await A.ctx.close();   // ホストの端末が閉じる（つながりが切れる）
  await expect(B.p.locator('#msgT')).toContainText('冒険はおわりました', { timeout: 30000 });
});

test('なかまと冒険：「ひとりで冒険」でログインしていないと入れない', async ({ page }) => {
  await page.goto('quest-party.html?emu=1');
  await expect(page.locator('#entryErr')).toContainText('ログイン');
  await expect(page.locator('#btnNew')).toBeDisabled();
});
