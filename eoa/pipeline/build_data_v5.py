#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LFmall 기획전 온톨로지 분석 툴 - 로컬 파이프라인 (재편: 7축 + 카드구성/탭/상품)"""
import json, os, re, math, datetime, urllib.parse
from collections import defaultdict, Counter

BASE = os.path.dirname(os.path.abspath(__file__))
import glob as _glob
DB_ROOT = os.path.join(BASE, "..", "PLAN_DATABASE")
_dated = sorted(d for d in _glob.glob(os.path.join(DB_ROOT, "20[0-9][0-9][0-9][0-9][0-9][0-9]")) if os.path.isdir(d))
DB   = _dated[-1] if _dated else DB_ROOT
PREP = os.path.join(BASE, "..", "prep")
OUT  = os.path.join(BASE, "..")
def p(n): return os.path.join(DB, n)
print("[DB] 기준 폴더:", os.path.basename(DB))

def load_json(name):
    fp = p(name)
    try:
        with open(fp, encoding="utf-8") as f: d = json.load(f)
    except Exception as e:
        alt = os.path.join(DB_ROOT, name)
        if os.path.abspath(alt) != os.path.abspath(fp) and os.path.exists(alt):
            with open(alt, encoding="utf-8") as f: d = json.load(f)
        else:
            raise
    return d if isinstance(d, list) else (d.get("data") or list(d.values())[0])
def s(v): return "" if v is None else str(v).strip()
def num(v, d=0.0):
    try:
        if v in ("", None): return d
        return float(str(v).replace(",", ""))
    except Exception: return d
def sq(v):
    try: return str(int(float(v)))
    except Exception: return s(v)

IMG_BASE = "https://img.lfmall.co.kr/file/WAS/display/"
def img_url(m):
    for col in ("SEARCH_IMGPATH", "THML_IMG_PATH_NM", "MOBILE_IMG_FILE", "IMG_FILE"):
        v = s(m.get(col))
        if v: return IMG_BASE + "/".join(urllib.parse.quote(x) for x in v.split("/"))
    return ""

print("[0] COMMON_CODE")
cc = load_json("COMMON_CODE.json")
CODE = defaultdict(dict)
for r in cc: CODE[r["COLUMNS"]][str(r["CODE"])] = r["CODE_NM"]
def decode(col, raw):
    out = []
    for c in s(raw).split(","):
        c = c.strip()
        if not c: continue
        lab = CODE.get(col, {}).get(c)
        if not lab and re.match(r"^\d+\.?\d*$", c): lab = CODE.get(col, {}).get(str(int(float(c))))
        if lab: out.append(lab)
    return out

print("[1] LST_PLAN")
plans = [r for r in load_json("LST_PLAN.json") if s(r.get("OPEN_YN")) == "Y"]
PLAN = {sq(r["PLAN_SQ"]): r for r in plans}
KEYS = set(PLAN.keys())
print("    plans:", len(KEYS))

print("[2] LST_PLAN_PROD_PLANSQ")
plan_prods = defaultdict(list); need_prod = set()
cur = None
with open(p("LST_PLAN_PROD_PLANSQ.json"), encoding="utf-8", errors="ignore") as f:
    for line in f:
        m = re.search(r'"PLAN_SQ"\s*:\s*(\d+)', line)
        if m: cur = m.group(1); continue
        m = re.search(r'"PROD_CD"\s*:\s*"([^"]+)"', line)
        if m and cur and cur in KEYS:
            plan_prods[cur].append(m.group(1)); need_prod.add(m.group(1))
print("    plans_with_prod:", len(plan_prods), "| need_prod:", len(need_prod))

