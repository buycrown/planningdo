#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LFmall 기획전 온톨로지 분석 툴 v4 - 로컬 데이터 파이프라인
================================================================
실행: python3 build_data.py
입력: ../PLAN_DATABASE/*.json(l)   (실제 LFmall DB 16테이블)
출력: ../data.json            (기존 store.js/ontology_engine.js 호환 EVENTS/REVIEWS/CONFIG)
      ../vectors_local.json   (TF-IDF 로컬 희소 벡터 - 하이브리드 유사도의 로컬 계층)
      ../attributes.json      (조건 빌더 '속성' 소스 A: 벡터 DB 기반 속성 레지스트리)

네트워크 불요(샌드박스/PC에서 실행). Gemini 임베딩/AI 비전 속성(소스 B)은 브라우저 계층에서 별도 병합.
"""
import json, os, re, math, datetime
from collections import defaultdict, Counter

BASE = os.path.dirname(os.path.abspath(__file__))
DB   = os.path.join(BASE, "..", "PLAN_DATABASE")
OUT  = os.path.join(BASE, "..")

def p(name): return os.path.join(DB, name)

def load_json(name):
    with open(p(name), encoding="utf-8") as f:
        d = json.load(f)
    return d if isinstance(d, list) else (d.get("data") or list(d.values())[0])

def iter_jsonl(name):
    with open(p(name), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try: yield json.loads(line)
                except Exception: continue

def s(v):
    return "" if v is None else str(v).strip()

def num(v, default=0.0):
    try:
        if v in ("", None): return default
        return float(str(v).replace(",", ""))
    except Exception:
        return default

def sq(v):
    try: return str(int(float(v)))
    except Exception: return s(v)

# [0] COMMON_CODE 디코더
print("[0] COMMON_CODE 로드")
cc = load_json("COMMON_CODE.json")
CODE = defaultdict(dict)
for r in cc:
    CODE[r["COLUMNS"]][str(r["CODE"])] = r["CODE_NM"]

def decode(col, raw):
    out = []
    for c in s(raw).split(","):
        c = c.strip()
        if not c: continue
        lab = CODE.get(col, {}).get(c)
        if not lab and re.match(r"^\d+\.?\d*$", c):
            lab = CODE.get(col, {}).get(str(int(float(c))))
        if lab: out.append(lab)
    return out

# [1] 마스터 (노출중 기획전)
print("[1] LST_PLAN 마스터 로드")
plans = [r for r in load_json("LST_PLAN.json") if s(r.get("OPEN_YN")) == "Y"]
PLAN = {sq(r["PLAN_SQ"]): r for r in plans}
KEYS = set(PLAN.keys())
print("    노출중 기획전:", len(KEYS))

# [2] 상품 조인 (주의: LST_PLAN_PROD.PLAN_DTL_SQ 컬럼은 실제로 PLAN_SQ 값을 담음 - 검증완료)
print("[2] LST_PLAN_PROD 조인")
plan_prods = defaultdict(list)
need_prod = set()
for r in load_json("LST_PLAN_PROD.json"):
    if s(r.get("DEL_YN")) == "Y": continue
    psq = sq(r.get("PLAN_DTL_SQ"))
    if psq in KEYS:
        pc = s(r.get("PROD_CD"))
        if pc:
            plan_prods[psq].append(pc)
            need_prod.add(pc)
print("    상품 매핑된 기획전:", len(plan_prods), "| 필요 상품코드:", len(need_prod))

# [3] 상품정보 스트리밍
print("[3] PLAN_PROD_INFO 스트리밍")
PRODI = {}
need_brand = set()
for r in iter_jsonl("PLAN_PROD_INFO.jsonl"):
    pc = s(r.get("PROD_CD"))
    if pc in need_prod and pc not in PRODI:
        bcd = s(r.get("BRAND_CD"))
        lp = num(r.get("LIST_PRICE")); pp = num(r.get("PROD_PRICE"))
        dcr = num(r.get("DC_RATE"))
        if dcr <= 0 and lp > 0 and pp > 0:
            dcr = round((lp - pp) / lp * 100, 1)
        PRODI[pc] = {"brand": bcd, "dc": max(0.0, min(99.0, dcr)),
                     "season": s(r.get("SEASON_CD")), "item": s(r.get("ITEMKIND_CD"))}
        if bcd: need_brand.add(bcd)
print("    상품정보 확보:", len(PRODI), "| 필요 브랜드:", len(need_brand))

# [4] 브랜드 스트리밍
print("[4] STB_BRAND 스트리밍")
BRAND = {}
for r in iter_jsonl("STB_BRAND.jsonl"):
    bcd = s(r.get("BRAND_CD"))
    if bcd in need_brand and bcd not in BRAND:
        BRAND[bcd] = {"nm": s(r.get("BRAND_NM")), "enm": s(r.get("BRAND_ENM")),
                      "group": s(r.get("BRAND_GROUP_NM")), "import": s(r.get("IMPORT_YN"))}
print("    브랜드 확보:", len(BRAND))

# [5] 코드 속성
print("[5] TB_LFM12_PLAN_ATRT 디코드")
ATRT = {}
for r in load_json("TB_LFM12_PLAN_ATRT.json"):
    psq = sq(r["PLAN_SQ"])
    if psq in KEYS: ATRT[psq] = r

# [6] 카테고리/쿠폰/전시/성과
print("[6] 카테고리/쿠폰/전시/성과 조인")
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

display = defaultdict(list)
for r in load_json("PLAN_DISPLAY_POSITION.json"):
    psq = sq(r.get("기획전번호"))
    if psq in KEYS:
        display[psq].append({"area": s(r.get("전시영역")), "tab": s(r.get("전시")), "menu": s(r.get("노출메뉴"))})

revenue = {}
for r in load_json("PLAN_REVENUE.json"):
    revenue[sq(r.get("기획전 번호"))] = r

# [7] EVENT 조립 + facet 추출
print("[7] EVENT 조립 + facet 추출")
THEME_KW = ["여름","썸머","봄","스프링","가을","어텀","겨울","윈터","간절기","시즌오프","시즌 오프",
            "신상","신상품","뉴인","런칭","리뉴얼","단독","독점","베스트","스테디","페어","위크","데이",
            "페스타","페스티벌","바캉스","휴가","장마","우기","연말","설","추석","명절","크리스마스",
            "블랙프라이데이","블프","빅세일","빅딜","타임딜","원데이","리빙","홈","코디","스타일링","화보"]
BENEFIT_KW = ["최대","할인","세일","특가","균일가","쿠폰","적립","무료배송","사은품","증정","기프트",
              "1+1","캐시백","페이백","청구할인"]
def name_kw(nm, vocab):
    return [w for w in vocab if w in nm]
def tokens_for_search(nm):
    nm2 = re.sub(r"[\[\]\(\)/_·\-:]", " ", nm)
    return [t for t in re.split(r"\s+", nm2) if len(t) >= 2][:8]

EVENTS = []
attr_counter = defaultdict(lambda: defaultdict(int))

for psq in sorted(KEYS, key=lambda k: int(k)):
    m = PLAN[psq]; a = ATRT.get(psq, {}); rev = revenue.get(psq, {})
    nm = s(m.get("PLAN_NM"))

    prods = plan_prods.get(psq, [])
    dcs = sorted([PRODI[pc]["dc"] for pc in prods if pc in PRODI and PRODI[pc]["dc"] > 0])
    if dcs:
        discMin = round(dcs[max(0, int(len(dcs)*0.10))])
        discMax = round(dcs[min(len(dcs)-1, int(len(dcs)*0.90))])
    else:
        cp = num(m.get("CPN_DISCOUNT_PER"))
        discMin, discMax = (int(cp), int(cp)) if cp else (0, 0)
    if discMax < discMin: discMax = discMin

    bcounts = Counter(PRODI[pc]["brand"] for pc in prods if pc in PRODI and PRODI[pc]["brand"])
    top_brands = [BRAND[b]["enm"] or BRAND[b]["nm"] for b, _ in bcounts.most_common(4)
                  if b in BRAND and (BRAND[b]["enm"] or BRAND[b]["nm"])]
    brand_count = len(bcounts)
    prodCnt = len(set(prods))

    anly = decode("ANLY_CTGY_CD", a.get("ANLY_CTGY_CD"))
    if len(anly) >= 8:
        # 전 카테고리(8개+) 부착 = 제휴/복지몰 등 '통합형' → 개별 카테고리 속성 살포 방지
        cats = ["통합"]
        main_category = "통합"
    else:
        cats = anly or ctgy_pbsh.get(psq) or plan_cate.get(psq) or []
        main_category = cats[0] if cats else "기타"

    season = decode("EVN_SASN_CD", a.get("EVN_SASN_CD"))
    evn_type = decode("EVN_TYPE_CD", a.get("EVN_TYPE_CD"))
    dc_type = decode("DC_TYPE_CD", a.get("DC_TYPE_CD"))
    clbt = decode("CLBT_TYPE_CD", a.get("CLBT_TYPE_CD"))
    bnft = decode("BNFT_MTHD_CD", a.get("BNFT_MTHD_CD"))

    cps = plan_coupons.get(psq, [])
    coupon_type = "쿠폰있음" if cps else "쿠폰없음"
    card_benefit = any(s(c.get("CARD_CD")) for c in cps) or s(m.get("APPLY_CART_COUPON")) == "Y"
    gift_yn = s(m.get("APPLY_GIFT")) == "Y"
    hot_yn = s(m.get("HOTDEAL_YN")) == "Y"

    disp = display.get(psq, [])
    access_route = disp[0]["tab"] if disp and disp[0]["tab"] else (disp[0]["menu"] if disp else "직접진입")
    disp_areas = list({d["area"] for d in disp if d["area"]})[:3]
    multi_brand = brand_count >= 2 or any("복합 브랜드" in x for x in clbt)
    size_label = "소량(<30)" if prodCnt < 30 else ("중량(30~80)" if prodCnt < 80 else "대량(80+)")

    kw = {
        "theme":   list(dict.fromkeys(season + evn_type + name_kw(nm, THEME_KW))),
        "benefit": list(dict.fromkeys(dc_type + bnft + name_kw(nm, BENEFIT_KW) + [coupon_type]
                    + ([f"~{discMax}%할인"] if discMax > 0 else [])
                    + (["카드혜택"] if card_benefit else [])
                    + (["사은품"] if gift_yn else []) + (["핫딜"] if hot_yn else []))),
        "product": list(dict.fromkeys(cats + [size_label]
                    + (["멀티브랜드"] if multi_brand else ["단일브랜드"]) + clbt)),
        "visual":  list(dict.fromkeys(disp_areas
                    + (["콘텐츠큐레이션"] if any("컨텐츠" in x or "브랜딩" in x for x in evn_type) else []))),
        "brand":   list(dict.fromkeys(top_brands)),
    }
    for axis, vals in kw.items():
        for v in vals:
            attr_counter[axis][v] += 1

    sales_won = num(rev.get("매출액"))
    visits = int(num(rev.get("기획전 UV")))
    conv = num(rev.get("상품UV CR"))
    if conv and conv < 1: conv = round(conv * 100, 2)

    EVENTS.append({
        "id": psq, "name": nm,
        "url": "https://m.lfmall.co.kr/app/event/" + psq,
        "img": s(m.get("MOBILE_IMG_FILE")) or s(m.get("IMG_FILE")),
        "period": s(m.get("PLAN_STDT"))[:10] + "~" + s(m.get("PLAN_EDDT"))[:10],
        "discMin": discMin, "discMax": discMax,
        "prodCnt": prodCnt, "brand_count": brand_count,
        "multi_brand_yn": "Y" if multi_brand else "N",
        "is_entr_yn": "Y" if s(m.get("SPLY_ORG_YN")) == "Y" else "N",
        "main_category": main_category,
        "curation_type": (evn_type[0] if evn_type else "기타"),
        "coupon_type": coupon_type,
        "card_benefit_yn": "Y" if card_benefit else "N",
        "access_route": access_route,
        "entry_depth": len(disp_areas),
        "visibility_score": min(100, 40 + len(disp)*6),
        "complexity_score": min(100, prodCnt // 3),
        "nav_depth": 1 if disp else 3,
        "sales": round(sales_won / 10000.0),
        "visits": visits, "convRate": conv,
        "gift_yn": "Y" if gift_yn else "N",
        "hot_yn": "Y" if hot_yn else "N",
        "kinds": cats[:3], "concepts": (season + dc_type)[:3],
        "summary": main_category + " · " + (evn_type[0] if evn_type else "기획전")
                   + " · 상품 " + str(prodCnt) + "개 · 브랜드 " + str(brand_count) + "개",
        "clbt_type": clbt, "season": season, "display_areas": disp_areas,
        "real_sales_won": round(sales_won), "real_uv": visits,
        "tokens": tokens_for_search(nm),
        "kw": kw,
    })
print("    EVENTS 생성:", len(EVENTS))

# [8] 속성 레지스트리 (조건 빌더 소스 A)
ATTRIBUTES = {"source": "vector_db", "generated_at": datetime.date.today().isoformat(), "axes": {}}
for axis, vals in attr_counter.items():
    ATTRIBUTES["axes"][axis] = sorted(
        [{"value": v, "freq": f, "source": "A"} for v, f in vals.items()],
        key=lambda x: -x["freq"])

# [9] TF-IDF 로컬 벡터
print("[9] TF-IDF 로컬 벡터 산출")
docs = {}
for e in EVENTS:
    bag = []
    for axis in ("theme", "benefit", "product", "visual", "brand"):
        bag += [axis + ":" + w for w in e["kw"][axis]]
    docs[e["id"]] = bag
DF = Counter()
for bag in docs.values():
    DF.update(set(bag))
N = len(docs)
vectors = {}
for pid, bag in docs.items():
    tf = Counter(bag); vec = {}
    for term, c in tf.items():
        idf = math.log((N + 1) / (DF[term] + 1)) + 1
        vec[term] = (c / max(1, len(bag))) * idf
    norm = math.sqrt(sum(v*v for v in vec.values())) or 1.0
    vectors[pid] = {t: round(v / norm, 5) for t, v in vec.items()}

# [10] CONFIG
print("[10] CONFIG 구성")
old = json.load(open(os.path.join(OUT, "data.json"), encoding="utf-8"))
old_cfg = old.get("CONFIG", {})
CONFIG = {
    "SYN": old_cfg.get("SYN", {}),
    "AXES": old_cfg.get("AXES", []),
    "AXIS_WEIGHT": old_cfg.get("AXIS_WEIGHT", {}),
    "REV_AXES": old_cfg.get("REV_AXES", []),
    "models": [
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro"},
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash"},
    ],
    "gemini_api_key": old_cfg.get("gemini_api_key", ""),
    "data_source": "LFmall real DB",
    "built_at": datetime.datetime.now().isoformat(timespec="seconds"),
}

# [11] 저장
print("[11] 저장")
bak = os.path.join(OUT, "data.v3_backup.json")
if not os.path.exists(bak):
    with open(bak, "w", encoding="utf-8") as f:
        json.dump(old, f, ensure_ascii=False)
    print("    기존 data.json 백업 ->", os.path.basename(bak))

with open(os.path.join(OUT, "data.json"), "w", encoding="utf-8") as f:
    json.dump({"EVENTS": EVENTS, "REVIEWS": {}, "CONFIG": CONFIG}, f, ensure_ascii=False)
with open(os.path.join(OUT, "vectors_local.json"), "w", encoding="utf-8") as f:
    json.dump({"N": N, "DF": dict(DF), "vectors": vectors}, f, ensure_ascii=False)
with open(os.path.join(OUT, "attributes.json"), "w", encoding="utf-8