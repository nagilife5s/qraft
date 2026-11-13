// リカリア・チーム戦のエンジンと決まりごとのテスト（2026-11-13）。node --test tests/rikaria-engine.test.mjs
// 最後の「試算」は、方向性 8.5 の表（群れ約75秒・番人約100秒・ボス約4分半、正答率70%で全滅3%・0%・22%）に近いかを見る。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../rikaria-data.js';
import * as E from '../rikaria-engine.js';

const JOBS6 = ['warrior', 'mage', 'priest', 'hunter', 'monk'];
function team(lv = 12, jobs = JOBS6) {
  return jobs.map((j, i) => { const s = D.statsOf({ j, lv }, true); return { id: 'u' + i, name: (i + 1) + '番', j, lk: 'a', lv, atk: s.atk, def: s.def, mhp: s.mhp, sr: {}, ld: null }; });
}

test('データ：6職業に技が10個ずつ、名前はランク3つ、効果の部品がある', () => {
  assert.deepEqual(D.JOB_KEYS.sort(), Object.keys(D.JOBS).sort());
  for (const j of D.JOB_KEYS) {
    const sk = D.JOBS[j].sk; assert.equal(sk.length, 10, j);
    sk.forEach((s, i) => { assert.equal(s.lv, D.LEARN[i], j + i); assert.equal(s.names.length, 3); assert.ok(s.mp >= 1 && s.mp <= 5); });
    assert.equal(sk.filter(s => s.ult).length, 2, j + 'の必殺技は2つ');
  }
  assert.equal(D.UNITS.length, 12);
  D.UNITS.forEach(u => { assert.equal(u.z.length, 6); assert.equal(u.guards.length, 4); [...u.z, ...u.guards, u.boss].forEach(e => assert.ok(D.ELEM[e.t], u.id + e.n)); });
  assert.equal(D.skillName('summoner', 0, 1, 'water'), 'アクアボール');
});

test('レベル：100＋50×Lv（650で頭打ち）、SPも数える', () => {
  assert.equal(D.expToNext(1), 150); assert.equal(D.expToNext(11), 650); assert.equal(D.expToNext(30), 650);
  const c = { lv: 1, exp: 0, sp: 0, spt: 0 }; const up = D.addExp(c, 150 + 200 + 10);
  assert.equal(up, 2); assert.equal(c.lv, 3); assert.equal(c.exp, 10); assert.equal(c.sp, 2); assert.equal(c.spt, 2);
});

test('ランクアップ：SPで名前が変わる・覚えていない技は上げられない・使った分を数える', () => {
  const c = { j: 'warrior', lv: 3, sp: 5, spt: 5, sr: {} };
  assert.equal(D.canRankUp(c, 2), false, 'Lv5の技はまだ');
  assert.ok(D.rankUp(c, 0)); assert.equal(c.sp, 3); assert.equal(D.skillName('warrior', 0, D.rankOf(c, 0)), 'ダブルスラッシュ');
  assert.ok(D.rankUp(c, 1)); assert.equal(c.sp, 0);
  assert.equal(D.canRankUp(c, 0), false, 'SPが足りない');
  assert.equal(D.spUsed(c), 5);
  assert.equal(c.sp + D.spUsed(c), c.spt);
});

test('第1版のキャラを移す：振っていたポイントを返す', () => {
  const c = { j: 'priest', lv: 7, exp: 20, sp: 2, sk: { 0: 1, 1: 3, 2: 1 } };
  assert.ok(D.migrateChar(c));
  assert.equal(c.sk, undefined); assert.equal(c.spt, 6); assert.equal(c.sp, 6); assert.deepEqual(c.sr, {});
  assert.equal(D.migrateChar(c), false, '2回目は何もしない');
});

test('持っていく技：覚えた技から4つ＋必殺技1つ', () => {
  assert.deepEqual(D.loadoutOf({ j: 'mage', lv: 1 }), { a: [0], u: -1 });
  assert.deepEqual(D.loadoutOf({ j: 'mage', lv: 12 }), { a: [0, 1, 2, 3], u: 4 });
  assert.deepEqual(D.loadoutOf({ j: 'mage', lv: 40, ld: { a: [9, 8, 6, 5, 1], u: 9 } }), { a: [8, 6, 5, 1], u: 9 }, '必殺技は通常の枠に入れない');
});

