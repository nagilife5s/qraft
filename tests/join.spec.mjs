// 参加画面の流れ（2026-11-12）：PINだけ入れる → 部屋のモードで行き先が変わる
//   クラシック＝ニックネームとキャラを聞いて参加／クエスト＝専用画面へ（ニックネーム・キャラなし）／ジェットチェイス＝専用画面へ
import { test, expect } from '@playwright/test';

const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function put(path, value) {
  const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(value) });
  if (!r.ok) throw new Error('seed failed ' + r.status);
}
async function room(pin, mode) { await put('rooms/' + pin, { hostUid: 'test-host', state: { mode, phase: 'lobby' } }); }
const v = (page, id) => page.locator('#' + id).isVisible();

test('参加：最初はPINだけ。ニックネームとキャラは出ない', async ({ page }) => {
  await page.goto('play.html?emu=1');
  await expect(page.locator('#btnPin')).toBeVisible();
  expect(await v(page, 'nick')).toBe(false);
  expect(await v(page, 'avBox')).toBe(false);
  expect(await v(page, 'btnJoin')).toBe(false);
});

test('参加：存在しないPINはエラー', async ({ page }) => {
  await page.goto('play.html?emu=1');
  await page.fill('#pin', '999999');
  await page.click('#btnPin');
  await expect(page.locator('#joinErr')).toContainText('見つかりません');
  expect(await v(page, 'nick')).toBe(false);
});

test('参加：クラシックの部屋 → ニックネームとキャラを入れて参加', async ({ page }) => {
  await room('111111', 'classic');
  await page.goto('play.html?emu=1');
  await page.fill('#pin', '111111');
  await page.click('#btnPin');
  await expect(page.locator('#nick')).toBeVisible();
  await expect(page.locator('#avBox')).toBeVisible();
  await page.fill('#nick', 'たろう');
  await page.click('#btnJoin');
  await expect(page.locator('#s-wait')).toBeVisible();
  const players = await (await fetch(`${DB}/rooms/111111/players.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })).json();
  expect(Object.values(players).map((p) => p.nick)).toEqual(['たろう']);
});

test('参加：PINを打ちなおすと、ニックネームの欄が引っ込む', async ({ page }) => {
  await room('111112', 'classic');
  await page.goto('play.html?emu=1');
  await page.fill('#pin', '111112'); await page.click('#btnPin');
  await expect(page.locator('#nick')).toBeVisible();
  await page.fill('#pin', '11111');
  await expect(page.locator('#btnPin')).toBeVisible();
  expect(await v(page, 'nick')).toBe(false);
});

test('参加：クエストの部屋 → 専用画面へ（ニックネーム・キャラは聞かない）', async ({ page }) => {
  await room('222222', 'quest');
  await page.goto('play.html?emu=1');
  await page.fill('#pin', '222222');
  await page.click('#btnPin');
  await expect(page).toHaveURL(/quest-play\.html\?pin=222222/);
  expect(await v(page, 'nick').catch(() => false)).toBe(false);
});

test('参加：ジェットチェイスの部屋 → 専用画面へ', async ({ page }) => {
  await room('333333', 'chase');
  await page.goto('play.html?emu=1');
  await page.fill('#pin', '333333');
  await page.click('#btnPin');
  await expect(page).toHaveURL(/chase-play\.html\?pin=333333/);
});

test('参加：QRのURL（?pin=）から来ると、PINの確認まで自動で進む', async ({ page }) => {
  await room('444444', 'classic');
  await page.goto('play.html?emu=1&pin=444444');
  await expect(page.locator('#nick')).toBeVisible();
});
