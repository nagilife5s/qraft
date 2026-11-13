/*
 * ジェットチェイスのミニゲーム（4種類）を、先生の画面・生徒の画面から同じ形で扱うための窓口（2026-11-12）。
 *   blast = ブラストタイム（bomb.js）  sky = スカイレース（skyrace.js）
 *   dig   = ほりほりトレジャー（dig.js） tug = チーム綱引き（tug.js）
 * 通信の置き場所はブラストタイムと同じ（Firebaseルールを変えずに使うため）：
 *   bgrp/<uid> = 自分の盤面と番号　bd/<盤面> = 盤面のデータ　bin/<uid> = { d: 0〜4, b: 回数 }（生徒の入力）
 *   スカイレースの b ＝ ブースト回数×10 ＋ 2つ目の向き（ななめ用）
 *   綱引きの b ＝ かけ声の番号×4 ＋ 判定（1=PERFECT 2=GOOD 3=MISS）。判定は生徒の端末で行う
 */
import * as B from './bomb.js?v=20261113170053';
import * as S from './skyrace.js?v=20261113170053';
import * as D from './dig.js?v=20261113170053';
import * as T from './tug.js?v=20261113170053';

export var KINDS = ['blast', 'sky', 'dig', 'tug'];
export var INFO = {
  blast: { name: 'ブラストタイム', em: '💣', btn: '💣', stat: 'ブラストタイム！ 小さいロボットをたおせ（アイテムで強くなる）',
    intro: '小さいロボット🤖を、爆弾でたおせ！ 矢印キー／WASDで動く・スペースで爆弾。爆発に巻き込まれると減点（5秒で復活）<br>たおすと、ときどきアイテム（🔥火力・💣爆弾の数・👟スピード）が落ちる！' },
  sky: { name: 'スカイレース', em: '✈️', btn: '💨', stat: 'スカイレース！ 雲・鳥・雷をよけて、星をあつめろ',
    intro: '星を早いもの勝ちで あつめよう（大きい星は＋5）。雲・鳥・雷に当たると、押し戻されて星を2つ落とす<br>矢印キー／WASDで飛ぶ（ななめもOK）・スペースでブースト（3回）' },
  dig: { name: 'ほりほりトレジャー', em: '⛏️', btn: '🔩', stat: 'ほりほりトレジャー！ 下にほるほど、古い時代の化石',
    intro: '新生代10点・中生代20点・古生代30点。キラッと光るところに化石がある。みんなが掘った道は、だれでも通れる<br>矢印キー／WASDで掘る・動く・スペースでドリル（3回）' },
  tug: { name: 'チーム綱引き', em: '💪', btn: '引く！', stat: 'チーム綱引き！ かけ声に合わせて、チームで引け',
    intro: '外の輪が内の輪に重なった瞬間に「引く」（スペースキーかボタン）。ぴったりでPERFECT。チームの7割がそろうと力が1.5倍<br>連打は空ぶりになって、逆に弱くなる！' }
};
/* つぎのミニゲーム：前回と同じものは続けて出さない */
export function pickKind(last, allow) {
  var list = (allow && allow.length ? allow : KINDS).filter(function (k) { return k !== last; });
  if (!list.length) list = allow && allow.length ? allow : KINDS;
  return list[Math.floor(Math.random() * list.length)];
}
/* 先生の画面で1枚の盤面を描くときの、横÷縦 */
export function aspect(kind) { return kind === 'blast' ? B.W / B.H : kind === 'sky' ? S.VW / S.VH : kind === 'dig' ? D.W / D.H : 20 / 11; }
var TUG_CPU = { names: ['校長', '教頭', '担任', '副担'], chars: [3, 9, 11, 15], accs: [5, 5, 5, 5] };

/* ====================================================================
   先生の画面
   ==================================================================== */
