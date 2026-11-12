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
