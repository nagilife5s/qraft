// リカリア・チーム戦の通しテスト（2026-11-13）：先生1人・生徒2人（同じ班）。
// 部屋づくり → 参加（合言葉・キャラ作成・班）→ 準備（技えらび）→ 出発 → リーダーの移動 → 戦闘（答える・技）→ 終了 → キャラと班の進み具合の保存
import { test, expect } from '@playwright/test';

const DB = 'http://127.0.0.1:9000', NS = 'qraft-e4345-default-rtdb';
async function rest(method, path, value) {
  const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: value === undefined ? undefined : JSON.stringify(value) });
  if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status);
  return r.json();
}
const SHOT = process.env.SHOTS;   // 画面の写真を撮る（目で確かめる用）
async function shot(p, name) { if (SHOT) await p.screenshot({ path: SHOT + '/' + name + '.png' }); }
const Y = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; })();
test.setTimeout(150000);

async function join(ctx, pin, n, job, name) {
  const p = await ctx.newPage();
  await p.goto('rikaria-play.html?emu=1&pin=' + pin);
  await p.locator('#nums button', { hasText: new RegExp('^' + n + '$') }).click();
  await p.locator('input[aria-label="合言葉"]').fill('abc' + n + '23');
  await p.getByRole('button', { name: 'OK' }).click();
  await p.locator('.jobcard[data-job="' + job + '"]').click();
  await p.locator('#cname').fill(name);
  await p.locator('#btnMake').click();
  await p.locator('#gpgrid button', { hasText: '1班' }).click();
  await p.locator('#btnGp').click();
  await expect(p.locator('#s-prep')).toBeVisible();
  await p.locator('#ppReady').click();
  return p;
}

test('リカリア・チーム戦：通しで動き、続きから始められるように保存される', async ({ browser }) => {
  const tctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const host = await tctx.newPage();
  await host.goto('records.html?emu=1');
  const id = host.locator('#myUid'); await expect(id).not.toBeEmpty({ timeout: 15000 });
  await rest('PUT', 'admins/' + (await id.textContent()).trim(), true);
  for (const n of [1, 2]) await rest('PUT', `quest/${Y}/keys/1-1-${n}`, 'abc' + n + '23');
  await host.evaluate(() => localStorage.setItem('qraft.rikaria.last', JSON.stringify({ g: '1', c: '1', t: '300', sets: ['chu1-mono.json'] })));
  await host.goto('rikaria-host.html?emu=1');
  await expect(host.locator('#selInfo')).toContainText('まどろみの錬金工房');
  await host.locator('#btnCreate').click();
  await expect(host.locator('#s-lobby')).toBeVisible();
  const pin = (await host.locator('#pin').textContent()).replace(/\s/g, '');

  const a = await join(await browser.newContext({ viewport: { width: 1366, height: 854 } }), pin, 1, 'mage', 'まほう');
  const b = await join(await browser.newContext({ viewport: { width: 1366, height: 854 } }), pin, 2, 'monk', 'ぶとう');
  // 準備：技をえらべる（魔法使いLv1はフレアだけ）
  await expect(a.locator('#ppSkills .sk.on')).toHaveCount(1);
  await shot(a, '1-prep');
  await expect(host.locator('#groups .gp-card')).toHaveText(/1班[\s\S]*全員準備OK/, { timeout: 15000 });

  await host.locator('#btnStart').click();
  await expect(host.locator('#s-run')).toBeVisible();
  await expect(host.locator('#tm1')).toBeVisible();
  // リーダーは出席番号の小さい1番（前回のリーダーがいないので）
  const st = await rest('GET', `rooms/${pin}/state`);
  const players = await rest('GET', `rooms/${pin}/players`);
  const uidOf = (n) => Object.keys(players).find((u) => players[u].sid === '1-1-' + n);
  expect(st.gp['1'].lead).toBe(uidOf(1));
  await expect(a.locator('#s-field')).toBeVisible({ timeout: 10000 });
  await expect(b.locator('#s-prac')).toBeVisible();
  // 班員は探索中に練習問題（正解でMP）
  await expect(b.locator('#prCmd .choices button').first()).toBeVisible({ timeout: 10000 });
  await a.waitForTimeout(800); await shot(a, '2-field'); await shot(b, '3-prac'); await shot(host, '4-host-field');
  // リーダーが矢印で1歩進む
  const pos0 = (await rest('GET', `rooms/${pin}/gv/1`)).pos;
  await a.locator('#wrap').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await a.keyboard.press('ArrowRight');
  await expect.poll(async () => (await rest('GET', `rooms/${pin}/gv/1`)).pos[0], { timeout: 8000 }).toBe(pos0[0] + 1);
  // 見えているワスレモノに向かって歩く → 戦闘
  const gv = await rest('GET', `rooms/${pin}/gv/1`);
  const m = gv.mobs[0];
  await rest('PATCH', `rooms/${pin}/ctl/${uidOf(1)}`, { x: m[0], y: m[1], n: 900 });
  for (let i = 0; i < 6 && !(await b.locator('#s-battle').isVisible()); i++) {   // 魔物は歩くので、何度か追いかける
    const g2 = await rest('GET', `rooms/${pin}/gv/1`); if (g2.ph !== 'explore' || !g2.mobs.length) break;
    await rest('PATCH', `rooms/${pin}/ctl/${uidOf(1)}`, { x: g2.mobs[0][0], y: g2.mobs[0][1], n: 901 + i });
    await b.waitForTimeout(2500);
  }
  await expect(b.locator('#s-battle')).toBeVisible({ timeout: 20000 });
  await expect(a.locator('#s-battle')).toBeVisible();
  await expect(b.locator('#foes .enemy').first()).toBeVisible();
  await b.waitForTimeout(1500); await shot(b, '5-battle'); await shot(host, '6-host-battle');
  // 答える（どれかを押す）→ 採点の結果が出る
  await b.locator('#cmd .choices button').first().click();
  await expect(b.locator('#cmd .banner')).toBeVisible({ timeout: 8000 });
  // 敵をクリックしてねらいを変える
  const nFoes = await b.locator('#foes .enemy').count();
  if (nFoes > 1) { await b.locator('#foes .enemy').nth(1).click(); await expect.poll(async () => (await rest('GET', `rooms/${pin}/gv/1`)).mem[uidOf(2)].tg, { timeout: 5000 }).toBe(1); }
  // 技：MPを入れてから魔法使いの「フレア」
  await expect(a.locator('#skills .act')).toHaveCount(1);
  // 終了して保存
  await host.locator('#btnEnd').click();
  await expect(host.locator('#s-end')).toBeVisible({ timeout: 20000 });
  await expect(a.locator('#s-result')).toBeVisible({ timeout: 20000 });
  await expect(a.locator('#rCards')).toContainText('班の進み');
  await shot(a, '7-result');
  const prog = await rest('GET', `quest/${Y}/teams/1-1/matter/1`);
  expect(prog.lead).toBe('1-1-1');
  expect(prog.fl).toBe(1);
  expect(prog.snap).toBeTruthy();
  const ch = await rest('GET', `quest/${Y}/chars/1-1-2`);
  expect(ch.j).toBe('monk'); expect(ch.spt).toBe(ch.lv - 1); expect(ch.sk).toBeUndefined();
});