test('地図：大きさがそろい、入口から番人の前まで歩ける。扉は群れ2回で開く', () => {
  const m = E.buildMap(); m.g.forEach(r => assert.equal(r.length, m.w));
  const G = E.newGroup({ unit: D.UNITS[1], mem: team() }); G.mobs = [];
  E.moveTo(G, G.map.guard[0] - 1, G.map.guard[1]); assert.equal(G.path.length, 0, '扉が閉まっている');
  G.wins = 2; E.moveTo(G, G.map.guard[0], G.map.guard[1]); assert.ok(G.path.length > 20);
  for (let i = 0; i < 400 && G.ph === 'explore'; i++) E.step(G, .25);
  for (let i = 0; i < 10 && G.ph === 'enc'; i++) E.step(G, .25);
  assert.equal(G.ph, 'battle'); assert.equal(G.kind, 'guard'); assert.equal(G.foes[0].n, 'ルーペオン');
});

test('技60個：どれを使っても止まらない', () => {
  for (const j of D.JOB_KEYS) for (let i = 0; i < 10; i++) {
    const mem = team(40, [j, 'warrior', 'priest']); mem[0].ld = { a: [i], u: i };
    const G = E.newGroup({ unit: D.UNITS[i % 12], mem }); E.startBattle(G, i % 3 === 0 ? 'boss' : 'zako');
    G.mem.u0.mp = 6; G.mem.u1.dn = 1;
    assert.ok(E.skill(G, 'u0', i), j + i);
    for (let k = 0; k < 20; k++) E.step(G, .5);
    E.view(G);
  }
});

test('苦手な精霊で2倍・ボスは手下を呼んでバリア・全滅したら入口から', () => {
  const G = E.newGroup({ unit: D.UNITS[0], mem: team(12, ['summoner']) }); E.startBattle(G, 'boss');
  const f = G.foes[0]; f.hp = f.mx * .69; E.step(G, .5);
  assert.equal(G.foes.length, 3); assert.equal(f.barrier, true);
  const before = f.hp; G.mem.u0.tg = 0; E.answer(G, 'u0', true); assert.equal(f.hp, before, 'バリアで通らない');
  G.foes.slice(1).forEach(x => { x.hp = 0; }); G.mem.u0.tg = 1; E.answer(G, 'u0', true);
  // 全滅
  const G2 = E.newGroup({ unit: D.UNITS[0], mem: team(1, ['mage']) }); E.startBattle(G2, 'zako');
  G2.mem.u0.hp = 1; G2.foes[0].atk = 0; G2.foes[0].aim = 'u0'; G2.foes.slice(1).forEach(x => { x.atk = 99; });
  E.step(G2, .5); assert.equal(G2.ph, 'result');
  for (let i = 0; i < 10; i++) E.step(G2, .5);
  assert.equal(G2.ph, 'explore'); assert.deepEqual(G2.pos, G2.map.start);
});

test('止めて続きから：戦闘の途中の敵のHPが残る', () => {
  const G = E.newGroup({ unit: D.UNITS[4], mem: team(), fl: 3, keys: 2 }); E.startBattle(G, 'guard'); G.foes[0].hp = 33;
  const s = JSON.parse(JSON.stringify(E.snapshot(G)));
  const H = E.newGroup({ unit: D.UNITS[4], mem: team(), snap: s });
  assert.equal(H.ph, 'battle'); assert.equal(H.foes[0].hp, 33); assert.equal(H.fl, 3); assert.equal(H.keys, 2);
});

