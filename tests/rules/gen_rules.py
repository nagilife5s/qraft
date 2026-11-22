"""ルールの quest（指摘2）と practice（指摘3）の部分を作り直して書く。
  python3 tests/rules/gen_rules.py tests/firebase-rules.json
書いたら npm run test:rules で確かめてから、Firebaseコンソールに貼って公開する。"""
import json, sys, math
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

# 値段は rikaria-data.js（GEAR_PRICE・ITEMS）と同じ。2026-11-13 確定の数値の表
ITEMS = {'potion': 30, 'ether': 40, 'wing': 20, 'potion2': 55, 'ether2': 70, 'potion3': 90, 'ether3': 110}
GEAR_PRICE = [150, 220, 300, 400, 500, 600]
WEAP = {'w%d' % (i + 1): p for i, p in enumerate(GEAR_PRICE)}
ARMO = {'a%d' % (i + 1): p for i, p in enumerate(GEAR_PRICE)}
# ひとりで冒険の1日の上限（学年×50G。2026-11-16 に 学年×10G から5倍）。gd＝日本時間の日の番号・gg＝その日に稼いだ額
DAY = 86400000
JST = 32400000
CAP = "($sid.beginsWith('1-') ? 50 : $sid.beginsWith('2-') ? 100 : 150)"
# ---------------------------------------------------------------- キャラ第2版（リカリア・2026-11-13）
# 6職業・技15個（ランク sr/<i> は 1 か 2）・もらったSPの合計 spt。数値は rikaria-data.js と同じ
JOBS = ['warrior', 'mage', 'priest', 'hunter', 'monk', 'summoner']
LEARN = [1, 3, 5, 8, 12, 16, 20, 25, 30, 36, 50, 60, 70, 80, 100]
NSK = len(LEARN)
# 技ごとのMP（6職業とも同じ並び。rikaria-data.js と合わせる）
MP = [1, 2, 1, 2, 5, 3, 2, 3, 3, 5, 3, 3, 3, 3, 5]
def cost(mp): return [6, 12] if mp >= 5 else [4, 8] if mp >= 3 else [3, 6] if mp >= 2 else [2, 4]
LV_MAX = 200
def need(L): return "(%s >= 30 ? 650 + 30 * (%s - 30) + (%s - 30) * (%s - 30) : %s >= 11 ? 650 : 100 + 50 * %s)" % (L, L, L, L, L, L)
def sr(i, w='newData'): return "%s.child('sr').child('%d')" % (w, i)
used = "(" + " + ".join("(%s.exists() ? (%s.val() >= 2 ? %d : %d) : 0)" % (sr(i), sr(i), sum(cost(MP[i])), cost(MP[i])[0]) for i in range(NSK)) + ")"
sr_ok = AND("!" + NE('sk'), N('spt') + " >= 0", "%s + %s === %s" % (N('sp'), used, N('spt')))
def inv_le(k):   # 持ち物が増えていない（使った・そのまま）
    return OR("!" + NE('inv', k), N('inv', k) + " === 0", AND(DE('inv', k), N('inv', k) + " <= " + D('inv', k)))
def inv_inc(k):  # ちょうど1つ増えた（買った）
    return OR(AND("!" + DE('inv', k), N('inv', k) + " === 1"), AND(DE('inv', k), N('inv', k) + " === " + D('inv', k) + " + 1"))
def same(*p): return N(*p) + " === " + D(*p)
def same_opt(k): return OR(AND("!" + NE(k), "!" + DE(k)), AND(NE(k), DE(k), same(k)))
def same_opt_p(*p): return OR(AND("!" + NE(*p), "!" + DE(*p)), AND(NE(*p), DE(*p), same(*p)))
gdelta = "(%s - %s)" % (N('gold'), D('gold'))
day_ok = AND(N('gd') + " * %d <= now + %d" % (DAY, JST), "now + %d < (%s + 1) * %d" % (JST, N('gd'), DAY))
gg_ok = OR(AND(DE('gd'), D('gd') + " === " + N('gd'), N('gg') + " === " + D('gg') + " + " + gdelta),
           AND(OR("!" + DE('gd'), D('gd') + " !== " + N('gd')), N('gg') + " === " + gdelta))
day_cap = OR(AND(N('gold') + " === " + D('gold'), same_opt('gd'), same_opt('gg')),
             AND(N('gold') + " > " + D('gold'), day_ok, gg_ok, N('gg') + " <= " + CAP))
