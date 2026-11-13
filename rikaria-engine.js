/*
 * リカリア・チーム戦のエンジン（1つの班の、探索と戦闘の計算）。画面も通信も持たない。
 * 先生のPC（rikaria-host.html）が班ごとに1つ持ち、0.5秒ごとに step() で進める。生徒の入力は answer / skill / target / moveTo などで入れる。
 * 生徒の画面には view() の中身を送る。node で単体テストできる（tests/rikaria-engine.test.mjs）。
 */
import { goldOf, JOBS, N, REWARD, RANK_POW, RANK_SEC, MP_MAX, lvMult, weakOf, ELEMS, ELEM, skillName, rankOf, loadoutOf,
  zakoImg, guardImg, bossImg, bossTitle, BOSS_SK, BSK_SAY, OBLION, oblionImg, ITEMS, isCarry } from './rikaria-data.js';

var rnd = function (a) { return a[Math.floor(Math.random() * a.length)]; };
var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

/* ------------------------------------------------------------ ダンジョン（# 壁 k 床 c じゅうたん D 扉 < 入口 G 番人。数字1〜8は小物：8種類とも置く） */
var LAYOUT = [
  '####################################',
  '####################################',
  '###########81k1k1k1k2###############',
  '###########kkkkkkkkkkkk#############',
  '###########kkkkkkkkkkkk#############',
  '###########k3kkkkkk3kkk#####8kkkkkk#',
  '###########kkkkkccccckk#####kkkkkkk#',
  '###########kkkkkckkkkkk####kkkkkkkkk',
  'kkkkkkk8###4kkkkcck4kk#####kkkkkkkk#',
  'k5kkkkkk######kkcc##########kkkkkkk#',
  'kkkkkkkk######kkcc##########kkkkkkk#',
  '<cccccccccccccccccccccccccD...G...k#',
  'kkkkkkkk######kkcc##########kkkkkkk#',
  'kkkkkkkk###4kkkkcck4kk######kkkkkkk#',
  'kkkkkkk6###kkkkkcckkkk#####kkkkkkkk#',
  '###########kkkkkcc5kkk#####kkkkkkkk#',
  '###########kkkkkkkkk3kk#####kkkkkkk#',
  '###########k3kkkkkkkkkk#####kkkkkkk#',
  '###########kkkkkkkkkkkk#############',
  '###########6kk7kk8kk7k6#############',
  '####################################',
  '####################################'
];
export function buildMap() {
  var g = LAYOUT.map(function (r) { return r.split('').map(function (c) { return c === '.' ? 'k' : c; }); });
  var guard = null, door = null, start = null;
  g.forEach(function (r, y) { r.forEach(function (c, x) { if (c === 'G') { guard = [x, y]; r[x] = 'k'; } if (c === 'D') door = [x, y]; if (c === '<') start = [x + 1, y]; }); });
  return { g: g, guard: guard, door: door, start: start, w: g[0].length, h: g.length };
}
var BLOCK = '#12345678';
var TRAIL_MAX = 5;
var SPOTS = [[15, 4], [19, 3], [14, 16], [19, 17], [4, 9], [30, 7], [13, 8], [20, 14]];

/* ------------------------------------------------------------ 班をつくる
 * opt = { unit, lap, fl, keys, wins, mem: [{ id, name, j, lk, lv, atk, def, mhp, sr, ld, it }], snap? } */
export function newGroup(opt) {
  var G = { unit: opt.unit, lap: opt.lap || 0, fl: opt.fl || 1, keys: opt.keys || 0, wins: opt.wins || 0, map: buildMap(),
    ph: 'explore', t: 0, seq: 0, ev: [], mobs: [], foes: [], kind: null, mem: {}, order: [], guardCnt: 0, grp: {}, target: null, path: [], dir: 'right',
    stepT: 0, mobT: 0, encT: 0, resT: 0, cleared: false, bossDown: false, trail: [] };   /* trail＝リーダーが通ったマス（班員が一列でついて歩く） */
  G.pos = G.map.start.slice();
  opt.mem.forEach(function (m) { addMember(G, m); });
  spawnMobs(G);
  if (opt.snap) restore(G, opt.snap);
  return G;
}
export function addMember(G, m) {
  var J = JOBS[m.j] || JOBS.warrior;
  G.mem[m.id] = { id: m.id, name: m.name, j: JOBS[m.j] ? m.j : 'warrior', lk: m.lk, lv: m.lv || 1, atk: m.atk || J.atk, def: m.def != null ? m.def : J.def,
    mx: m.mhp || J.hp, hp: m.mhp || J.hp, mp: 0, mm: m.mmp || MP_MAX, cut: m.cut || 1, hx: m.healX || 1, cr: m.crit || 0, dn: 0, tg: 0, streak: 0, sr: m.sr || {}, ld: loadoutOf({ j: m.j, lv: m.lv, ld: m.ld }),
    elem: 'fire', mode: 'atk', nextCrit: 0, keep: 0, gs: null, counter: null, rw: { exp: 0, gold: 0, ok: 0, ans: 0, dmg: 0, heal: 0 }, here: true,
    it: isCarry(m.it) ? m.it : '', itUsed: false };   /* it＝持っていく持ち物（回復系を1つ。1回の授業で1回だけ使える） */
  if (G.order.indexOf(m.id) < 0) G.order.push(m.id);
}
export function setHere(G, id, here) { if (G.mem[id]) G.mem[id].here = !!here; }
function people(G) { return Math.max(1, G.order.filter(function (id) { return G.mem[id].here; }).length); }
function alive(G) { return G.order.map(function (id) { return G.mem[id]; }).filter(function (m) { return m.here && !m.dn; }); }
function present(G) { return G.order.map(function (id) { return G.mem[id]; }).filter(function (m) { return m.here; }); }
function emit(G, e) { e.q = ++G.seq; G.ev.push(e); if (G.ev.length > 40) G.ev.splice(0, G.ev.length - 40); }