test('ボスの技：12体とも3つ、予兆のあとに効果。封印は正解1回で治り、その正解は攻撃にならない', () => {
  D.UNITS.forEach(u => assert.equal(D.BOSS_SK[u.id].length, 3, u.id));
  D.OBLION.forEach((o, i) => { assert.ok(o.sk.length >= 2, '形態' + (i + 1)); o.sk.forEach(s => assert.ok(D.BSK_SAY[s.k], s.n)); assert.ok(D.obTitle(i + 1).length <= 20); });
  const G = E.newGroup({ unit: D.UNITS[4], mem: team() }); E.startBattle(G, 'boss');   // イノチノキ：つるのしばり（封印）
  const f = G.foes[0]; f.skT = 0; f.atk = 99; f.last = 1; f.sk = [f.sk[0]];
  E.step(G, .5); assert.ok(f.cast, '予兆'); assert.ok(G.ev.some(e => e.t === 'cast' && /つるのしばり/.test(e.s)));
  for (let i = 0; i < 4; i++) E.step(G, .5);
  const sealed = G.order.filter(id => G.mem[id].seal > 0); assert.equal(sealed.length, 1);
  const m = G.mem[sealed[0]]; m.mp = 6; m.ld = { a: [0], u: -1 };
  assert.equal(E.skill(G, m.id, 0), false, '封印中は技が使えない');
  const hp0 = f.hp; E.answer(G, m.id, true); assert.equal(m.seal, 0); assert.equal(f.hp, hp0, '治すのに使った正解は攻撃にならない');
  E.answer(G, m.id, true); assert.ok(f.hp < hp0);
  assert.equal(E.view(G).mem[m.id].sl, 0);
});

test('ボスの技：毒では倒れない・守りでダメージ半分・回復は2回まで', () => {
  const G = E.newGroup({ unit: D.UNITS[1], mem: team() }); E.startBattle(G, 'boss');
  const f = G.foes[0]; f.atk = 999; f.skT = 999;
  G.order.forEach(id => { G.mem[id].hp = 1; G.mem[id].psn = 15; });
  for (let i = 0; i < 30; i++) E.step(G, .5);
  assert.ok(G.order.every(id => G.mem[id].hp === 1 && !G.mem[id].dn));
  f.ward = 15; const m = G.mem.u0; let sum = 0; for (let i = 0; i < 40; i++) { const h = f.hp; E.answer(G, 'u0', true); sum += h - f.hp; }
  f.ward = 0; let sum2 = 0; for (let i = 0; i < 40; i++) { const h = f.hp; E.answer(G, 'u0', true); sum2 += h - f.hp; }
  assert.ok(sum < sum2 * .7, '守りの間はダメージが減る');
  const H = E.newGroup({ unit: D.UNITS[0], mem: team() }); E.startBattle(H, 'boss');   // アルケミラ：エリクサー（回復・後半）
  const b = H.foes[0]; b.atk = 999; H.summoned = true; b.charged = true; b.hp = b.mx * .3; b.sk = [b.sk[2]];
  for (let k = 0; k < 5; k++) { b.skT = 0; b.last = -1; E.step(H, .5); E.step(H, 2.5); b.hp = b.mx * .3; }
  assert.equal(b.heals, 2);
});

test('オブリオン：クラスで1体のHP・班ごとに攻撃・全滅は休んで復帰・倒すと全班が勝ち', () => {
  const O = E.newOblion(3, 1000);
  const A = E.newGroup({ unit: D.UNITS[0], mem: team() }), B = E.newGroup({ unit: D.UNITS[0], mem: team().map(m => ({ ...m, id: 'b' + m.id })) });
  E.startOblion(A, O); E.startOblion(B, O);
  E.answer(A, 'u0', true); const afterA = O.hp; assert.ok(afterA < 1000); assert.equal(B.foes[0].hp, afterA, 'HPは全班で同じ');
  assert.equal(B.foes[0].n, '忘却の王オブリオン'); assert.equal(A.foes.length, 1, '手下はよばない');
  assert.equal(E.obElem(A), 'wind'); O.hp = 600; E.obTick(O, .5); assert.equal(E.obElem(A), 'water', 'HPが減るとタイプが変わる');
  O.hp = 300; E.obTick(O, .5); assert.equal(E.obElem(B), 'earth');
  // 技は全班いっせい
  O.skT = 0; O.last = 0; O.sk = [D.OBLION[2].sk[1]]; E.obTick(O, .5); assert.ok(A.ev.some(e => e.t === 'cast') && B.ev.some(e => e.t === 'cast'));
  for (let i = 0; i < 4; i++) E.obTick(O, .5);
  assert.ok(A.order.some(id => A.mem[id].seal > 0) && B.order.some(id => B.mem[id].seal > 0));
  // 全滅：休んで、HP半分で戻る
  A.order.forEach(id => { A.mem[id].hp = 1; }); A.foes[0].atk = 0; A.foes[0].aim = null;
  for (let i = 0; i < 6 && A.ph === 'battle'; i++) { A.order.forEach(id => { A.mem[id].hp = 0; A.mem[id].dn = 1; }); E.step(A, .5); }
  assert.equal(A.ph, 'rest');
  for (let i = 0; i < 30 && A.ph === 'rest'; i++) E.step(A, .5);
  assert.equal(A.ph, 'battle'); assert.ok(A.order.every(id => !A.mem[id].dn && A.mem[id].hp === Math.round(A.mem[id].mx / 2)));
  // 倒す
  O.hp = 1; B.mem.bu0.tg = 0; B.mem.bu0.seal = 0; B.mem.bu0.psn = 0; E.answer(B, 'bu0', true); E.step(A, .5);
  assert.equal(B.ph, 'result'); assert.equal(A.ph, 'result'); assert.ok(A.obDown && B.obDown);
});