def sr_same(i): return OR(AND("!" + sr(i) + ".exists()", "!" + sr(i, 'data') + ".exists()"), "%s.val() === %s.val()" % (sr(i), sr(i, 'data')))
def sr_ge(i): return OR("!" + sr(i, 'data') + ".exists()", AND(sr(i) + ".exists()", "%s.val() >= %s.val()" % (sr(i), sr(i, 'data'))))
dl = "(%s - %s)" % (N('lv'), D('lv'))
gained = "((%s === 1 ? %s : 0) + %s - %s)" % (dl, need(D('lv')), N('exp'), D('exp'))

# ---------------------------------------------------------------- やり込み（鍛冶屋・図鑑・裏ボス。2026-11-19）
# 単元の id（rikaria-data.js の UNITS と同じ12こ）。図鑑 zk・裏ボス ub は単元ごとなので、12こを並べて調べる（ルールでは子の数を数えられないため）
UIDS = ['matter', 'classify', 'force', 'earth', 'life', 'reaction', 'weather', 'electric', 'ion', 'space', 'heredity', 'energy']
GRADE = "($sid.beginsWith('1-') ? 1 : $sid.beginsWith('2-') ? 2 : 3)"
# 鍛冶屋：＋1〜＋5 の値段（rikaria-data.js の UP_PRICE・upPrice と同じ）。2026-11-20 から学年で変える：四捨五入(もと×倍率÷10)×10（JS の Math.round と同じ丸め）
UP_PRICE = [400, 600, 900, 1300, 1800]
UP_GX = {1: .35, 2: .65, 3: 1}
def up_price(g, k): return int(math.floor(UP_PRICE[k] * UP_GX[g] / 10 + .5)) * 10
def up_price_expr(k): return "($sid.beginsWith('1-') ? %d : $sid.beginsWith('2-') ? %d : %d)" % (up_price(1, k), up_price(2, k), up_price(3, k))
# レベルの節目（rikaria-data.js の MS と同じ。2026-11-20）：レベル → (SP, ゴールド×学年)
MS = {90: (2, 50), 100: (3, 100), 110: (2, 50), 120: (3, 100), 150: (5, 150), 200: (10, 300)}
def ms_add(k): return AND(NE('ms', str(k)), "!" + DE('ms', str(k)))
ms_all_same = [OR("!" + NE('ms', str(k)), DE('ms', str(k))) for k in MS]
# 裏ボスの自己ベスト（2026-11-20）：ubb/<単元> = { m: まちがい, q: 答えた問題 }・ubd＝ベストのゴールドをもらった日の番号
UBB_GOLD = 20
# ubb は消せない（keep_rec）・m と q がそろっている（.validate）ので、「新しく無い」か「前もあって m・q が同じ」ならそのまま
def ubb_same(u): return OR("!" + NE('ubb', u), AND(DE('ubb', u), same('ubb', u, 'm'), same('ubb', u, 'q')))
def ubb_chg(u): return AND(NE('ubb', u), "!" + ubb_same(u))
ubb_all_same = [ubb_same(u) for u in UIDS] + [same_opt('ubd')]
# 裏ボスをはじめて倒したときのごほうび（rikaria-data.js の URA と同じ）：SP＋5・ゴールド 学年×100
URA_SP, URA_GOLD = 5, 100
# 消せないこと（下の keep_rec）と合わせて、ub が増えていない＝そのまま
def ub_add(u): return AND(NE('ub', u), "!" + DE('ub', u))
ub_all_same = [OR("!" + NE('ub', u), DE('ub', u)) for u in UIDS]
# 図鑑・裏ボスの記録は消せない（消して取り直すと、ごほうびをもう一度もらえてしまう）。どの書き込みでも調べる
keep_rec = [OR("!" + DE(k, u), NE(k, u)) for k in ('zk', 'ub', 'bc', 'ubb', 'mt') for u in UIDS] + [OR("!" + DE('ms', str(k)), NE('ms', str(k))) for k in MS] + \
           [OR("!" + DE(k), NE(k)) for k in ('tb', 'pr')]   # 2026-11-23：単元マスターの記録 mt・称号 tb・昇格 pr も消せない