/* ------------------------------------------------------------ 探索 */
function spawnMobs(G) {
  var n = 5, spots = SPOTS.slice().sort(function () { return Math.random() - .5; }).slice(0, n);
  G.mobs = spots.map(function (p) { return { x: p[0], y: p[1], z: Math.floor(Math.random() * 6) }; });
}
export function cell(G, x, y) { var r = G.map.g[y]; return r ? r[x] : undefined; }
export function blocked(G, x, y) {
  var c = cell(G, x, y); if (c === undefined || BLOCK.indexOf(c) >= 0 || c === '<') return true;
  if (c === 'D') return G.wins < N.need; return false;
}
/* リーダーが行き先を決める（クリック・矢印）。先生のPCが1歩ずつ進める */
export function moveTo(G, x, y) {
  if (G.ph !== 'explore') return;
  var W = G.map.w, prev = new Map(), k = function (a, b) { return b * W + a; }, q = [G.pos]; prev.set(k(G.pos[0], G.pos[1]), null);
  var goal = null;
  while (q.length) {
    var p = q.shift(); if (p[0] === x && p[1] === y) { goal = p; break; }
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var nx = p[0] + d[0], ny = p[1] + d[1]; if (prev.has(k(nx, ny)) || cell(G, nx, ny) === undefined) return;
      var isGoal = nx === x && ny === y, isMob = G.mobs.some(function (m) { return m.x === nx && m.y === ny; }), isGuard = nx === G.map.guard[0] && ny === G.map.guard[1];
      if (blocked(G, nx, ny) && !isGoal) return; if ((isMob || isGuard) && !isGoal) return;
      prev.set(k(nx, ny), p); q.push([nx, ny]);
    });
  }
  G.path = [];
  if (!goal) { if (cell(G, x, y) === 'D' && G.wins < N.need) emit(G, { t: 'say', s: '扉に鍵がかかっている。群れをあと ' + (N.need - G.wins) + '回 倒すと開く' }); return; }
  var cur = goal; while (cur && !(cur[0] === G.pos[0] && cur[1] === G.pos[1])) { G.path.unshift(cur); cur = prev.get(k(cur[0], cur[1])); }
}
export function stepDir(G, dx, dy) { G.path = [[G.pos[0] + dx, G.pos[1] + dy]]; }
function walk(G) {
  if (!G.path.length) return;
  var p = G.path.shift(), nx = p[0], ny = p[1];
  if (Math.abs(nx - G.pos[0]) + Math.abs(ny - G.pos[1]) !== 1) { G.path = []; return; }
  G.dir = nx > G.pos[0] ? 'right' : nx < G.pos[0] ? 'left' : ny > G.pos[1] ? 'down' : 'up';
  if (nx === G.map.guard[0] && ny === G.map.guard[1]) { G.path = []; encounter(G, 'guard'); return; }
  var mi = G.mobs.findIndex(function (m) { return m.x === nx && m.y === ny; });
  if (mi >= 0) { var mob = G.mobs.splice(mi, 1)[0]; G.path = []; encounter(G, 'zako', mob); return; }
  if (blocked(G, nx, ny)) { G.path = []; if (cell(G, nx, ny) === 'D') emit(G, { t: 'say', s: '扉に鍵がかかっている。群れをあと ' + (N.need - G.wins) + '回 倒すと開く' }); return; }
  G.trail.unshift([G.pos[0], G.pos[1], G.dir]); if (G.trail.length > TRAIL_MAX) G.trail.length = TRAIL_MAX;
  G.pos = [nx, ny]; emit(G, { t: 'move' });
}
function mobsWalk(G) {
  G.mobs.forEach(function (m) {
    if (Math.random() < .45) return;
    var d = rnd([[1, 0], [-1, 0], [0, 1], [0, -1]]), nx = m.x + d[0], ny = m.y + d[1];
    if (cell(G, nx, ny) !== 'k' || (nx === G.pos[0] && ny === G.pos[1]) || G.mobs.some(function (o) { return o !== m && o.x === nx && o.y === ny; })) return;
    if (nx > 26) return;   /* 番人の部屋には入らない */
    m.x = nx; m.y = ny;
  });
}
function encounter(G, kind, mob) { G.ph = 'enc'; G.encT = .9; G.encKind = kind; G.encMob = mob; emit(G, { t: 'enc', s: kind === 'guard' ? '番人の部屋に入った！' : 'ワスレモノとぶつかった！' }); }

/* ------------------------------------------------------------ 戦闘のはじまり */
function foe(G, kind, n, t, img, hpBase, extra) {
  var hp = Math.round(hpBase * people(G) * (G.lap > 0 ? N.lapHp : 1));
  return Object.assign({ n: n, t: t, img: img, hp: hp, mx: hp, chg: 0, charged: false, atk: 3 + Math.random() * 3, aim: null, stun: 0, dots: [], kind: kind }, extra || {});
}
export function startBattle(G, kind, mob) {
  var U = G.unit; G.kind = kind; G.ph = 'battle'; G.guardCnt = 0; G.summoned = false; G.bt = 0;
  if (kind === 'boss') G.foes = [foe(G, 'boss', U.boss.n, U.boss.t, bossImg(U), N.hp.boss, bossExtra(BOSS_SK[U.id]))];
  else if (kind === 'guard') { var gd = U.guards[G.fl - 1] || U.guards[0]; G.foes = [foe(G, 'guard', gd.n, gd.t, guardImg(U, G.fl), N.hp.guard, { gd: 1 })]; }
  else {
    var n = 2 + (Math.random() < .5 ? 1 : 0), first = mob ? mob.z : Math.floor(Math.random() * 6); G.foes = [];
    for (var i = 0; i < n; i++) { var zi = i === 0 ? first : Math.floor(Math.random() * 6), z = U.z[zi]; G.foes.push(foe(G, 'zako', z.n, z.t, zakoImg(U, zi), N.hp.zako)); }
  }
  present(G).forEach(function (m) { m.tg = Math.floor(Math.random() * G.foes.length); });
  emit(G, { t: 'start', kind: kind, s: kind === 'boss' ? U.boss.n + ' があらわれた！' : kind === 'guard' ? '番人 ' + G.foes[0].n + ' があらわれた！' : 'ワスレモノが ' + G.foes.length + '体 あらわれた！' });
}
/* ------------------------------------------------------------ オブリオン（クラス全員で1体。HPと技・タイプは全班で共有し、攻撃を受けるのは班ごと）
 * 先生のPCが newOblion で1つ作り、各班に startOblion で入れる。0.5秒ごとに obTick(O) を1回、各班の step(G) をいつもどおり */