test('オブリオン：形態7は仮面が交代、形態9は班ごとにガードで色が変わる。学期制で形態の順番', () => {
  const O = E.newOblion(7, 1000), G = E.newGroup({ unit: D.UNITS[0], mem: team() }); E.startOblion(G, O);
  assert.equal(E.obElem(G), 'fire'); for (let i = 0; i < 41; i++) E.obTick(O, .5); assert.equal(E.obElem(G), 'water');
  const O9 = E.newOblion(9, 5000), P = E.newGroup({ unit: D.UNITS[0], mem: team() }), Q = E.newGroup({ unit: D.UNITS[0], mem: team().map(m => ({ ...m, id: 'q' + m.id })) });
  E.startOblion(P, O9); E.startOblion(Q, O9);
  const q0 = E.obElem(Q), p0 = E.obElem(P); P.foes[0].chg = 10; for (let i = 0; i < 4; i++) E.answer(P, 'u' + i, true);
  assert.notEqual(E.obElem(P), p0, 'ガード成功で色が変わる'); assert.equal(E.obElem(Q), q0, 'ほかの班は変わらない');
  assert.equal(D.obNext(1, 3), 2); assert.equal(D.obNext(1, 2), 3); assert.equal(D.obNext(9, 3), 0);
  assert.equal(D.obFirst(3, 3), 7); assert.equal(D.obFirst(3, 2), 7); assert.equal(D.obFirst(2, 2), 4); assert.equal(D.obFirst(1, 2), 1);
});

/* ---------------- 2026-11-13 追加：小物8種類・一列で歩く・持ち物・オブリオンのゴールド・物語・地図 */
test('地図：小物は8種類とも置いてあり、置いたあとも入口からどの湧き場所・番人にも歩ける', () => {
  const m = E.buildMap(), seen = new Set(); m.g.forEach(r => r.forEach(c => { if (/[1-8]/.test(c)) seen.add(c); }));
  assert.deepEqual([...seen].sort(), ['1', '2', '3', '4', '5', '6', '7', '8']);
  const G = E.newGroup({ unit: D.UNITS[1], mem: team() }); G.wins = 2;
  const spots = G.mobs.map(o => [o.x, o.y]); G.mobs = [];
  spots.concat([G.map.guard]).forEach(p => { E.moveTo(G, p[0], p[1]); assert.ok(G.path.length > 0, 'マス ' + p); });
});

