// 問題データの検査（家庭練習用 web/home/ と、授業用 web/questions/ の一覧）
//   node tests/check_questions.mjs        … エラーがあれば終了コード1
// エラー：出題できない・正解判定がおかしくなるもの（正解の番号が範囲外、選択肢が空、画像が無い、一覧と中身の数が合わない など）
// 警告　：出題はできるが確認したいもの（同じ選択肢が2つ、4択で全部が正解 など）。終了コードには影響しない
// ※正解が科学的に正しいかは、ここでは分からない。原本との突き合わせは ../tools/audit_answers.py（非公開・手元で実行）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(WEB, p), 'utf8'));
const errors = [], warns = [];
const E = (where, m) => errors.push(where + ': ' + m), W = (where, m) => warns.push(where + ': ' + m);
export const errorCount = () => errors.length;
const isInt = (x) => Number.isInteger(x);
const ctext = (c) => (typeof c === 'string' ? c : (c && c.t) || '');
const cimg = (c) => (typeof c === 'string' ? null : (c && c.image) || null);
const imgOk = (p) => typeof p === 'string' && /^img\//.test(p) && fs.existsSync(path.join(WEB, p));

export function checkQuestion(q, where) {
  if (!q || typeof q.q !== 'string' || !q.q.trim()) return E(where, '問題文がない');
  if (q.image && !imgOk(q.image)) E(where, '問題の画像が見つからない: ' + q.image);
  if ('imageAlt' in q && (typeof q.imageAlt !== 'string' || !q.imageAlt.trim() || q.imageAlt.length > 100 || !q.image)) E(where, '画像の説明文（imageAlt）が空か長すぎるか、画像がない');
  if ('ex' in q && (typeof q.ex !== 'string' || !q.ex.trim() || q.ex.length > 200)) E(where, '解説（ex）が空か、200字をこえている');
  if (q.type === 'text') {
    if (!Array.isArray(q.accept) || !q.accept.length || q.accept.some((a) => typeof a !== 'string' || !a.trim())) E(where, '入力式の答え（accept）が空');
    return;
  }
  const ch = q.choices;
  if (!Array.isArray(ch) || ch.length < 2 || ch.length > 6) return E(where, '選択肢の数が2〜6でない');
  ch.forEach((c, i) => {
    if (!ctext(c).trim() && !cimg(c)) E(where, '選択肢' + (i + 1) + 'が空');
    if (cimg(c) && !imgOk(cimg(c))) E(where, '選択肢' + (i + 1) + 'の画像が見つからない: ' + cimg(c));
    if (typeof c !== 'string' && 'alt' in c && (typeof c.alt !== 'string' || !c.alt.trim() || c.alt.length > 100)) E(where, '選択肢' + (i + 1) + 'の画像の説明文が空か長すぎる');
  });
  const hasA = 'answer' in q, hasM = 'answers' in q;
  if (hasA === hasM) return E(where, 'answer と answers のどちらか一方だけが必要');
  const list = hasM ? q.answers : Array.isArray(q.answer) ? q.answer : [q.answer];
  if (!Array.isArray(list) || !list.length) return E(where, '正解が空');
  if (list.some((a) => !isInt(a) || a < 0 || a >= ch.length)) E(where, '正解の番号 ' + JSON.stringify(list) + ' が選択肢 ' + ch.length + ' 個の範囲外');
  if (new Set(list).size !== list.length) E(where, '正解の番号が重複');
  if (hasM && !Array.isArray(q.answers)) E(where, 'answers は配列');
  const keys = ch.map((c) => ctext(c).replace(/\s+/g, '') + '|' + (cimg(c) || ''));
  if (new Set(keys).size !== keys.length) W(where, '同じ選択肢が2つある');
  if (list.length === ch.length) W(where, '全部の選択肢が正解');
}

export function run() {
  const idx = read('home/index.json');
  if (!Array.isArray(idx) || !idx.length) E('home/index.json', '一覧が空');
  let nq = 0;
  const seen = new Set();
  for (const e of idx) {
    const where = 'home/' + e.id + '.json';
    if (seen.has(e.id)) E(where, '一覧に2回ある'); seen.add(e.id);
    if (!fs.existsSync(path.join(WEB, where))) { E(where, 'ファイルがない'); continue; }
    const d = read(where);
    if (!Array.isArray(d.questions) || !d.questions.length) { E(where, '問題がない'); continue; }
    if (d.questions.length !== e.count) E(where, '一覧の問題数 ' + e.count + ' と中身 ' + d.questions.length + ' が合わない');
    if (d.title !== e.title) E(where, '一覧の題名と中身の題名が違う');
    d.questions.forEach((q, i) => checkQuestion(q, where + ' 問' + (i + 1)));
    nq += d.questions.length;
  }
  // 授業用：一覧にあるファイルがそろっていて、暗号化されたものは暗号化の形になっているか（中身は確かめられない）
  const qi = read('questions/index.json');
  for (const e of qi) {
    const where = 'questions/' + e.file;
    if (!fs.existsSync(path.join(WEB, where))) { E(where, 'ファイルがない'); continue; }
    const d = read(where);
    if (e.enc) { if (!(d.enc === 1 && d.salt && d.iv && d.ct && d.iter)) E(where, '暗号化の形になっていない'); }
    else { if (!Array.isArray(d.questions)) E(where, '問題がない'); else d.questions.forEach((q, i) => checkQuestion(q, where + ' 問' + (i + 1))); }
  }
  return { sets: idx.length, questions: nq, classSets: qi.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = run();
  console.log(`家庭練習 ${r.sets} セット・${r.questions} 問 ／ 授業用 ${r.classSets} セットを検査`);
  warns.forEach((w) => console.log('  警告  ' + w));
  errors.forEach((e) => console.log('  エラー ' + e));
  console.log(`エラー ${errors.length} 件・警告 ${warns.length} 件`);
  process.exit(errors.length ? 1 : 0);
}
