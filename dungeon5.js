/*
 * ひとりで冒険の5階のダンジョン（2026-11-20。mock/dungeon5-mock.html を本番用にしたもの）
 * 単元と階で決まる乱数で迷路を作る（同じ単元・同じ階なら、いつも同じ形）。
 *   '#' 壁 ・ '.' 床 ・ 'D' 扉（鍵が必要数そろうと開く）。階段（5階はボス）は 5×5 の部屋の真ん中で、部屋の入口は扉1つだけ。
 *   items: stair / boss / key / chest。1〜3階は鍵1本、4・5階は鍵2本。
 */
export const DG_W = 41, DG_H = 29, DG_FLOORS = 5;
export function dgRng(seed) { let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export function dgBfs(g, [sx, sy]) {
  const d = g.map((r) => r.map(() => -1)); d[sy][sx] = 0; const q = [[sx, sy]];
  for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (g[ny] && g[ny][nx] === '.' && d[ny][nx] < 0) { d[ny][nx] = d[y][x] + 1; q.push([nx, ny]); } } }
  return d;
}
export function dgBuild(uid, fl) {
  /* 階段の部屋の壁が通路を切って、扉の手前がせまくなりすぎることがある（force 3階・space 3階）。そのときは種を変えて作り直す */
  for (let t = 0; t < 20; t++) { const M = make(uid + '#' + fl + (t ? '#' + t : ''), fl); if (M.spots.length >= 120) return M; }
  return make(uid + '#' + fl, fl);
}
function make(seed, fl) {
  const W = DG_W, H = DG_H, R = dgRng(seed), g = Array.from({ length: H }, () => Array(W).fill('#'));
  /* 1) 穴掘り迷路 */
  const st = [[1, 1]]; g[1][1] = '.';
  while (st.length) { const [x, y] = st[st.length - 1], n = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => g[y + dy] && g[y + dy][x + dx] === '#' && x + dx > 0 && x + dx < W - 1 && y + dy > 0 && y + dy < H - 1);
    if (!n.length) { st.pop(); continue; } const [dx, dy] = n[Math.floor(R() * n.length)]; g[y + dy / 2][x + dx / 2] = '.'; g[y + dy][x + dx] = '.'; st.push([x + dx, y + dy]); }
  /* 2) 部屋 */
  const rooms = [];
  for (let i = 0; i < 7; i++) { const w = 3 + 2 * Math.floor(R() * 3), h = 3 + 2 * Math.floor(R() * 2), x = 1 + 2 * Math.floor(R() * ((W - w - 2) / 2)), y = 1 + 2 * Math.floor(R() * ((H - h - 2) / 2));
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy][xx] = '.'; rooms.push({ x, y, w, h }); }
  /* 3) ループ */
  for (let i = 0; i < 25; i++) { const x = 1 + Math.floor(R() * (W - 2)), y = 1 + Math.floor(R() * (H - 2)); if (g[y][x] === '#' && ((g[y][x - 1] === '.' && g[y][x + 1] === '.') || (g[y - 1][x] === '.' && g[y + 1][x] === '.'))) g[y][x] = '.'; }
  /* 4) 一番遠い所に、壁でかこんだ階段の部屋（入口は扉1つ） */
  const start = [1, 1], dist = dgBfs(g, start);
  let far = start, fd = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dist[y][x] > fd) { fd = dist[y][x]; far = [x, y]; }
  const rx = Math.min(W - 6, Math.max(1, far[0] - 2)), ry = Math.min(H - 6, Math.max(1, far[1] - 2));
  for (let y = ry - 1; y <= ry + 5; y++) for (let x = rx - 1; x <= rx + 5; x++) { if (y < 0 || x < 0 || y >= H || x >= W) continue; g[y][x] = (y === ry - 1 || y === ry + 5 || x === rx - 1 || x === rx + 5) ? '#' : '.'; }
  far = [rx + 2, ry + 2];
  const dd = dgBfs(g, start); let door = null, bd = 1e9;
  for (let y = ry - 1; y <= ry + 5; y++) for (let x = rx - 1; x <= rx + 5; x++) {
    if (!(y === ry - 1 || y === ry + 5 || x === rx - 1 || x === rx + 5) || x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1) continue;
    if ((x === rx - 1 || x === rx + 5) && (y === ry - 1 || y === ry + 5)) continue;
    const ox = x === rx - 1 ? x - 1 : x === rx + 5 ? x + 1 : x, oy = y === ry - 1 ? y - 1 : y === ry + 5 ? y + 1 : y;
    if (dd[oy] && dd[oy][ox] >= 0 && dd[oy][ox] < bd) { bd = dd[oy][ox]; door = [x, y]; } }
  if (!door) { door = [rx - 1, ry + 2]; for (let x = rx - 2; x >= 1 && dd[ry + 2][x] < 0; x--) g[ry + 2][x] = '.'; }
  g[door[1]][door[0]] = 'D';
  const d2 = dgBfs(g, start); let key = start, kd = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d2[y][x] > kd && g[y][x] === '.') { kd = d2[y][x]; key = [x, y]; }
  const items = [{ k: fl === DG_FLOORS ? 'boss' : 'stair', x: far[0], y: far[1] }, { k: 'key', x: key[0], y: key[1] }];
  if (fl >= 4) { let k2 = start, best = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = d2[y][x], dk = Math.abs(x - key[0]) + Math.abs(y - key[1]); if (v > 0 && g[y][x] === '.' && dk > best && v > kd * .5) { best = dk; k2 = [x, y]; } } items.push({ k: 'key', x: k2[0], y: k2[1] }); }
  rooms.slice(0, 3).forEach((r) => { if (g[r.y][r.x] === '.' && d2[r.y][r.x] > 0 && !items.some((i) => i.x === r.x && i.y === r.y)) items.push({ k: 'chest', x: r.x, y: r.y }); });
  /* 魔物の置き場所の候補：入口から離れた、扉の手前の床（階段の部屋には置かない） */
  const spots = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d2[y][x] > 8 && !items.some((i) => i.x === x && i.y === y)) spots.push([x, y]);
  return { g, items, start, door, need: fl >= 4 ? 2 : 1, spots, R };
}
