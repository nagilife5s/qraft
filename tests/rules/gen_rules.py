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
# ---------------------------------------------------------------- キャラ第2版（リカリア・2026-11-13）
# 6職業・技10個（ランク sr/<i> は 1 か 2）・もらったSPの合計 spt。数値は rikaria-data.js と同じ
JOBS = ['warrior', 'mage', 'priest', 'hunter', 'monk', 'summoner']
LEARN = [1, 3, 5, 8, 12, 16, 20, 25, 30, 36]
MP = [1, 2, 1, 2, 5, 3, 2, 3, 3, 5]
def cost(mp): return [6, 12] if mp >= 5 else [4, 8] if mp >= 3 else [3, 6] if mp >= 2 else [2, 4]
LV_MAX = 50
def need(L): return "(%s >= 11 ? 650 : 100 + 50 * %s)" % (L, L)
def sr(i, w='newData'): return "%s.child('sr').child('%d')" % (w, i)
used = "(" + " + ".join("(%s.exists() ? (%s.val() >= 2 ? %d : %d) : 0)" % (sr(i), sr(i), sum(cost(MP[i])), cost(MP[i])[0]) for i in range(10)) + ")"
sr_ok = AND("!" + NE('sk'), N('spt') + " >= 0", "%s + %s === %s" % (N('sp'), used, N('spt')))
def inv_le(k):   # 持ち物が増えていない（使った・そのまま）
    return OR("!" + NE('inv', k), N('inv', k) + " === 0", AND(DE('inv', k), N('inv', k) + " <= " + D('inv', k)))
def inv_inc(k):  # ちょうど1つ増えた（買った）
    return OR(AND("!" + DE('inv', k), N('inv', k) + " === 1"), AND(DE('inv', k), N('inv', k) + " === " + D('inv', k) + " + 1"))
def same(*p): return N(*p) + " === " + D(*p)
def sr_same(i): return OR(AND("!" + sr(i) + ".exists()", "!" + sr(i, 'data') + ".exists()"), "%s.val() === %s.val()" % (sr(i), sr(i, 'data')))
def sr_ge(i): return OR("!" + sr(i, 'data') + ".exists()", AND(sr(i) + ".exists()", "%s.val() >= %s.val()" % (sr(i), sr(i, 'data'))))
dl = "(%s - %s)" % (N('lv'), D('lv'))
gained = "((%s === 1 ? %s : 0) + %s - %s)" % (dl, need(D('lv')), N('exp'), D('exp'))

create = AND("!data.exists()", N('lv') + " === 1", N('exp') + " === 0", N('gold') + " === 0", N('sp') + " === 0", N('spt') + " === 0",
             "!" + NE('sr'), "!" + NE('eq'), "!" + NE('ttl'), *[inv_le(k) for k in ITEMS])
# 第1版のキャラ（sk がある・spt がない）を移す：レベル・経験値・ゴールドはそのまま、振っていたポイントは全部返す（spt＝Lv−1）
migrate = AND("data.exists()", OR(DE('sk'), "!" + DE('spt')), same('lv'), same('exp'), N('gold') + " <= " + D('gold'),
              N('spt') + " === " + N('lv') + " - 1", "!" + NE('sr'), same('eq', 'w'), same('eq', 'a'), *[inv_le(k) for k in ITEMS])
# 戦闘の報酬（ひとりで冒険）：1回でレベル＋1まで・経験値300・ゴールド200まで、前の書き込みから20秒以上。もらったSPはレベルと同じだけ増える
reward = AND(dl + " >= 0", dl + " <= 1", N('lv') + " <= %d" % LV_MAX, gained + " >= 0", gained + " <= 300", N('exp') + " < " + need(N('lv')),
             N('spt') + " === " + D('spt') + " + " + dl,
             N('gold') + " <= " + D('gold') + " + 200",
             OR("!" + DE('u'), D('u') + " + 20000 <= now"),
             same('eq', 'w'), same('eq', 'a'), same('lk'), *[sr_same(i) for i in range(10)], *[inv_le(k) for k in ITEMS])
# 買い物・技のランクアップ・見た目・持っていく技：レベル・経験値・もらったSPはそのまま、ゴールドは値段の分だけ減る
def buy_eq(slot, table):
    return OR(same('eq', slot), *[AND(N('eq', slot) + " === '%s'" % i, N('gold') + " <= " + D('gold') + " - %d" % p) for i, p in table.items()])
