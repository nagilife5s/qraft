// ひとりで冒険の敵の強さ（quest.js）。単元の学年ではなく、その子のレベルで決まる（2026-11-16）
import test from 'node:test';
import assert from 'node:assert/strict';
import { soloEnemyHp, soloEnemyAtkX, soloHpX } from '../quest.js';

test('Lv1・Lv16・Lv30 は前の1年・2年・3年の値とほぼ同じ', () => {
  assert.equal(soloEnemyHp(0, 1), 30);
  assert.ok(Math.abs(soloEnemyHp(0, 16) - Math.round(30 * 1.75 * 1.25)) <= 1);
  assert.equal(soloEnemyHp(0, 30), Math.round(30 * 2.45 * 1.5));
  assert.equal(soloEnemyAtkX(1), 1);
  assert.ok(Math.abs(soloEnemyAtkX(30) - 3.03) < 1e-9);
});
test('レベルが上がるほど強く、上限は1.5倍で止まる', () => {
  for (let lv = 1; lv < 50; lv++) assert.ok(soloEnemyHp(2, lv + 1) > soloEnemyHp(2, lv));
  assert.equal(soloHpX(50), 1.5);
  assert.equal(soloEnemyHp(1, 0), soloEnemyHp(1, 1));
});