test('探索：班員はリーダーの通ったマスを一列でついて歩く（人数−1まで・入口にもどると列は消える）', () => {
  const G = E.newGroup({ unit: D.UNITS[1], mem: team(12, ['warrior', 'mage', 'priest']) }); G.mobs = [];
  assert.deepEqual(E.view(G).tr, []);
  const s = G.map.start;
  E.moveTo(G, s[0] + 4, s[1]); for (let i = 0; i < 40; i++) E.step(G, .25);
  assert.deepEqual(G.pos, [s[0] + 4, s[1]]);
  const v = E.view(G);
  assert.deepEqual(v.tr, [[s[0] + 3, s[1], 'right'], [s[0] + 2, s[1], 'right']], '3人班なら後ろに2人');
  // 全滅 → 入口から。列も消える
  E.startBattle(G, 'zako'); G.order.forEach(id => { G.mem[id].hp = 0; G.mem[id].dn = 1; });
  for (let i = 0; i < 12 && G.ph !== 'explore'; i++) E.step(G, .5);
  assert.equal(G.ph, 'explore'); assert.deepEqual(E.view(G).tr, []);
});

test('持ち物：回復系を1つ持っていける。戦闘中に1回だけ使えて、効果が出る', () => {
  assert.ok(D.isCarry('potion') && D.isCarry('ether3')); assert.equal(D.isCarry('wing'), false); assert.equal(D.isCarry('x'), false);
  assert.deepEqual(D.carryList({ inv: { potion: 2, wing: 3, ether2: 1, potion3: 0 } }), ['potion', 'ether2']);
  const mem = team(12, ['warrior', 'mage', 'priest']); mem[0].it = 'potion'; mem[1].it = 'ether'; mem[2].it = 'wing';
  const G = E.newGroup({ unit: D.UNITS[0], mem });
  assert.equal(G.mem.u2.it, '', '帰還の羽は持っていけない');
  assert.equal(E.useItem(G, 'u0'), false, '探索中は使えない');
  E.startBattle(G, 'zako');
  assert.equal(E.view(G).mem.u0.it, 'potion');
  G.mem.u0.hp = 5; assert.ok(E.useItem(G, 'u0')); assert.equal(G.mem.u0.hp, 25);
  assert.ok(G.ev.some(e => e.t === 'item' && e.who === 'u0' && /回復のしずく/.test(e.s)));
  assert.equal(E.useItem(G, 'u0'), false, '2回目は使えない'); assert.equal(E.view(G).mem.u0.it, '', '使ったらボタンが消える');
  G.mem.u1.mp = 5; assert.ok(E.useItem(G, 'u1')); assert.equal(G.mem.u1.mp, G.mem.u1.mm, 'MPは上限まで');
  assert.equal(E.useItem(G, 'u2'), false);
  const H = E.newGroup({ unit: D.UNITS[0], mem: team(12, ['warrior']).map(m => ({ ...m, it: 'potion3' })) }); E.startBattle(H, 'zako');
  H.mem.u0.hp = 1; H.mem.u0.dn = 1; assert.equal(E.useItem(H, 'u0'), false, 'たおれているときは使えない');
  H.mem.u0.dn = 0; assert.ok(E.useItem(H, 'u0')); assert.equal(H.mem.u0.hp, H.mem.u0.mx, 'ひかりのしずくは全回復');
});

test('オブリオンを倒したときのゴールドは学年で決まる（100・190・300）', () => {
  assert.deepEqual([1, 2, 3].map(g => D.goldOf('ob', g)), [100, 190, 300]);
  assert.equal(D.REWARD.ob.gold, D.goldOf('ob', 1));
});

test('新しいキャラ：学年の目安のレベルから（2年 Lv16・3年 Lv30、SPは Lv−1）', () => {
  assert.deepEqual(D.newChar('あ', 'mage', 'a', 1), { n: 'あ', j: 'mage', lk: 'a', lv: 1, exp: 0, gold: 0, sp: 0, spt: 0 });
  const c2 = D.newChar('い', 'monk', 'b', 2), c3 = D.newChar('う', 'priest', 'a', 3);
  assert.equal(c2.lv, 16); assert.equal(c2.sp, 15); assert.equal(c2.spt, 15); assert.equal(c3.lv, 30); assert.equal(c3.spt, 29);
  assert.equal(c3.sp + D.spUsed(c3), c3.spt);
});

