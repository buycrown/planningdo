#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
daily_run.py — 매일 10시 온톨로지 갱신 오케스트레이터 (로컬 계층, 네트워크 불요)
순서:
 1) build_data.py 재실행 → data.json / attributes.json / vectors_local.json 갱신
 2) 어제(직전 스냅샷) 대비 '속성 증감(diff)' 계산 (소스 A + 소스 B 병합 기준)
 3) docs/ 에 속성 diff MD + 온톨로지 상태 MD 자동 생성
 4) attributes_history/ 에 오늘 스냅샷 저장
※ Gemini 임베딩/AI 비전 검수(브라우저 계층)는 예약 작업 에이전트가 별도 수행 후
   ai_vision_attrs.json 을 갱신한다. 본 스크립트는 그 결과까지 반영해 diff를 낸다.
"""
import json, os, subprocess, datetime, glob, sys

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(BASE, "..")
HIST = os.path.join(ROOT, "attributes_history")
DOCS = os.path.join(ROOT, "docs")
os.makedirs(HIST, exist_ok=True); os.makedirs(DOCS, exist_ok=True)
TODAY = datetime.date.today().isoformat()
AXES = ["placement", "theme", "benefit", "product", "brand", "card", "coupon", "pricetier", "discount", "metric"]
DB_ROOT = os.path.join(ROOT, "PLAN_DATABASE")
PREP = os.path.join(ROOT, "prep")

def _latest_db():
    ds = sorted(d for d in glob.glob(os.path.join(DB_ROOT, "20[0-9][0-9][0-9][0-9][0-9][0-9]")) if os.path.isdir(d))
    return ds[-1] if ds else DB_ROOT

def _slim(src, out, keep, dedup_key=None):
    import re
    kv = re.compile(r'^\s*"([A-Z0-9_]+)"\s*:\s*(.*?),?\s*$')
    def jv(v):
        try: return json.loads(v)
        except Exception: return v
    n = 0; cur = {}; seen = set(); started = False
    with open(src, encoding="utf-8", errors="ignore") as f, open(out, "w", encoding="utf-8") as o:
        for line in f:
            t = line.strip()
            if t == "{": cur = {}; started = True; continue
            if started and t and t[0] == "}":
                k = cur.get(dedup_key) if dedup_key else cur.get("PROD_CD")
                if k and (dedup_key is None or k not in seen):
                    if dedup_key: seen.add(k)
                    o.write(json.dumps({x: jv(cur[x]) for x in cur if x in keep}, ensure_ascii=False) + "\n"); n += 1
                cur = {}; continue
            m = kv.match(line)
            if m and m.group(1) in keep: cur[m.group(1)] = m.group(2)
    return n

def ensure_prep_slims():
    """최신 날짜폴더의 PLAN_PROD_INFO/STB_BRAND가 prep 슬림보다 새로우면 재생성(아니면 스킵)."""
    os.makedirs(PREP, exist_ok=True)
    db = _latest_db()
    ppi = os.path.join(db, "PLAN_PROD_INFO.json")
    sbs = sorted(glob.glob(os.path.join(db, "STB_BRAND*.json")), key=os.path.getmtime)
    sb = sbs[-1] if sbs else None
    pslim = os.path.join(PREP, "prodinfo_slim.jsonl"); bslim = os.path.join(PREP, "brand_slim.jsonl")
    def stale(s, d): return os.path.exists(s) and (not os.path.exists(d) or os.path.getmtime(s) > os.path.getmtime(d))
    if stale(ppi, pslim):
        print("    prodinfo_slim 재생성:", _slim(ppi, pslim, {"PROD_CD","BRAND_CD","PROD_NM","DC_RATE","LIST_PRICE","PROD_PRICE"}))
    else:
        print("    prodinfo_slim 최신(스킵)")
    if sb and stale(sb, bslim):
        print("    brand_slim 재생성:", _slim(sb, bslim, {"BRAND_CD","BRAND_NM","BRAND_ENM"}, dedup_key="BRAND_CD"))
    else:
        print("    brand_slim 최신(스킵)")

def load(fp, default=None):
    try:
        with open(fp, encoding="utf-8") as f: return json.load(f)
    except Exception: return default

def merged_axis_values():
    """소스 A(attributes.json) + 소스 B(ai_vision_attrs.json) 축별 값 집합"""
    A = load(os.path.join(ROOT, "attributes.json"), {"axes": {}})
    B = load(os.path.join(ROOT, "ai_vision_attrs.json"), {"axes": {}})
    out = {}
    for ax in AXES:
        vals = set(o["value"] for o in A.get("axes", {}).get(ax, []))
        vals |= set(o["value"] for o in B.get("axes", {}).get(ax, []))
        out[ax] = vals
    return out

def latest_snapshot():
    snaps = sorted(glob.glob(os.path.join(HIST, "attributes_*.json")))
    snaps = [s for s in snaps if TODAY not in s]
    return load(snaps[-1]) if snaps else None

def main():
    print("[daily_run] 0) prep 슬림 최신화")
    ensure_prep_slims()
    print("[daily_run] 1) 파이프라인 재실행")
    r = subprocess.run([sys.executable, os.path.join(BASE, "build_data.py")], capture_output=True, text=True)
    print(r.stdout.strip().splitlines()[-1] if r.stdout else "", r.stderr[-300:] if r.returncode else "")

    print("[daily_run] 2) 속성 diff 계산")
    today_vals = merged_axis_values()
    prev = latest_snapshot()
    prev_vals = {ax: set(prev["axes"].get(ax, [])) for ax in AXES} if prev else {ax: set() for ax in AXES}

    added, removed = {}, {}
    for ax in AXES:
        added[ax] = sorted(today_vals[ax] - prev_vals[ax])
        removed[ax] = sorted(prev_vals[ax] - today_vals[ax])
    n_add = sum(len(v) for v in added.values()); n_rem = sum(len(v) for v in removed.values())
    n_tot = sum(len(v) for v in today_vals.values())

    print("[daily_run] 3) MD 설명서 생성")
    md = ["# 온톨로지 속성 갱신 설명서 (" + TODAY + ")\n",
          "> 매일 10:00 자동 갱신 · 모델: Gemini 2.5 Flash(분석)/AI 비전(검수) · 생성: daily_run.py\n",
          "## 요약",
          "- 총 속성: **" + str(n_tot) + "**개 (" + str(len(AXES)) + "축)",
          "- 신규 추가: **" + str(n_add) + "**개 · 삭제: **" + str(n_rem) + "**개",
          "- 직전 스냅샷: " + (prev.get("date", "없음") if prev else "없음(최초 실행)") + "\n",
          "## 축별 현황 / 변경"]
    for ax in AXES:
        md.append("\n### " + ax + " (" + str(len(today_vals[ax])) + "개)")
        if added[ax]: md.append("- ➕ 추가: " + ", ".join(added[ax][:30]))
        if removed[ax]: md.append("- ➖ 삭제: " + ", ".join(removed[ax][:30]))
        if not added[ax] and not removed[ax]: md.append("- 변경 없음")
    md.append("\n## 비고")
    md.append("- 신규 속성은 '조건 조합 빌더 → 기획전 속성 필터'에 자동 등록됩니다.")
    md.append("- 어제와 다른 오늘 결과로 속성이 추가/삭제될 수 있으며, 본 문서가 그 근거를 기록합니다.")
    with open(os.path.join(DOCS, "ontology_update_" + TODAY + ".md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md))

    print("[daily_run] 4) 스냅샷 저장")
    snap = {"date": TODAY, "axes": {ax: sorted(today_vals[ax]) for ax in AXES},
            "totals": {ax: len(today_vals[ax]) for ax in AXES}}
    with open(os.path.join(HIST, "attributes_" + TODAY + ".json"), "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=1)

    print("[완료] 총속성 " + str(n_tot) + " | +%d / -%d" % (n_add, n_rem) + " | docs/ontology_update_" + TODAY + ".md")

if __name__ == "__main__":
    main()
