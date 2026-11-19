// 5階のダンジョン（2026-11-20）：12単元×5階の全部が、鍵をとって扉を開ければ階段（5階はボス）に着けること
import test from 'node:test';
import assert from 'node:assert/strict';
import { dgBuild, dgBfs, DG_FLOORS } from '../dungeon5.js';
import { UNITS } from '../rikaria-data.js';

test('全部の階が解ける（鍵は扉の手前・階段は扉の奥）', () => {
  assert.equal(UNITS.length, 12);
  for (const u of UNITS) for (let fl = 1; fl <= DG_FLOORS; fl++) {
    const M = dgBuild(u.id, fl), tag = u.id + ' ' + fl + '階';
    const d = dgBfs(M.g, M.start), goal = M.items[0];
    assert.equal(goal.k, fl === 5 ? 'boss' : 'stair', tag);
    assert.equal(M.g.flat().filter((c) => c === 'D').length, 1, tag + ' 扉は1つ');
    const keys = M.items.filter((i) => i.k === 'key');
    assert.equal(keys.length, M.need, tag);
    keys.forEach((k) => assert.ok(d[k.y][k.x] > 0, tag + ' 鍵に扉なしで行ける'));
    assert.equal(d[goal.y][goal.x], -1, tag + ' 階段は扉を開けないと行けない');
    const g2 = M.g.map((r) => r.map((c) => (c === 'D' ? '.' : c)));
    assert.ok(dgBfs(g2, M.start)[goal.y][goal.x] > 0, tag + ' 扉を開ければ階段に行ける');
    assert.ok(M.spots.length > 20, tag + ' 魔物の置き場所');
  }
});
test('同じ単元・同じ階なら同じ形', () => {
  assert.deepEqual(dgBuild('matter', 3).g, dgBuild('matter', 3).g);
  assert.notDeepEqual(dgBuild('matter', 3).g, dgBuild('matter', 4).g);
});