# ボスを倒した記録 bc（2026-11-19）：新しく書けるのは、ひとりで冒険の報酬の書き込みだけで、1回に1つまで。
# そのとき、経験値が60以上増えていて（ボスの報酬。いちばん弱いボスでも約70）、図鑑のその単元のボスの印（zk の 1024）もついていること。
# ほかの書き込み（買い物・振り直し・鍛冶屋・裏ボス）では増やせない。消せないのは keep_rec
def bc_add(u): return AND(NE('bc', u), "!" + DE('bc', u))
bc_all_same = [OR("!" + NE('bc', u), DE('bc', u)) for u in UIDS]
up_same = [same_opt_p('up', 'w'), same_opt_p('up', 'a')]
# 節目・自己ベストは、それぞれの道（下の mstone・ubest）だけで変えられる。ほかの書き込みではそのまま（update でまとめて調べる）
yk_same = ms_all_same + ubb_all_same
def smith_slot(slot, other):
    tier = "'%s6'" % slot
    steps = [AND(N('up', slot) + " === %d" % k, OR("!" + DE('up', slot), D('up', slot) + " === 0") if k == 1 else D('up', slot) + " === %d" % (k - 1),
                 N('gold') + " === " + D('gold') + " - " + up_price_expr(k - 1)) for k in range(1, len(UP_PRICE) + 1)]
    return AND(N('eq', slot) + " === " + tier, OR(*steps), same_opt_p('up', other))
# ---------------------------------------------------------------- 新しく作るキャラは学年の始まりの目安から（1年 Lv1・2年 Lv16・3年 Lv30。SPは Lv−1）。rikaria-data.js の START_LV・newChar と同じ（2026-11-13）
START = "($sid.beginsWith('1-') ? 1 : $sid.beginsWith('2-') ? 16 : 30)"
create = AND("!data.exists()", N('lv') + " === " + START, N('exp') + " === 0", N('gold') + " === 0", N('sp') + " === " + N('lv') + " - 1", N('spt') + " === " + N('lv') + " - 1",
             "!" + NE('sr'), "!" + NE('eq'), "!" + NE('ttl'), "!" + NE('gd'), "!" + NE('gg'), "!" + NE('up'), "!" + NE('ub'), "!" + NE('bc'), "!" + NE('ms'), "!" + NE('ubb'), "!" + NE('ubd'), *[inv_le(k) for k in ITEMS])
# 第1版のキャラ（sk がある・spt がない）を移す：レベル・経験値・ゴールドはそのまま、振っていたポイントは全部返す（spt＝Lv−1）
migrate = AND("data.exists()", OR(DE('sk'), "!" + DE('spt')), same('lv'), same('exp'), N('gold') + " <= " + D('gold'),
              N('spt') + " === " + N('lv') + " - 1", "!" + NE('sr'), same('eq', 'w'), same('eq', 'a'), same_opt('gd'), same_opt('gg'), *up_same, *ub_all_same, *bc_all_same, *yk_same, *[inv_le(k) for k in ITEMS])
# レアな敵のおたから（2026-11-20）：報酬の書き込みで、持ち物を1つだけ＋1できる（potion2・ether2・potion3・ether3 のどれか）。
# その持ち物を落とすレアの図鑑のしるし（r1＝17・r2＝18・超レア＝19）が、どれかの単元についていること（一度も倒していないのに増やせない）
ZK_BITS = 20
DROP = {'potion2': [17], 'ether2': [18], 'potion3': [19], 'ether3': [19]}
def zk_bit_any(b): return OR(*[AND(NE('zk', u), "%s %% %d >= %d" % (N('zk', u), 2 ** (b + 1), 2 ** b)) for u in UIDS])   # 無い単元の値（null）で計算しないように exists を先に
drop_ok = [OR(inv_le(k), AND(inv_inc(k), OR(*[zk_bit_any(b) for b in bs]))) for k, bs in DROP.items()]
drop_one = "(" + " + ".join("(%s ? 1 : 0)" % inv_inc(k) for k in DROP) + ") <= 1"
# 戦闘の報酬（ひとりで冒険）：1回でレベル＋1まで・経験値300・ゴールド200まで、前の書き込みから20秒以上。もらったSPはレベルと同じだけ増える
reward = AND(dl + " >= 0", dl + " <= 1", N('lv') + " <= %d" % LV_MAX, gained + " >= 0", gained + " <= 300", N('exp') + " < " + need(N('lv')),
             N('spt') + " === " + D('spt') + " + " + dl,
             N('gold') + " <= " + D('gold') + " + 200", day_cap,
             "(" + " + ".join("(%s ? 1 : 0)" % bc_add(u) for u in UIDS) + ") <= 1",
             *["(!%s || ((%s >= 60 || %s === %d) && %s %% 2048 >= 1024))" % (bc_add(u), gained, N('lv'), LV_MAX, N('zk', u)) for u in UIDS],
             OR("!" + DE('u'), D('u') + " + 20000 <= now"),
             same('eq', 'w'), same('eq', 'a'), same('lk'), *up_same, *ub_all_same, *[sr_same(i) for i in range(NSK)], *[inv_le(k) for k in ITEMS if k not in DROP], *drop_ok, drop_one)
