// 画面の表示テスト（スモークテスト）
//   主な画面を 1280×720・1366×768（学校のChromebook）・スマホ幅 で開き、
//   ・スクリプトのエラーが出ない　・画面が1つ表示される　・横にはみ出さない　を確かめる。
//   トップ画面は、メニューのカードがすべて画面内に収まることも確かめる（レビュー指摘4）。
//   Firebase はエミュレーター。先生の画面は、その端末を先生として登録してから開く。
import { test, expect } from '@playwright/test';

const SIZES = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: 'phone', width: 375, height: 812 },
];
const PAGES = [
  { path: 'index.html', name: 'トップ' },
  { path: 'rikaria.html', name: 'リカリア（タイトル）' },
  { path: 'play.html', name: 'ゲームに参加（生徒）' },
  { path: 'home.html', name: 'おうちで練習' },
  { path: 'quest.html', name: 'クエスト（ひとりで冒険）' },
  { path: 'rikaria-play.html', name: 'リカリア・チーム戦（生徒）' },
  { path: 'host.html', name: 'クラシック（先生）', teacher: true },
  { path: 'chase-host.html', name: 'ジェットチェイス（先生）', teacher: true },
  { path: 'rikaria-host.html', name: 'リカリア・チーム戦（先生）', teacher: true },
  { path: 'records.html', name: '記録画面（先生）', teacher: true, noScreen: true },
];
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';

/* エミュレーターに直接書く（管理者として。テストの準備用） */
async function seed(path, value) {
  const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(value) });
  if (!r.ok) throw new Error('seed failed ' + r.status);
}

async function open(page, p) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (p.teacher) {
    // 記録画面に出る「この端末のID」を先生として登録してから開く（同じブラウザなので同じ匿名ユーザー）
    await page.goto('records.html?emu=1');
    const id = page.locator('#myUid');
    await expect(id).not.toBeEmpty({ timeout: 15000 });
    await seed('admins/' + (await id.textContent()).trim(), true);
  }
  await page.goto(p.path + '?emu=1');
  await page.waitForLoadState('networkidle');
  return errors;
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    for (const p of PAGES) {
      test(p.name, async ({ page }) => {
        const errors = await open(page, p);
        if (!p.noScreen) await expect(page.locator('.screen.on').first()).toBeVisible();
        else await expect(page.locator('h1')).toBeVisible();
        const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(over, '横にはみ出している').toBeLessThanOrEqual(1);
        expect(errors, 'スクリプトのエラー').toEqual([]);
      });
    }
    test('トップのカードがすべて画面内', async ({ page }) => {
      await page.goto('index.html?emu=1');
      const vh = size.height;
      const inView = async (loc, n, label) => {
        await expect(loc).toHaveCount(n);
        await page.waitForTimeout(800);   // 出てくるアニメーションを待つ
        for (let i = 0; i < n; i++) {
          const b = await loc.nth(i).boundingBox();
          expect(b.y, label + (i + 1) + '枚目の上').toBeGreaterThanOrEqual(0);
          expect(b.y + b.height, label + (i + 1) + '枚目の下').toBeLessThanOrEqual(vh);
        }
      };
      await inView(page.locator('#v-main .mcard'), 2, 'トップ');          // リカリア／クイズ
      await page.locator('#goQuiz').click();
      await inView(page.locator('#v-quiz .mcard'), 3, 'クイズ');          // みんなで参加／おうちで練習／ゲームを開く
      await expect(page.locator('#goBackQuiz')).toBeInViewport();
      await page.locator('#goOpen').click();
      await inView(page.locator('#v-modes .mcard'), 2, 'モード');         // クラシック／ジェットチェイス
      await expect(page.locator('#goBack')).toBeInViewport();
    });
    test('リカリア：タイトル → えらぶ → チーム戦（画面内）', async ({ page }) => {
      await page.goto('rikaria.html?emu=1');
      await expect(page.locator('#goStart')).toBeInViewport();
      await page.locator('#goStart').click();
      const menu = page.locator('#v-menu .mcard');
      await expect(menu).toHaveCount(2);
      await page.waitForTimeout(300);
      for (let i = 0; i < 2; i++) await expect(menu.nth(i)).toBeInViewport();
      await page.locator('#goTeam').click();
      const team = page.locator('#v-team .mcard');
      await expect(team).toHaveCount(2);
      for (let i = 0; i < 2; i++) await expect(team.nth(i)).toBeInViewport();
      await expect(page.locator('#goBackMenu')).toBeInViewport();
    });
  });
}
