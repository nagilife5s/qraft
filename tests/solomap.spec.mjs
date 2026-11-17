// 目で確かめる用（ふだんのテストには入れない）：ひとりで冒険の「行き先の地図・出る問題・1問ずつえらぶ」と、記録画面のテスト範囲、リカリアの準備・参加画面の見た目
//   SHOTS=<フォルダ> npx playwright test -c shots.config.mjs solomap.spec.mjs（エミュレーターの中で）
import { test, expect } from '@playwright/test';
const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) { const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status); return r.json(); }
const SHOT = process.env.SHOTS || 'test-results/shots', Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
test.setTimeout(240000);
for (const vp of [{ width: 1366, height: 657 }, { width: 1920, height: 950 }]) {
  test('ひとりで冒険の行き先と問題 ' + vp.width, async ({ browser }) => {
    const errs = [], W = vp.width;
    const ctx = await browser.newContext({ viewport: vp });
    // 先生：テスト範囲を作る
    const t = await ctx.newPage(); t.on('pageerror', e => errs.push(String(e)));
    await t.goto('records.html?emu=1');
    const id = t.locator('#myUid'); await expect(id).not.toBeEmpty({ timeout: 15000 });
    const uid = await id.textContent(); await rest('PUT', `admins/${uid}`, true); await t.reload();
    await rest('DELETE', `quest/${Y}/ranges/3`);
    await t.locator('#tab-q').click(); await t.locator('#qsub button', { hasText: 'テスト範囲をつくる' }).click();   /* 問題タブの1か所で作る（2026-11-17） */
    await t.locator('#mkG button', { hasText: '1年' }).click(); await t.locator('.mkuh', { hasText: '物質' }).getByRole('button', { name: 'この単元を全部' }).click();
    await t.locator('#mkG button', { hasText: '3年' }).click(); await t.locator('.mkuh', { hasText: 'イオン' }).getByRole('button', { name: 'この単元を全部' }).click();
    await t.locator('#mkTo').selectOption('3');
    await t.locator('#mkTerm button', { hasText: '2学期' }).click(); await t.locator('#mkExam button', { hasText: '期末' }).click();
    await t.locator('#mkSave').click(); await expect(t.locator('#tblRangeMk')).toContainText('2学期期末', { timeout: 15000 });
    await t.locator('#tblRangeMk').scrollIntoViewIfNeeded(); await t.screenshot({ path: `${SHOT}/r-ranges-${W}.png` });
    // 3年の生徒
    await rest('PUT', `quest/${Y}/keys/3-1-5`, 'abc315');
    await rest('DELETE', `quest/${Y}/chars/3-1-5`); await rest('DELETE', `quest/${Y}/owners/3-1-5`);
    const p = await (await browser.newContext({ viewport: vp })).newPage(); p.on('pageerror', e => errs.push(String(e)));
    await p.goto('quest.html?emu=1');
    await p.locator('#segG button[data-v="3"]').click(); await p.locator('#segC button', { hasText: '1' }).first().click();
    await p.locator('#nums button', { hasText: /^5$/ }).click();
    await p.locator('input[aria-label="合言葉"]').fill('abc315'); await p.getByRole('button', { name: 'OK' }).click();
    await expect(p.locator('#s-make')).toBeVisible({ timeout: 15000 });
    await p.locator('.jobcard[data-job="warrior"]').click(); await p.locator('#cname').fill('さんねん'); await p.locator('#btnMake').click();
    await expect(p.locator('#s-town')).toBeVisible({ timeout: 15000 }); await p.waitForTimeout(800);
    await expect(p.locator('#goMenu')).toBeVisible();
    await expect(p.locator('#units .nm')).toHaveCount(0);
    await p.keyboard.press('m'); await expect(p.locator('.gm-bg .win')).toBeVisible();
    await p.keyboard.press('ArrowDown'); await p.screenshot({ path: `${SHOT}/q1b-menu-${W}.png` });
    await p.getByRole('button', { name: 'タイトルへもどる' }).click(); await expect(p.locator('.gm-confirm')).toBeVisible();
    await p.screenshot({ path: `${SHOT}/q1c-menu-confirm-${W}.png` });
    await p.getByRole('button', { name: 'いいえ' }).click(); await p.getByRole('button', { name: 'ステータス' }).click();
    await expect(p.locator('#s-stat')).toBeVisible(); await p.waitForTimeout(400);
    await expect(p.locator('#skMore')).not.toHaveClass(/off/);
    await p.screenshot({ path: `${SHOT}/q1d-stat-${W}.png` });
    await p.locator('#skills').hover(); await p.mouse.wheel(0, 3000); await p.waitForTimeout(400);
    await expect(p.locator('#skMore')).toHaveClass(/off/);
    await p.screenshot({ path: `${SHOT}/q1e-stat-scrolled-${W}.png` });
    await p.locator('#statBack').click(); await p.waitForTimeout(500);
    await p.screenshot({ path: `${SHOT}/q1-town-${W}.png` });
    // 門へ歩く → 行き先の地図
    for (let i = 0; i < 40 && !(await p.locator('#s-world').isVisible()); i++) {
      const pt = await p.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(), w = document.querySelector('.fd-wrap').getBoundingClientRect(), ts = r.width / 36;
        let x = 34; while (r.left + (x + .5) * ts > w.right - 4) x--; return { x: r.left + (x + .5) * ts, y: r.top + 11.5 * ts }; });
      await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(1500);
    }
    await expect(p.locator('#s-world')).toBeVisible();
    await expect(p.locator('#wmHint')).toBeVisible();
    await p.screenshot({ path: `${SHOT}/q2-gate-map-${W}.png` });
    // 1年の単元へ（3年でも入れる）
    await p.locator('#wmTabs button[data-v="1"]').click();
    await p.locator('.wm-node[data-wm="1-物質"]').click();
    await p.locator('.src input[value="range"]').check(); await p.waitForTimeout(300);
    await p.screenshot({ path: `${SHOT}/q3-src-${W}.png` });
    await p.locator('.src input[value="sets"]').check();
    await expect(p.locator('.pk .pkr')).toBeVisible();
    await p.locator('.pk .pcard').nth(0).click(); await p.locator('.pk .pcard').nth(1).click(); await expect(p.locator('.pk .pill')).toContainText('2');
    await p.screenshot({ path: `${SHOT}/q4-sets-${W}.png` });
    await p.getByRole('button', { name: 'これで決める' }).click();
    await p.locator('#wmGo').click();
    await expect(p.locator('#fdSub')).toContainText('1年 物質');
    await expect(p.locator('#fdSub')).toContainText('問題セット');
    await p.waitForTimeout(800); await p.screenshot({ path: `${SHOT}/q5-area-${W}.png` });
    // 奥の霧に入ると、ボスにひとりでちょうせんできる
    await p.evaluate(() => { document.getElementById('fdMsg').classList.add('hide'); });
    await p.evaluate(() => window.__bossAsk());
    await expect(p.getByRole('button', { name: 'ちょうせんする' })).toBeVisible({ timeout: 30000 });
    await p.screenshot({ path: `${SHOT}/q6-boss-ask-${W}.png` });
    await p.getByRole('button', { name: 'ちょうせんする' }).click();
    await expect(p.locator('#s-battle')).toBeVisible({ timeout: 10000 });
    await p.locator('#cmd .qbox, #cmd .btn').first().waitFor({ timeout: 15000 }).catch(() => {});
    await expect(p.locator('#ename')).toContainText('アルケミラ');
    await p.screenshot({ path: `${SHOT}/q7-boss-battle-${W}.png` });
    // 敵の強さは自分のレベル（Lv30）に合わせる
    const hp = await p.evaluate(async () => (await import('./quest.js')).soloEnemyHp(1, 30));
    expect(hp).toBeGreaterThan(100);
    // リカリアの準備画面（先生）と参加画面（生徒）
    await t.goto('rikaria-host.html?emu=1'); await t.waitForTimeout(1500); await t.screenshot({ path: `${SHOT}/h1-setup-${W}.png` });
    const s = await ctx.newPage(); await s.goto('rikaria-play.html?emu=1'); await s.waitForTimeout(1200); await s.screenshot({ path: `${SHOT}/p1-join-${W}.png` });
    await t.goto('rikaria.html'); await t.waitForTimeout(2500); await t.locator('#goStart').click(); await t.waitForTimeout(600); await t.screenshot({ path: `${SHOT}/t1-menu-${W}.png` });
    console.log('pageerrors', JSON.stringify(errs));
    expect(errs).toEqual([]);
  });
}
