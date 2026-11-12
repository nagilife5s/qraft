// 中優先課題（2026-11-12）のテスト：発表の時間とランキングの頻度・音のメニュー・パスワードを端末に残さない・クエストの案内
import { test, expect } from '@playwright/test';

const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function seed(path, value) {
  const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(value) });
  if (!r.ok) throw new Error('seed failed ' + r.status);
}
async function asTeacher(page) {
  await page.goto('records.html?emu=1');
  const id = page.locator('#myUid');
  await expect(id).not.toBeEmpty({ timeout: 15000 });
  await seed('admins/' + (await id.textContent()).trim(), true);
}
test.use({ viewport: { width: 1280, height: 720 } });

test('パスワードは端末に残さない（前に残したものも消す）', async ({ page }) => {
  await asTeacher(page);
  await page.evaluate(() => localStorage.setItem('qraft.pw', 'old-secret'));
  await page.goto('host.html?emu=1');
  await expect(page.locator('#paceSel')).toBeAttached();
  await page.waitForFunction(() => localStorage.getItem('qraft.pw') === null);
  expect(await page.locator('#pw').inputValue()).toBe('');
});

test('音のメニュー：BGMと効果音を別々に・音量・キーボードで操作', async ({ page }) => {
  await page.goto('index.html?emu=1');
  const btn = page.locator('.snd').first();
  await btn.focus(); await page.keyboard.press('Enter');
  const menu = page.locator('#sndMenu');
  await expect(menu).toBeVisible();
  await expect(page.locator('#sndMenu [data-k=bgm]')).toBeFocused();
  await page.keyboard.press('Space');                                  // BGM をオフ
  expect(await page.evaluate(() => [localStorage.getItem('qraft.sound.bgm'), localStorage.getItem('qraft.sound.sfx')])).toEqual(['off', 'on']);
  await expect(btn).toHaveText(/🔉/);                                 // 片方だけオンの表示
  await page.locator('#sndMenu [data-k=vol]').fill('40');
  expect(await page.evaluate(() => localStorage.getItem('qraft.sound.vol'))).toBe('0.4');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(btn).toBeFocused();
});

test('クエストの「たたかい方」の案内は端末ごとに一度だけ', async ({ page }) => {
  await page.goto('index.html?emu=1');
  const url = new URL('quest.js', page.url()).href;
  await page.evaluate((u) => import(u).then((m) => { window.__g = m.battleGuide('solo'); }), url);
  const dlg = page.getByRole('dialog', { name: 'たたかい方' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'わかった！' }).click();
  await expect(dlg).toHaveCount(0);
  await page.evaluate((u) => import(u).then((m) => m.battleGuide('solo')), url);   // 2回目はすぐ終わる
  await expect(page.getByRole('dialog', { name: 'たたかい方' })).toHaveCount(0);
});

test('クラシック：「ランキングは最後だけ」なら途中でランキングを出さない', async ({ browser }) => {
  test.setTimeout(150000);
  const host = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await asTeacher(host);
  await host.goto('host.html?emu=1');
  // 暗号化していないサンプルのセットを1つ選ぶ
  await host.locator('#picker label.pcard').filter({ hasNotText: '🔒' }).first().waitFor();
  const plain = await host.evaluate(async () => (await (await fetch('questions/index.json')).json()).filter((s) => !s.enc).map((s) => s.title));
  expect(plain.length, '暗号化していないセット').toBeGreaterThan(0);
  await host.locator('#picker label.pcard', { hasText: plain[0] }).first().click();
  await host.fill('#count', '3');
  await host.selectOption('#limitSel', '10');
  await host.selectOption('#paceSel', 'short');
  await host.selectOption('#rankSel', '0');
  await host.click('#btnCreate');
  await expect(host.locator('#pin')).toHaveText(/\d/, { timeout: 20000 });   // 部屋ができるまで待つ
  const pin = (await host.locator('#pin').textContent()).replace(/\s/g, '');
  expect(pin).toMatch(/^\d{6}$/);
  // 生徒1人が参加（答えなくても、制限時間で次へ進む）
  const stu = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await stu.goto('play.html?emu=1&pin=' + pin);
  if (!(await stu.locator('#nick').isVisible())) { await stu.fill('#pin', pin); await stu.keyboard.press('Enter'); }
  await stu.fill('#nick', 'テスト');
  await stu.click('#btnJoin');
  // 先生：生徒が入ったら開始。終わるまで、ランキングの画面が一度も出ないことを見張る
  await expect(host.locator('#btnStart')).toBeEnabled({ timeout: 20000 });
  await host.click('#btnStart');
  let sawRank = false;
  for (let t = 0; t < 120; t++) {
    const on = await host.evaluate(() => [...document.querySelectorAll('.screen.on')].map((s) => s.id));
    if (on.includes('s-rank')) sawRank = true;
    if (on.includes('s-end')) break;
    await host.waitForTimeout(1000);
  }
  expect(await host.evaluate(() => !!document.querySelector('#s-end.on')), '最後まで進んだ').toBe(true);
  expect(sawRank, '途中でランキングを出していない').toBe(false);
});

