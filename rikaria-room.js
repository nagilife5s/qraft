/*
 * リカリアのチーム戦の「部屋の進行役」（先生の画面 rikaria-host.html と、生徒が開く「なかまと冒険」quest-party.html で共通。2026-11-16）
 * 進行役の端末がエンジン（rikaria-engine.js）を動かし、生徒の端末とは Firebase の rooms/<参加コード>/ を通してやりとりする。
 *   出題と採点（qs・answers）／技（act）／リーダーの移動・ねらい（ctl）／持ち物の「使う」の合図（players/<uid>/it）
 * 正解は生徒の端末に送らない（採点は進行役の端末）。
 *
 * cx = { pin: ()=>参加コード, players: ()=>players, GR: {班→{G, lead…}}, P: {uid→出題の状態}, CH: {uid→キャラ}, pool: ()=>問題の配列, ended: ()=>終わったか, phase: ()=>state.phase }
 */
import { db, ref, set, shuffle, prepareQuestion, maskOf, weakQueue, qstOf, qstSet, qstNext } from './lib.js?v=20261121040000';
import { onChildAdded, onChildChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import * as E from './rikaria-engine.js?v=20261121040000';

export function makeRoomDriver(cx) {
  var ITU = {};
  function sendQ(u) {
    var players = cx.players(), GR = cx.GR;
    if (cx.ended() || !players[u] || !GR[players[u].gp]) return;
    var POOL = cx.pool(), p = cx.P[u] = cx.P[u] || { n: 0, queue: [] };
    var st = cx.qst ? cx.qst(u) : null;   /* 生徒ごとの問題の色（2026-11-19） */
    if (!p.queue || !p.queue.length) p.queue = weakQueue(POOL, st);
    var qi = p.queue.pop(), q = prepareQuestion(POOL[qi], true); q.qi = qi;
    p.n++; p.cur = q; p.wait = true;
    set(ref(db, 'rooms/' + cx.pin() + '/qs/' + u), { n: p.n, t: q.text, img: q.image || '', imgAlt: q.imageAlt || '', ch: q.choices, mu: q.multi ? 1 : 0, id: POOL[qi]._s != null ? POOL[qi]._s + '-' + (POOL[qi]._i + 1) : '', wk: qstOf(st, POOL[qi]) === 1 ? 1 : 0 });
  }
  function onAnsBucket(snap) { var n = Number(snap.key), v = snap.val() || {}; Object.keys(v).forEach(function (u) { var p = cx.P[u]; if (p && p.n === n && p.wait) grade(u, v[u]); }); }
  function grade(u, a) {
    var P = cx.P, players = cx.players(), p = P[u], q = p.cur, mask = a.c != null ? (1 << a.c) : a.m, cor = maskOf(q.correct), ok = mask === cor, R = cx.GR[players[u].gp];
    p.wait = false;
    var wasDown = R && R.G.mem[u] && R.G.mem[u].dn, mm = R && R.G.mem[u], wasBad = mm && !mm.dn && (mm.seal > 0 || mm.psn > 0) && R.G.ph === 'battle';
    if (R) E.answer(R.G, u, ok);
    var st = cx.qst ? cx.qst(u) : null, pq = cx.pool()[q.qi]; if (st && pq) qstSet(st, pq, qstNext(qstOf(st, pq), ok));
    set(ref(db, 'rooms/' + cx.pin() + '/qs/' + u + '/r'), { n: p.n, ok: ok ? 1 : 0, cor: cor, ex: q.ex || '', rv: wasDown ? 1 : 0, cu: ok && wasBad ? 1 : 0 });
    if (!ok) { var pos = Math.min(p.queue.length, 3 + Math.floor(Math.random() * 4)); p.queue.splice(p.queue.length - pos, 0, q.qi); }   /* まちがえた問題は数問あとに */
    setTimeout(function () { sendQ(u); }, ok ? 900 : q.ex ? 5000 : 2600);   /* まちがえて解説が出るときは、読めるように5秒 */
  }
  function onAct(snap) { var players = cx.players(), u = snap.key, v = snap.val() || {}, R = players[u] && cx.GR[players[u].gp]; if (!R || v.n == null) return; cx.P[u] = cx.P[u] || {}; if (cx.P[u].act === v.n) return; cx.P[u].act = v.n; E.skill(R.G, u, v.a); }
  function onCtl(snap) {
    var players = cx.players(), u = snap.key, v = snap.val() || {}, R = players[u] && cx.GR[players[u].gp]; if (!R) return;
    if (v.tg != null) E.target(R.G, u, v.tg);
    if (v.el) E.setElem(R.G, u, v.el);
    if (v.md) E.setMode(R.G, u, v.md);
    cx.P[u] = cx.P[u] || {};
    if (v.n != null && v.n !== cx.P[u].mv && R.lead === u) {
      cx.P[u].mv = v.n; var G = R.G, dx = v.x - G.pos[0], dy = v.y - G.pos[1];
      if (Math.abs(dx) + Math.abs(dy) === 1) E.stepDir(G, dx, dy); else E.moveTo(G, v.x, v.y);
    }
  }
  /* 生徒が「使う」を押すと players/<uid>/it が「!」で始まる名前になる（合図）。効果をかけて、キャラの持ち物を1つ減らす */
  function itemCheck() {
    if (cx.phase() !== 'run' || cx.ended()) return;
    var players = cx.players();
    Object.keys(players).forEach(function (u) {
      var p = players[u], R = cx.GR[p.gp]; if (!R || !R.G.mem[u] || ITU[u] || String(p.it || '').charAt(0) !== '!') return;
      var k = R.G.mem[u].it; if (!E.useItem(R.G, u)) return;   /* いまは使えない（探索中など）→ 次の0.5秒でもう一度 */
      ITU[u] = true; var ch = cx.CH[u];
      if (ch && ch.inv && ch.inv[k] > 0) { ch.inv = Object.assign({}, ch.inv); ch.inv[k]--; }
    });
  }
  /* 答え・技・ほうこうの書き込みを聞きはじめる（出発のとき1回） */
  function listen() {
    var b = 'rooms/' + cx.pin() + '/';
    onChildAdded(ref(db, b + 'answers'), onAnsBucket); onChildChanged(ref(db, b + 'answers'), onAnsBucket);
    onChildAdded(ref(db, b + 'act'), onAct); onChildChanged(ref(db, b + 'act'), onAct);
    onChildAdded(ref(db, b + 'ctl'), onCtl); onChildChanged(ref(db, b + 'ctl'), onCtl);
  }
  /* 1班ぶんを0.5秒進めて、生徒の端末に見せる形（gv）を書く。ボスをたおした周は bossLaps に足す */
  function stepGroup(n, dt) {
    var R = cx.GR[n], G = R.G, q0 = R.q0 != null ? R.q0 : 0;
    E.step(G, dt);
    G.ev.forEach(function (e) { if (e.q > q0 && e.t === 'clear') { R.bossLaps = R.bossLaps || []; R.bossLaps.push(G.lap); } });
    R.q0 = G.seq;
    var v = E.view(G); set(ref(db, 'rooms/' + cx.pin() + '/gv/' + n), v).catch(function () {});
    return { v: v, q0: q0 };
  }
  return { sendQ: sendQ, itemCheck: itemCheck, listen: listen, stepGroup: stepGroup };
}