# 買い物・技のランクアップ・見た目・持っていく技：レベル・経験値・もらったSPはそのまま、ゴールドは値段の分だけ減る
def buy_eq(slot, table):
    return OR(same('eq', slot), *[AND(N('eq', slot) + " === '%s'" % i, N('gold') + " <= " + D('gold') + " - %d" % p) for i, p in table.items()])
ks = list(ITEMS)
shop = AND(same('lv'), same('exp'), same('spt'), N('gold') + " <= " + D('gold'), same_opt('gd'), same_opt('gg'),
           buy_eq('w', WEAP), buy_eq('a', ARMO), *up_same, *ub_all_same, *bc_all_same,
           *[OR(inv_le(k), AND(inv_inc(k), N('gold') + " <= " + D('gold') + " - %d" % ITEMS[k])) for k in ks],
           *["!(%s && %s)" % (inv_inc(a), inv_inc(b)) for i, a in enumerate(ks) for b in ks[i + 1:]],
           *[sr_ge(i) for i in range(NSK)])   # 買い物ではランクを下げられない（下げるのは下の「振り直し」だけ）
# 教会の振り直し：ちょうど100ゴールドで、振ったポイントを全部戻す（sr を消して SP＝もらったSPの合計）。ほかは何も変えない（2026-11-13）
respec = AND(N('gold') + " === " + D('gold') + " - 100", "!" + NE('sr'), N('sp') + " === " + N('spt'),
             same('lv'), same('exp'), same('spt'), same('lk'), same('eq', 'w'), same('eq', 'a'), same_opt('gd'), same_opt('gg'),
             *up_same, *ub_all_same, *bc_all_same, *[same_opt_p('inv', k) for k in ITEMS])
# 鍛冶屋（2026-11-19）：6段目を付けている武器か防具を ＋1 だけ上げる。ゴールドはちょうど値段の分だけ減る。ほかは何も変えない
nochange = [same('lv'), same('exp'), same('spt'), same('lk'), same('eq', 'w'), same('eq', 'a'), same_opt('gd'), same_opt('gg'),
            *[sr_same(i) for i in range(NSK)], *[same_opt_p('inv', k) for k in ITEMS]]
smith = AND(same('spt'), *ub_all_same, OR(smith_slot('w', 'a'), smith_slot('a', 'w')))
# 裏ボスをはじめて倒した（2026-11-19）：ボスを倒した単元（前の bc が true）の ub を1つだけ新しく書き、SP（spt）がちょうど＋5・ゴールドがちょうど＋学年×100。
# ほかは何も変えない（1日の上限 gd・gg も変えない＝上限の外のごほうび）。2回目からは ub がもうあるので、この道は通れない（ふつうの reward だけ）
ura_one = "(" + " + ".join("(%s ? 1 : 0)" % ub_add(u) for u in UIDS) + ") === 1"   # 新しく書いた ub はちょうど1つ
ura_bc = ["(!%s || %s === true)" % (ub_add(u), D('bc', u)) for u in UIDS]            # それはボスを倒した単元
ura = AND(*up_same, N('spt') + " === " + D('spt') + " + %d" % URA_SP,
          N('gold') + " === " + D('gold') + " + " + GRADE + " * %d" % URA_GOLD, ura_one, *ura_bc)
# レベルの節目（2026-11-20）：節目 ms を1つだけ新しく書き、レベルがそこに届いていて、SP（spt）がちょうど＋表の数・ゴールドがちょうど＋学年×表の数。
# ほかは何も変えない（1日の上限 gd・gg の外のごほうび）。1回きりの決まった額なので、20秒の間隔は要らない。2つ目は次の保存で
ms_one = "(" + " + ".join("(%s ? 1 : 0)" % ms_add(k) for k in MS) + ") === 1"
mstone = AND(*up_same, *ub_all_same, *ubb_all_same, ms_one,
             *["(!%s || (%s >= %d && %s === %s + %d && %s === %s + %s * %d))" % (ms_add(k), D('lv'), k, N('spt'), D('spt'), sp, N('gold'), D('gold'), GRADE, g) for k, (sp, g) in MS.items()])
# 裏ボスの自己ベスト（2026-11-20）：ubb を1つの単元だけ、前より良く（まちがいが少ない・同じなら答えた問題が少ない）書く。その単元の裏ボスを倒していること（ub）。
# その日はじめてのベストなら ubd を今日にしてゴールドちょうど＋学年×20、そうでなければ ubd・ゴールドはそのまま。ほかは何も変えない
ubb_one = "(" + " + ".join("(%s ? 1 : 0)" % ubb_chg(u) for u in UIDS) + ") === 1"
ubb_ok = ["(!%s || (%s === true && (!%s || %s < %s || (%s === %s && %s < %s))))" % (ubb_chg(u), D('ub', u), DE('ubb', u), N('ubb', u, 'm'), D('ubb', u, 'm'),
          N('ubb', u, 'm'), D('ubb', u, 'm'), N('ubb', u, 'q'), D('ubb', u, 'q')) for u in UIDS]
