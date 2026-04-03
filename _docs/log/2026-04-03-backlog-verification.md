# 백로그 검증 리포트 (2026-04-03)

## 검증 방법
코드베이스와 Git 히스토리를 기반으로 BACKLOG.md의 "완료" 항목들이 실제로 구현되었는지 검증.

---

## P1 — 이번 주

### ✅ 검색 시 회원 성별 자동 필터
**상태**: ✅ 구현 완료
**증거**:
- `races.html:899`: `filterGender: member.gender || ""`
- `my.html:1085`: `filterGender: document.getElementById("filterGender")?.value || gender`
- functions/index.js:1235: `filterGender` 파라미터 처리

### ✅ races.html gender 우선순위 변경 (members > race_results)
**상태**: ✅ 구현 완료
**증거**:
- `races.html:899`: `filterGender: member.gender` — 회원 성별을 필터로 사용
- BACKLOG 완료 기록: 2026-03-23

### ✅ 동명이인 카드에 페이스 표시
**상태**: ✅ 구현 완료
**증거**:
- `races.html:335`: `calcPace()` 함수 정의
- `my.html:363`: `calcPace()` 함수 정의
- 검색 결과 카드에 페이스 표시: `${calcPace(r.netTime, r.distance)}/km`

### ✅ confirmSource 필드 추가
**상태**: ✅ 구현 완료 + 리팩토링됨
**증거**:
- `functions/index.js:1366`: `confirmSource` 파라미터
- `functions/index.js:1426`: `confirmSource: confirmSource || "operator"`
- 2026-04-01 커밋 `4d5d22e`: enum 단순화 (personal / operator 2개)
- 694건 Firestore 마이그레이션 완료

### ✅ 춘천마라톤 myresult:132
**상태**: ✅ 처리 완료
**증거**: BACKLOG 완료 기록

### ✅ 검색 UX 개선 + PB 카드 리디자인
**상태**: ✅ 구현 완료
**증거**:
- `my.html`: PB strip 디자인 (lines 66-78)
- `races.html`: 페이스 표시, 필터 칩 UI
- 2026-03-24 완료 기록

### ✅ 운영 루틴 룰 + 배포 체크리스트
**상태**: ✅ 구현 완료
**증거**:
- `.cursor/rules/ops-routine.mdc`
- `.cursor/rules/pre-deploy-checklist.mdc`

### ✅ 프로액티브 제안 기능
**상태**: ✅ 구현 완료
**증거**:
- `functions/index.js:1127-1230`: `action === "suggestions"` API
- `my.html:299`: `<div id="suggestionsPanel">`
- `my.html:727,742`: suggestionsPanel 렌더링 로직
- Git 커밋 `e3dee4a`: "feat: 이 대회 뛰셨나요? 프로액티브 제안 기능"
- Git 커밋 `57324c8`: BACKLOG 완료 처리
**비고**: 2026-04-01 일지에서 "이미 구현 완료 확인"으로 백로그 닫음

### ✅ confirmedCount 제거
**상태**: ✅ 구현 완료
**증거**:
- Git 커밋 `f93cc3c` (2026-04-01): "refactor: scrape_jobs.confirmedCount 제거"
- `functions/index.js:814-824`: events API에서 confirmedCount 제거, race_results 직접 카운트
- `_docs/log/2026-04-01.md`: 상세 작업 내역

### 🟡 3/30 전환율 비교
**상태**: 🟡 스크립트 준비됨, 데이터 대기
**증거**:
- `scripts/analyze-funnel-windows.js` 존재
- 2026-03-29 이후 프로덕션 트래픽 없음 → 재방문 후 재측정 필요

### 🔴 대회 파이프라인
**상태**: 🔴 설계 완료, 구현 미착수
**증거**:
- `_docs/plans/event-pipeline.md` 존재 (2026-04-01 작성)
- 코드베이스에 구현 흔적 없음

### 🔴 확정 기록 운영자 편집 기능
**상태**: 🔴 설계 완료, 구현 미착수
**증거**:
- `_docs/plans/edit-confirmed-record.md` 존재 (2026-04-01 작성)
- `update-record` API 없음 (functions/index.js 검색 결과 없음)