print("[3] prodinfo_slim")
PRODI = {}; need_brand = set()
with open(os.path.join(PREP, "prodinfo_slim.jsonl"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line: continue
        try: r = json.loads(line)
        except Exception: continue
        pc = s(r.get("PROD_CD"))
        if pc in need_prod and pc not in PRODI:
            bcd = s(r.get("BRAND_CD"))
            PRODI[pc] = {"brand": bcd, "nm": s(r.get("PROD_NM")), "dc": num(r.get("DC_RATE")), "list": num(r.get("LIST_PRICE")), "price": num(r.get("PROD_PRICE"))}
            if bcd: need_brand.add(bcd)
print("    prodinfo matched:", len(PRODI), "| need_brand:", len(need_brand))

print("[4] brand_slim")
BRAND = {}
with open(os.path.join(PREP, "brand_slim.jsonl"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line: continue
        try: r = json.loads(line)
        except Exception: continue
        bcd = s(r.get("BRAND_CD"))
        if bcd in need_brand and bcd not in BRAND:
            BRAND[bcd] = {"nm": s(r.get("BRAND_NM")), "enm": s(r.get("BRAND_ENM"))}
print("    brand matched:", len(BRAND))

print("[5] TB_LFM12_PLAN_ATRT")
ATRT = {sq(r["PLAN_SQ"]): r for r in load_json("TB_LFM12_PLAN_ATRT.json") if sq(r["PLAN_SQ"]) in KEYS}

print("[6] 카드/탭/category/coupon/display/revenue")
CARD_LABEL = {
 "TOP_BANNER":"상단배너","BANNER":"배너","MID_BANNER":"중간배너","TILE_BANNER":"타일배너","BANNER_BLOCK":"배너블록",
 "B_BENEFIT":"구매혜택","P_BENEFIT":"PLUS혜택","M_BENEFIT":"멤버혜택",
 "EMP_PROD":"추천상품","NAVI":"네비게이션","ATTENTION":"유의사항","TAB_CONTAINER":"탭형구성","TEXT":"텍스트",
 "PICTORIAL":"화보형","FCFS_CPN":"선착순쿠폰","RANDOM_NO":"랜덤번호","FLASH_SALE":"타임딜","H_DEAL":"핫딜","T_DEAL":"타임딜",
 "COUNT":"카운트다운","SHARE":"공유이벤트","REVIEW":"리뷰","REVIEW_GUIDE":"리뷰가이드","MOVIE":"영상","G_PURCHASE":"공동구매",
 "ROULET":"룰렛이벤트","COMMENT":"댓글","BUY_KING":"구매왕","INVITE_STATUS":"초대현황","APP_PUSH_AGREEMENT":"앱푸시동의","ENTCODE":"제휴인증","H_DEAL ":"핫딜",
}
plan_cards = defaultdict(list)
for r in load_json("TB_LFM12_EXHB_CARD_LIST.json"):
    psq = sq(r.get("EXHB_NO"))
    if psq in KEYS and s(r.get("EPSR_YN")) == "Y":
        raw = s(r.get("CARD_TYPE_VAL"))
        plan_cards[psq].append((num(r.get("SORT_SEQ"), 0), CARD_LABEL.get(raw, raw), raw))

plan_tabs = defaultdict(list)
for r in load_json("LST_PLAN_DTL.json"):
    psq = sq(r.get("PLAN_SQ"))
    if psq in KEYS and s(r.get("STS_CD")) != "9":
        nm = s(r.get("CONNER_NM"))
        if nm and nm not in plan_tabs[psq]: plan_tabs[psq].append(nm)

ctgy_pbsh = defaultdict(list)
for r in load_json("LST_PLAN_CTGY_PBSH.json"):
    psq = sq(r["PLAN_SQ"])
    if psq in KEYS:
        lab = CODE.get("CTGY_PBSH_CD", {}).get(s(r.get("CTGY_PBSH_CD")))
        if lab: ctgy_pbsh[psq].append(lab)
plan_cate = defaultdict(list)
for r in load_json("LST_PLAN_CATEGORY.json"):
    psq = sq(r["PLAN_SQ"])
    if psq in KEYS:
        lab = CODE.get("CATEGORY_CD", {}).get(s(r.get("CATEGORY_CD")))
        if lab: plan_cate[psq].append(lab)
coupon_db = {r["COUPON_ID"]: r for r in load_json("STB_COUPON.json")}
plan_coupons = defaultdict(list)
for r in load_json("LST_PLAN_COUPON.json"):
    psq = sq(r["PLAN_SQ"])
    if psq in KEYS and s(r.get("USE_YN")) != "N":
        cp = coupon_db.get(s(r.get("COUPON_ID")))
        if cp: plan_coupons[psq].append(cp)
DEV = ("개발", "TEST", "EDIT", "(TEST)")
def ok_slot(x): return bool(x) and not any(d in x for d in DEV)
placement = defaultdict(list)
for r in load_json("PLAN_DISPLAY_POSITION_RE.json" if os.path.exists(p("PLAN_DISPLAY_POSITION_RE.json")) else "PLAN_DISPLAY_POSITION.json"):
    psq = sq(r.get("기획전번호"))
    if psq in KEYS:
        area = s(r.get("전시영역")); tab = s(r.get("전시"))
        if ok_slot(area): placement[psq].append("구좌:" + area)
        if ok_slot(tab):  placement[psq].append("탭:" + tab)
revenue = {sq(r.get("기획전 번호")): r for r in load_json("PLAN_REVENUE.json")}

print("[7] EVENT 조립")
THEME_KW = ["여름","썸머","봄","스프링","가을","어텀","겨울","윈터","간절기","시즌오프","시즌 오프","신상","신상품","뉴인","런칭","리뉴얼","단독","독점","베스트","스테디","페어","위크","데이","페스타","페스티벌","바캉스","휴가","장마","우기","연말","설","추석","명절","크리스마스","블랙프라이데이","블프","빅세일","빅딜","타임딜","원데이","리빙","홈","코디","스타일링","화보"]
BENEFIT_KW = ["최대","할인","세일","특가","균일가","쿠폰","적립","무료배송","사은품","증정","기프트","1+1","캐시백","페이백","청구할인"]
def name_kw(nm, vocab): return [w for w in vocab if w in nm]
def tokens_for_search(nm):
    nm2 = re.sub(r"[\[\]\(\)/_·\-:]", " ", nm); return [t for t in re.split(r"\s+", nm2) if len(t) >= 2][:8]
def disc_band(d):
    if d <= 0: return None
    if d <= 30: return "할인 ~30%"
    if d <= 50: return "할인 30~50%"
    return "할인 50%+"
def price_tier(mp):
    if mp <= 0: return None
    if mp < 50000: return "가성비형(~5만)"
    if mp < 150000: return "실속형(5~15만)"
    if mp < 400000: return "프리미엄형(15~40만)"
    return "럭셔리형(40만+)"
def dc_intensity(eff):
    if eff < 15: return "저할인(~15%)"
    if eff < 30: return "중할인(15~30%)"
    if eff < 50: return "고할인(30~50%)"
    return "초고할인(50%+)"

EVENTS = []
for psq in sorted(KEYS, key=lambda k: int(k)):
    m = PLAN[psq]; a = ATRT.get(psq, {}); rev = revenue.get(psq, {}); nm = s(m.get("PLAN_NM"))
    prods = plan_prods.get(psq, [])
    dcs = sorted([PRODI[pc]["dc"] for pc in prods if pc in PRODI and PRODI[pc]["dc"] > 0])
    if dcs:
        discMin = round(dcs[max(0, int(len(dcs)*0.10))]); discMax = round(dcs[min(len(dcs)-1, int(len(dcs)*0.90))])
    else:
        cpv = num(m.get("CPN_DISCOUNT_PER")); discMin, discMax = (int(cpv), int(cpv)) if cpv else (0, 0)
    if discMax < discMin: discMax = discMin
    bcounts = Counter(PRODI[pc]["brand"] for pc in prods if pc in PRODI and PRODI[pc]["brand"])
    top_brands = [BRAND[b]["enm"] or BRAND[b]["nm"] for b, _ in bcounts.most_common(5) if b in BRAND and (BRAND[b]["enm"] or BRAND[b]["nm"])]
    brand_count = len(bcounts); prodCnt = len(set(prods))
    prod_names = []
    for pc in prods:
        if pc in PRODI and PRODI[pc]["nm"]:
            n = PRODI[pc]["nm"]
            if n not in prod_names: prod_names.append(n)
        if len(prod_names) >= 8: break
    anly = decode("ANLY_CTGY_CD", a.get("ANLY_CTGY_CD"))
    if len(anly) >= 8: cats = ["통합"]; main_category = "통합"
    else:
        cats = anly or ctgy_pbsh.get(psq) or plan_cate.get(psq) or []
        main_category = cats[0] if cats else "기타"
    season = decode("EVN_SASN_CD", a.get("EVN_SASN_CD")); evn_type = decode("EVN_TYPE_CD", a.get("EVN_TYPE_CD"))
    dc_type = decode("DC_TYPE_CD", a.get("DC_TYPE_CD")); clbt = decode("CLBT_TYPE_CD", a.get("CLBT_TYPE_CD")); bnft = decode("BNFT_MTHD_CD", a.get("BNFT_MTHD_CD"))
    cps = plan_coupons.get(psq, [])
    coupon_type = "쿠폰있음" if cps else "쿠폰없음"
    card_benefit = any(s(c.get("CARD_CD")) for c in cps) or s(m.get("APPLY_CART_COUPON")) == "Y"
    gift_yn = s(m.get("APPLY_GIFT")) == "Y"; hot_yn = s(m.get("HOTDEAL_YN")) == "Y"
    place = list(dict.fromkeys(placement.get(psq, [])))[:6]
    multi_brand = brand_count >= 2 or any("복합 브랜드" in x for x in clbt)
    size_label = "소량(<30)" if prodCnt < 30 else ("중량(30~80)" if prodCnt < 80 else "대량(80+)")
    is_entr = s(m.get("SPLY_ORG_YN")) == "Y"
    db = disc_band(discMax)
    pp_list = sorted([PRODI[pc]["price"] for pc in prods if pc in PRODI and PRODI[pc]["price"] > 0])
    plan_mp = pp_list[len(pp_list)//2] if pp_list else 0
    dc_all = [PRODI[pc]["dc"] for pc in prods if pc in PRODI]
    eff_dc = (sum(dc_all)/len(dc_all)) if dc_all else 0
    ptier = price_tier(plan_mp); dintensity = dc_intensity(eff_dc) if dc_all else None
    cards_sorted = sorted(plan_cards.get(psq, []), key=lambda x: x[0])
    card_labels = list(dict.fromkeys(c[1] for c in cards_sorted))
    is_newtmpl = len(card_labels) > 0
    card_kw = (["뉴템플릿 기획전"] if is_newtmpl else []) + card_labels
    cardset_raw = set(c[2] for c in plan_cards.get(psq, []))
    strong_cpn = cardset_raw & {"FCFS_CPN", "P_BENEFIT", "M_BENEFIT"}
    coupon_kw = []
    if cps: coupon_kw.append("DB쿠폰")
    if strong_cpn: coupon_kw.append("퍼블리싱쿠폰")
    elif "B_BENEFIT" in cardset_raw: coupon_kw.append("퍼블리싱혜택카드")
    if not coupon_kw: coupon_kw.append("쿠폰없음")
    tabs = list(dict.fromkeys(plan_tabs.get(psq, [])))[:12]
    kw = {
        "placement": place,
        "theme": list(dict.fromkeys(season + evn_type + name_kw(nm, THEME_KW) + (["콘텐츠큐레이션"] if any("컨텐츠" in x or "브랜딩" in x for x in evn_type) else []))),
        "benefit": list(dict.fromkeys(dc_type + bnft + name_kw(nm, BENEFIT_KW) + [coupon_type] + ([db] if db else []) + (["카드혜택"] if card_benefit else []) + (["사은품"] if gift_yn else []) + (["핫딜"] if hot_yn else []))),
        "product": list(dict.fromkeys(cats + [size_label] + (["멀티브랜드"] if multi_brand else ["단일브랜드"]) + clbt + (["입점상품"] if is_entr else []))),
        "brand": list(dict.fromkeys(top_brands)),
        "card": card_kw,
        "coupon": coupon_kw,
        "pricetier": ([ptier] if ptier else []),
        "discount": ([dintensity] if dintensity else []),
        "metric": [],
    }
    sales_won = num(rev.get("매출액")); visits = int(num(rev.get("기획전 UV"))); conv = num(rev.get("상품UV CR"))
    if conv and conv < 1:
        conv = round(conv * 100, 2)
    if not conv:
        orders = num(rev.get("주문건수")); puv = num(rev.get("상품UV"))
        conv = round(orders / puv * 100, 2) if (orders and puv) else 0.0
    EVENTS.append({
        "id": psq, "name": nm, "url": "https://m.lfmall.co.kr/app/event/" + psq,
        "img": img_url(m), "period": s(m.get("PLAN_STDT"))[:10] + "~" + s(m.get("PLAN_EDDT"))[:10],
        "discMin": discMin, "discMax": discMax, "prodCnt": prodCnt, "brand_count": brand_count,
        "multi_brand_yn": "Y" if multi_brand else "N", "is_entr_yn": "Y" if is_entr else "N",
        "main_category": main_category, "curation_type": (evn_type[0] if evn_type else "기타"),
        "coupon_type": coupon_type, "card_benefit_yn": "Y" if card_benefit else "N",
        "access_route": (place[0].split(":",1)[-1] if place else "직접진입"), "entry_depth": len(place),
        "visibility_score": min(100, 40 + len(place)*6), "complexity_score": min(100, prodCnt // 3 + len(card_labels)*2), "nav_depth": 1 if place else 3,
        "sales": round(sales_won/10000.0), "visits": visits, "convRate": conv,
        "gift_yn": "Y" if gift_yn else "N", "hot_yn": "Y" if hot_yn else "N",
        "kinds": cats[:3], "concepts": (season + dc_type)[:3],
        "summary": main_category + " · " + (evn_type[0] if evn_type else "기획전") + " · 상품 " + str(prodCnt) + "개 · 브랜드 " + str(brand_count) + "개" + (" · 카드 " + str(len(card_labels)) if is_newtmpl else ""),
        "clbt_type": clbt, "season": season, "placements": place,
        "products": prod_names, "brands": top_brands, "tabs": tabs, "card_types": card_labels, "is_newtmpl": "Y" if is_newtmpl else "N",
        "real_sales_won": round(sales_won), "real_uv": visits, "tokens": tokens_for_search(nm), "kw": kw,
    })
print("    EVENTS:", len(EVENTS))

def band3(v, lo, hi, L): return L[0] if v <= lo else (L[1] if v <= hi else L[2])
ss = sorted([e["sales"] for e in EVENTS if e["sales"] > 0]); cv = sorted([e["convRate"] for e in EVENTS if e["convRate"] > 0])
uv = sorted([e["visits"] for e in EVENTS if e["visits"] > 0]); cm = sorted([e["complexity_score"] for e in EVENTS if e["complexity_score"] > 0])
def pct(arr, q): return arr[min(len(arr)-1, int(len(arr)*q))] if arr else 0
s33,s66=pct(ss,.33),pct(ss,.66); c33,c66=pct(cv,.33),pct(cv,.66); u33,u66=pct(uv,.33),pct(uv,.66); k33,k66=pct(cm,.33),pct(cm,.66)
for e in EVENTS:
    mt=[]
    if e["sales"]>0: mt.append("매출 "+band3(e["sales"],s33,s66,["하","중","상"]))
    if e["convRate"]>0: mt.append("전환율 "+band3(e["convRate"],c33,c66,["낮음","보통","높음"]))
    if e["visits"]>0: mt.append("유입 "+band3(e["visits"],u33,u66,["적음","보통","많음"]))
    mt.append("시인성 "+band3(e["visibility_score"],50,70,["낮음","보통","높음"]))
    mt.append("복잡도 "+band3(e["complexity_score"],k33,k66,["낮음","보통","높음"]))
    e["kw"]["metric"]=mt

AXIS_KEYS=["placement","theme","benefit","product","brand","card","coupon","pricetier","discount","metric"]
attr=defaultdict(lambda: defaultdict(int))
for e in EVENTS:
    for ax in AXIS_KEYS:
        for v in e["kw"][ax]: attr[ax][v]+=1
ATTRIBUTES={"source":"vector_db","generated_at":datetime.date.today().isoformat(),"axes":{}}
for ax in AXIS_KEYS:
    ATTRIBUTES["axes"][ax]=sorted([{"value":v,"freq":f,"source":"A"} for v,f in attr[ax].items()],key=lambda x:-x["freq"])

print("[8b] 기획전별 상품 상세 파일")
PRODDIR = os.path.join(OUT, "products")
os.makedirs(PRODDIR, exist_ok=True)
for e in EVENTS:
    psq = e["id"]; seen = set(); rows = []
    for pc in plan_prods.get(psq, []):
        if pc in seen: continue
        seen.add(pc)
        pi = PRODI.get(pc)
        if not pi: continue
        b = BRAND.get(pi["brand"], {})
        bnm = b.get("nm") or b.get("enm") or pi["brand"]
        rows.append({"code": pc, "name": pi["nm"], "brand": bnm,
                     "list": int(pi.get("list", 0)), "price": int(pi.get("price", 0))})
    with open(os.path.join(PRODDIR, psq + ".json"), "w", encoding="utf-8") as f:
        json.dump({"plan": psq, "name": e["name"], "count": len(rows), "rows": rows}, f, ensure_ascii=False)

print("[9] TF-IDF")
docs={}
for e in EVENTS:
    bag=[]
    for ax in AXIS_KEYS: bag+=[ax+":"+w for w in e["kw"][ax]]
    docs[e["id"]]=bag
DF=Counter()
for b in docs.values(): DF.update(set(b))
N=len(docs); vectors={}
for pid,b in docs.items():
    tf=Counter(b); vec={}
    for t,c in tf.items():
        idf=math.log((N+1)/(DF[t]+1))+1; vec[t]=(c/max(1,len(b)))*idf
    nrm=math.sqrt(sum(v*v for v in vec.values())) or 1.0
    vectors[pid]={t:round(v/nrm,5) for t,v in vec.items()}

print("[10] CONFIG")
try: old=json.load(open(os.path.join(OUT,"data.json"),encoding="utf-8")); oc=old.get("CONFIG",{})
except Exception:
    try: oc=json.load(open(os.path.join(OUT,"data.v3_backup.json"),encoding="utf-8")).get("CONFIG",{})
    except Exception: oc={}
AXES=[
 {"key":"placement","label":"노출 구좌","color":"#fb7185"},
 {"key":"theme","label":"테마/시즌","color":"#a78bfa"},
 {"key":"benefit","label":"혜택/가격","color":"#fcd34d"},
 {"key":"product","label":"상품/구성","color":"#86efac"},
 {"key":"brand","label":"브랜드","color":"#93c5fd"},
 {"key":"card","label":"카드 구성","color":"#fdba74"},
 {"key":"coupon","label":"쿠폰 출처/유무","color":"#fca5a5"},
 {"key":"pricetier","label":"가격 포지셔닝","color":"#34d399"},
 {"key":"discount","label":"할인 강도","color":"#f87171"},
 {"key":"metric","label":"성과 구간","color":"#f9a8d4"},
]
CONFIG={"SYN":oc.get("SYN",{}),"AXES":AXES,
 "AXIS_WEIGHT":{"placement":1.0,"theme":1.3,"benefit":1.1,"product":1.1,"brand":0.9,"card":1.0,"coupon":1.1,"pricetier":1.0,"discount":0.9,"metric":0.4},
 "REV_AXES":oc.get("REV_AXES",[]),
 "models":[
   {"id":"gemini-2.5-flash","name":"Gemini 2.5 Flash (무료·자동, 기본)"},
   {"id":"gemini-2.5-pro","name":"Gemini 2.5 Pro (API)"},
   {"id":"claude-sonnet-4-6","name":"Claude Sonnet 4.6 (API)"},
   {"id":"claude-haiku-4-5-20251001","name":"Claude Haiku 4.5 (API)"},
   {"id":"claude-desktop","name":"Claude Desktop (수동·Pro)"},
 ],
 "gemini_api_key":oc.get("gemini_api_key",""),"claude_api_key":oc.get("claude_api_key",""),
 "data_source":"LFmall real DB (updated)","built_at":datetime.datetime.now().isoformat(timespec="seconds")}

print("[11] save")
with open(os.path.join(OUT,"data.json"),"w",encoding="utf-8") as f:
    json.dump({"EVENTS":EVENTS,"REVIEWS":{},"CONFIG":CONFIG},f,ensure_ascii=False)
with open(os.path.join(OUT,"vectors_local.json"),"w",encoding="utf-8") as f:
    json.dump({"N":N,"DF":dict(DF),"vectors":vectors},f,ensure_ascii=False)
with open(os.path.join(OUT,"attributes.json"),"w",encoding="utf-8") as f:
    json.dump(ATTRIBUTES,f,ensure_ascii=False,indent=1)
print("[완료] EVENTS="+str(len(EVENTS))+" attrs="+str({k:len(v) for k,v in ATTRIBUTES["axes"].items()}))