/* クラシックで1問だけ遊ぶ。解説はテスト用に問題データへ差しこむ（授業用の解説つきセットは暗号化されていて、テストでは開けないため） */
async function playOne(browser, exOn) {
  const EX = 'テスト用の解説：答えの理由を1〜2文で示します。';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route(/\/questions\/(?!index)[^/]+\.json$/, async (route) => {
    const r = await route.fetch(); const d = await r.json();
    if (Array.isArray(d.questions)) d.questions.forEach((q) => { q.ex = EX; });
    await route.fulfill({ response: r, json: d });
  });
  const host = await ctx.newPage();
  await asTeacher(host);
  await host.goto('host.html?emu=1');
  const plain = await host.evaluate(async () => (await (await fetch('questions/index.json')).json()).filter((s) => !s.enc).map((s) => s.title));
  await host.locator('#picker label.pcard', { hasText: plain[0] }).first().click();
  await host.fill('#count', '1');
  await host.selectOption('#limitSel', '10');
  await host.selectOption('#paceSel', 'long');
  if (!exOn) await host.uncheck('#exShow');
  await host.click('#btnCreate');
  await expect(host.locator('#pin')).toHaveText(/\d/, { timeout: 20000 });
  const pin = (await host.locator('#pin').textContent()).replace(/\s/g, '');
  const stu = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await stu.goto('play.html?emu=1&pin=' + pin);
  if (!(await stu.locator('#nick').isVisible())) { await stu.fill('#pin', pin); await stu.keyboard.press('Enter'); }
  await stu.fill('#nick', 'テスト'); await stu.click('#btnJoin');
  await expect(host.locator('#btnStart')).toBeEnabled({ timeout: 20000 });
  await host.click('#btnStart');
  await expect(host.locator('#s-reveal')).toHaveClass(/on/, { timeout: 40000 });   // 答えずに時間切れ → 正解発表
  return { host, stu, EX };
}

test('クラシック：正解発表に解説を出す（先生の画面と生徒の端末）', async ({ browser }) => {
  test.setTimeout(180000);
  const { host, stu, EX } = await playOne(browser, true);
  await expect(host.locator('#rex')).toBeVisible();
  await expect(host.locator('#rex')).toContainText(EX);
  await expect(stu.locator('#lateex')).toBeVisible({ timeout: 15000 });   // 時間切れの画面
  await expect(stu.locator('#lateex')).toContainText(EX);
});

test('クラシック：「解説を出す」をオフにすると出ない', async ({ browser }) => {
  test.setTimeout(180000);
  const { host, stu } = await playOne(browser, false);
  await expect(host.locator('#rex')).toBeHidden();
  await expect(stu.locator('#s-late')).toHaveClass(/on/, { timeout: 15000 });
  await expect(stu.locator('#lateex')).toBeHidden();
});