/* ids = 参加者の uid（シャッフル済み）。戻り値 st を hostStep / hostDraw に渡す */
export function hostCreate(kind, ids, seed) {
  var st = { kind: kind, boards: [], bgrp: {}, bd: {}, lastB: {}, rowCache: [] }, n = ids.length;
  if (kind === 'tug') {
    /* チームは6人まで。チームの数は偶数にして、2チームずつ対戦。1チームしかできないときは先生チームと */
    var tc = Math.max(2, Math.ceil(n / 6)); if (tc % 2 && n > tc) tc++;
    var teams = [], k = 0;
    for (var t = 0; t < tc; t++) { var size = Math.floor(n / tc) + (t < n % tc ? 1 : 0); teams.push(ids.slice(k, k + size)); k += size; }
    for (var mi = 0; mi * 2 < teams.length; mi++) {
      var a = teams[mi * 2], b = teams[mi * 2 + 1] || [];
      var cpuB = !b.length, mem = [a, cpuB ? [null, null, null, null] : b];
      var m = T.newMatch(mem[0].length, mem[1].length);
      st.boards.push({ g: m, members: mem, cpu: [false, cpuB], bots: mem.map(function (side) { return side.map(function () { return { skill: 90 + Math.random() * 120, rate: .6 + Math.random() * .2, at: null, for: -1 };   /* 先生チームは少し弱め */ }); }) });
      mem.forEach(function (side, s) { side.forEach(function (u, i) { if (u) st.bgrp[u] = mi + '.' + s + '.' + i; }); });
      st.bd[mi] = T.serialize(m);
    }
    return st;
  }
  var gc = Math.max(1, Math.ceil(n / 6)); k = 0;
  for (var g = 0; g < gc; g++) {
    var sz = Math.floor(n / gc) + (g < n % gc ? 1 : 0), members = ids.slice(k, k + sz); k += sz;
    var sd = seed + g * 31 + Math.floor(Math.random() * 999);
    var game = kind === 'blast' ? B.newGame(sz, sd) : kind === 'sky' ? S.newGame(sz, sd) : D.newGame(sz, sd);
    st.boards.push({ g: game, members: members });
    members.forEach(function (u, i) { st.bgrp[u] = g + '.' + i; });
    if (kind === 'dig') { var r = D.rows(game); st.rowCache[g] = r; st.bd[g] = { s: D.serialize(game), r: r }; }
    else st.bd[g] = kind === 'blast' ? B.serialize(game) : S.serialize(game);
  }
  return st;
}
/* ミニゲームが始まる前の、入力の回数を覚えておく（前のミニゲームの回数を、押したと数えないため） */
export function hostMarkInputs(st, binMap) { Object.keys(st.bgrp).forEach(function (u) { st.lastB[u] = (binMap[u] && binMap[u].b) || 0; }); }

/* 1回ぶん進める（0.1秒ごとに呼ぶ）。elapsed = 開始からのミリ秒（綱引きで使う）。
   戻り値 { upd: Firebase の bd に書く分, over: 全部終わった, ev: 音を鳴らすできごと } */
