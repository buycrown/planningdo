#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LFmall 상품 온톨로지 파이프라인 (기획전 구성상품 추천용)
목적: AI PLAN이 기획전 추천 시 '구성 상품'까지 추천하도록, 상품 속성축 + 상품-상품 관계(동시구성)를 도출.
입력:
  ../prep/allprod_slim.jsonl       (전 판매상품 슬림: PROD_CD,BRAND_CD,ITEMKIND_CD,PROD_PRICE,DC_RATE,PROD_TYPE)
  ../PLAN_DATABASE/<최신>/LST_PLAN_PROD_PLANSQ.json (기획전-상품)
  ../prep/prodinfo_slim.jsonl      (기획전 상품 브랜드/가격/할인)
  ../prep/brand_slim.jsonl         (브랜드 명칭)
출력:
  ../product_attributes.json       (상품 속성 레지스트리: 5축 + 빈도, 소스 A')
  ../product_cooc.json             (브랜드/품목군 동시구성 = 연관규칙 lift)
  ../docs/product_ontology_YYYY-MM-DD.md
상품 5축: pricetier(가격대)·discount(할인강도)·itemkind(품목군)·prodtype(상품유형)·coverage(기획전노출)
"""
import json, os, re, glob, datetime, math
from collections import defaultdict, Counter

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(BASE, "..")
PREP = os.path.join(ROOT, "prep")
DOCS = os.path.join(ROOT, "docs")
os.makedirs(DOCS, exist_ok=True)
DB_ROOT = os.path.join(ROOT, "PLAN_DATABASE")
_dated = sorted(d for d in glob.glob(os.path.join(DB_ROOT, "20[0-9][0-9][0-9][0-9][0-9][0-9]")) if os.path.isdir(d))
DB = _dated[-1] if _dated else DB_ROOT
TODAY = datetime.date.today().isoformat()
print("[DB] 기준 폴더:", os.path.basename(DB))

def sq(v):
    try: return str(int(float(v)))
    except Exception: return str(v).strip()

# ---- 1) 기획전-상품 매핑 + 기획전 집합 ----
print("[1] 기획전-상품 매핑")
def load(fp):
    d = json.load(open(fp, encoding="utf-8"))
    return d if isinstance(d, list) else (d.get("data") or list(d.values())[0])
plan_keys = {sq(r["PLAN_SQ"]) for r in load(os.path.join(DB, "LST_PLAN.json")) if str(r.get("OPEN_YN")).strip() == "Y"}
plan_prods = defaultdict(list); inplan = set()
cur = None
with open(os.path.join(DB, "LST_PLAN_PROD_PLANSQ.json"), encoding="utf-8", errors="ignore") as f:
    for line in f:
        m = re.search(r'"PLAN_SQ"\s*:\s*(\d+)', line)
        if m: cur = m.group(1); continue
        m = re.search(r'"PROD_CD"\s*:\s*"([^"]+)"', line)
        if m and cur in plan_keys:
            plan_prods[cur].append(m.group(1)); inplan.add(m.group(1))
print("    기획전:", len(plan_keys), "| 기획전노출 상품:", len(inplan))

# ---- 2) 브랜드 명칭 + 기획전상품 브랜드 ----
bname = {}
for line in open(os.path.join(PREP, "brand_slim.jsonl"), encoding="utf-8"):
    try: r = json.loads(line)
    except Exception: continue
    bname[r["BRAND_CD"]] = r.get("BRAND_NM") or r.get("BRAND_ENM") or r["BRAND_CD"]
prod_brand = {}
for line in open(os.path.join(PREP, "prodinfo_slim.jsonl"), encoding="utf-8"):
    try: r = json.loads(line)
    except Exception: continue
    prod_brand[r["PROD_CD"]] = r.get("BRAND_CD")

# ---- 3) 전 카탈로그 속성 분포 (allprod_slim 스트리밍) ----
print("[2] 전 카탈로그 속성 분포 (스트리밍)")
def price_tier(p):
    if p < 30000: return "가성비(~3만)"
    if p < 100000: return "실속(3~10만)"
    if p < 300000: return "프리미엄(10~30만)"
    if p < 1000000: return "럭셔리(30~100만)"
    return "초럭셔리(100만+)"
def disc_band(d):
    if d <= 0: return "정가(0%)"
    if d < 20: return "약할인(~20%)"
    if d < 40: return "중할인(20~40%)"
    if d < 60: return "강할인(40~60%)"
    return "초강할인(60%+)"

axes = {k: Counter() for k in ("pricetier", "discount", "itemkind", "prodtype", "coverage")}
prod_item = {}   # inplan 상품의 itemkind (동시구성용)
n = 0; bad = 0
for line in open(os.path.join(PREP, "allprod_slim.jsonl"), encoding="utf-8"):
    line = line.strip()
    if not line: continue
    try: r = json.loads(line)
    except Exception: bad += 1; continue
    n += 1
    pc = r.get("PROD_CD")
    pp = r.get("PROD_PRICE") or 0
    dc = r.get("DC_RATE") or 0
    ik = str(r.get("ITEMKIND_CD") or "")[:2] or "(미상)"
    pt = str(r.get("PROD_TYPE") or "")
    if isinstance(pp, (int, float)) and pp > 0: axes["pricetier"][price_tier(pp)] += 1
    if isinstance(dc, (int, float)): axes["discount"][disc_band(dc)] += 1
    axes["itemkind"]["품목 " + ik] += 1
    axes["prodtype"]["유형 " + pt] += 1
    cov = "기획전노출" if pc in inplan else "미노출(카탈로그)"
    axes["coverage"][cov] += 1
    if pc in inplan: prod_item[pc] = ik
print("    카탈로그 상품:", n, "| 파싱불가 skip:", bad)

ATTR = {"source": "product_catalog", "generated_at": TODAY, "catalog_size": n, "inplan_size": len(inplan), "axes": {}}
AXIS_KEYS = ["pricetier", "discount", "itemkind", "prodtype", "coverage"]
for ax in AXIS_KEYS:
    items = sorted(axes[ax].items(), key=lambda x: -x[1])
    if ax == "itemkind": items = items[:30]
    ATTR["axes"][ax] = [{"value": v, "freq": f, "source": "A'"} for v, f in items]
json.dump(ATTR, open(os.path.join(ROOT, "product_attributes.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---- 4) 동시구성(브랜드/품목군) lift = 상품-상품 관계 ----
print("[3] 동시구성 연관규칙 (브랜드/품목군)")
def cooc(basket_of):
    co = Counter(); fr = Counter(); Np = 0
    for psq, prods in plan_prods.items():
        s = set();
        for pc in prods:
            v = basket_of(pc)
            if v: s.add(v)
        if not s: continue
        Np += 1
        sl = list(s)
        for v in sl: fr[v] += 1
        for i in range(len(sl)):
            for j in range(i + 1, len(sl)):
                a, b = sorted((sl[i], sl[j])); co[(a, b)] += 1
    rel = defaultdict(list)
    for (a, b), c in co.items():
        if c < 3: continue
        lift = (c / Np) / ((fr[a] / Np) * (fr[b] / Np))
        rel[a].append((b, round(lift, 2), c)); rel[b].append((a, round(lift, 2), c))
    out = {}
    for k, lst in rel.items():
        lst.sort(key=lambda x: -x[1]); out[k] = lst[:10]
    return out, Np

brand_rel, Nb = cooc(lambda pc: prod_brand.get(pc))
item_rel, Ni = cooc(lambda pc: ("품목 " + prod_item[pc]) if pc in prod_item else None)
# 브랜드 코드 -> 명칭 라벨링
brand_rel_named = {}
for b, lst in brand_rel.items():
    brand_rel_named[bname.get(b, b)] = [{"target": bname.get(t, t), "lift": l, "co": c} for t, l, c in lst]
COOC = {"generated_at": TODAY, "brand_basis_plans": Nb,
        "brand_cooc": brand_rel_named,
        "itemkind_cooc": {k: [{"target": t, "lift": l, "co": c} for t, l, c in v] for k, v in item_rel.items()}}
json.dump(COOC, open(os.path.join(ROOT, "product_cooc.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("    브랜드 관계 노드:", len(brand_rel_named), "| 품목군 관계 노드:", len(item_rel))

# ---- 5) docs MD ----
md = ["# 상품 온톨로지 도출 설명서 (" + TODAY + ")\n",
      "> 목적: AI PLAN 기획전 추천 시 '구성 상품' 추천. 상품 속성축 + 동시구성 연관규칙.\n",
      "## 요약",
      "- 카탈로그 상품: **" + format(n, ",") + "**개 (기획전노출 " + format(len(inplan), ",") + "개)",
      "- 상품 속성: 5축 (" + ", ".join(AXIS_KEYS) + ")",
      "- 동시구성 관계: 브랜드 " + str(len(brand_rel_named)) + "노드 · 품목군 " + str(len(item_rel)) + "노드\n",
      "## 상품 속성축"]
for ax in AXIS_KEYS:
    top = ATTR["axes"][ax][:6]
    md.append("\n### " + ax + " (" + str(len(ATTR["axes"][ax])) + ")")
    md.append("- " + ", ".join(o["value"] + "(" + format(o["freq"], ",") + ")" for o in top))
md.append("\n## 동시구성 연관규칙 (lift 상위 예시)")
flat = []
for b, lst in brand_rel_named.items():
    for o in lst: flat.append((o["lift"], b, o["target"], o["co"]))
flat.sort(reverse=True)
seen = set()
for l, a, b, c in flat:
    key = tuple(sorted((a, b)))
    if key in seen: continue
    seen.add(key); md.append("- " + a + " × " + b + " — lift " + str(l) + " (공동 " + str(c) + "건)")
    if len(seen) >= 12: break
md.append("\n## 활용 (AI PLAN 연계)")
md.append("- 기획전 속성(테마/브랜드/가격포지셔닝) → 동일 속성 상품 풀에서 후보 추출.")
md.append("- 시드 브랜드/품목군의 동시구성 lift 상위를 '함께 구성할 상품군'으로 추천.")
md.append("- 미노출(카탈로그) 상품 중 시드와 속성유사 + 고연관 브랜드를 신규 편성 후보로 제안.")
open(os.path.join(DOCS, "product_ontology_" + TODAY + ".md"), "w", encoding="utf-8").write("\n".join(md))
print("[완료] product_attributes.json / product_cooc.json / docs/product_ontology_" + TODAY + ".md")
