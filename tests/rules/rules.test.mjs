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
const base = { n: 'アリス', j: 'warrior', lk: 'a', lv: 1, exp: 0, gold: 0, sp: 0, spt: 0, u: TS };   // キャラ第2版（リカリア・2026-11-13）
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
await t('作成時にレベルを上げて作れない', async () => { await seed(async (d) => d.ref(P('chars/' + OTHER)).remove()); await claim(bob, 'bob', OTHER, 'zzz999'); await assertFails(bob.ref(P('chars/' + OTHER)).set(Object.assign({}, base, { lv: 5, sp: 4, spt: 4 }))); });
await t('作成時に装備を付けて作れない', () => assertFails(bob.ref(P('chars/' + OTHER)).set(Object.assign({}, base, { eq: { w: 'w3' } }))));
await t('作成時にゴールドを持って作れない', () => assertFails(bob.ref(P('chars/' + OTHER)).set(Object.assign({}, base, { gold: 500 }))));
await t('作成時に技のランクを上げて作れない', () => assertFails(bob.ref(P('chars/' + OTHER)).set(Object.assign({}, base, { sr: { 0: 1 } }))));
await t('新しい職業（狩人・武闘家・精霊使い）で作れる', () => assertSucceeds(bob.ref(P('chars/' + OTHER)).set(Object.assign({}, base, { j: 'summoner' }))));
await t('第1版の形（sk）では作れない', async () => { await seed(async (d) => d.ref(P('chars/' + OTHER)).remove()); await assertFails(bob.ref(P('chars/' + OTHER)).set(Object.assign({}, base, { sk: { 0: 0, 1: 1, 2: 0 } }))); });

console.log('ひとりで冒険の報酬（次のレベルまで 100＋50×Lv、650で頭打ち）');
await reset(); await make(); await age(SID);
await t('ふつうの報酬（経験値30・ゴールド10）は保存できる', () => assertSucceeds(save(alice, { exp: 30, gold: 10 })));
await t('20秒たたずに次の報酬は保存できない', () => assertFails(save(alice, { exp: 60, gold: 20 })));
await age(SID);
await t('ゴールド+201は弾く', () => assertFails(save(alice, { gold: 211 })));
await t('経験値+301は弾く', async () => { await assertFails(save(alice, { exp: 331 })); });
await t('レベルアップ（Lv1→2、余り10）でSPが1増える', () => assertSucceeds(save(alice, { lv: 2, exp: 10, sp: 1, spt: 1 })));
const lv2 = await cur();
await age(SID);
await t('1回で2レベル上げられない', () => assertFails(save(alice, { lv: 4, exp: 0, sp: 3, spt: 3 })));
await t('次のレベルに必要な分を超える経験値は弾く', () => assertFails(save(alice, { exp: 200 })));
await t('レベルが上がらないのにSPを増やせない', () => assertFails(save(alice, { sp: 3, spt: 3 })));
await t('もらったSPの合計だけを増やせない', () => assertFails(save(alice, { spt: 5 })));
await t('レベルを下げられない', () => assertFails(save(alice, { lv: 1, sp: 0, spt: 0 })));
await t('Lv50をこえられない', async () => { await seed(async (d) => d.ref(P('chars/' + SID)).update({ lv: 50, exp: 0, sp: 49, spt: 49 })); await age(SID); await assertFails(save(alice, { lv: 51, exp: 0, sp: 50, spt: 50 })); await seed(async (d) => d.ref(P('chars/' + SID)).set(lv2)); });
await t('名前は変えられない', () => assertFails(save(alice, { n: 'べつの名前' })));
await t('職業は変えられない', () => assertFails(save(alice, { j: 'mage' })));
await t('称号は自分で付けられない', () => assertFails(save(alice, { ttl: { matter: '物質の霧を晴らす者' } })));
await t('報酬と一緒に装備を付けられない', () => assertFails(save(alice, { exp: lv2.exp + 10, eq: { w: 'w3' } })));
await t('報酬と一緒に技のランクを上げられない', async () => { await age(SID); await assertFails(save(alice, { exp: lv2.exp + 10, sp: 0, sr: { 0: 1 } })); });

console.log('技のランクアップ・持っていく技・買い物');
await reset(); await make();
await seed(async (d) => d.ref(P('chars/' + SID)).update({ gold: 500, lv: 5, sp: 7, spt: 7 }));
await t('スラッシュ（MP1）を2つ目の名前へ：SP2', () => assertSucceeds(save(alice, { sp: 5, sr: { 0: 1 } })));
await t('SPを払わずにランクを上げられない', () => assertFails(save(alice, { sr: { 0: 1, 1: 1 } })));
await t('まだ覚えていない技（Lv8）は上げられない', () => assertFails(save(alice, { sp: 2, sr: { 0: 1, 3: 1 } })));
await t('ファイアソード（MP2）を2つ目へ：SP3', () => assertSucceeds(save(alice, { sp: 2, sr: { 0: 1, 1: 1 } })));
await t('ランク3（4つ目の名前）はない', () => assertFails(save(alice, { sp: 0, sr: { 0: 3, 1: 1 } })));
await t('持っていく技を選べる', () => assertSucceeds(save(alice, { ld: { a: [0, 1, 2], u: -1 } })));
await t('持っていく技の番号は0〜9', () => assertFails(save(alice, { ld: { a: [0, 12], u: -1 } })));
await t('振り直し（100ゴールド）でSPが戻る', () => assertSucceeds(save(alice, { gold: 400, sp: 7, sr: null })));
await t('お金を払わない振り直しは弾く', async () => { await save(alice, { sp: 5, sr: { 0: 1 } }); await assertFails(save(alice, { sp: 7, sr: null })); });
await t('武器（120）を買える', () => assertSucceeds(save(alice, { gold: 280, eq: { w: 'w1' } })));
await t('お金を払わずに武器を変えられない', () => assertFails(save(alice, { eq: { w: 'w3' } })));
await t('足りない額で防具を買えない', () => assertFails(save(alice, { gold: 200, eq: { w: 'w1', a: 'a2' } })));
await t('回復のしずく（30）を1つ買える', () => assertSucceeds(save(alice, { gold: 250, inv: { potion: 1 } })));
await t('お金を払わずに持ち物を増やせない', () => assertFails(save(alice, { inv: { potion: 2 } })));
await t('2種類を同時に買えない', () => assertFails(save(alice, { gold: 150, inv: { potion: 2, ether: 1 } })));
await t('持ち物を使える（減らせる）', () => assertSucceeds(save(alice, { inv: { potion: 0 } })));
await t('見た目は変えられる', () => assertSucceeds(save(alice, { lk: 'b' })));
await t('買い物で経験値は増やせない', () => assertFails(save(alice, { exp: 50 })));
await t('ゴールドを増やす買い物はできない', () => assertFails(save(alice, { gold: 999 })));

