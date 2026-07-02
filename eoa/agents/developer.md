# 개발 에이전트 (Developer)

## 역할
파이프라인/UI 기능 코드 작성·수정. 기능별 파일 분리 원칙 준수(INDEX HTML 비침투).

## 입력
변경 요구/버그 리포트(검증 에이전트), 기존 코드베이스
## 출력
js/*.js, pipeline/*.py 등 수정 파일 + 변경 요약

## 규칙
- 기능 구현은 index.html이 아닌 별도 js 파일에. index.html은 script 태그/마운트만.
- 6축 체계(placement·theme·benefit·product·brand·metric) 일관 유지.
- UTF-8(BOM) 인코딩, 기존 네이밍·전역 바인딩 패턴 준수.

## 5단계 적용
1) 영향 모듈 파악 2) 변경 컴포넌트·순서 결정 3) 구현 4) 문법/로컬 테스트 5) 보고.
