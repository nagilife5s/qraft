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

async function join(ctx, pin, n, job, name, gp = 1) {
  const p = await ctx.newPage();
  await p.goto('rikaria-play.html?emu=1&pin=' + pin);
  await p.locator('#nums button', { hasText: new RegExp('^' + n + '$') }).click();
  await p.locator('input[aria-label="合言葉"]').fill('abc' + n + '23');
  await p.getByRole('button', { name: 'OK' }).click();
  await expect(p.locator('#s-make, #s-group').locator('visible=true').first()).toBeVisible({ timeout: 10000 });
  if (await p.locator('#s-make').isVisible()) {   /* はじめての人だけキャラを作る */
    await p.locator('.jobcard[data-job="' + job + '"]').click();
    await p.locator('#cname').fill(name);
    await p.locator('#btnMake').click();
  }
  await p.locator('#gpgrid button', { hasText: gp + '班' }).click();
  await p.locator('#btnGp').click();
  await expect(p.locator('#s-prep')).toBeVisible();
  await p.locator('#ppReady').click();
  return p;
}

/* 物語の場面（先生の画面）：出ていたら「つぎへ」を最後まで押す。出た見出しと文を返す */
async function skipStory(host, until) {
  const seen = [];
  for (let i = 0; i < 40; i++) {
    if (await host.locator('#story').isVisible()) { seen.push((await host.locator('#stH').textContent()) + '｜' + (await host.locator('#stS').textContent())); await host.locator('#stNext').click(); await host.waitForTimeout(150); continue; }
    if (!until || await host.locator(until).isVisible()) { if (!until || seen.length || i > 2) break; }
    await host.waitForTimeout(300);
  }
  return seen;
}