export function hostStep(st, binMap, elapsed) {
  var upd = {}, over = true, ev = [];
  st.boards.forEach(function (bd, gi) {
    var g = bd.g;
    if (st.kind === 'tug') {
      bd.members.forEach(function (side, s) {
        side.forEach(function (u, i) {
          if (!u) { cpuTap(bd, s, i, g); return; }
          var r = binMap[u] || {}, b = r.b || 0;
          if (b !== (st.lastB[u] || 0)) { st.lastB[u] = b; if (b > 0) T.setTap(g, s, i, Math.floor(b / 4), T.RES[b % 4] || 'm'); }
        });
      });
      T.stepTo(g, Math.max(0, elapsed));
      upd[gi] = T.serialize(g);
      g.ev.forEach(function (e) { if (e.k === 'sync') ev.push('sync'); if (e.k === 'end') ev.push('end'); });
    } else {
      var inputs = bd.members.map(function (u) {
        var r = binMap[u] || {}, b = r.b || 0, lb = st.lastB[u] || 0;
        if (st.kind === 'sky') { var pressed = Math.floor(b / 10) !== Math.floor(lb / 10); st.lastB[u] = b; return { d: r.d || 0, d2: b % 10, b: pressed }; }
        st.lastB[u] = b; return { d: r.d || 0, b: b > lb || (b < lb && b > 0) };
      });
      if (st.kind === 'blast') { B.step(g, inputs); upd[gi] = B.serialize(g); g.ev.forEach(function (e) { if (e.k === 'boom' || e.k === 'kill') ev.push(e.k); }); }
      else if (st.kind === 'sky') { S.step(g, inputs); upd[gi] = S.serialize(g); g.ev.forEach(function (e) { if (e.k === 'star' && e.v > 1) ev.push('bigstar'); if (e.k === 'hit') ev.push('hit'); }); }
      else {
        D.step(g, inputs); upd[gi + '/s'] = D.serialize(g);
        /* 地面は、変わった行だけ書きなおす */
        var dirty = {}; g.ev.forEach(function (e) { if (e.k === 'dug') dirty[e.y] = 1; if (e.k === 'find') ev.push('find'); });
        if (g.t % 20 === 0) for (var y = 0; y < D.H; y++) dirty[y] = 1;   /* 化石の埋めなおし（2秒ごと）も写す */
        Object.keys(dirty).forEach(function (y) { var s = D.rowStr(g, y); if (st.rowCache[gi][y] !== s) { st.rowCache[gi][y] = s; upd[gi + '/r/' + y] = s; } });
      }
    }
    if (!g.over) over = false;
  });
  return { upd: upd, over: over, ev: ev };
}
function cpuTap(bd, s, i, m) {
  var b = bd.bots[s][i];
  if (b.for !== m.nextBeat) { b.for = m.nextBeat; var e = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; b.at = Math.random() < b.rate ? m.nextBeat + e * b.skill : null; }
  if (b.at !== null && m.t >= b.at) { T.tap(m, s, i); b.at = null; }
}
/* 残り時間（秒） */
export function hostLeft(st, elapsed) {
  var g = st.boards[0] && st.boards[0].g; if (!g) return 0;
  if (st.kind === 'tug') return Math.max(0, (T.RULE.length - elapsed) / 1000);
  var len = st.kind === 'blast' ? B.RULE.length : st.kind === 'sky' ? S.RULE.length : D.RULE.length;
  return Math.max(0, (len - g.t) / 10);
}
/* uid ごとの点数 */
export function hostScores(st) {
  var out = {};
  st.boards.forEach(function (bd) {
    if (st.kind === 'tug') bd.members.forEach(function (side, s) { side.forEach(function (u, i) { if (u) out[u] = bd.g.teams[s].players[i].score; }); });
    else bd.members.forEach(function (u, i) { out[u] = bd.g.players[i].score; });
  });
  return out;
}
/* 盤面の見出し（グループ名や対戦カード） */
export function hostLabel(st, gi) {
  if (st.kind !== 'tug') return 'グループ ' + (gi + 1);
  var bd = st.boards[gi]; return 'チーム' + (gi * 2 + 1) + ' vs ' + (bd.cpu[1] ? '先生チーム' : 'チーム' + (gi * 2 + 2));
}
/* 盤面の下に出す点数（nick(u) で名前） */
export function hostLine(st, gi, nick) {
  var bd = st.boards[gi];
  if (st.kind === 'tug') { var m = bd.g; return m.over ? (m.win < 0 ? 'ひきわけ' : (m.win ? '右' : '左') + 'のチームの勝ち！') : '綱の位置 ' + (m.pos < 0 ? '◀ ' : m.pos > 0 ? '▶ ' : '') + Math.round(Math.abs(m.pos) * 100) + '%'; }
  return bd.members.map(function (u, i) { return nick(u) + ' ' + bd.g.players[i].score; }).join(' / ');
}
/* 先生の画面の1枚を描く。av(u) = parseAv の結果 {c, a} */
export function hostDraw(st, gi, cv, av, nick) {
  var bd = st.boards[gi], ctx = cv.getContext('2d');
  if (st.kind === 'tug') {
    var o = tugOpt(bd.members, bd.cpu, av, nick, st.kind, gi); ctx.setTransform(1, 0, 0, 1, 0, 0);
    T.draw(ctx, bd.g, cv.width, cv.height, o); return;
  }
  var chars = [], accs = [];
  bd.members.forEach(function (u) { var v = av(u); chars.push(v.c); accs.push(v.a); });
  if (st.kind === 'blast') B.draw(ctx, bd.g, cv.width, { chars: chars, accs: accs, emojis: [] });
  else if (st.kind === 'sky') S.draw(ctx, bd.g, cv.width, { chars: chars, accs: accs, a: Math.min(1, (performance.now() - (st.stepAt || 0)) / 100) });
  else D.draw(ctx, bd.g, cv.width, { chars: chars, accs: accs });
}
function tugOpt(mem, cpu, av, nick, kind, mi) {
  var o = { chars: [[], []], accs: [[], []], names: [[], []], labels: ['チーム' + (mi * 2 + 1), cpu[1] ? '先生チーム' : 'チーム' + (mi * 2 + 2)] };
  mem.forEach(function (side, s) { side.forEach(function (u, i) {
    if (!u) { o.chars[s].push(TUG_CPU.chars[i % 4]); o.accs[s].push(TUG_CPU.accs[i % 4]); o.names[s].push(TUG_CPU.names[i % 4]); return; }
    var v = av(u); o.chars[s].push(v.c); o.accs[s].push(v.a); o.names[s].push(nick(u));
  }); });
  return o;
}

/* ====================================================================
   生徒の画面
   ==================================================================== */