ubd_ok = AND(N('ubd') + " * %d <= now + %d" % (DAY, JST), "now + %d < (%s + 1) * %d" % (JST, N('ubd'), DAY))
ubest = AND(same('spt'), *up_same, *ub_all_same, *ms_all_same, ubb_one, *ubb_ok,
            OR(AND(N('gold') + " === " + D('gold'), same_opt('ubd')),
               AND(OR("!" + DE('ubd'), D('ubd') + " !== " + N('ubd')), ubd_ok, N('gold') + " === " + D('gold') + " + " + GRADE + " * %d" % UBB_GOLD)))
fixed0 = [c for c in nochange if c != same('spt')] + bc_all_same
fixed = AND(*fixed0, OR(mstone, ubest))
# 教会で職業を変える（2026-11-20）：ちょうど 学年×100ゴールドで、職業 j（と見た目 lk）を変える。技のランク sr を消して SP＝もらったSPの合計（新しい職業で選び直す）。
# 持っていく技 ld は消す。レベル・経験値・装備（段階は職業に関係ない）・鍛冶屋・図鑑・称号などは そのまま
JOBCHG_GOLD = 100
jobchg = AND(N('j') + " !== " + D('j'), N('gold') + " === " + D('gold') + " - " + GRADE + " * %d" % JOBCHG_GOLD, "!" + NE('sr'), "!" + NE('ld'), N('sp') + " === " + N('spt'),
             same('lv'), same('exp'), same('spt'), same('eq', 'w'), same('eq', 'a'), same_opt('gd'), same_opt('gg'),
             *up_same, *ub_all_same, *bc_all_same, *yk_same, *[same_opt_p('inv', k) for k in ITEMS])
update = AND("data.exists()", DE('spt'), "!" + DE('sk'), same('n'), *keep_rec,
             OR(AND(same('j'), OR(AND(*yk_same, OR(reward, shop, respec, AND(*fixed0, OR(smith, ura)))), fixed)), jobchg))
# ↑ smith・ura・mstone・ubest は「ほかは何も変えない（nochange・bc）」が同じなので、ルールを短くするため fixed にまとめて1回だけ調べる。
#   節目・自己ベストは mstone・ubest のほかではそのまま（yk_same）

ch = q['chars']
ch.pop('.read', None)
c = ch['$sid']
c['.read'] = "auth != null && (%s || %s)" % (A, O)
# 先生はキャラを消せる（作り直し。記録画面から。2026-11-16）。生徒は消せない
c['.write'] = "auth != null && %s && (%s || (newData.exists() && %s && %s && %s))" % (SID, A, O, sr_ok, OR(create, migrate, update))
c['.validate'] = ("newData.hasChildren(['n','j','lv','exp','gold','sp','spt']) && newData.child('n').isString() && newData.child('n').val().length >= 1 && newData.child('n').val().length <= 8"
                  " && newData.child('lv').isNumber() && newData.child('lv').val() >= 1 && newData.child('lv').val() <= %d" % LV_MAX +
                  " && newData.child('exp').isNumber() && newData.child('exp').val() >= 0 && newData.child('exp').val() <= 1000000"
                  " && newData.child('gold').isNumber() && newData.child('gold').val() >= 0 && newData.child('gold').val() <= 1000000"
                  " && newData.child('sp').isNumber() && newData.child('sp').val() >= 0 && newData.child('sp').val() <= 600"
                  " && newData.child('spt').isNumber() && newData.child('spt').val() >= 0 && newData.child('spt').val() <= 600")
