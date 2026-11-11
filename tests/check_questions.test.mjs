// 問題データの検査そのものが、壊れたデータを見逃さないかのテスト（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkQuestion, errorCount } from './check_questions.mjs';

const ok4 = { q: '問', choices: ['a', 'b', 'c', 'd'], answer: 1 };
const cases = [
  ['正しい4択', ok4, 0],
  ['正しい入力式', { q: '問', type: 'text', accept: ['塩素', 'えんそ'] }, 0],
  ['正しい複数選択', { q: '問', choices: ['a', 'b', 'c'], answers: [0, 2] }, 0],
  ['正解の番号が範囲外', { ...ok4, answer: 4 }, 1],
  ['正解の番号が負', { ...ok4, answer: -1 }, 1],
  ['answer と answers の両方', { ...ok4, answers: [0, 1] }, 1],
  ['正解なし', { q: '問', choices: ['a', 'b'] }, 1],
  ['選択肢が空', { q: '問', choices: ['a', ''], answer: 0 }, 1],
  ['選択肢が1つ', { q: '問', choices: ['a'], answer: 0 }, 1],
  ['問題文なし', { q: '', choices: ['a', 'b'], answer: 0 }, 1],
  ['入力式の答えが空', { q: '問', type: 'text', accept: [] }, 1],
  ['画像が無い', { ...ok4, image: 'img/q/none.webp' }, 1],
  ['解説つき', { ...ok4, ex: '理由の文。' }, 0],
  ['解説が空', { ...ok4, ex: ' ' }, 1],
  ['解説が長すぎる', { ...ok4, ex: 'あ'.repeat(201) }, 1],
];
for (const [name, q, n] of cases) {
  test(name, () => {
    const before = errorCount();
    checkQuestion(q, name);
    assert.equal(errorCount() - before, n);
  });
}