export function obHp(k, people, avgLv) { return Math.round(N.ob.hp * (N.ob.hpX[k - 1] || 1) * Math.max(1, people) * lvMult(avgLv || 1)); }
export function newOblion(k, mx, hp) {
  var D = OBLION[k - 1];
  var O = { k: k, n: D.n, t: D.t, sw: D.sw || '', ei: 0, swT: 0, mx: mx, hp: hp > 0 ? Math.min(hp, mx) : mx, sk: D.sk, skT: N.bsk.first, cast: null, heals: 0, ward: 0, rage: 0, last: -1, groups: [] };
  if (O.sw === 'hp') O.ei = O.hp > O.mx * 2 / 3 ? 0 : O.hp > O.mx / 3 ? 1 : 2;
  return O;
}
export function startOblion(G, O) {
  G.kind = 'oblion'; G.ph = 'battle'; G.guardCnt = 0; G.bt = 0; G.summoned = true; G.path = [];
  if (O.sw === 'guard') G.ob9 = rnd(ELEMS);
  var f = { n: O.n, img: oblionImg(O.k), chg: 0, charged: false, atk: 3 + Math.random() * 3, aim: null, stun: 0, dots: [], kind: 'boss', fin: 1, ob: O, sk: O.sk };
  ['hp', 'mx', 'ward', 'rage', 'heals', 'cast'].forEach(function (k) { Object.defineProperty(f, k, { get: function () { return O[k]; }, set: function (v) { O[k] = v; }, enumerable: true }); });
  Object.defineProperty(f, 't', { get: function () { return O.sw === 'guard' ? G.ob9 : O.t[O.ei]; }, enumerable: true });
  G.foes = [f]; present(G).forEach(function (m) { m.tg = 0; });
  if (O.groups.indexOf(G) < 0) O.groups.push(G);
  emit(G, { t: 'start', kind: 'oblion', s: O.n + ' があらわれた！' });
}
export function obTick(O, dt) {
  if (O.hp <= 0) return;
  if (O.ward > 0) O.ward = Math.max(0, O.ward - dt);
  if (O.rage > 0) O.rage = Math.max(0, O.rage - dt);
  var ei = O.ei;
  if (O.sw === 'hp') ei = O.hp > O.mx * 2 / 3 ? 0 : O.hp > O.mx / 3 ? 1 : 2;
  else if (O.sw === 'swap' || O.sw === 'spin') { O.swT += dt; if (O.swT >= N.ob[O.sw]) { O.swT = 0; ei = (O.ei + 1) % O.t.length; } }
  if (ei !== O.ei) {
    O.ei = ei; var e = O.t[ei];
    O.groups.forEach(function (G) { emit(G, { t: 'elem', ob: 1, s: (O.sw === 'swap' ? (ei ? '影の仮面' : '光の仮面') + 'が前に出た！ ' : 'オブリオンの色が変わった！ ') + ELEM[e].ic + ELEM[e].n + 'のタイプに' }); });
  }
  bossSkillTick(O, dt, O.groups);
}
/* いまのタイプ（班ごと。形態9は班によってちがう） */
export function obElem(G) { var f = G.foes[0]; return f && f.ob ? f.t : null; }

function bossExtra(sk) { return { fin: 1, barrier: false, sk: sk || [], skT: N.bsk.first, cast: null, heals: 0, ward: 0, rage: 0, last: -1 }; }
function aliveFoes(G) { return G.foes.filter(function (f) { return f.hp > 0; }); }
function kindKey(G, f) { return f && f.fin ? 'boss' : G.kind === 'guard' ? 'guard' : 'zako'; }

/* ------------------------------------------------------------ 生徒の入力 */
export function target(G, id, i) { var m = G.mem[id]; if (m && G.foes[i] && G.foes[i].hp > 0) { m.tg = i; } }
export function setElem(G, id, e) { var m = G.mem[id]; if (m && m.j === 'summoner' && ELEMS.indexOf(e) >= 0) m.elem = e; }
export function setMode(G, id, mode) { var m = G.mem[id]; if (m && m.j === 'priest') m.mode = mode === 'heal' ? 'heal' : 'atk'; }

/* 答えた（ok＝正解）。探索中は練習問題：正解でMP。戦闘中は攻撃 */
export function answer(G, id, ok) {
  var m = G.mem[id]; if (!m || !m.here) return;
  m.rw.ans++; if (ok) m.rw.ok++;
  if (G.ph !== 'battle') { if (ok) gainMp(G, m, 1); return; }
  if (m.dn) { if (ok) { m.dn++; if (m.dn > N.revive) { m.dn = 0; m.hp = Math.round(m.mx / 2); emit(G, { t: 'revive', who: id, s: m.name + ' が復活！' }); } } return; }
  if (!ok) { if (m.keep) m.keep = 0; else m.streak = 0; return; }
  if (m.seal > 0 || m.psn > 0) { m.seal = 0; m.psn = 0; guardTick(G); emit(G, { t: 'cure', who: id }); return; }   /* じゃまは正解1回で治る（その正解は攻撃にならない） */
  var J = JOBS[m.j]; m.streak = Math.min(J.streakMax || 99, m.streak + 1);
  gainMp(G, m, J.mpGain);
  guardTick(G);
  if (m.j === 'priest' && m.mode === 'heal') { healOne(G, m, J.healOnOk); return; }
  hit(G, m, { pow: 1 }, null, 0);
}
function gainMp(G, m, n) { var r = G.grp.mpRate > 0 ? .5 : 0; m.mp = Math.min(m.mm || MP_MAX, m.mp + n + r); }
/* 班で正解を数えて、強い攻撃のガード */
function guardTick(G) {
  var ch = aliveFoes(G).filter(function (f) { return f.chg > 0; })[0]; if (!ch) return;
  G.guardCnt++;
  if (G.guardCnt >= N.guardOk[kindKey(G, ch)]) {
    ch.chg = 0; G.guardCnt = 0; emit(G, { t: 'ban', s: 'ガード成功！ 強い攻撃を打ち消した' });
    if (ch.ob && ch.ob.sw === 'guard') { var cur = G.ob9; G.ob9 = rnd(ELEMS.filter(function (e) { return e !== cur; })); emit(G, { t: 'elem', s: 'オブリオンの色が変わった！ ' + ELEM[G.ob9].ic + ELEM[G.ob9].n + 'のタイプに' }); }
  }
}

