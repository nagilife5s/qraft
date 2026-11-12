"""ルールの quest（指摘2）と practice（指摘3）の部分を作り直して書く。
  python3 tests/rules/gen_rules.py tests/firebase-rules.json
書いたら npm run test:rules で確かめてから、Firebaseコンソールに貼って公開する。"""
import json, sys
P = sys.argv[1]
R = json.load(open(P))
q = R['rules']['quest']['$y']

A = "root.child('admins').child(auth.uid).exists()"
O = "root.child('quest').child($y).child('owners').child($sid).child(auth.uid).exists()"
SID = "$sid.matches(/^[1-3]-[1-9]-[0-9]{1,2}$/)"
def N(*p): return "newData" + "".join(".child('%s')" % x for x in p) + ".val()"
def D(*p): return "data" + "".join(".child('%s')" % x for x in p) + ".val()"
def NE(*p): return "newData" + "".join(".child('%s')" % x for x in p) + ".exists()"
def DE(*p): return "data" + "".join(".child('%s')" % x for x in p) + ".exists()"
def AND(*a): return "(" + " && ".join(a) + ")"
def OR(*a): return "(" + " || ".join(a) + ")"

ITEMS = {'potion': 30, 'ether': 40, 'wing': 20}
WEAP = {'w1': 120, 'w2': 300, 'w3': 700}
ARMO = {'a1': 100, 'a2': 260, 'a3': 600}
FREE = [0, 1, 0]

# スキル：3つとも数で入っていて、「残りのポイント＋振ったポイント＝レベル」
sk_ok = AND(*[ "newData.child('sk').child('%d').isNumber()" % i for i in range(3)],
            "%s + %s + %s + %s === %s" % (N('sp'), N('sk', '0'), N('sk', '1'), N('sk', '2'), N('lv')))
def inv_le(k):   # 持ち物が増えていない（使った・そのまま）
    return OR("!" + NE('inv', k), N('inv', k) + " === 0", AND(DE('inv', k), N('inv', k) + " <= " + D('inv', k)))
def inv_inc(k):  # ちょうど1つ増えた（買った）
    return OR(AND("!" + DE('inv', k), N('inv', k) + " === 1"), AND(DE('inv', k), N('inv', k) + " === " + D('inv', k) + " + 1"))
def same(*p): return N(*p) + " === " + D(*p)
def sk_same(i): return OR(same('sk', str(i)), AND("!" + DE('sk'), N('sk', str(i)) + " === %d" % FREE[i]))
def sk_ge(i): return OR("!" + DE('sk', str(i)), N('sk', str(i)) + " >= " + D('sk', str(i)))

dl = "(%s - %s)" % (N('lv'), D('lv'))
gained = "(40 * %s + 20 * %s * %s + 10 * %s * (%s - 1) + %s - %s)" % (dl, dl, D('lv'), dl, dl, N('exp'), D('exp'))

create = AND("!data.exists()", N('lv') + " === 1", N('exp') + " === 0", N('gold') + " === 0", N('sp') + " === 0",
             N('sk', '0') + " === 0", N('sk', '1') + " === 1", N('sk', '2') + " === 0",
             "!" + NE('eq'), "!" + NE('ttl'), *[inv_le(k) for k in ITEMS])
# 戦闘の報酬：経験値（レベルアップ込み）300・ゴールド200まで、前の書き込みから20秒以上。ほかは増やせない
reward = AND(dl + " >= 0", dl + " <= 4", gained + " >= 0", gained + " <= 300", N('exp') + " < 40 + 20 * " + N('lv'),
             N('gold') + " <= " + D('gold') + " + 200",
             OR("!" + DE('u'), D('u') + " + 20000 <= now"),
             same('eq', 'w'), same('eq', 'a'), same('lk'), *[sk_same(i) for i in range(3)], *[inv_le(k) for k in ITEMS])
# 買い物・スキル・見た目・持ち物を使う：レベルと経験値はそのまま、ゴールドは値段の分だけ減る
def buy_eq(slot, table):
    return OR(same('eq', slot), *[AND(N('eq', slot) + " === '%s'" % i, N('gold') + " <= " + D('gold') + " - %d" % p) for i, p in table.items()])
ks = list(ITEMS)
shop = AND(same('lv'), same('exp'), N('gold') + " <= " + D('gold'),
           buy_eq('w', WEAP), buy_eq('a', ARMO),
           *[OR(inv_le(k), AND(inv_inc(k), N('gold') + " <= " + D('gold') + " - %d" % ITEMS[k])) for k in ks],
           *["!(%s && %s)" % (inv_inc(a), inv_inc(b)) for i, a in enumerate(ks) for b in ks[i + 1:]],
           OR(N('sp') + " <= " + D('sp'), N('gold') + " <= " + D('gold') + " - 100"),
           OR(N('sp') + " > " + D('sp'), AND(*[sk_ge(i) for i in range(3)])))
update = AND("data.exists()", same('n'), same('j'), OR(reward, shop))

ch = q['chars']
ch.pop('.read', None)
c = ch['$sid']
c['.read'] = "auth != null && (%s || %s)" % (A, O)
c['.write'] = "auth != null && %s && newData.exists() && (%s || (%s && %s && %s))" % (SID, A, O, sk_ok, OR(create, update))
c['ttl'] = {"$a": {".validate": "newData.isString() && newData.val().length <= 20 && (%s || newData.val() === data.val())" % A}}
q['owners'] = {"$sid": {".read": "auth != null && " + A, "$uid": {
    ".read": "auth != null && auth.uid === $uid",
    ".write": "auth != null && (%s || (auth.uid === $uid && !data.exists() && newData.exists() && %s && root.child('quest').child($y).child('keys').child($sid).exists() && newData.child('c').val() === root.child('quest').child($y).child('keys').child($sid).val()))" % (A, SID),
    ".validate": "newData.hasChildren(['c','t']) && newData.child('t').val() === now",
    "c": {".validate": "newData.isString() && newData.val().length <= 12"}, "t": {".validate": True}, "$other": {".validate": False}}}}
q['keys'] = {".read": "auth != null && " + A, ".write": "auth != null && " + A,
             "$sid": {".validate": SID + " && newData.isString() && newData.val().length >= 4 && newData.val().length <= 12"}}
# ---------------------------------------------------------------- 家庭練習の記録（レビュー指摘3）
# 書けるのは、その番号の持ち主（クエストと同じ合言葉）の端末だけ。y＝年度（文字列）で、その年度の持ち主かを見る
pr = R['rules']['practice']['$sid']['$key']
pr['.write'] = ("auth != null && !data.exists() && $sid.matches(/^[1-3]-[1-9]-[0-9]{1,2}$/) && newData.child('y').isString() && "
                "root.child('quest').child(newData.child('y').val()).child('owners').child($sid).child(auth.uid).exists()")
if "'y'" not in pr['.validate']:
    pr['.validate'] = pr['.validate'].replace("newData.hasChildren(['f','n','k','t'])", "newData.hasChildren(['f','n','k','t','y'])")
# 記録を消せるのは先生だけ（番号ごとにまとめて消す。書き換えや追加はできない）。2026-11-12
R['rules']['practice']['$sid']['.write'] = "auth != null && root.child('admins').child(auth.uid).exists() && !newData.exists()"
pr['y'] = {".validate": "newData.isString() && newData.val().matches(/^20[0-9][0-9]$/)"}
json.dump(R, open(P, 'w'), ensure_ascii=False, indent=2)
print('ok', len(c['.write']))