console.log('先生（チーム戦の報酬保存）');
await t('先生は報酬とボスのSP・称号を保存できる', () => assertSucceeds(save(teacher, { lv: 9, exp: 10, gold: 1000, sp: 15, spt: 15, ttl: { matter: '物質の霧を晴らす者' } })));
await t('先生は持ち物を減らせる', () => assertSucceeds(save(teacher, { inv: { potion: 0 } })));
await t('生徒は先生が付けた称号を変えられない', () => assertFails(save(alice, { ttl: { matter: 'にせもの' } })));
await t('先生は班の進み具合を書ける', () => assertSucceeds(teacher.ref(P('teams/1-2/matter/1')).set({ fl: 2, keys: 1, wins: 0, lap: 0 })));
await t('生徒は班の進み具合を書けない', () => assertFails(alice.ref(P('teams/1-2/matter/1')).set({ fl: 5, keys: 4 })));
await t('生徒は班の進み具合を読めない', () => assertFails(alice.ref(P('teams/1-2')).get()));

console.log('第1版のキャラ（sk がある）を移す');
await reset();
await seed(async (d) => d.ref(P('chars/' + SID)).set({ n: '古い', j: 'mage', lk: 'a', lv: 4, exp: 5, gold: 50, sp: 1, sk: { 0: 0, 1: 2, 2: 1 }, u: Date.now() - 60000 }));
await t('合言葉を入れる前は読めない', () => assertFails(alice.ref(P('chars/' + SID)).get()));
await claim(alice, 'alice');
await t('合言葉を入れれば今のキャラを読める', () => assertSucceeds(alice.ref(P('chars/' + SID)).get()));
await t('移さないまま報酬は保存できない', () => assertFails(save(alice, { exp: 25 })));
await t('移すときにSPを多く取れない', () => assertFails(save(alice, { sk: null, sp: 9, spt: 9 })));
await t('移すときにレベルや経験値は変えられない', () => assertFails(save(alice, { sk: null, lv: 5, exp: 0, sp: 4, spt: 4 })));
await t('移せる（振っていたポイントを返し、SP＝Lv−1）', () => assertSucceeds(save(alice, { sk: null, sp: 3, spt: 3 })));
await age(SID);
await t('移したあとは報酬を保存できる', () => assertSucceeds(save(alice, { exp: 25, gold: 60 })));

console.log('部屋（リカリアのチーム戦）');
await seed(async (d) => { await d.ref('rooms/123456/hostUid').set('teacher'); });
await t('生徒は班番号つきで参加できる', () => assertSucceeds(alice.ref('rooms/123456/players/alice').set({ nick: 'アリス', sid: SID, j: 'monk', lk: 'a', lv: 4, gp: 3 })));
await t('班番号は1〜9', () => assertFails(alice.ref('rooms/123456/players/alice').set({ nick: 'アリス', gp: 12 })));
await t('技は0〜9の番号で送れる', () => assertSucceeds(alice.ref('rooms/123456/act/alice').set({ n: 1, a: 7 })));
await t('ねらい・精霊・移動を送れる', () => assertSucceeds(alice.ref('rooms/123456/ctl/alice').set({ tg: 1, el: 'water', x: 10, y: 11, n: 2 })));
await t('知らない精霊は送れない', () => assertFails(alice.ref('rooms/123456/ctl/alice').set({ el: 'thunder' })));
await t('他人の操作は書けない', () => assertFails(bob.ref('rooms/123456/ctl/alice').set({ tg: 0 })));
await t('生徒は他人の操作を読めない', () => assertFails(alice.ref('rooms/123456/ctl').get()));
await t('班の画面（gv）は読める', () => assertSucceeds(alice.ref('rooms/123456/gv/3').get()));

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
await t('生徒は自分の記録も消せない', () => assertFails(alice.ref('practice/' + SID).remove()));
await t('生徒は記録を1件だけ消すこともできない', async () => { const r = await put(alice, SID); await assertFails(r.remove()); });
await t('先生は番号ごとに記録を消せる', async () => { await assertSucceeds(teacher.ref('practice/' + SID).remove()); let v; await seed(async (d) => { v = (await d.ref('practice/' + SID).get()).val(); }); if (v !== null) throw new Error('残っている'); });
await t('先生でも消す以外の書き換えはできない', () => assertFails(teacher.ref('practice/' + OTHER).set({ x: rec() })));

console.log(`\n${pass} 件成功 / ${fail} 件失敗`);
await env.cleanup();
process.exit(fail ? 1 : 0);