/* 技を使う（i は技の番号 0〜9。持っていった技だけ） */
export function skill(G, id, i) {
  var m = G.mem[id]; if (!m || G.ph !== 'battle' || m.dn || m.seal > 0) return false;
  if (m.ld.a.indexOf(i) < 0 && m.ld.u !== i) return false;
  var s = JOBS[m.j].sk[i]; if (!s || m.mp < s.mp) return false;
  m.mp -= s.mp;
  var r = rankOf(m, i), P = RANK_POW[r], T = RANK_SEC[r], name = skillName(m.j, i, r, m.elem), fx = s.fx === 'elem' ? elemFx(m.elem) : s.fx, team = present(G);
  emit(G, { t: 'skill', who: id, n: name, fx: fx, ult: s.ult ? 1 : 0 });
  if (s.heal) team.forEach(function (o) { if (o.dn && s.revive) { o.dn = 0; o.hp = o.mx; m.rw.heal += o.mx; } else if (!o.dn) { var h = Math.min(o.mx - o.hp, Math.ceil(o.mx * s.heal * P * (m.hx || 1))); o.hp += h; m.rw.heal += h; } });
  if (s.revive && !s.heal) team.forEach(function (o) { if (o.dn) { o.dn = 0; o.hp = Math.round(o.mx / 2); } });
  if (s.healOne) healOne(G, m, s.healOne * P);
  if (s.selfHeal) { var sh = Math.min(m.mx - m.hp, Math.ceil(m.mx * s.selfHeal * P)); m.hp += sh; }
  if (s.guardSelf) m.gs = { cut: Math.min(.85, s.guardSelf.cut * (r ? 1.1 : 1)), t: s.guardSelf.sec * T };
  if (s.shield) G.grp.shield = { cut: Math.min(.8, s.shield.cut * (1 + .15 * r)), t: s.shield.sec * T };
  if (s.buff) G.grp.buff = { x: 1 + (s.buff.x - 1) * P, t: s.buff.sec * T };
  if (s.regen) G.grp.regen = { pct: s.regen.pct * P, t: s.regen.sec * T };
  if (s.mpRate) G.grp.mpRate = s.mpRate.sec * T;
  if (s.elemBuff) G.grp.elemBuff = { e: m.elem, t: s.elemBuff.sec * T };
  if (s.mpOne) { var lo = team.filter(function (o) { return o !== m && !o.dn; }).sort(function (a, b) { return a.mp - b.mp; })[0]; if (lo) lo.mp = Math.min(lo.mm || MP_MAX, lo.mp + Math.round(s.mpOne * P)); }
  if (s.mpAll) team.forEach(function (o) { if (o !== m && !o.dn) o.mp = Math.min(o.mm || MP_MAX, o.mp + s.mpAll + (r >= 2 ? 1 : 0)); });
  if (s.reveal) G.grp.reveal = 1;
  if (s.nextCrit) m.nextCrit = 1 + r;
  if (s.keep) m.keep = 1;
  if (s.counter) m.counter = { pow: s.counter.pow * P, t: s.counter.sec * T };
  if (s.trap) G.grp.trap = { stun: s.trap.stun * T, by: id };
  if (s.pow || s.hpPct) {
    var hits = s.hitsStreak ? Math.max(1, m.streak) : (s.hits || 1);
    for (var h2 = 0; h2 < hits; h2++) hit(G, m, s, P, h2, name, fx);
    if (s.useStreak) m.streak = 0;
  }
  return true;
}
/* 持ち物を使う（準備画面で選んだ回復系を1つ。戦闘中に1回だけ）。使えたら true。持ち物を減らすのは画面の側 */
export function useItem(G, id) {
  var m = G.mem[id]; if (!m || !m.here || G.ph !== 'battle' || m.dn || !m.it || m.itUsed) return false;
  var it = ITEMS[m.it]; if (!it) return false;
  m.itUsed = true;
  var h = it.hp ? Math.min(m.mx - m.hp, it.hp) : 0, p = it.mp ? Math.min((m.mm || MP_MAX) - m.mp, it.mp) : 0;
  m.hp += h; m.mp += p; m.rw.heal += h;
  emit(G, { t: 'item', who: id, k: m.it, d: h, s: m.name + ' は ' + it.n + ' を使った！' + (it.hp ? ' HP +' + h : '') + (it.mp ? ' MP +' + Math.floor(p) : '') });
  return true;
}
function elemFx(e) { return { fire: '02', water: '06', wind: '05', earth: '07' }[e] || '02'; }
function healOne(G, m, pct) {
  var lo = present(G).filter(function (o) { return !o.dn; }).sort(function (a, b) { return a.hp / a.mx - b.hp / b.mx; })[0]; if (!lo) return;
  var h = Math.min(lo.mx - lo.hp, Math.ceil(lo.mx * pct * (m.hx || 1))); lo.hp += h; m.rw.heal += h; emit(G, { t: 'heal', who: m.id, to: lo.id, d: h });
}

