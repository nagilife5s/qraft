// Firebase Realtime Database のルールのテスト（エミュレーター）。クエストのキャラ・合言葉・家庭練習の記録
//   cd tests && npm run test:rules   （エミュレーターの起動から終了まで自動。Java 21 が必要）
// ルールの正本は tests/firebase-rules.json。quest と practice の部分は gen_rules.py で作る
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import fs from 'fs';
import { setLogLevel } from 'firebase/app';
setLogLevel('error');   // 「わざと弾かれる書き込み」の警告を出さない
import path from 'path';
import { fileURLToPath } from 'url';
const RULES = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'firebase-rules.json');

const env = await initializeTestEnvironment({
  projectId: 'qraft-test',
  database: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 9000 },
});
const Y = 2026, SID = '1-2-3', OTHER = '1-2-4', TS = { '.sv': 'timestamp' };
const P = (p) => `quest/${Y}/${p}`;
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name); }
  catch (e) { fail++; console.log('  NG  ', name, '-', e.message.split('\n')[0]); }
}
const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();
const alice = db('alice'), bob = db('bob'), teacher = db('teacher'), alice2 = db('alice-chromebook');
const base = { n: 'アリス', j: 'warrior', lk: 'a', lv: 1, exp: 0, gold: 0, sp: 0, sk: { 0: 0, 1: 1, 2: 0 }, u: TS };
async function seed(fn) { await env.withSecurityRulesDisabled(async (c) => fn(c.database())); }
async function reset() {
  await env.clearDatabase();
  await seed(async (d) => {
    await d.ref('admins/teacher').set(true);
    await d.ref(P('keys/' + SID)).set('abc234');
    await d.ref(P('keys/' + OTHER)).set('zzz999');
  });
}
// 前の書き込みの時刻を21秒前にする（20秒の間隔テスト用）
async function age(sid, ms = 21000) { await seed(async (d) => d.ref(P('chars/' + sid + '/u')).set(Date.now() - ms)); }
async function claim(d, uid, sid = SID, c = 'abc234') { return d.ref(P(`owners/${sid}/${uid}`)).set({ c, t: TS }); }
async function make(d = alice, uid = 'alice') { await claim(d, uid); await d.ref(P('chars/' + SID)).set(base); }
async function cur() { let v; await seed(async (d) => { v = (await d.ref(P('chars/' + SID)).get()).val(); }); return v; }
async function save(d, patch) { const c = Object.assign(await cur(), patch, { u: TS }); return d.ref(P('chars/' + SID)).set(c); }

console.log('合言葉と持ち主');
await reset();
await t('合言葉が違うと持ち主になれない', () => assertFails(claim(alice, 'alice', SID, 'wrong1')));
await t('他人のuidの持ち主記録は書けない', () => assertFails(claim(alice, 'bob')));
await t('合言葉の中身は生徒には読めない', () => assertFails(alice.ref(P('keys/' + SID)).get()));
await t('合言葉の一覧は生徒には読めない', () => assertFails(alice.ref(P('keys')).get()));
await t('持ち主でないとキャラを作れない', () => assertFails(alice.ref(P('chars/' + SID)).set(base)));
await t('正しい合言葉で持ち主になれる', () => assertSucceeds(claim(alice, 'alice')));
await t('持ち主はキャラを作れる', () => assertSucceeds(alice.ref(P('chars/' + SID)).set(base)));
await t('本人は自分のキャラを読める', () => assertSucceeds(alice.ref(P('chars/' + SID)).get()));
await t('自分の持ち主記録を読める（再読み込み後の確認用）', () => assertSucceeds(alice.ref(P(`owners/${SID}/alice`)).get()));
await t('別の端末でも合言葉を入れれば持ち主になれる', () => assertSucceeds(claim(alice2, 'alice-chromebook')));
await t('別の端末でもキャラを読める', () => assertSucceeds(alice2.ref(P('chars/' + SID)).get()));
await t('他人（bob）は読めない', () => assertFails(bob.ref(P('chars/' + SID)).get()));
await t('他人はキャラ全体の一覧を読めない', () => assertFails(bob.ref(P('chars')).get()));
await t('他人は書き換えられない', () => assertFails(bob.ref(P('chars/' + SID)).set(Object.assign({}, base, { n: 'のっとり' }))));
await t('他人は別の合言葉では持ち主になれない', () => assertFails(claim(bob, 'bob', SID, 'zzz999')));
await t('未ログインは読めない', () => assertFails(db(null).ref(P('chars/' + SID)).get()));
await t('持ち主の一覧は生徒には読めない', () => assertFails(bob.ref(P('owners/' + SID)).get()));
await t('先生は持ち主の一覧を読める', () => assertSucceeds(teacher.ref(P('owners/' + SID)).get()));
await t('先生はキャラを読める', () => assertSucceeds(teacher.ref(P('chars/' + SID)).get()));
await t('先生は合言葉を作れる', () => assertSucceeds(teacher.ref(P('keys/1-2-5')).set('qwe789')));
await t('生徒は合言葉を作れない', () => assertFails(alice.ref(P('keys/1-2-6')).set('qwe789')));
await t('作成時にレベルを上げて作れない', async () => { await seed(async (d) => d.ref(P('chars/' + OTHER)).remove()); await claim(bob, 'bob', OTHER, 'zzz999'); await assertFails(bob.ref(P('chars/' + OTHER)).set(Object.assign({}, base, { lv: 5, sp: 4 }))); });
await t('作成時に装備を付けて作れない', () => assertFails(bob.ref(P('chars/' + OTHER)).set(Object.assign({}, base, { eq: { w: 'w3' } }))));
await t('作成時にゴールドを持って作れない', () => assertFails(bob.ref(P('chars/' + OTHER)).set(Object.assign({}, base, { gold: 500 }))));

