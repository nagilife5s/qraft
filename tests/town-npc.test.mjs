// ひとりで冒険の町：施設の6人を立たせても、どの段階（0〜12）でも行ける場所が減らないこと（2026-11-17）
// quest.html の buildTown をそのまま取り出して動かす
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { placeFacNpcs, townReach } from '../quest.js';

const src = fs.readFileSync(new URL('../quest.html', import.meta.url), 'utf8');
function pick(from, to) { const a = src.indexOf(from); const b = src.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return src.slice(a, b); }
const code = pick('function rng(seed)', '\n/*\n * 町の地図') + pick('function buildTown(st)', '\nfunction buildArea()') + '\n' + pick('var BLOCK = new Set', '\n');
const make = new Function('placeFacNpcs', 'TOWN_MAX', code + '\nreturn { buildTown: buildTown, NPCS: NPCS, BLOCK: BLOCK };');
const { buildTown, BLOCK } = make(placeFacNpcs, 12);
const blocked = c => BLOCK.has(c);
function near(g, x, y, seen, W) { return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(d => { const xx = x + d[0], yy = y + d[1]; return g[yy] && g[yy][xx] !== undefined && seen[yy * W + xx]; }); }

test('どの段階でも、施設の6人が立ち、行けるマス・入口・門・噴水が減らない', () => {
  for (let st = 0; st <= 12; st++) {
    const m = buildTown(st), g = m.g, W = g[0].length;
    assert.equal(m.fnpc.length, 6, '段階' + st + ' で6人');
    assert.deepEqual(m.fnpc.map(n => n.f).sort(), [0, 1, 2, 3, 4, 5]);
    // 6人を置かない地図と比べる
    const g0 = g.map(r => r.slice()); m.fnpc.forEach(n => { g0[n.y][n.x] = '.'; });
    const before = townReach(g0, blocked, m.start), after = townReach(g, blocked, m.start);
    for (let i = 0; i < before.length; i++) if (before[i] && !after[i]) assert.ok(m.fnpc.some(n => n.y * W + n.x === i), '段階' + st + ' で行けなくなったマス ' + (i % W) + ',' + Math.floor(i / W));
    m.blds.forEach(b => { let ok = false; for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (near(g, x, y, after, W)) ok = true; assert.ok(ok, '段階' + st + ' 施設' + b.f + ' に入れる'); });
    m.fnpc.forEach(n => assert.ok(near(g, n.x, n.y, after, W), '段階' + st + ' 施設の人' + n.f + ' に話しかけられる'));
    assert.ok(after[11 * W + (W - 2)] || after[12 * W + (W - 2)], '段階' + st + ' 門まで行ける');
    assert.ok(near(g, 16, 11, after, W) || near(g, 17, 12, after, W), '段階' + st + ' 噴水を調べられる');
    // 施設の人は道・入口の正面に立たない
    m.fnpc.forEach(n => { if (n.f) { const b = m.blds.find(q => q.f === n.f), cx = b.x + b.w / 2; assert.ok(!(n.y === b.y + b.h && Math.abs(n.x + .5 - cx) < 1), '入口の正面'); } });
  }
});
