// 参加画面の流れ（2026-11-12）：クイズの入口は PIN・ニックネーム・キャラを1画面で入れる。
//   クエスト（リカリア）の部屋のPINを入れてしまっても、専用画面へ送る。
import { test, expect } from '@playwright/test';

const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function put(path, value) {
  const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(value) });
  if (!r.ok) throw new Error('seed failed ' + r.status);
}
async function room(pin, mode) { await put('rooms/' + pin, { hostUid: 'test-host', state: { mode, phase: 'lobby' } }); }

test('クイズに参加：PIN・ニックネーム・キャラを入れて参加', async ({ page }) => {
  await room('111111', 'classic');
  await page.goto('play.html?emu=1');
  await expect(page.locator('#pin')).toBeVisible();
  await expect(page.locator('#nick')).toBeVisible();
  await expect(page.locator('#avBox')).toBeVisible();
  await page.fill('#pin', '111111');
  await page.fill('#nick', 'たろう');
  await page.click('#btnJoin');
  await expect(page.locator('#s-wait')).toBeVisible();
  const players = await (await fetch(`${DB}/rooms/111111/players.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })).json();
  expect(Object.values(players).map((p) => p.nick)).toEqual(['たろう']);
});

test('クイズに参加：存在しないPINはエラー', async ({ page }) => {
  await page.goto('play.html?emu=1');
  await page.fill('#pin', '999999'); await page.fill('#nick', 'a');
  await page.click('#btnJoin');
  await expect(page.locator('#joinErr')).toContainText('見つかりません');
});

test('クイズに参加：リカリアのチーム戦の部屋のPINは専用画面へ', async ({ page }) => {
  await room('222222', 'rikaria');
  await page.goto('play.html?emu=1');
  await page.fill('#pin', '222222'); await page.fill('#nick', 'a');
  await page.click('#btnJoin');
  await expect(page).toHaveURL(/rikaria-play\.html\?pin=222222/);
});

test('クイズに参加：ジェットチェイスの部屋のPINは専用画面へ', async ({ page }) => {
  await room('333333', 'chase');
  await page.goto('play.html?emu=1');
  await page.fill('#pin', '333333'); await page.fill('#nick', 'a');
  await page.click('#btnJoin');
  await expect(page).toHaveURL(/chase-play\.html\?pin=333333/);
});