console.log('ひとりで冒険の報酬');
await reset(); await make(); await age(SID);
await t('ふつうの報酬（経験値30・ゴールド10）は保存できる', () => assertSucceeds(save(alice, { exp: 30, gold: 10 })));
await t('20秒たたずに次の報酬は保存できない', () => assertFails(save(alice, { exp: 60, gold: 20 })));
await age(SID);
await t('ゴールド+201は弾く', () => assertFails(save(alice, { gold: 211 })));
await t('経験値+301は弾く', async () => { await assertFails(save(alice, { exp: 331 })); });
await t('レベルアップ（Lv1→2、余り10）は保存できる', () => assertSucceeds(save(alice, { lv: 2, exp: 10, sp: 1 })));
const lv2 = await cur();
await age(SID);
await t('経験値を減らしてレベルを上げる水増しは弾く', () => assertFails(save(alice, { lv: 6, exp: 0, sp: 5 })));
await t('次のレベルに必要な分を超える経験値は弾く', () => assertFails(save(alice, { exp: 200 })));
await t('レベルが上がらないのにスキルポイントを増やせない', () => assertFails(save(alice, { sp: 3 })));
await t('レベルを下げられない', () => assertFails(save(alice, { lv: 1, sp: 0 })));
await t('名前は変えられない', () => assertFails(save(alice, { n: 'べつの名前' })));
await t('職業は変えられない', () => assertFails(save(alice, { j: 'mage' })));
await t('称号は自分で付けられない', () => assertFails(save(alice, { ttl: { '1-物質': '錬金を解きし者' } })));
await t('報酬と一緒に装備を付けられない', () => assertFails(save(alice, { exp: lv2.exp + 10, eq: { w: 'w3' } })));