/* ダメージを与える。s＝技の効果（ふつうの攻撃は {pow:1}）。P＝ランクの強さ */
function hit(G, m, s, P, k, name, fx) {
  P = P || 1;
  var list = aliveFoes(G); if (!list.length) return;
  var tg = G.foes[m.tg]; if (!tg || tg.hp <= 0) { tg = list[0]; m.tg = G.foes.indexOf(tg); }
  var targets = s.all ? list : s.multi ? [tg].concat(list.filter(function (f) { return f !== tg; }).slice(0, s.multi - 1)) : [tg];
  var J = JOBS[m.j], buff = G.grp.buff ? G.grp.buff.x : 1;
  targets.forEach(function (f) {
    var base = N.base * (m.atk / 9) * lvMult(m.lv) * buff * (0.9 + Math.random() * .2);
    var d = s.hpPct ? Math.max(base, f.hp * s.hpPct * P) : base * (s.pow || 1) * P;
    if (s.streakX) d *= 1 + s.streakX * m.streak;
    if (J.streakAtk && !s.useStreak) d *= 1 + J.streakAtk * Math.min(m.streak, J.streakMax);
    if (s.useStreak) d *= 1 + s.useStreak * m.streak;
    if (s.bossX && (f.fin || f.gd)) d *= s.bossX;
    if (s.vsChg && f.chg > 0) d *= s.vsChg;
    /* 苦手な精霊 */
    var weak = weakOf(f.t), elemHit = null;
    if (m.j === 'summoner') elemHit = s.quad ? weak : s.dual ? (k % 2 ? ELEMS[(ELEMS.indexOf(m.elem) + 1) % 4] : m.elem) : m.elem;
    else if (G.grp.elemBuff) elemHit = G.grp.elemBuff.e;
    if (elemHit && elemHit === weak) d *= m.j === 'summoner' ? 2 : 1.5;
    /* 会心 */
    var critRate = s.crit ? 1 : m.nextCrit ? 1 : ((J.crit || .1) + (m.cr || 0)), crit = Math.random() < critRate;
    if (m.nextCrit && !s.ult) m.nextCrit = 0;
    if (crit) d *= s.ult ? 1.3 : 1.8;
    /* バリア */
    if (f.ward > 0) d *= N.bsk.wardCut;
    if (f.barrier) { if (!s.pierce) { emit(G, { t: 'hit', who: m.id, i: G.foes.indexOf(f), d: 0, guard: 1 }); return; } d *= .5 * (s.barrierX || 1); }
    d = Math.max(1, Math.round(d));
    f.hp = Math.max(0, f.hp - d); m.rw.dmg += d;
    if (s.stun) f.stun = Math.max(f.stun, s.stun * (P > 1 ? 1.2 : 1));
    if (s.slow) f.atk += s.slow;
    if (s.dot) f.dots.push({ d: N.base * s.dot.pow * P, t: s.dot.sec });
    if (s.cancel && f.chg > 0) { f.chg = 0; emit(G, { t: 'ban', s: 'ためを打ち消した！' }); }
    if (s.cancel && (f.ward > 0 || f.rage > 0)) { f.ward = 0; f.rage = 0; emit(G, { t: 'ban', s: f.n + ' の守り・怒りを打ち消した！' }); }
    if (J.delayChg && f.chg > 0) f.chg += J.delayChg;
    emit(G, { t: 'hit', who: m.id, i: G.foes.indexOf(f), d: d, crit: crit ? 1 : 0, weak: elemHit && elemHit === weak ? 1 : 0, n: name || null, fx: fx || null, ult: s.ult ? 1 : 0, j: m.j });
    afterHit(G, f);
  });
  if (!aliveFoes(G).length) win(G);
}
function afterHit(G, f) {
  if (f.hp > 0) return;
  if (f.chg > 0) { f.chg = 0; emit(G, { t: 'ban', s: 'ためていた ' + f.n + ' を倒した！' }); }
  f.aim = null;
  if (!f.fin && G.kind === 'boss' && !G.foes.some(function (x) { return !x.fin && x.hp > 0; })) { G.foes[0].barrier = false; emit(G, { t: 'ban', s: 'バリアが消えた！ いまだ、ボスをねらえ！' }); }
}

