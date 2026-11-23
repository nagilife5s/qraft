// 理科用語カードのデータのテスト（2026-11-23）。node --test tests/cards.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import * as C from '../rikaria-cards.js';
import { UNITS } from '../rikaria-data.js';

test('625枚・13単元・単元の中で同じ語がない・★は1〜3', () => {
  assert.equal(C.CD_UNITS.length, 13);
  let n = 0;
  for (const u of C.CD_UNITS) {
    const c = C.CARDS[u].c, seen = new Set();
    for (const x of c) {
      assert.equal(x.length, 4); assert.ok(x[0] && x[2], u + ' ' + x[0]);
      assert.ok([1, 2, 3].includes(x[3]), u + ' ' + x[0]);
      assert.ok(!seen.has(x[0]), u + ' で重複：' + x[0]); seen.add(x[0]);
    }
    n += c.length;
  }
  assert.equal(n, 625);
});

test('単元の id はゲームの単元（自然と人間 nature だけはエリアなし）', () => {
  const ids = UNITS.map((u) => u.id);
  for (const u of C.CD_UNITS) if (u !== 'nature') { assert.ok(ids.includes(u), u); assert.equal(UNITS.find((x) => x.id === u).unit, C.CARDS[u].unit); }
  for (const id of ids) assert.ok(C.CARDS[id], id);
});

test('ルールの枚数 CD_N（gen_rules.py）がデータと同じ', () => {
  const py = fs.readFileSync(new URL('./rules/gen_rules.py', import.meta.url), 'utf8');
  const m = py.match(/^CD_N = (\{.*\})$/m); assert.ok(m);
  const N = JSON.parse(m[1].replace(/'/g, '"'));
  for (const u of UNITS.map((x) => x.id)) assert.equal(N[u], C.cdN(u), u);
  assert.equal(N.nature, undefined);
});

test('しるし：足す・数える・78枚でも正しい', () => {
  const ch = {};
  assert.ok(C.cdAdd(ch, 'life', 0)); assert.ok(C.cdAdd(ch, 'life', 77)); assert.ok(!C.cdAdd(ch, 'life', 77)); assert.ok(!C.cdAdd(ch, 'life', 78));
  assert.deepEqual(ch.cd.life, { a: 1, c: Math.pow(2, 77 - 52) });
  assert.equal(C.cdCount(ch, 'life'), 2);
  for (let i = 0; i < 78; i++) C.cdAdd(ch, 'life', i);
  assert.ok(C.cdFull(ch, 'life')); assert.deepEqual(ch.cd.life, { a: 2 ** 26 - 1, b: 2 ** 26 - 1, c: 2 ** 26 - 1 });
  assert.ok(C.cdBonusDue(ch, 'life')); ch.cdc = { life: true }; assert.ok(!C.cdBonusDue(ch, 'life'));
  assert.deepEqual(C.cdTitles(ch), ['植物と動物博士']);
});

test('落ちる：答えの語なら40%でそのカード・それ以外は15%', () => {
  const ch = {}, i = C.CARDS.matter.c.findIndex((x) => x[0] === '有機物');
  assert.ok(i >= 0);
  assert.equal(C.cdRoll(ch, 'matter', ['有機物'], () => .39), i);
  assert.equal(C.cdRoll(ch, 'matter', ['有機物'], () => .41), -1);
  assert.equal(C.cdRoll(ch, 'matter', ['なにか'], () => .16), -1);
  const j = C.cdRoll(ch, 'matter', ['なにか'], () => .1); assert.ok(j >= 0 && j < C.cdN('matter'));
  C.cdAdd(ch, 'matter', i); assert.notEqual(C.cdRoll(ch, 'matter', ['有機物'], () => .1), i);   // 持っているカードは落ちない
});
