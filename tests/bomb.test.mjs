// ブラストタイム（爆弾ミニゲーム）のアイテムのテスト（2026-11-12）。node --test tests/bomb.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../bomb.js';

function run(g, n, inp) { for (let i = 0; i < n; i++) B.step(g, inp ? inp(i) : []); }

test('小ロボットを倒すとアイテムが落ち、拾うと強くなる', () => {
  const save = B.RULE.itemRate; B.RULE.itemRate = 1;   // 必ず落ちるようにして確かめる
  try {
    const g = B.newGame(1, 3);
    g.robots = [{ id: 99, x: 2, y: 0, cd: 1e9, d: 1 }];   // 動かないロボットを2マス右に
    g.players[0].x = 0; g.players[0].y = 0;
    B.step(g, [{ d: 0, b: true }]);                        // その場に爆弾
    g.players[0].x = 6; g.players[0].y = 6;                // 爆風の届かない所へ
    run(g, B.RULE.fuse + 2);
    assert.equal(g.players[0].kills, 1, 'ロボットを倒した');
    assert.equal(g.items.length, 1, 'アイテムが落ちた');
    const it = g.items[0];
    // 炎が消えるのを待ってから、アイテムまで歩く
    run(g, B.RULE.flame + 1);
    const p = g.players[0];
    p.x = it.x; p.y = it.y; B.step(g, []);
    assert.equal(g.items.length, 0, '拾うと消える');
    assert.ok(p.rg + p.mb + p.sp === 1, '強さが1つ上がる');
    // 通信の鏡にも、強さとアイテムが写る
    const v = B.newView(); B.applyData(v, B.serialize(g));
    assert.deepEqual([v.players[0].rg, v.players[0].mb, v.players[0].sp], [p.rg, p.mb, p.sp]);
  } finally { B.RULE.itemRate = save; }
});

test('火力アップで爆風が長くなり、上限で止まる', () => {
  const g = B.newGame(1, 5); g.robots = []; const p = g.players[0];
  p.x = 0; p.y = 0; p.rg = 99;   // 上限を超える値でも
  B.step(g, [{ d: 0, b: true }]);
  assert.equal(g.bombs[0].r, B.RULE.rangeMax, '爆風は上限の長さ');
});

test('落ちたアイテムは時間がたつと消える', () => {
  const g = B.newGame(1, 9); g.robots = [];
  g.items = [{ x: 6, y: 6, k: 'b', t: B.RULE.itemLife }];
  run(g, B.RULE.itemLife + 1);
  assert.equal(g.items.length, 0);
});