/* ------------------------------------------------------------ 時間で進める（dt 秒） */
export function step(G, dt) {
  G.t += dt;
  if (G.ph === 'explore') {
    G.stepT -= dt; if (G.stepT <= 0) { G.stepT = .22; walk(G); }
    G.mobT -= dt; if (G.mobT <= 0) { G.mobT = 1.1; mobsWalk(G); }
  } else if (G.ph === 'enc') {
    G.encT -= dt; if (G.encT <= 0) startBattle(G, G.encKind, G.encMob);
  } else if (G.ph === 'battle') battleTick(G, dt);
  else if (G.ph === 'result') { G.resT -= dt; if (G.resT <= 0) afterResult(G); }
  else if (G.ph === 'rest') { G.restT -= dt; if (G.restT <= 0) { present(G).forEach(function (m) { m.dn = 0; m.hp = Math.round(m.mx / 2); m.seal = 0; m.psn = 0; }); G.ph = 'battle'; emit(G, { t: 'ban', s: '立ち上がった！ もう一度オブリオンへ', big: 1 }); } }
  /* 班の効果の時間 */
  ['shield', 'buff', 'regen', 'elemBuff'].forEach(function (k) { if (G.grp[k]) { G.grp[k].t -= dt; if (G.grp[k].t <= 0) delete G.grp[k]; } });
  if (G.grp.mpRate > 0) { G.grp.mpRate -= dt; if (G.grp.mpRate <= 0) delete G.grp.mpRate; }
  present(G).forEach(function (m) {
    if (m.gs) { m.gs.t -= dt; if (m.gs.t <= 0) m.gs = null; }
    if (m.counter) { m.counter.t -= dt; if (m.counter.t <= 0) m.counter = null; }
    if (m.seal > 0) m.seal = Math.max(0, m.seal - dt);
    if (m.psn > 0) { m.psn = Math.max(0, m.psn - dt); m.pacc = (m.pacc || 0) + dt; if (m.pacc >= 2 && !m.dn && G.ph === 'battle') { m.pacc = 0; m.hp = Math.max(1, m.hp - N.bsk.psnDmg); } }   /* 毒では倒れない */
  });
}
function battleTick(G, dt) {
  G.bt += dt;
  if (G.grp.regen && G.ph === 'battle') { G.grp.regen.acc = (G.grp.regen.acc || 0) + dt; if (G.grp.regen.acc >= 2) { G.grp.regen.acc = 0; alive(G).forEach(function (o) { o.hp = Math.min(o.mx, o.hp + Math.ceil(o.mx * G.grp.regen.pct)); }); } }
  G.foes.forEach(function (f) {
    if (f.hp <= 0) return;
    f.dots.forEach(function (d) { d.t -= dt; d.acc = (d.acc || 0) + dt; if (d.acc >= 2) { d.acc = 0; var x = Math.max(1, Math.round(d.d)); f.hp = Math.max(0, f.hp - x); emit(G, { t: 'hit', i: G.foes.indexOf(f), d: x, dot: 1 }); afterHit(G, f); } });
    f.dots = f.dots.filter(function (d) { return d.t > 0; });
    if (f.hp <= 0) return;
    if (!f.ob) { if (f.ward > 0) f.ward = Math.max(0, f.ward - dt); if (f.rage > 0) f.rage = Math.max(0, f.rage - dt); }
    if (f.stun > 0) { f.stun -= dt; f.aim = null; if (f.cast && !f.ob) f.cast = null; return; }
    if (f.sk && !f.ob && bossSkillTick(f, dt, [G])) return;
    if (f.ob && f.ob.cast) { f.aim = null; return; }   /* オブリオンが技のかまえ中は、ふつうの攻撃をしない */
    /* ボス：HP70%で手下を2体よんでバリア（オブリオンはよばない） */
    if (f.fin && !f.ob && !G.summoned && f.hp < f.mx * .7) {
      G.summoned = true; f.barrier = true;
      [0, 1].forEach(function () { var zi = Math.floor(Math.random() * 6), z = G.unit.z[zi]; G.foes.push(foe(G, 'zako', z.n, z.t, zakoImg(G.unit, zi), N.hp.zako, { charged: true })); });
      present(G).forEach(function (m) { m.tg = 1 + Math.floor(Math.random() * 2); });
      emit(G, { t: 'summon', s: f.n + ' が手下をよんだ！ バリアをはった' }); return;
    }
    var kk = kindKey(G, f);
    /* HPが半分（ボスは40%）を切ったら強い攻撃をためる（同時にためるのは1体だけ） */
    if (!f.charged && f.hp < f.mx * (f.fin ? .4 : .5) && !f.barrier && !G.foes.some(function (x) { return x !== f && x.chg > 0 && x.hp > 0; })) {
      f.charged = true; f.chg = N.chgSec[kk]; G.guardCnt = 0; f.aim = null;
      emit(G, { t: 'ban', s: f.n + ' が 力をためている！（班で' + N.guardOk[kk] + '問正解でガード）' });
    }
    if (f.chg > 0) {
      f.chg -= dt;
      if (f.chg <= 0) { f.chg = 0; var dd = N.chg[kk] * (G.lap > 0 ? N.lapHit : 1) * obUp(f); alive(G).forEach(function (m) { hurt(G, m, dd, f); }); emit(G, { t: 'ban', s: f.n + ' の強い攻撃！ 全員にダメージ', big: 1 }); }
      return;
    }
    f.atk -= dt;
    if (f.atk <= 1.5 && !f.aim) { var w = rnd(alive(G)); if (w) { f.aim = w.id; emit(G, { t: 'aim', who: w.id, i: G.foes.indexOf(f) }); } }
    if (f.atk <= 0) {
      f.atk = (N.atk[kk] + Math.random() * 3) * (f.rage > 0 ? N.bsk.rageSpd : 1);
      var tgt = alive(G).filter(function (m) { return m.id === f.aim; })[0] || rnd(alive(G)); f.aim = null;
      if (!tgt) return;
      if (G.grp.trap) { f.stun = G.grp.trap.stun; delete G.grp.trap; emit(G, { t: 'ban', s: 'わなにかかった！ ' + f.n + ' が動けない' }); return; }
      hurt(G, tgt, hitOf(G, f), f);
      emit(G, { t: 'atk', who: tgt.id, i: G.foes.indexOf(f) });
      if (tgt.counter && !tgt.dn) { var cd = Math.max(1, Math.round(N.base * tgt.counter.pow)); f.hp = Math.max(0, f.hp - cd); tgt.rw.dmg += cd; emit(G, { t: 'hit', who: tgt.id, i: G.foes.indexOf(f), d: cd, n: 'カウンター' }); afterHit(G, f); }
    }
  });
  if (G.ph !== 'battle') return;
  if (!aliveFoes(G).length) { win(G); return; }
  if (!alive(G).length) wipe(G);
}
/* ふつうの攻撃1回のダメージ（怒り・オブリオンの形態で上がる） */
function obUp(f) { return f.ob ? 1 + N.ob.hitUp * (f.ob.k - 1) : 1; }
function hitOf(G, f) { return N.hit[kindKey(G, f)] * (G.lap > 0 ? N.lapHit : 1) * (f.rage > 0 ? N.bsk.rageX : 1) * obUp(f); }

/* ------------------------------------------------------------ ボスの技（単元のボスは班ごと、オブリオンは全班いっせい）
 * B＝技を持つもの（単元のボスの敵、またはオブリオンの共有の体 O）。Gs＝効果をかける班。戻り値 true＝この0.5秒は予兆で手が止まる */
