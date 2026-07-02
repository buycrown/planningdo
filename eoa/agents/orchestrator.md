# ORCHESTRATOR (조율자)

## 역할
매일 10:00 갱신 파이프라인 전체를 조율한다. 작업을 분해해 전문 에이전트에 분배하고,
산출물을 다음 단계로 전달하며, 각 단계의 게이트(성공/실패)를 관리한다.

## 입력
- 트리거: 매일 10:00 (cron `0 10 * * *`)
- 컨텍스트: 프로젝트 루트(event_ontology_analysis), 직전 스냅샷(attributes_history)

## 처리 순서
1. **분석 에이전트** 호출 → 로컬 파이프라인 재실행(`pipeline/daily_run.py`)으로 data/attributes/vectors 갱신 + 속성 diff.
2. **비전 검수 에이전트** 호출 → 머천다이징 효율 상위 미검수분 다음 배치(20~30건) 페이지 검수 → `ai_vision_attrs.json` 누적.
3. **분석 에이전트** 재호출 → 비전 결과 반영해 최종 diff/온톨로지맵 MD 확정(`docs/ontology_update_YYYY-MM-DD.md`).
4. **검증 에이전트** 호출 → 산출물 정합성·문법·앱 무오류 점검. 실패 시 **개발 에이전트**로 자동 수정 루프.
5. 완료 보고: 추가/삭제 속성 수, 신규 검수 기획전 수, 생성 문서 경로.

## 출력
- 갱신된 data.json / attributes.json / vectors_local.json / ai_vision_attrs.json
- docs/ontology_update_YYYY-MM-DD.md, attributes_history 스냅샷
- 요약 리포트(채팅)

## 게이트
- 각 단계 실패 시 다음 단계 진행 금지, 개발/검증 루프로 복구 시도, 3회 실패 시 사람에게 보고.