test('リカリア・チーム戦：通しで動き、続きから始められるように保存される', async ({ browser }) => {
  const tctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const host = await tctx.newPage();
  await host.goto('records.html?emu=1');
  const id = host.locator('#myUid'); await expect(id).not.toBeEmpty({ timeout: 15000 });
  await rest('PUT', 'admins/' + (await id.textContent()).trim(), true);
  for (const n of [1, 2]) await rest('PUT', `quest/${Y}/keys/1-1-${n}`, 'abc' + n + '23');
  await rest('DELETE', `quest/${Y}/classes/1-1/open`);   // その年度の最初の授業にする（章の始まりが出る）
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
  // 章の始まり（その年度の最初だけ）：先生の画面に場面、生徒には短い帯。「つぎへ」で冒険が始まる
  await expect(host.locator('#story')).toBeVisible({ timeout: 15000 });
  await expect(host.locator('#stH')).toContainText('はじまりの村');
  await expect(host.locator('#stS')).toContainText('見習いの冒険者たち');
  await expect(a.locator('#storyMini')).toContainText('はじまりの村', { timeout: 8000 });
  await shot(host, '1b-story-open');
  await host.locator('#stNext').click();
  await expect(host.locator('#story')).toBeHidden();
  await expect(a.locator('#storyMini')).toBeHidden({ timeout: 8000 });
  expect(await rest('GET', `quest/${Y}/classes/1-1/open`)).toBe(true);
  await expect(host.locator('#s-run')).toBeVisible();
  await expect(host.locator('#tm1')).toBeVisible();
  // たいまつが地図にある・小物は8種類とも
  await expect(host.locator('#tm1 .torch').first()).toBeAttached();
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
  // 班員（2番）がリーダーの後ろのマスについて歩く
  expect((await rest('GET', `rooms/${pin}/gv/1`)).tr[0].slice(0, 2)).toEqual(pos0);
  await expect(a.locator('#map .unit.fol')).toHaveCount(1, { timeout: 8000 });
  await expect(a.locator('#map .torch').first()).toBeAttached();
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

// オブリオン戦（2026-11-13）：クラスで1体・2班。1回目で削って持ち越し → 2回目で倒す → 前回だけ来た人にもごほうび
test('オブリオン戦：クラスで1体のHPを持ち越し、倒すと参加した人全員にごほうび', async ({ browser }) => {
  const tctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const host = await tctx.newPage();
  await host.goto('records.html?emu=1');
  const id = host.locator('#myUid'); await expect(id).not.toBeEmpty({ timeout: 15000 });
  await rest('PUT', 'admins/' + (await id.textContent()).trim(), true);
  for (const n of [1, 2]) await rest('PUT', `quest/${Y}/keys/1-2-${n}`, 'abc' + n + '23');
  await rest('PUT', `quest/${Y}/chars/1-2-9`, { n: 'やすみ', j: 'hunter', lk: 'a', lv: 3, exp: 0, gold: 0, sp: 2, spt: 2 });   // 前回だけ来た人
  await rest('DELETE', `quest/${Y}/classes/1-2`);
  const open = async () => {
    await host.evaluate(() => localStorage.setItem('qraft.rikaria.last', JSON.stringify({ g: '1', c: '2', t: '300', sets: ['chu1-mono.json'], m: 'ob' })));
    await host.goto('rikaria-host.html?emu=1');
    await expect(host.locator('#obRow')).toBeVisible();
    await expect(host.locator('#obInfo')).toHaveText(/はじめて|前回の続き/, { timeout: 30000 });
    await expect(host.locator('#selOb')).toHaveValue('1');
    await host.locator('#btnCreate').click();
    await expect(host.locator('#s-lobby')).toBeVisible();
    await expect(host.locator('#lbTitle')).toContainText('霧影オブリオン');
    return (await host.locator('#pin').textContent()).replace(/\s/g, '');
  };
  // 1回目
  let pin = await open();
  const a = await join(await browser.newContext({ viewport: { width: 1366, height: 854 } }), pin, 1, 'priest', 'そうりょ', 1);
  const b = await join(await browser.newContext({ viewport: { width: 1366, height: 854 } }), pin, 2, 'warrior', 'せんし', 2);
  await expect(host.locator('#groups .gp-card')).toHaveCount(2, { timeout: 15000 });
  await host.locator('#btnStart').click();
  // 章の始まり（クラスの記録を消したので出る）→ オブリオンの「戦いの前」のセリフ
  await expect(host.locator('#story')).toBeVisible({ timeout: 15000 });
  const seen = await skipStory(host, '#obStage');
  expect(seen.length).toBe(2); expect(seen[0]).toContain('はじまりの村'); expect(seen[1]).toContain('霧の中に消えればよい');
  await expect(host.locator('#obStage')).toBeVisible();
  await expect(a.locator('#s-battle')).toBeVisible({ timeout: 10000 });
  await expect(b.locator('#s-battle')).toBeVisible();
  await expect(a.locator('#foes .enemy.obl')).toHaveCount(1);
  await expect(a.locator('#midNm')).toContainText('霧影オブリオン');
  const players = await rest('GET', `rooms/${pin}/players`);
  const uidOf = (n) => Object.keys(players).find((u) => players[u].sid === '1-2-' + n);
  // 2人が答える（正解するまで）→ クラスのHPが減る。2つの班で同じHP
  for (let i = 0; i < 12; i++) {
    for (const p of [a, b]) { const btn = p.locator('#cmd .choices button:not([disabled])').first(); if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {}); }
    await a.waitForTimeout(1300);
    const g1 = await rest('GET', `rooms/${pin}/gv/1`); if (g1.foes[0].hp < g1.foes[0].mx) break;
  }
  const g1 = await rest('GET', `rooms/${pin}/gv/1`), g2 = await rest('GET', `rooms/${pin}/gv/2`);
  expect(g1.foes[0].hp).toBeLessThan(g1.foes[0].mx);
  expect(Math.abs(g1.foes[0].hp - g2.foes[0].hp)).toBeLessThan(g1.foes[0].mx * .05);
  await a.waitForTimeout(800); await shot(a, 'ob-1-student'); await shot(host, 'ob-2-host');
  await host.locator('#btnEnd').click();
  await expect(host.locator('#s-end')).toBeVisible({ timeout: 20000 });
  await expect(a.locator('#s-result')).toBeVisible({ timeout: 20000 });
  await expect(a.locator('#rStory')).toContainText('残りHP');
  let ob = await rest('GET', `quest/${Y}/classes/1-2/ob`);
  expect(ob.k).toBe(1); expect(ob.hp).toBeGreaterThan(0); expect(ob.hp).toBeLessThan(ob.mx); expect(ob.sem).toBe(3);
  expect(ob.who['1-2-1'] && ob.who['1-2-2']).toBeTruthy();
  // 2回目：HPを1にして、前回だけ来た人を足しておく → 続きから・倒す
  await rest('PATCH', `quest/${Y}/classes/1-2/ob`, { hp: 1 }); await rest('PUT', `quest/${Y}/classes/1-2/ob/who/1-2-9`, true);
  await a.close(); await b.close();
  pin = await open();
  await expect(host.locator('#obInfo')).toContainText('前回の続き');
  const a2 = await join(await browser.newContext({ viewport: { width: 1366, height: 854 } }), pin, 1, 'priest', '', 1);
  await host.locator('#btnStart').click();
  await expect(host.locator('#story')).toBeVisible({ timeout: 15000 });
  const seen2 = await skipStory(host, '#obStage');   // 2回目は「戦いの前」だけ（章の始まりは出ない）
  expect(seen2.length).toBe(1); expect(seen2[0]).toContain('霧影オブリオン');
  await expect(a2.locator('#s-battle')).toBeVisible({ timeout: 10000 });
  for (let i = 0; i < 15; i++) {
    const btn = a2.locator('#cmd .choices button:not([disabled])').first(); if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
    await a2.waitForTimeout(1300);
    if (await host.locator('#s-end').isVisible()) break;
    const g = await rest('GET', `rooms/${pin}/gv/1`); if (g.ph === 'result') break;
  }
  await shot(host, 'ob-3-host-win');
  await expect(host.locator('#s-end')).toBeVisible({ timeout: 25000 });
  await expect(host.locator('#endTitle')).toContainText('封じた');
  // 倒した日だけ「倒したあと」の場面
  await expect(host.locator('#stS')).toContainText('まだ始まったばかりだ', { timeout: 10000 });
  await host.locator('#stNext').click(); await expect(host.locator('#story')).toBeHidden();
  await expect(a2.locator('#rStory')).toContainText('影はかき消えた', { timeout: 20000 });
  await expect(a2.locator('#rTitle')).toContainText('封じた', { timeout: 20000 });
  await shot(a2, 'ob-4-result');
  ob = await rest('GET', `quest/${Y}/classes/1-2/ob`);
  expect(ob.k).toBe(2); expect(ob.hp).toBe(0);
  for (const sid of ['1-2-1', '1-2-2', '1-2-9']) {
    const c = await rest('GET', `quest/${Y}/chars/${sid}`);
    expect(c.ttl && c.ttl.ob1, sid).toBe('霧影オブリオンを封じた者');
    expect(c.sp + 0).toBeGreaterThanOrEqual(3);
  }
  // オブリオンのゴールドは学年で決まる（1年は100G）。前回だけ来た人は、ちょうど100G
  expect((await rest('GET', `quest/${Y}/chars/1-2-9`)).gold).toBe(100);
});

// 2026-11-13 追加：町の名前・冒険の地図で単元をえらぶ・持ち物を1つ持っていく・精霊・新しいキャラは学年のレベルから
// （新しいキャラの Lv16 は、ルールの「作るとき」が学年の目安のレベルを通すようになってから成功する）
test('町の名前と冒険の地図、持ち物と精霊（2年）', async ({ browser }) => {
  const tctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const host = await tctx.newPage();
  await host.goto('records.html?emu=1');
  const id = host.locator('#myUid'); await expect(id).not.toBeEmpty({ timeout: 15000 });
  await rest('PUT', 'admins/' + (await id.textContent()).trim(), true);
  for (const n of [1, 2]) await rest('PUT', `quest/${Y}/keys/2-3-${n}`, 'abc' + n + '23');
  await rest('PUT', `quest/${Y}/classes/2-3`, { open: true, stage: 5, areas: { life: { done: true } } });
  await rest('PUT', `quest/${Y}/chars/2-3-1`, { n: 'せいれい', j: 'summoner', lk: 'a', lv: 16, exp: 0, gold: 0, sp: 15, spt: 15, inv: { potion: 2, wing: 1 } });
  await rest('DELETE', `quest/${Y}/chars/2-3-2`); await rest('DELETE', `quest/${Y}/teams/2-3`);
  await host.evaluate(() => localStorage.setItem('qraft.rikaria.last', JSON.stringify({ g: '2', c: '3', t: '300', sets: ['chu1-mono.json'] })));
  await host.goto('rikaria-host.html?emu=1');
  // 町の名前：✏️で入れる → クラスの記録に入る。空にすると「ルーメンの村」
  await expect(host.locator('#townInfo')).toContainText('ルーメンの村（広場の村）', { timeout: 30000 });
  await host.locator('#btnTown').click();
  await host.locator('#townName').fill('  ひかりの町  ');
  await host.locator('#townSave').click();
  await expect(host.locator('#townInfo')).toContainText('町：ひかりの町（広場の村）');
  expect(await rest('GET', `quest/${Y}/classes/2-3/town`)).toBe('ひかりの町');
  expect(await rest('GET', `quest/${Y}/classes/2-3/stage`)).toBe(5);
  // 冒険の地図：2年の4か所。クリアした単元は旗、まだの単元は霧。場所を押すとその単元になる
  await expect(host.locator('#amMap .am-node')).toHaveCount(4);
  await expect(host.locator('#amMap .am-node.clear')).toHaveCount(1);
  await expect(host.locator('#amMap .am-node[data-u="life"] .flag')).toBeVisible();
  await expect(host.locator('#amMap .am-fog')).toHaveCount(3);
  await expect(host.locator('#amMap')).toContainText('ひかりの町');
  await host.locator('#amMap .am-node[data-u="weather"]').click();
  await expect(host.locator('#amMap .am-node[data-u="weather"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(host.locator('#selUnit')).toHaveValue('weather');
  await expect(host.locator('#selInfo')).toContainText('嵐の天空塔');
  await host.locator('#selUnit').selectOption('electric');   // ふつうの一覧（キーボード用）でもえらべる
  await expect(host.locator('#selInfo')).toContainText('雷鳴の発電所');
  await shot(host, 'map-1-setup');
  await host.locator('#btnCreate').click();
  await expect(host.locator('#s-lobby')).toBeVisible();
  await expect(host.locator('#lbTitle')).toContainText('雷鳴の発電所');
  const pin = (await host.locator('#pin').textContent()).replace(/\s/g, '');

  // 生徒1：精霊使い。回復のしずくを持っていく（帰還の羽は出ない）
  const a = await browser.newContext({ viewport: { width: 1366, height: 854 } }).then((c) => c.newPage());
  await a.goto('rikaria-play.html?emu=1&pin=' + pin);
  await a.locator('#nums button', { hasText: /^1$/ }).click();
  await a.locator('input[aria-label="合言葉"]').fill('abc123'); await a.getByRole('button', { name: 'OK' }).click();
  await a.locator('#gpgrid button', { hasText: '1班' }).click(); await a.locator('#btnGp').click();
  await expect(a.locator('#ppItems button')).toHaveCount(2);   // 持っていかない・回復のしずく
  await a.locator('#ppItems button[data-it="potion"]').click();
  await expect(a.locator('#ppItems button[data-it="potion"]')).toHaveAttribute('aria-pressed', 'true');
  await shot(a, 'item-1-prep');
  await a.locator('#ppReady').click();
  // 生徒2：新しいキャラ。2年は Lv16・SP15 から
  const b = await join(await browser.newContext({ viewport: { width: 1366, height: 854 } }), pin, 2, 'mage', 'しんいり', 1);
  const c2 = await rest('GET', `quest/${Y}/chars/2-3-2`);
  expect(c2.lv).toBe(16); expect(c2.sp).toBe(15); expect(c2.spt).toBe(15);
  await expect(host.locator('#groups .gp-card')).toHaveText(/1班[\s\S]*全員準備OK/, { timeout: 15000 });
  const players = await rest('GET', `rooms/${pin}/players`);
  const uidOf = (n) => Object.keys(players).find((u) => players[u].sid === '2-3-' + n);
  expect(players[uidOf(1)].it).toBe('potion');
  await host.locator('#btnStart').click();
  await expect(host.locator('#s-run')).toBeVisible({ timeout: 15000 });   // 章の始まりは、もう見たクラスなので出ない
  await expect(host.locator('#story')).toBeHidden();
  // ワスレモノにぶつかって戦闘へ
  await expect(a.locator('#s-field')).toBeVisible({ timeout: 10000 });
  for (let i = 0; i < 8 && !(await a.locator('#s-battle').isVisible()); i++) {
    const g = await rest('GET', `rooms/${pin}/gv/1`); if (g.ph !== 'explore' || !g.mobs.length) { await a.waitForTimeout(1500); continue; }
    await rest('PATCH', `rooms/${pin}/ctl/${uidOf(1)}`, { x: g.mobs[0][0], y: g.mobs[0][1], n: 900 + i });
    await a.waitForTimeout(2500);
  }
  await expect(a.locator('#s-battle')).toBeVisible({ timeout: 20000 });
  // 精霊：精霊使いの横に、いまの精霊（火）。切りかえると絵も変わる
  await expect(a.locator('#teambar .chip.me .spirit')).toHaveAttribute('data-el', 'fire');
  await expect(a.locator('#mySpirit')).toHaveAttribute('src', /spirit-fire/);
  await expect(b.locator('#teambar .spirit')).toHaveCount(1);
  await a.locator('.elemrow button', { hasText: '水' }).first().click();
  await expect(a.locator('#mySpirit')).toHaveAttribute('src', /spirit-water/, { timeout: 8000 });
  await expect(host.locator('#tm1 .mparty .spirit')).toHaveAttribute('data-el', 'water', { timeout: 8000 });
  await shot(a, 'item-2-battle');
  // 持ち物：1回だけ使える。使うとボタンが消え、キャラの持ち物が1つ減る
  await expect(a.locator('#btnItem')).toBeVisible();
  await expect(b.locator('#btnItem')).toHaveCount(0);
  await a.locator('#btnItem').click();
  await expect(a.locator('#btnItem')).toHaveCount(0, { timeout: 8000 });
  expect((await rest('GET', `rooms/${pin}/players/${uidOf(1)}`)).it).toBe('!potion');
  await expect.poll(async () => (await rest('GET', `quest/${Y}/chars/2-3-1/inv/potion`)), { timeout: 8000 }).toBe(1);
  expect((await rest('GET', `rooms/${pin}/gv/1`)).mem[uidOf(1)].it).toBe('');
  await host.locator('#btnEnd').click();
  await expect(host.locator('#s-end')).toBeVisible({ timeout: 20000 });
  await expect(a.locator('#s-result')).toBeVisible({ timeout: 20000 });
  const ch = await rest('GET', `quest/${Y}/chars/2-3-1`);
  expect(ch.inv.potion).toBe(1); expect(ch.inv.wing).toBe(1);   // 先生のPCの保存でも、減った数のまま
  expect(await rest('GET', `quest/${Y}/classes/2-3/town`)).toBe('ひかりの町');
});
