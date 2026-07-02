# 상품 온톨로지 에이전트 (Product Ontology)

## 역할
기획전(Plan) 온톨로지와 **별도 계층**으로, **상품(Product) 간 온톨로지**를 구성한다.
목적은 AI PLAN이 기획전을 추천할 때 **그 기획전을 채울 '구성 상품'까지 추천**하도록,
상품의 속성축과 상품-상품 관계(동시구성 연관규칙)를 도출하는 것.

## 배경
- `ALL_PRODUCT_INFO`(전 판매상품, 약 251만, `PROD_STS_CD=90`)가 추가되어 전사 카탈로그 모수를 확보.
- 기획전 온톨로지(10축)는 '어떤 기획전을 만들지'를 다루고, 본 에이전트는 '그 기획전에 무엇을 담을지'를 다룬다.

## 입력
- `../prep/allprod_slim.jsonl` — 전 카탈로그 슬림(PROD_CD·BRAND_CD·ITEMKIND_CD·PROD_PRICE·DC_RATE·PROD_TYPE)
- `../PLAN_DATABASE/<최신 날짜폴더>/LST_PLAN_PROD_PLANSQ.json` — 기획전-상품 매핑(동시구성 basket)
- `../prep/prodinfo_slim.jsonl`, `../prep/brand_slim.jsonl` — 기획전 상품 브랜드/명칭

## 출력
- `../product_attributes.json` — 상품 속성 레지스트리(소스 A')
- `../product_cooc.json` — 브랜드/품목군 동시구성 연관규칙(lift)
- `../docs/product_ontology_YYYY-MM-DD.md`

## 상품 5축 (속성)
- `pricetier` 가격대 — 가성비(~3만)/실속(3~10만)/프리미엄(10~30만)/럭셔리(30~100만)/초럭셔리(100만+)
- `discount` 할인강도 — 정가(0%)/약(~20%)/중(20~40%)/강(40~60%)/초강(60%+)
- `itemkind` 품목군 — ITEMKIND_CD 2자리 클러스터(대분류 신호)
- `prodtype` 상품유형 — PROD_TYPE
- `coverage` 노출구분 — 기획전노출 / 미노출(카탈로그)  ← 신규 편성 후보 풀 식별용

## 상품-상품 관계 (동시구성 연관규칙)
- **basket = 기획전** : 같은 기획전에 함께 편성된 브랜드/품목군 집합.
- 브랜드 i,j 가 함께 등장한 기획전 수로 **lift** 산출(공동≥3). 각 노드별 상위 10 관계 저장.
- 해석: lift 高 = '함께 구성되는 경향'. 예) 골프 4사(스릭슨·보이스캐디·브릿지스톤·야마하) 강결합.

## 실행
- `python3 pipeline/product_ontology.py` (단독 실행. 네트워크 불요·로컬)
- 무거운 계층(251만 스트리밍)이라 **매일 10시 기획전 갱신과 분리**해 온디맨드/별도 스케줄로 운용.
- 전제: `prep/allprod_slim.jsonl` 최신화. (ALL_PRODUCT_INFO 갱신 시 재슬림 필요 → daily/별도 스텝)

## AI PLAN 연계 (구성상품 추천 신호)
1. 기획전 속성(theme·brand·pricetier·discount)에서 **타깃 상품 속성 프로필** 도출.
2. 프로필에 맞는 카탈로그 상품 풀 필터 → 후보군.
3. 시드 브랜드/품목군의 **동시구성 lift 상위**를 '함께 담을 상품군'으로 가중.
4. `coverage=미노출` 중 시드와 속성유사+고연관을 **신규 편성 후보**로 제안(참신성).

## 5단계 사고 프로토콜 적용
1) 카탈로그 스키마·코드(ITEMKIND/PRICE/DC) 재확인 → 슬림 무결성 점검(파싱불가 라인 skip).
2) 속성축·동시구성 설계 → 산출물 스키마 결정.
3) `product_ontology.py` 실행 → JSON/MD 생성.
4) 검증: 카탈로그 수·기획전노출 수·lift 정합성(골프/키즈 군집 등 도메인 타당성) 확인.
5) MD 보고 → Orchestrator 전달, AI PLAN advisor 지침과 연계.

## 향후 확장
- 품목군 코드 → 한글 라벨 매핑(별도 코드표 확보 시).
- 상품-상품 직접 유사도(가격대×품목군×브랜드연관) 벡터화로 cold-start 추천 강화.
- 성과(매출/전환) 가중 동시구성 → '성과 검증형 구성상품' 추천.