test('物語の場面：12単元・9形態・3学年ぶんの文があり、{町}などが入れかわる', () => {
  D.UNITS.forEach(u => {
    const p = D.storyBoss(u, 'ひかりの町', 4);
    assert.ok(D.STORY.boss[u.id], u.id); assert.ok(!/[{}]/.test(p.s), u.id);
    assert.ok(p.s.endsWith('「' + u.unit + 'の知識」がひかりの町にもどってきた。――噴水に水が戻った。'), u.id);
    assert.equal(p.img, 'img/rikaria/town/stage-4.webp');
  });
  for (let k = 1; k <= 9; k++) for (const w of ['b', 'a']) { const p = D.storyOb(k, w, 'ひかりの町'); assert.ok(p.s.length > 5 && !/[{}]/.test(p.s)); assert.equal(p.img, D.oblionImg(k)); assert.equal(p.h, D.OBLION[k - 1].n); }
  assert.ok(D.storyOb(5, 'a', 'ひかりの町').s.includes('ひかりの町へ降りそそいだ'));
  [1, 2, 3].forEach(g => { const p = D.storyOpen(g, ''); assert.ok(p.s.includes(D.TOWN_DEFAULT) && !/[{}]/.test(p.s)); assert.equal(p.img, D.townImg(D.townStart(g))); });
  const e = D.storyEnding('ひかりの町'); assert.equal(e.length, 3); assert.ok(e[0].s.includes('ひかりの町の人々')); e.forEach(p => assert.ok(!/[{}]/.test(p.s)));
  assert.equal(D.storyBoss(D.UNITS[0], '', 99).img, D.townImg(D.TOWN_MAX), '段階は0〜12におさめる');
});

test('町の名前：前後の空白を取り、12文字まで。空なら「ルーメンの村」', () => {
  assert.equal(D.townName('  ひかりの町 '), 'ひかりの町'); assert.equal(D.townName(''), D.TOWN_DEFAULT); assert.equal(D.townName('   '), D.TOWN_DEFAULT); assert.equal(D.townName(null), D.TOWN_DEFAULT);
  assert.equal(Array.from(D.townName('あいうえおかきくけこさしすせそ')).length, 12);
});

test('冒険の地図：学年ごとに4単元の場所があり、絵の中におさまる', () => {
  [1, 2, 3].forEach(g => {
    const M = D.advMap(g), us = D.unitsOf(g); assert.equal(us.length, 4);
    assert.deepEqual(Object.keys(M.at).sort(), us.map(u => u.id).sort());
    Object.values(M.at).concat([M.town, M.castle]).forEach(p => { assert.ok(p[0] >= 5 && p[0] <= 95 && p[1] >= 5 && p[1] <= 95); });
  });
});

/* ---------------- 試算：正答率70%・1問6〜14秒・5人班（技も使う） */
function sim(kind, rate, runs = 200) {
  let tsum = 0, wipes = 0;
  for (let r = 0; r < runs; r++) {
    const G = E.newGroup({ unit: D.UNITS[r % 12], mem: team(12) }); E.startBattle(G, kind);
    const next = {}; G.order.forEach(id => { next[id] = 2 + Math.random() * 6; });
    let t = 0;
    while (G.ph === 'battle' && t < 900) {
      t += .5; E.step(G, .5);
      for (const id of G.order) {
        next[id] -= .5; if (next[id] > 0 || G.ph !== 'battle') continue;
        next[id] = 6 + Math.random() * 8;
        E.answer(G, id, Math.random() < rate);
        const m = G.mem[id];
        if (G.ph === 'battle' && !m.dn) { const can = m.ld.a.concat(m.ld.u >= 0 ? [m.ld.u] : []).filter(i => D.JOBS[m.j].sk[i].mp <= m.mp); if (can.length && Math.random() < .5) E.skill(G, id, can[can.length - 1]); }
      }
    }
    if (G.wiped || G.ev.some(e => e.t === 'wipe')) wipes++; else tsum += t;
  }
  return { sec: Math.round(tsum / Math.max(1, runs - wipes)), wipe: Math.round(100 * wipes / runs) };
}
test('試算（表示だけ。方向性 8.5 と比べる）', () => {
  const out = {};
  for (const k of ['zako', 'guard', 'boss']) for (const r of [.5, .7, .9]) out[k + ' ' + r * 100 + '%'] = sim(k, r, k === 'boss' ? 120 : 200);
  console.table(out);
});
