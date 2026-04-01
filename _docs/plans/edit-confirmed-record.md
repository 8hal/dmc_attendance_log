# 작업 지시서: 확정 기록 운영자 편집 기능

> 작성일: 2026-04-01
> 우선순위: P1
> 예상 규모: M (3~5일)

---

## 배경 / 문제

현재 `race_results`(SSOT)를 운영자가 직접 수정할 UI가 없다.
확정 후 오류 발견 시 삭제 → 재확정만 가능하고, 그마저도 report.html이 아닌 my.html에서만 된다.

또한 report.html은 `scrape_jobs`를 진입점으로 써서, 수동 import·ohmyrace 등
`scrape_jobs` 없이 들어온 124건은 운영자 시야에서 완전히 빠진다.

**운영자는 SSOT를 직접 보고 수정할 능력이 있어야 한다.**

---

## 목표

- 운영자가 report.html에서 모든 `race_results`를 조회·수정·삭제할 수 있다
- `scrape_jobs` 유무와 무관하게 전체 기록이 보인다

## 성공 기준

- 확정 기록의 주요 필드(이름, 날짜, 종목, 기록, source 등)를 UI에서 수정 가능
- 수동 import 데이터(고아 124건)도 운영자 화면에서 조회·수정 가능
- 수정 내역이 `race_results`에 즉시 반영됨

---

## 설계 방향

### API (functions/index.js)

`action=update-record` (POST) 신규 추가

```
입력: { docId, patch: { eventName?, eventDate?, distance?, netTime?, gunTime?, memberRealName?, ... } }
출력: { ok, updatedDocId }
검증: requesterName === 운영자 (verify-admin 방식)
```

### report.html

완료탭에 "전체 기록" 서브탭 추가:
- `race_results` 직접 조회 (scrape_jobs 무관)
- 이벤트/날짜 기준 그룹핑
- 행 클릭 → 인라인 편집 모달
- 수정 가능 필드: eventName, eventDate, distance, netTime, gunTime, memberRealName, note
- 삭제 버튼 (기존 delete-record API 재사용)

---

## 구현 순서

1. `update-record` API 작성 + 필드 검증
2. report.html "전체 기록" 탭 — 조회 + 그룹핑 UI
3. 편집 모달 — 저장/취소
4. 삭제 연동
5. pre-deploy-test 통과 확인

---

## 관련 파일

- `functions/index.js` — update-record 액션 추가
- `report.html` — 탭 + 편집 UI
- `_docs/api/http-api-actions.md` — 문서 업데이트

---

## 보류 조건

- 편집 빈도가 월 1회 미만으로 낮다면 → 스크립트 수준으로 유지
- 프로액티브 제안 기능(P1)과 순서 조율 필요