function foeOf(G, B) { return G.foes.filter(function (f) { return f === B || f.ob === B; })[0]; }
function bossSkillTick(B, dt, Gs) {
  if (B.hp <= 0 || !B.sk.length) return false;
  var Gb = Gs.filter(function (G) { return G.ph === 'battle'; });
  if (B.cast) {
    B.cast.t -= dt;
    if (B.cast.t <= 0) { var s = B.sk[B.cast.i]; B.cast = null; Gb.forEach(function (G, k) { var f = foeOf(G, B); if (f) useBossSkill(G, f, s, k === 0); }); }
    return true;
  }
  if (!Gb.length || Gb.every(function (G) { var f = foeOf(G, B); return f && f.chg > 0; })) return false;   /* 強い攻撃をためている間は使わない */
  B.skT -= dt; if (B.skT > 0) return false;
  var mask = B.sw === 'swap' ? B.ei : -1;
  var ok = B.sk.map(function (s, i) { return i; }).filter(function (i) {
    var s = B.sk[i];
    if (s.late && B.hp >= B.mx * .5) return false;
    if (s.mask != null && s.mask !== mask) return false;
    if (s.k === 'heal' && (B.heals >= N.bsk.heals || B.hp > B.mx * .85)) return false;
    if ((s.k === 'ward' && B.ward > 0) || (s.k === 'rage' && B.rage > 0)) return false;
    return true;
  });
  if (ok.length > 1) ok = ok.filter(function (i) { return i !== B.last; });
  if (!ok.length) { B.skT = 5; return false; }
  var i = rnd(ok); B.last = i; B.skT = N.bsk.every * (.85 + Math.random() * .3); B.cast = { i: i, t: N.bsk.cast };
  Gb.forEach(function (G) { var f = foeOf(G, B); if (f) f.aim = null; emit(G, { t: 'cast', s: B.n + ' の「' + B.sk[i].n + '」！', k: B.sk[i].k, ob: B.sw !== undefined ? 1 : 0 }); });
  return true;
}
/* 技の効果を1つの班にかける。first＝ボス自身への効果（回復など）は、全班のうち1回だけ */
function useBossSkill(G, f, s, first) {
  var A = alive(G), hit1 = hitOf(G, f), who = '';
  if (s.k === 'all' || s.k === 'big') A.forEach(function (m) { hurt(G, m, hit1 * N.bsk[s.k], f); });
  else if (s.k === 'multi') { var t = rnd(A); if (t) { who = t.name + ' に'; for (var k = 0; k < N.bsk.multi && !t.dn; k++) hurt(G, t, hit1 * N.bsk.multiPow, f); } }
  else if (s.k === 'seal') { var c = A.filter(function (m) { return !(m.seal > 0); }).sort(function () { return Math.random() - .5; }).slice(0, s.n2 || 1); c.forEach(function (m) { m.seal = N.bsk.seal; }); if (c.length) who = c.map(function (m) { return m.name; }).join('・') + ' の'; }
  else if (s.k === 'poison') A.forEach(function (m) { m.psn = N.bsk.poison; m.pacc = 0; });
  else if (s.k === 'drain') { A.forEach(function (m) { m.mp = Math.max(0, m.mp - N.bsk.drain); }); if (first && !f.ob) f.hp = Math.min(f.mx, f.hp + Math.round(f.mx * N.bsk.drainHeal)); }   /* オブリオンはMP吸いで回復しない（クラス全体のHPが大きいため） */
  else if (s.k === 'heal') { if (first) { f.hp = Math.min(f.mx, f.hp + Math.round(f.mx * N.bsk.heal)); f.heals++; } }
  else if (s.k === 'ward') f.ward = N.bsk.ward;
  else if (s.k === 'rage') f.rage = N.bsk.rage;
  emit(G, { t: 'bsk', k: s.k, s: who + BSK_SAY[s.k], big: s.k === 'big' ? 1 : 0, ob: f.ob ? 1 : 0 });
}

function hurt(G, m, d, f) {
  var cut = (G.grp.shield ? G.grp.shield.cut : 0); if (m.gs) cut = Math.max(cut, m.gs.cut) + (G.grp.shield && m.gs ? .1 : 0);
  d = Math.max(1, Math.round(d * (1 - Math.min(.9, cut)) * (1 - .04 * m.def) * (m.cut || 1)));   /* 守り1につき4%へらす。防具の分も */
  m.hp = Math.max(0, m.hp - d);
  if (m.hp <= 0 && !m.dn) { m.dn = 1; m.streak = 0; m.seal = 0; m.psn = 0; emit(G, { t: 'down', who: m.id, s: m.name + ' がたおれた' }); }
}

/* ------------------------------------------------------------ 勝ち・全滅 */
/* ゴールドは学年の倍率をかける（goldOf） */
function give(G, r, kind) { var gd = kind ? goldOf(kind, G.unit && G.unit.g) : r.gold; present(G).forEach(function (m) { m.rw.exp += r.exp * (G.lap > 0 ? 1.3 : 1); m.rw.gold += gd; }); }
function win(G) {
  if (G.ph !== 'battle') return;
  G.ph = 'result'; G.resT = 3; G.grp.reveal = 0;
  if (G.kind === 'oblion') { G.resT = 1e9; G.obDown = true; emit(G, { t: 'clear', s: G.foes[0].n + ' をたおした！', ob: 1, big: 1 }); return; }
  if (G.kind === 'boss') {
    give(G, REWARD.boss, 'boss'); G.bossDown = true; G.resT = 8;
    emit(G, { t: 'clear', s: G.unit.boss.n + ' をたおした！', title: bossTitle(G.unit, G.lap) });
  } else if (G.kind === 'guard') {
    give(G, REWARD.guard, 'guard'); G.keys++;
    emit(G, { t: 'win', s: '番人をたおした！ 鍵を手に入れた 🔑', key: 1 });
  } else {
    give(G, REWARD.zako, 'zako'); G.wins++;
    emit(G, { t: 'win', s: '勝利！' + (G.wins === N.need ? '　番人の部屋の扉が開いた！' : '') });
  }
}
function wipe(G) {
  if (G.kind === 'oblion') { G.ph = 'rest'; G.restT = N.ob.rest; G.foes.forEach(function (f) { f.aim = null; f.chg = 0; }); emit(G, { t: 'wipe', s: '全滅…　' + N.ob.rest + '秒 休んで、HP半分で立ち上がる', big: 1 }); return; }
  G.ph = 'result'; G.resT = 3; G.wiped = true;
  present(G).forEach(function (m) { m.rw.exp = Math.round(m.rw.exp * REWARD.wipeExp); });
  emit(G, { t: 'wipe', s: '全滅…　この階の入口からやり直し（けいけんちが少し減る）', big: 1 });
}
function afterResult(G) {
  var lastKind = G.kind;
  G.foes = []; G.kind = null;
  present(G).forEach(function (m) { if (G.wiped) { m.hp = m.mx; m.dn = 0; } else if (!m.dn) m.hp = Math.min(m.mx, m.hp + Math.round(m.mx * .2)); m.streak = m.keep ? m.streak : m.streak; });
  if (G.wiped) { G.wiped = false; G.pos = G.map.start.slice(); G.trail = []; spawnMobs(G); return toExplore(G, ''); }
  if (lastKind === 'boss') {   /* 2周目へ */
    G.lap++; G.fl = 1; G.keys = 0; G.wins = 0; G.bossDown = false; G.pos = G.map.start.slice(); G.trail = []; spawnMobs(G);
    present(G).forEach(function (m) { m.hp = m.mx; m.dn = 0; });
    return toExplore(G, (G.lap + 1) + '周目：ワスレモノが強くなった');
  }
  if (lastKind === 'guard') {
    if (G.keys >= N.floors) { emit(G, { t: 'ban', s: '鍵が4つそろった！ ボスの間へ…', big: 1 }); G.fl = N.floors + 1; return startBattle(G, 'boss'); }
    G.fl++; G.wins = 0; G.pos = G.map.start.slice(); G.trail = []; spawnMobs(G);
    return toExplore(G, G.fl + '階へ進んだ');
  }
  if (!G.mobs.length) spawnMobs(G);
  toExplore(G, G.wins >= N.need ? '番人の部屋の扉が開いた！' : '');
}
function toExplore(G, msg) { G.ph = 'explore'; G.path = []; emit(G, { t: 'explore', s: msg }); }

