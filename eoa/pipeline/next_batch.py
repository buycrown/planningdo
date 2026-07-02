#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""next_batch.py [N] — AI 비전 검수 다음 배치(미검수 머천다이징 효율 상위) JSON 출력"""
import json, os, sys
BASE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.join(BASE,"..")
N=int(sys.argv[1]) if len(sys.argv)>1 else 20
E=json.load(open(os.path.join(ROOT,"data.json"),encoding="utf-8"))["EVENTS"]
try: done=set(json.load(open(os.path.join(ROOT,"ai_vision_attrs.json"),encoding="utf-8")).get("inspected",[])) \
     | set(json.load(open(os.path.join(ROOT,"ai_vision_attrs.json"),encoding="utf-8")).get("failed",[]))
except Exception: done=set()
def eff(e):
    avg=(e["discMin"]+e["discMax"])/2; return e["sales"]/avg if avg>0 else e["sales"]
def portal(e):
    n=e["name"]; return e["main_category"]=="통합" or any(k in n for k in ["복지몰","제휴","VIP","임직원","공제","전용 혜택","회원 혜택","회원 전용","적립금","친구초대"])
q=[e for e in E if not portal(e) and e["prodCnt"]>0 and e["id"] not in done]
q=sorted(q,key=lambda e:-eff(e))[:N]
print(json.dumps([{"sq":e["id"],"name":e["name"][:40]} for e in q], ensure_ascii=False))