console.log('買い物・スキル・持ち物');
await reset(); await make();
await seed(async (d) => d.ref(P('chars/' + SID)).update({ gold: 500, lv: 3, sp: 2 }));
await t('スキルに1ポイント振れる', () => assertSucceeds(save(alice, { sp: 1, sk: { 0: 0, 1: 2, 2: 0 } })));
await t('ポイントなしでスキルを上げられない', () => assertFails(save(alice, { sk: { 0: 1, 1: 2, 2: 0 } })));
await t('スキルを付け替え（無料）できない', () => assertFails(save(alice, { sk: { 0: 1, 1: 1, 2: 0 } })));
await t('スキル6段階は弾く', () => assertFails(save(alice, { sp: 0, sk: { 0: 0, 1: 6, 2: 0 } })));
await t('振り直し（100ゴールド）はできる', () => assertSucceeds(save(alice, { gold: 400, sp: 2, sk: { 0: 0, 1: 1, 2: 0 } })));
await t('お金を払わない振り直しは弾く', async () => { await save(alice, { sp: 1, sk: { 0: 0, 1: 2, 2: 0 } }).catch(() => {}); await assertFails(save(alice, { sp: 2, sk: { 0: 0, 1: 1, 2: 0 } })); });
await t('武器（120）を買える', () => assertSucceeds(save(alice, { gold: 280, eq: { w: 'w1' } })));
await t('お金を払わずに武器を変えられない', () => assertFails(save(alice, { eq: { w: 'w3' } })));
await t('足りない額で防具を買えない', () => assertFails(save(alice, { gold: 200, eq: { w: 'w1', a: 'a2' } })));
await t('回復のしずく（30）を1つ買える', () => assertSucceeds(save(alice, { gold: 250, inv: { potion: 1 } })));
await t('お金を払わずに持ち物を増やせない', () => assertFails(save(alice, { inv: { potion: 2 } })));
await t('2つまとめて1つ分の値段では買えない', () => assertFails(save(alice, { gold: 220, inv: { potion: 3 } })));
await t('2種類を同時に買えない', () => assertFails(save(alice, { gold: 150, inv: { potion: 2, ether: 1 } })));
await t('持ち物を使える（減らせる）', () => assertSucceeds(save(alice, { inv: { potion: 0 } })));
await t('見た目は変えられる', () => assertSucceeds(save(alice, { lk: 'b' })));
await t('買い物で経験値は増やせない', () => assertFails(save(alice, { exp: 50 })));
await t('ゴールドを増やす買い物はできない', () => assertFails(save(alice, { gold: 999 })));

console.log('先生（チームモードの報酬保存）');
await t('先生は報酬を保存できる', () => assertSucceeds(save(teacher, { lv: 6, exp: 10, gold: 1000, sp: 5, ttl: { '1-物質': '錬金を解きし者' } })));
await t('先生は持ち物を減らせる', () => assertSucceeds(save(teacher, { inv: { potion: 0 } })));
await t('生徒は先生が付けた称号を消せない…変えられない', () => assertFails(save(alice, { ttl: { '1-物質': 'にせもの' } })));

console.log('今あるキャラ（skがない古いキャラ）');
await reset();
await seed(async (d) => d.ref(P('chars/' + SID)).set({ n: '古い', j: 'mage', lv: 2, exp: 5, gold: 50, sp: 1, u: Date.now() - 60000 }));
await t('合言葉を入れる前は読めない', () => assertFails(alice.ref(P('chars/' + SID)).get()));
await claim(alice, 'alice');
await t('合言葉を入れれば今のキャラを読める', () => assertSucceeds(alice.ref(P('chars/' + SID)).get()));
await t('古いキャラにスキルを足して報酬を保存できる', () => assertSucceeds(save(alice, { exp: 25, gold: 60, sk: { 0: 0, 1: 1, 2: 0 } })));

console.log('家庭練習の記録');
await reset();
const rec = (extra) => Object.assign({ f: '06147353', n: 10, k: 7, w: '2,5,9', r: 0, t: TS, y: String(Y) }, extra);
const put = (d, sid, extra) => d.ref('practice/' + sid).push(rec(extra));
await t('合言葉なしでは記録を送れない', () => assertFails(put(alice, SID)));
await claim(alice, 'alice');
await t('持ち主は自分の番号に記録を送れる', () => assertSucceeds(put(alice, SID)));
await t('他人の番号には送れない', () => assertFails(put(alice, OTHER)));
await t('年度なしの記録は送れない', () => assertFails(alice.ref('practice/' + SID).push(Object.assign(rec(), { y: null }))));
await t('持ち主でない年度を名乗っても送れない', () => assertFails(put(alice, SID, { y: '2025' })));
await t('正解数を問題数より多くできない', () => assertFails(put(alice, SID, { k: 11 })));
await t('送った記録は書き換えられない', async () => { const r = await alice.ref('practice/' + SID).push(rec()); await assertFails(r.update({ k: 10 })); });
await t('生徒は記録を読めない', () => assertFails(alice.ref('practice').get()));
await t('先生は記録を読める', () => assertSucceeds(teacher.ref('practice').get()));

console.log(`\n${pass} 件成功 / ${fail} 件失敗`);
await env.cleanup();
process.exit(fail ? 1 : 0);