// 記録を消すボタン（2026-11-12）。ほかのテストの記録を消さないよう、3年6組だけを使う
test('記録を消す：取り消すと残り、「けす」で今の絞り込みの記録だけ消える', async ({ page }) => {
  await asTeacher(page);
  const rec = { f: '06147353', n: 10, k: 7, t: Date.now(), y: '2026' };
  await seed('practice/3-6-38', { a1: rec, a2: rec });
  await seed('practice/3-5-38', { a1: rec });
  await page.reload();
  await expect(page.locator('#body')).toBeVisible({ timeout: 15000 });
  await page.selectOption('#fg', '3'); await page.selectOption('#fc', '6');
  await expect(page.locator('#meta')).toContainText('練習 2 回');
  // 期間で絞り込み中は押せない
  await page.selectOption('#fd', '7'); await expect(page.locator('#btnDel')).toBeDisabled();
  await page.selectOption('#fd', '0'); await expect(page.locator('#btnDel')).toBeEnabled();
  // 1回目：確認で「キャンセル」→ 何も消えない
  page.once('dialog', d => d.dismiss());
  await page.click('#btnDel');
  await expect(page.locator('#meta')).toContainText('練習 2 回');
  // 2回目：確認OK・入力ちがい → 消えない
  page.once('dialog', d => { page.once('dialog', d2 => d2.accept('はい')); d.accept(); });
  await page.click('#btnDel');
  await expect(page.locator('#delMsg')).toHaveText('消しませんでした。');
  // 3回目：「けす」→ 3年6組だけ消える
  page.once('dialog', d => { expect(d.message()).toContain('1 人・2 回分'); page.once('dialog', d2 => d2.accept('けす')); d.accept(); });
  await page.click('#btnDel');
  await expect(page.locator('#delMsg')).toContainText('消しました');
  await expect(page.locator('#meta')).toContainText('練習 0 回');
  await page.selectOption('#fc', '5');
  await expect(page.locator('#meta')).toContainText('練習 1 回');
});

// クエスト（チーム）の生徒の画面：2つ選ぶ問題で「答える」が画面の中にあり、答えを送れる。図は押すと拡大（2026-11-12 授業での指摘）
test('クエスト（チーム）：2つ選ぶ問題を答えられる・図を拡大できる', async ({ page }) => {
  test.setTimeout(90000);
  const PIN = '246810', Y = '2026', SID = '2-1-3';
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('quest-play.html?emu=1');
  const uid = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1500));
    const u = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/lib.js'));
    return (await (await import(u)).signIn()).uid;
  });
  const now = Date.now();
  await seed('quest/' + Y + '/keys/' + SID, 'abc234');
  await seed('quest/' + Y + '/owners/' + SID + '/' + uid, { c: 'abc234', t: now });
  await seed('quest/' + Y + '/chars/' + SID, { n: 'テスト', j: 'mage', lk: 'a', lv: 3, exp: 0, gold: 0, sp: 0, sk: { 0: 0, 1: 1, 2: 0 }, u: now });
  await seed('rooms/' + PIN + '/state', { mode: 'quest', phase: 'battle', g: 2, c: 1, y: Y, area: { name: '霧の森', k: 'forest' }, tm: { [uid]: 0 }, ends: now + 300000, Tl: 300, battle: 'zako' });
  await seed('rooms/' + PIN + '/tv/0', { m: { [uid]: { nm: 'テスト', j: 'mage', lk: 'a', hp: 30, mhp: 30, mp: 1 }, x1: { nm: 'なかま', j: 'warrior', lk: 'b', hp: 40, mhp: 40, mp: 0 } }, e: { k: 'donbuka', hp: 40, max: 60 }, log: '' });
  await page.evaluate((pin) => { localStorage.setItem('qraft.quest', JSON.stringify({ pin, n: 3 })); localStorage.setItem('qraft.quest.guide.team', '1'); }, PIN);
  await page.goto('quest-play.html?emu=1');
  await expect(page.locator('#s-battle')).toBeVisible({ timeout: 15000 });
  await seed('rooms/' + PIN + '/qs/' + uid, { n: 1, t: 'セキツイ動物にあてはまるものを すべて選びなさい。長い問題文のときに、画面の下のほうがどうなるかを確かめるための文です。', img: 'img/logo-mark.png', imgAlt: '図', ch: [{ t: 'メダカ' }, { t: 'イカ' }, { t: 'カエル' }, { t: 'バッタ' }], mu: 1, ko: 0 });
  const sub = page.locator('#cmd button.btn', { hasText: '答える' });
  await expect(sub).toBeVisible({ timeout: 10000 });
  await expect(sub).toBeInViewport({ ratio: 1 });           // 前は画面の下にはみ出して押せなかった
  await page.locator('#cmd .choices button', { hasText: 'メダカ' }).click();
  await page.locator('#cmd .choices button', { hasText: 'カエル' }).click();
  // 図を押すと拡大、もう一度押すと閉じる
  await page.locator('#cmd img.qimg').click();
  await expect(page.locator('.img-zoom')).toBeVisible();
  await page.locator('.img-zoom').click();
  await expect(page.locator('.img-zoom')).toHaveCount(0);
  await sub.click();
  await expect.poll(async () => (await (await fetch(`${DB}/rooms/${PIN}/answers/1/${uid}/m.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })).json())).toBe(5);   // メダカ(1)＋カエル(4)
});
