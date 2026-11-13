// アクセシビリティの自動検査（axe）と、キーボードだけでの操作（レビュー指摘6）
//   重大（critical）・深刻（serious）な問題が0件であることを確かめる。
//   色のコントラストは、背景画像の上の文字を正しく測れないので除外（目で確認する）。
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  ['index.html', 'トップ'], ['rikaria.html', 'リカリア（タイトル）'], ['play.html', 'ゲームに参加'], ['home.html', 'おうちで練習'],
  ['quest.html', 'クエスト（ひとりで冒険）'], ['quest-play.html', 'クエスト（チーム・生徒）'],
  ['host.html', 'クラシック（先生）'], ['chase-host.html', 'ジェットチェイス（先生）'],
  ['quest-host.html', 'クエスト（先生）'], ['records.html', '記録画面（先生）'],
];
test.use({ viewport: { width: 1280, height: 720 } });

async function check(page, where) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['color-contrast']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id}（${v.impact}）: ${v.help} … ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' ／ ')}`);
  expect(bad, where + ' のアクセシビリティの問題').toEqual([]);
}

for (const [path, name] of PAGES) {
  test('axe: ' + name, async ({ page }) => {
    await page.goto(path + '?emu=1');
    await page.waitForLoadState('networkidle');
    await check(page, name);
  });
}

test('axe: モードをえらぶ画面', async ({ page }) => {
  await page.goto('index.html?emu=1');
  await page.locator('#goQuiz').click();
  await page.locator('#goOpen').click();
  await check(page, 'モードをえらぶ');
});

test('家庭練習：問題に答えたあとの画面（正解・不正解の印と解説）', async ({ page }) => {
  test.setTimeout(90000);   // 本人確認と2回の検査で時間がかかる
  // エミュレーターに合言葉を入れておき、本人確認をすませて練習を始める
  const r = await fetch('http://127.0.0.1:9000/quest/' + (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1) + '/keys/3-1-1.json?ns=qraft-e4345-default-rtdb', { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: '"abc234"' });
  expect(r.ok).toBe(true);
  await page.goto('home.html?emu=1&sess=1');
  await page.evaluate(() => { const c = (id, t) => [...document.getElementById(id).querySelectorAll('*')].find((e) => e.textContent.trim() === t && !e.children.length).click(); c('idG', '3年'); c('idC', '1組'); });
  await page.selectOption('#idN', '1');
  await page.click('#btnId');
  await page.fill('form input', 'abc234');
  await page.click('form button[type=submit]');
  await page.locator('#s-pick button', { hasText: /^塩化銅水溶液の電気分解\s*3年/ }).click();
  // 選択問題になるまで進め、わざと間違える
  const shown = () => page.waitForFunction(() => { const v = (e) => e && e.offsetParent !== null; return v(document.querySelector('#stiles .tile')) || v(document.getElementById('textAns')); });
  for (let i = 0; i < 8; i++) {
    await shown();
    if (await page.locator('#stiles .tile').first().isVisible()) break;
    await page.fill('#textAns', 'x'); await page.click('#btnSubmit'); await page.click('#btnNext');
  }
  const tiles = page.locator('#stiles .tile');
  await tiles.first().waitFor();
  await check(page, '家庭練習の問題');
  if (await page.locator('#sqimg').isVisible()) expect((await page.locator('#sqimg').getAttribute('alt')) || '', '問題の図に説明文（alt）').not.toBe('');
  const n = await tiles.count();
  // 正解でない選択肢を1つ選ぶ（正解の位置はデータから分からないので、最初に試して正解なら次の問題で）
  await tiles.nth(n - 1).click();
  const sub = page.locator('#btnSubmit'); if (await sub.isVisible()) await sub.click();
  await expect(page.locator('#fb')).not.toBeEmpty();
  const marks = await page.evaluate(() => [...document.querySelectorAll('#stiles .tile')].map((t) => getComputedStyle(t, '::after').content).filter((c) => c && c !== 'none'));
  expect(marks.some((m) => m.includes('正解')), '正解の選択肢に「✓ 正解」').toBe(true);
  expect(await page.locator('#fb').getAttribute('aria-live')).toBe('polite');
  await check(page, '家庭練習の答えたあと');
});

test('キーボードだけでトップから「おうちで練習」へ', async ({ page }) => {
  await page.goto('index.html?emu=1');
  // Tab で「おうちで練習」まで進み、選んでいる場所が見えることを確かめてから Enter
  let found = false;
  await page.locator('#goQuiz').focus();   // 「クイズ」を開いて、その中の「おうちで練習」までTabで進む
  await page.keyboard.press('Enter');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const t = await page.evaluate(() => document.activeElement && document.activeElement.textContent);
    if (t && t.includes('おうちで練習')) { found = true; break; }
  }
  expect(found, 'Tab で「おうちで練習」に届く').toBe(true);
  const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; });
  expect(ring, '選んでいる場所に枠が見える').toBe(true);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/home\.html/);
});