c['spt'] = {".validate": True}
c['gd'] = {".validate": "newData.isNumber() && newData.val() >= 0"}
c['gg'] = {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 150"}
# ひとりで冒険のボスを倒した単元（単元の id → true）。2026-11-16
c['bc'] = {"$k": {".validate": "$k.matches(/^[a-z]{2,12}$/) && newData.val() === true"}}
# 鍛冶屋の ＋（0〜5 の整数）・図鑑（単元ごとの 0〜2047 の整数。しるしは増えるだけ）・裏ボス（単元 → true）。2026-11-19
c['up'] = {k: {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 5 && newData.val() % 1 === 0"} for k in ('w', 'a')}
c['up']['$other'] = {".validate": False}
# 図鑑のしるしは「前にあったしるしが全部残っている」ことを、20このしるしごとに（2026-11-20 に11→20。0〜10 の番号は前と同じなので、前の値もそのまま通る）割り算の余りで調べる（ルールにビット演算がないため）。
# しるし b があるのは (数 % 2^(b+1)) >= 2^b のとき
zk_keep = " && ".join("(!(data.val() %% %d >= %d) || newData.val() %% %d >= %d)" % (2 ** (b + 1), 2 ** b, 2 ** (b + 1), 2 ** b) for b in range(ZK_BITS))
UKEY = "(" + " || ".join("$k === '%s'" % u for u in UIDS) + ")"
c['zk'] = {"$k": {".validate": UKEY + " && newData.isNumber() && newData.val() >= 0 && newData.val() <= %d && newData.val() %% 1 === 0 && (!data.exists()" % (2 ** ZK_BITS - 1) + " || " + zk_keep + ")"}}
c['ub'] = {"$k": {".validate": UKEY + " && newData.val() === true"}}
# 節目（"90" など → true）・裏ボスの自己ベスト（単元 → { m, q }：0〜200 の整数）・ベストのゴールドの日（日の番号）。2026-11-20
c['ms'] = {"$k": {".validate": "(" + " || ".join("$k === '%d'" % k for k in MS) + ") && newData.val() === true"}}
INT200 = "newData.isNumber() && newData.val() >= 0 && newData.val() <= 200 && newData.val() % 1 === 0"
c['ubb'] = {"$k": {".validate": UKEY + " && newData.hasChildren(['m','q'])", "m": {".validate": INT200}, "q": {".validate": INT200}, "$other": {".validate": False}}}
c['ubd'] = {".validate": "newData.isNumber() && newData.val() >= 0"}
# 5階のダンジョンで、たどり着いた一番深い階（単元 → 2〜5 の整数）。2026-11-20。ごほうびではないので、ほかの書き込み（買い物の形など）といっしょに変わってよい
c['df'] = {"$k": {".validate": UKEY + " && newData.isNumber() && newData.val() >= 2 && newData.val() <= 5 && newData.val() % 1 === 0"}}
# 裏ダンジョン（2026-11-23）：たどり着いた一番深い階（単元 → 2〜10。11＝いちばん下のボスを倒した）。df と同じく、ほかの書き込みといっしょに変わってよい
c['uf'] = {"$k": {".validate": UKEY + " && newData.isNumber() && newData.val() >= 2 && newData.val() <= 11 && newData.val() % 1 === 0"}}
# 単元マスター（2026-11-23）：mt/<単元> = { a 答えた数, c 正解, b 連続正解のベスト, s いまの連続 }。a・c・b は減らない。c・b・s は a まで
MT_CAP = 100000
def mt_int(k, le):
    return {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() %% 1 === 0 && newData.val() <= %s" % le + ("" if k == 's' else " && (!data.exists() || newData.val() >= data.val())")}
MTA = "newData.parent().child('a').val()"
c['mt'] = {"$k": {".validate": UKEY + " && newData.hasChildren(['a','c','b','s'])", "a": mt_int('a', str(MT_CAP)), "c": mt_int('c', MTA), "b": mt_int('b', MTA), "s": mt_int('s', "newData.parent().child('b').val()"),
                  "$other": {".validate": False}}}
# 称号のしるし tb（単元の並び UIDS の i 番目＝2^i）。前のしるしは残す。新しく付けたしるしの単元は、mt が条件（30問以上・正解率90%以上・10問連続）を満たしていること
def mt_ok(u):
    m = lambda k: "newData.parent().child('mt').child('%s').child('%s').val()" % (u, k)
    return "(newData.parent().child('mt').child('%s').exists() && %s >= 30 && %s * 10 >= %s * 9 && %s >= 10)" % (u, m('a'), m('c'), m('a'), m('b'))
tb_new = " && ".join("(!(newData.val() %% %d >= %d) || (data.exists() && data.val() %% %d >= %d) || %s)" % (2 ** (i + 1), 2 ** i, 2 ** (i + 1), 2 ** i, mt_ok(u)) for i, u in enumerate(UIDS))
tb_keep = " && ".join("(!(data.val() %% %d >= %d) || newData.val() %% %d >= %d)" % (2 ** (i + 1), 2 ** i, 2 ** (i + 1), 2 ** i) for i in range(len(UIDS)))
c['tb'] = {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= %d && newData.val() %% 1 === 0 && (!data.exists() || %s) && %s" % (2 ** len(UIDS) - 1, tb_keep, tb_new)}
# 名前の横に出す称号 tc（単元の id）。その単元のしるしが tb にあること
c['tc'] = {".validate": OR(*["(newData.val() === '%s' && newData.parent().child('tb').val() %% %d >= %d)" % (u, 2 ** (i + 1), 2 ** i) for i, u in enumerate(UIDS)])}
# 昇格（2026-11-23）：pr＝true。Lv100 から（消せないのは keep_rec）
c['pr'] = {".validate": "newData.val() === true && newData.parent().child('lv').val() >= 100"}
c['eq'] = {"w": {".validate": " || ".join("newData.val() === '%s'" % k for k in WEAP)},
           "a": {".validate": " || ".join("newData.val() === '%s'" % k for k in ARMO)}, "$other": {".validate": False}}
c['inv'] = {"$k": {".validate": "(" + " || ".join("$k === '%s'" % k for k in ITEMS) + ") && newData.isNumber() && newData.val() >= 0 && newData.val() <= 9"}}
c['j'] = {".validate": " || ".join("newData.val() === '%s'" % j for j in JOBS)}
c.pop('sk', None)
c['sr'] = {**{str(i): {".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 2 && newData.parent().parent().child('lv').val() >= %d" % LEARN[i]} for i in range(NSK)}, "$other": {".validate": False}}
c['ld'] = {"a": {"$k": {".validate": "$k.matches(/^[0-3]$/) && newData.isNumber() && newData.val() >= 0 && newData.val() <= %d" % (NSK - 1)}},
           "u": {".validate": "newData.isNumber() && newData.val() >= -1 && (newData.val() <= %d || (newData.val() === %d && newData.parent().parent().child('pr').val() === true))" % (NSK - 1, NSK)}, "$other": {".validate": False}}
c['ttl'] = {"$a": {".validate": "newData.isString() && newData.val().length <= 20 && (%s || newData.val() === data.val())" % A}}
# クラスの記録（町の名前 town・町の段階 stage・単元 areas・オブリオン ob/obDone など）。読むのは誰でも、書くのは先生だけ。
# 中身の形は決めていない（先生の端末なら新しい項目を足せる）。生徒の端末からは書けない
q['classes'] = {".read": "auth != null", ".write": "auth != null && " + A}
# クラスの図鑑（2026-11-20）。quest/<年度>/czk/<学年-組>/<単元>/<番号> = その人の図鑑のしるし（キャラの zk/<単元> と同じ数）。
# 読むのはログインした人みんな（画面には、合わせた数と人数だけを出す）。書けるのは先生と、その番号の持ち主だけで、値は自分のキャラの図鑑と同じ数だけ（ごまかせない）
q['czk'] = {".read": "auth != null", ".write": "auth != null && " + A, "$gc": {".validate": "$gc.matches(/^[1-3]-[1-9]$/)", "$u": {".validate": UKEY.replace('$k', '$u'), "$n": {
    ".write": "auth != null && $n.matches(/^[0-9]{1,2}$/) && root.child('quest').child($y).child('owners').child($gc + '-' + $n).child(auth.uid).exists()"
              " && newData.val() === root.child('quest').child($y).child('chars').child($gc + '-' + $n).child('zk').child($u).val()",
    ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= %d && newData.val() %% 1 === 0" % (2 ** ZK_BITS - 1)}}}}
# 班の進み具合（先生だけ）。quest/<年度>/teams/<学年-組>/<単元>/<班>
q['teams'] = {".read": "auth != null && " + A, ".write": "auth != null && " + A}
# テスト範囲（ひとりで冒険の出題範囲。先生が記録画面で作る）。quest/<年度>/ranges/<学年>/<id> = { n: 名前, u: { <単元id>: true } }
# 読むのは誰でも（生徒が冒険の前にえらぶ）、書くのは先生だけ。2026-11-16
# s: { <セットid>: true } は任意。あれば冒険ではそのセットだけ出す（期末対策。2026-11-17）
# x: { <セットid>: { <問題の番号（0始まり）>: true } } は任意。そのセットから外す問題（問題の一覧から作った範囲。2026-11-17）
q['ranges'] = {".read": "auth != null", ".write": "auth != null && " + A, "$g": {".validate": "$g.matches(/^[1-3]$/)", "$id": {
    ".validate": "newData.hasChildren(['n','u']) && newData.child('n').isString() && newData.child('n').val().length >= 1 && newData.child('n').val().length <= 20",
    "n": {".validate": True}, "u": {"$k": {".validate": "$k.matches(/^[a-z]{2,12}$/) && newData.val() === true"}}, "s": {"$k": {".validate": "$k.matches(/^[a-z0-9]{8}$/) && newData.val() === true"}},
    "x": {"$k": {".validate": "$k.matches(/^[a-z0-9]{8}$/)", "$i": {".validate": "$i.matches(/^[0-9]{1,3}$/) && newData.val() === true"}}}, "$other": {".validate": False}}}}
# ---------------------------------------------------------------- 部屋（リカリアのチーム戦で足した場所）
rm = R['rules']['rooms']['$pin']
pl = rm['players']['$uid']
pl['j'] = {".validate": " || ".join("newData.val() === '%s'" % j for j in JOBS)}
pl['lv'] = {".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= %d" % LV_MAX}   # 2026-11-23：99 までだと Lv100 からチーム戦に入れなかった
pl['gp'] = {".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 9"}
HOST = "root.child('rooms').child($pin).child('hostUid').val() === auth.uid"
# なかまと冒険（生徒が開く部屋）：参加者が自分の強さの写し m を部屋に出す（進行役の端末はほかの人のキャラを読めないため）。JSON文字列で800字まで。
# 部屋の作り・進行は先生と同じ道（rooms/<参加コード>。hostUid を最初に書いた人が持ち主）で、ルールは変えていない。ごほうびは各自の端末が自分のキャラに書く（ひとりで冒険と同じ reward のルール）
pl['m'] = {".validate": "newData.isString() && newData.val().length <= 800"}
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
# 冒険の記録（2026-11-17）：家庭練習と同じ場所に、m＝'q'（ひとりで冒険）・'p'（なかまと冒険）・'t'（チーム戦）、u＝単元id、s＝かかった秒 を足せる
pr['m'] = {".validate": "newData.val() === 'q' || newData.val() === 'p' || newData.val() === 't'"}
pr['u'] = {".validate": "newData.isString() && newData.val().matches(/^[a-z]{2,12}$/)"}
pr['s'] = {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 36000"}
# 先生が手で直した問題（記録画面の「問題」タブ。2026-11-17）。qedits/<セットid>/<問題の番号> = { q, c:{0..9: 文字}, a, ex, t, by }
# 読むのはログインした人みんな（問題を読みこむ画面が重ねる）、書く・消すのは先生だけ
# 章の移しかえ（記録画面の「問題」タブ。2026-11-18）。chedits/<セットid> = 章の名前。読むのはログインした人みんな、書くのは先生だけ
R['rules']['chedits'] = {".read": "auth != null", ".write": "auth != null && " + A,
  "$set": {".validate": "$set.matches(/^[a-z0-9-]{1,24}$/) && newData.isString() && newData.val().length >= 1 && newData.val().length <= 60"}}
R['rules']['qedits'] = {".read": "auth != null", ".write": "auth != null && " + A,
  "$set": {".validate": "$set.matches(/^[a-z0-9-]{1,24}$/)", "$i": {
    ".validate": "$i.matches(/^[0-9]{1,3}$/) && newData.hasChildren(['t'])",
    "q": {".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 600"},
    "c": {"$j": {".validate": "$j.matches(/^[0-9]$/) && newData.isString() && newData.val().length <= 200"}},
    "a": {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 9"},
    "ex": {".validate": "newData.isString() && newData.val().length <= 1000"},
    "t": {".validate": "newData.isNumber()"},
    "by": {".validate": "newData.isString() && newData.val().length <= 40"},
    "$other": {".validate": False}}}}
# 生徒ごとの問題の色（2026-11-19）。qstat/<年度>/<番号>/<セットid> = 文字列（1問1字：0 まだ・1 まちがえた・2 1回正解・3 2回続けて正解）
# 読む・書くのは、その年度の番号の持ち主の端末だけ。先生は読める（チーム戦で出す問題をえらぶ）・番号ごと消せる
R['rules']['qstat'] = {"$y": {".validate": "$y.matches(/^20[0-9][0-9]$/)", "$sid": {
  ".read": "auth != null && (" + A + " || root.child('quest').child($y).child('owners').child($sid).child(auth.uid).exists())",
  ".write": "auth != null && " + A + " && !newData.exists()",
  "$set": {
    ".write": "auth != null && " + SID + " && root.child('quest').child($y).child('owners').child($sid).child(auth.uid).exists()",
    ".validate": "$set.matches(/^[a-z0-9-]{1,24}$/) && newData.isString() && newData.val().length <= 400 && newData.val().matches(/^[0-3]*$/)"}}}}
json.dump(R, open(P, 'w'), ensure_ascii=False, indent=2)
print('ok', len(c['.write']))
