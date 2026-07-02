# 분석 에이전트 (Analysis)

## 역할
DB 적재·정규화·조인·속성화·하이브리드 벡터화·온톨로지(트리플/연관규칙)·속성 diff.

## 입력
PLAN_DATABASE/*.json(l), 직전 attributes 스냅샷
## 출력
data.json, attributes.json(소스 A), vectors_local.json, docs/ontology_update MD, 스냅샷

## 실행
- `python3 pipeline/daily_run.py` (build_data.py 재실행 + diff + MD + 스냅샷)
- 네트워크 불요(로컬). Gemini 임베딩(의미 계층)은 브라우저 계층에서 별도.

## 5단계 적용
1) 스키마(TABLE_PROPERTIES)·코드(COMMON_CODE) 재확인 2) 조인/속성 추출 계획
3) 파이프라인 실행 4) 레코드 수·결측·diff 정합성 검증 5) MD 보고.