export function viewNew(kind) { return kind === 'blast' ? B.newView() : kind === 'sky' ? S.newView() : kind === 'dig' ? D.newView() : T.newView(); }
export function viewApply(kind, v, val) {
  if (!val) return;
  if (kind === 'blast') B.applyData(v, val);
  else if (kind === 'sky') { S.applyData(v, val); v.at = performance.now(); }
  else if (kind === 'dig') { if (val.r) D.applyRows(v, val.r); if (val.s) D.applyData(v, val.s); }
  else T.applyData(v, val);
}
/* 自分の盤面の仲間（uid の並び）。bgrp の書き方から読む */
export function myPlace(kind, bgrp, uid) {
  var s = bgrp[uid]; if (!s) return null; var t = s.split('.').map(Number);
  return kind === 'tug' ? { g: t[0], side: t[1], i: t[2] } : { g: t[0], i: t[1] };
}
export function boardMembers(kind, bgrp, pl) {
  var out = kind === 'tug' ? [[], []] : [];
  Object.keys(bgrp).forEach(function (u) {
    var t = String(bgrp[u]).split('.').map(Number); if (t[0] !== pl.g) return;
    if (kind === 'tug') out[t[1]][t[2]] = u; else out[t[1]] = u;
  });
  return out;
}
/* 生徒の画面のキャンバスの横÷縦 */
export function viewAspect(kind) { return kind === 'blast' ? B.W / B.H : kind === 'sky' ? S.VW / S.VH : kind === 'dig' ? DIG_COLS / DIG_ROWS : 20 / 11; }
var DIG_COLS = 16, DIG_ROWS = 11;
/* 生徒の画面を描く。o = { me, chars, accs, names, elapsed（綱引き） } */
export function viewDraw(kind, ctx, v, cv, o, mem, cpu, av, nick, pl) {
  if (kind === 'blast') { B.draw(ctx, v, cv.width, o); return; }
  if (kind === 'sky') { o.a = Math.min(1, (performance.now() - (v.at || 0)) / 100); S.draw(ctx, v, cv.width, o); return; }
  if (kind === 'dig') {
    var p = v.players[o.me] || { x: 0, y: 0 }, py = p.vy === undefined ? p.y : p.vy, px = p.vx === undefined ? p.x : p.vx;
    var wy = Math.max(0, Math.min(D.H - DIG_ROWS, py - DIG_ROWS * .45)), wx = Math.max(0, Math.min(D.W - DIG_COLS, px + .5 - DIG_COLS / 2));
    v.camY = v.camY === undefined ? wy : v.camY + (wy - v.camY) * .15; v.camX = v.camX === undefined ? wx : v.camX + (wx - v.camX) * .15;
    o.cam = v.camY; o.rows = DIG_ROWS; o.camX = v.camX; o.cols = DIG_COLS;
    D.draw(ctx, v, cv.width, o); return;
  }
  /* 綱引き：時刻は手元で進める（かけ声の輪をなめらかに出すため） */
  var t = o.elapsed; v.t = t;
  if (v.localBeat === undefined) { v.localBeat = 0; while (t >= T.beatAt(v.localBeat + 1)) v.localBeat++; }
  while (t >= T.beatAt(v.localBeat + 1)) { v.localBeat++; v.evq.push({ k: 'beat' }); }
  v.nextBeat = T.beatAt(v.localBeat + 1); v.beatNo = v.localBeat;
  var mm = [mem[0], cpu[1] && !mem[1].length ? [null, null, null, null] : mem[1]];
  var oo = tugOpt(mm, cpu, av, nick, kind, pl.g); oo.me = { side: pl.side, i: pl.i }; oo.big = true;
  ctx.setTransform(1, 0, 0, 1, 0, 0); T.draw(ctx, v, cv.width, cv.height, oo);
}
/* 綱引き：押した瞬間に手元で判定して、送る b を返す（同じかけ声に2回は送らない） */
export function tugPress(v, pl, elapsed) {
  var j = T.judge(elapsed); if (v.sent === j.beat) return null; v.sent = j.beat;
  var p = v.teams[pl.side] && v.teams[pl.side].players[pl.i];
  if (p) { p.fb = { res: j.res, t: elapsed }; p.pose = elapsed; }
  return j.beat * 4 + T.RES.indexOf(j.res);
}
export function viewScore(kind, v, pl) {
  if (!pl) return null;
  if (kind === 'tug') { var p = v.teams[pl.side] && v.teams[pl.side].players[pl.i]; return p ? p.score : null; }
  return v.players[pl.i] ? v.players[pl.i].score : null;
}
export function viewLeft(kind, v, elapsed) {
  if (kind === 'tug') return Math.max(0, (T.RULE.length - elapsed) / 1000);
  var len = kind === 'blast' ? B.RULE.length : kind === 'sky' ? S.RULE.length : D.RULE.length;
  return Math.max(0, (len - v.t) / 10);
}
export var FOSSIL = D.FOSSIL;