/* ------------------------------------------------------------ 画面に送る中身（生徒・投影） */
export function view(G) {
  var mem = {};
  G.order.forEach(function (id) {
    var m = G.mem[id]; if (!m.here) return;
    mem[id] = { n: m.name, j: m.j, lk: m.lk, hp: m.hp, mx: m.mx, mp: Math.floor(m.mp), mm: m.mm, dn: m.dn, tg: m.tg, st: m.streak, el: m.elem, md: m.mode,
      gs: m.gs ? 1 : 0, ct: m.counter ? 1 : 0, nc: m.nextCrit ? 1 : 0, kp: m.keep, sl: m.seal > 0 ? 1 : 0, ps: m.psn > 0 ? 1 : 0, it: m.itUsed ? '' : (m.it || '') };
  });
  return {
    ph: G.ph, fl: G.fl, keys: G.keys, wins: G.wins, lap: G.lap, kind: G.kind, pos: G.pos, dir: G.dir,
    mobs: G.mobs.map(function (m) { return [m.x, m.y, m.z]; }),
    tr: G.trail.slice(0, Math.max(0, Math.min(TRAIL_MAX, Object.keys(mem).length - 1))),   /* 班員が立つマス（リーダーのすぐ後ろから順に）［x, y, 向き］ */
    foes: G.foes.map(function (f) { return { n: f.n, t: f.t, img: f.img, hp: f.hp, mx: f.mx, chg: Math.ceil(f.chg), br: f.barrier ? 1 : 0, aim: f.aim || '', st: f.stun > 0 ? 1 : 0, fin: f.fin ? 1 : 0, gd: f.gd ? 1 : 0, dot: f.dots.length ? 1 : 0,
      cs: f.cast ? f.sk[f.cast.i].n : '', wd: f.ward > 0 ? 1 : 0, rg: f.rage > 0 ? 1 : 0, ob: f.ob ? f.ob.k : 0 }; }),
    mem: mem, rt: G.ph === 'rest' ? Math.ceil(G.restT) : 0, gc: G.guardCnt,
    grp: { sh: G.grp.shield ? 1 : 0, bf: G.grp.buff ? 1 : 0, rg: G.grp.regen ? 1 : 0, eb: G.grp.elemBuff ? G.grp.elemBuff.e : '', rv: G.grp.reveal ? 1 : 0, tr: G.grp.trap ? 1 : 0, mr: G.grp.mpRate ? 1 : 0 },
    ev: G.ev.slice(-12)
  };
}

/* ------------------------------------------------------------ 止める・続きから */
export function snapshot(G) {
  var s = { fl: G.fl, keys: G.keys, wins: G.wins, lap: G.lap, pos: G.pos };
  if (G.ph === 'battle' || G.ph === 'enc') {
    s.kind = G.ph === 'enc' ? G.encKind : G.kind;
    if (G.ph === 'battle') s.foes = G.foes.map(function (f) { return { n: f.n, t: f.t, img: f.img, hp: f.hp, mx: f.mx, fin: f.fin ? 1 : 0, gd: f.gd ? 1 : 0, br: f.barrier ? 1 : 0, ch: f.charged ? 1 : 0 }; });
    s.sum = G.summoned ? 1 : 0;
  }
  s.hp = {}; G.order.forEach(function (id) { var m = G.mem[id]; s.hp[id] = [m.hp, m.mx]; });
  return s;
}
function restore(G, s) {
  G.fl = s.fl || G.fl; G.keys = s.keys || 0; G.wins = s.wins || 0; G.lap = s.lap || 0; if (s.pos) G.pos = s.pos.slice();
  if (s.kind) {
    if (s.foes && s.foes.length) {
      G.ph = 'battle'; G.kind = s.kind; G.summoned = !!s.sum; G.bt = 0; G.guardCnt = 0;
      G.foes = s.foes.map(function (f) { return { n: f.n, t: f.t, img: f.img, hp: f.hp, mx: f.mx, fin: f.fin, gd: f.gd, barrier: !!f.br, charged: !!f.ch, chg: 0, atk: 3 + Math.random() * 3, aim: null, stun: 0, dots: [] }; });
      emit(G, { t: 'start', kind: G.kind, s: '前回の戦闘の続きから！' });
    } else startBattle(G, s.kind);
  }
  if (s.hp) Object.keys(s.hp).forEach(function (id) { var m = G.mem[id]; if (m && s.hp[id]) { m.hp = Math.max(1, Math.min(m.mx, s.hp[id][0])); } });
}
/* その日の結果（先生のPCが保存する） */
export function results(G) {
  var out = {}; G.order.forEach(function (id) { var m = G.mem[id]; out[id] = { exp: Math.round(m.rw.exp + REWARD.ok * m.rw.ok), gold: Math.round(m.rw.gold), ok: m.rw.ok, ans: m.rw.ans, dmg: m.rw.dmg, heal: m.rw.heal }; });
  return out;
}
