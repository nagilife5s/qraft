// スカイレース・ほりほりトレジャー・チーム綱引きのエンジンのテスト（2026-11-12）。node --test tests/minigames.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../skyrace.js';
import * as D from '../dig.js';
import * as T from '../tug.js';

test('スカイレース：60秒で終わり、通信の鏡に点数と位置が写る', () => {
  const g = S.newGame(5, 7);
  for (let i = 0; i < S.RULE.length; i++) S.step(g, g.players.map((p, k) => ({ d: k % 3, d2: 4, b: i === 30 })));
  assert.ok(g.over, '終わる');
  const v = S.newView(); S.applyData(v, S.serialize(g));
  assert.deepEqual(v.players.map(p => p.score), g.players.map(p => p.score));
  assert.ok(Math.abs(v.players[0].x - g.players[0].x) < 0.01);
  assert.ok(g.players.every(p => p.left === S.RULE.boosts - 1), 'ブーストは1回だけ使われた');
});

test('ほりほり：下へ掘ると化石が見つかり、行の文字列で地面が写る', () => {
  const g = D.newGame(1, 3), p = g.players[0];
  for (let i = 0; i < D.RULE.length && !g.over; i++) D.step(g, [{ d: 2, b: false }]);
  assert.ok(p.y > 10, '深く掘れた（' + p.y + '）');
  const v = D.newView(); D.applyRows(v, D.rows(g)); D.applyData(v, D.serialize(g));
  for (let i = 0; i < g.cells.length; i++) {
    assert.equal(!!v.cells[i].dug, !!g.cells[i].dug);
    assert.equal(v.cells[i].f || null, g.cells[i].f || null);
  }
  assert.equal(v.players[0].score, p.score);
});

test('ほりほり：化石を掘り当てると時代の点数が入る', () => {
  const g = D.newGame(1, 5), p = g.players[0];
  const y = 25, c = D.cell(g, p.x, y + 1);       // 中生代の行
  c.f = 'ammonite'; c.rock = 0; c.dug = 0;
  for (let yy = 2; yy <= y; yy++) D.cell(g, p.x, yy).dug = 1;
  p.y = y;
  for (let i = 0; i < 20; i++) D.step(g, [{ d: 2 }]);
  assert.equal(p.score, D.FOSSIL.ammonite.pts);
  assert.equal(g.fos.ammonite, 1);
});

test('綱引き：かけ声ぴったりで PERFECT、ずれると GOOD / MISS', () => {
  assert.equal(T.judge(T.beatAt(3)).res, 'p');
  assert.equal(T.judge(T.beatAt(3) + 150).res, 'g');
  assert.equal(T.judge(T.beatAt(3) + 400).res, 'm');
  assert.equal(T.judge(T.beatAt(3) - 30).beat, 3);
});

test('綱引き：そろって引いたチームが勝ち、勝ったチームに点が入る', () => {
  const m = T.newMatch(3, 3);
  for (let n = 1; !m.over && n < 200; n++) {
    m.teams[0].players.forEach((_, i) => T.setTap(m, 0, i, n, 'p'));   // 赤は全員ぴったり
    T.stepTo(m, T.beatAt(n) + T.RULE.good + 1);
  }
  assert.ok(m.over); assert.equal(m.win, 0);
  assert.ok(m.teams[0].players[0].score > m.teams[1].players[0].score);
  const v = T.newView(); T.applyData(v, T.serialize(m));
  assert.equal(v.win, 0); assert.equal(v.teams[0].players[0].perfect, m.teams[0].players[0].perfect);
});

test('綱引き：同じかけ声に2回押しても1回分', () => {
  const m = T.newMatch(1, 1);
  T.setTap(m, 0, 0, 1, 'm'); T.setTap(m, 0, 0, 1, 'p');
  T.stepTo(m, T.beatAt(1) + T.RULE.good + 1);
  assert.equal(m.teams[0].players[0].perfect, 0);
});