ks = list(ITEMS)
shop = AND(same('lv'), same('exp'), same('spt'), N('gold') + " <= " + D('gold'),
           buy_eq('w', WEAP), buy_eq('a', ARMO),
           *[OR(inv_le(k), AND(inv_inc(k), N('gold') + " <= " + D('gold') + " - %d" % ITEMS[k])) for k in ks],
           *["!(%s && %s)" % (inv_inc(a), inv_inc(b)) for i, a in enumerate(ks) for b in ks[i + 1:]],
           OR(AND(*[sr_ge(i) for i in range(10)]), N('gold') + " <= " + D('gold') + " - 100"))   # ランクを下げる（振り直し）は100ゴールド
update = AND("data.exists()", DE('spt'), "!" + DE('sk'), same('n'), same('j'), OR(reward, shop))

ch = q['chars']
ch.pop('.read', None)
c = ch['$sid']
c['.read'] = "auth != null && (%s || %s)" % (A, O)
c['.write'] = "auth != null && %s && newData.exists() && (%s || (%s && %s && %s))" % (SID, A, O, sr_ok, OR(create, migrate, update))
c['.validate'] = ("newData.hasChildren(['n','j','lv','exp','gold','sp','spt']) && newData.child('n').isString() && newData.child('n').val().length >= 1 && newData.child('n').val().length <= 8"
                  " && newData.child('lv').isNumber() && newData.child('lv').val() >= 1 && newData.child('lv').val() <= %d" % LV_MAX +
                  " && newData.child('exp').isNumber() && newData.child('exp').val() >= 0 && newData.child('exp').val() <= 100000"
                  " && newData.child('gold').isNumber() && newData.child('gold').val() >= 0 && newData.child('gold').val() <= 1000000"
                  " && newData.child('sp').isNumber() && newData.child('sp').val() >= 0 && newData.child('sp').val() <= 300"
                  " && newData.child('spt').isNumber() && newData.child('spt').val() >= 0 && newData.child('spt').val() <= 300")
c['spt'] = {".validate": True}
c['j'] = {".validate": " || ".join("newData.val() === '%s'" % j for j in JOBS)}
c.pop('sk', None)
c['sr'] = {**{str(i): {".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 2 && newData.parent().parent().child('lv').val() >= %d" % LEARN[i]} for i in range(10)}, "$other": {".validate": False}}
c['ld'] = {"a": {"$k": {".validate": "$k.matches(/^[0-3]$/) && newData.isNumber() && newData.val() >= 0 && newData.val() <= 9"}},
           "u": {".validate": "newData.isNumber() && newData.val() >= -1 && newData.val() <= 9"}, "$other": {".validate": False}}
c['ttl'] = {"$a": {".validate": "newData.isString() && newData.val().length <= 20 && (%s || newData.val() === data.val())" % A}}
# 班の進み具合（先生だけ）。quest/<年度>/teams/<学年-組>/<単元>/<班>
q['teams'] = {".read": "auth != null && " + A, ".write": "auth != null && " + A}
# ---------------------------------------------------------------- 部屋（リカリアのチーム戦で足した場所）
rm = R['rules']['rooms']['$pin']
pl = rm['players']['$uid']
pl['j'] = {".validate": " || ".join("newData.val() === '%s'" % j for j in JOBS)}
pl['gp'] = {".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 9"}
HOST = "root.child('rooms').child($pin).child('hostUid').val() === auth.uid"
rm['act']['$uid']['.validate'] = "newData.hasChildren(['n','a']) && newData.child('n').isNumber() && newData.child('a').isNumber() && newData.child('a').val() >= 0 && newData.child('a').val() <= 9"
rm['ctl'] = {".read": "auth != null && " + HOST, "$uid": {
    ".write": "auth != null && auth.uid === $uid && root.child('rooms').child($pin).child('players').child($uid).exists()",
    "tg": {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 5"},
    "el": {".validate": "newData.val() === 'fire' || newData.val() === 'water' || newData.val() === 'wind' || newData.val() === 'earth'"},
    "md": {".validate": "newData.val() === 'atk' || newData.val() === 'heal'"},
    "x": {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 60"},
    "y": {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 60"},
    "n": {".validate": "newData.isNumber()"},
    "$other": {".validate": False}}}
rm['gv'] = {".read": "auth != null"}
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