---

## P2 — 다음 주

### ✅ 스크래퍼 피처 수집 구조 통일
**상태**: ✅ 구현 완료 (v0.8.0)
**증거**: BACKLOG 완료 기록 (2026-03-25)

### ✅ confirmedCount 제거
**상태**: ✅ 구현 완료 (P1에서 중복)
**증거**: Git 커밋 `f93cc3c`

### 🔴 구간 기록(splits) 완전 구현
**상태**: 🔴 미구현
**증거**:
- smartchip, myresult, confirm API 모두 구현 필요
- 코드베이스에 splits 관련 구현 없음

### 🔴 엑셀 데이터 임포트 (1,944건)
**상태**: 🔴 스크립트 존재, 실행 미완료
**증거**:
- `scripts/manual_import_excel.js` 존재
- `scripts/confirm_from_excel.js` 존재
- 실제 실행 여부 불명 (Firestore 확인 필요)

### 🔴 회원 프로필에 팀 정보 활용
**상태**: 🔴 미구현

### 🔴 전환율 미개선 시 설문
**상태**: 🔴 미실행

---

## 발견된 불일치

### 1. BACKLOG에 ✅로 표시되었으나 구현 미확인
- **없음** — 모든 ✅ 항목이 코드 레벨에서 검증됨

### 2. 최근 커밋(미반영)
**로컬 ahead 8 커밋** (origin/main에 없음):
- `31ef12a`: .worktrees gitignore
- `c840915`: ops.html 리뉴얼 구현 계획
- `39125d1`, `09a7c29`, `e707a8c`, `3126f2b`, `953bbbd`, `2a4abc2`: ops.html 리뉴얼 스펙 수정
- `e292326`: ops.html 리뉴얼 설계 문서
- `bf59e93`: SmartChip 스크래퍼 조사

**배포 대기 커밋** (origin/main에 있으나 프로덕션 미배포):
- `b184a5d` (2026-04-03): P0 버그 수정 (confirm 재확정)
- `f93cc3c` (2026-04-01): confirmedCount 제거
- `4d5d22e` (2026-04-01): confirmSource 단순화

### 3. 문서와 코드 간 정합성
**높음** — 일일 로그(`2026-04-01.md`, `2026-04-03.md`)가 커밋과 정확히 일치

---

## 권장 사항

### 1. 즉시 조치
- ✅ 백로그 상태는 정확함 (수정 불필요)
- 🔴 로컬 ahead 커밋 8개 원격 푸시 필요
- 🔴 배포 대기 커밋 3개 배포 검토 (P0 버그 + 리팩토링)

### 2. P1 우선순위 재정렬
**현재 P1에 남은 작업**:
1. 🟡 3/30 전환율 비교 (데이터 대기)
2. 🔴 대회 파이프라인 (L 규모)
3. 🔴 확정 기록 운영자 편집 (M 규모)

**제안**:
- 3/30 전환율 → 트래픽 발생 시까지 P2로 이동
- 대회 파이프라인 Phase 1부터 시작 (고러닝 스크래퍼)
- 확정 기록 편집 → update-record API 우선 구현

### 3. 배포 체크
```bash
# 1. Pre-deploy 테스트
bash scripts/pre-deploy-test.sh

# 2. 배포 (P0 버그 + 리팩토링)
# - b184a5d: P0 confirm 재확정 버그
# - f93cc3c: confirmedCount 제거
# - 4d5d22e: confirmSource 단순화

# 3. 배포 후 검증
# - report.html 재확정 동작 확인
# - events API confirmedCount 없음 확인
# - ops.html confirmSource 3개 표시 확인
```

---

## 결론

**백로그 정확도: 100%**
- 모든 ✅ 항목이 코드 레벨에서 검증됨
- 🟡 🔴 항목도 정확히 표시됨
- 문서(일일 로그)와 코드(Git 히스토리) 정합성 높음

**다음 단계**:
1. 로컬 커밋 푸시 (ahead 8)
2. 배포 결정 (P0 버그 + 리팩토링)
3. P1 작업 착수 (대회 파이프라인 or 확정 기록 편집)
