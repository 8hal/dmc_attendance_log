# Test Cases - 단체 대회 상세 페이지

**작성일**: 2026-04-15  
**대상**: group.html 카드 + group-detail.html + Backend API

---

## TC-001: group.html 카드 간소화

### TC-001-1: 매칭 현황 배지 표시
**Given:** 스크랩 완료된 대회 (갭 결과 있음)  
**When:** group.html 로드  
**Then:**
- "매칭 현황" row에 ✅/⚠️/🔴 배지 표시
- 배지 숫자가 실제 gap 데이터와 일치

### TC-001-2: 확정 진행률 표시
**Given:** 일부 확정된 대회  
**When:** group.html 로드  
**Then:**
- "확정 진행" row에 프로그레스 바 표시
- "confirmed / total" 숫자와 퍼센트 정확

### TC-001-3: 카드 클릭 이동
**Given:** 단체 대회 카드  
**When:** 카드 영역 클릭 (버튼 제외)  
**Then:**
- `group-detail.html?eventId=...` 로 이동
- eventId가 URL 인코딩됨

### TC-001-4: 카드 클릭 예외
**Given:** 단체 대회 카드  
**When:** ⋮ 메뉴 또는 버튼 클릭  
**Then:**
- 상세 페이지로 이동하지 않음
- 해당 버튼 기능만 실행

### TC-001-5: 참가자 편집 버튼 제거
**Given:** group.html  
**When:** 카드 렌더링  
**Then:**
- "참가자 편집" 버튼이 없음

### TC-001-6: 갭 섹션 제거
**Given:** group.html  
**When:** 카드 렌더링  
**Then:**
- 일괄 확정, 동명이인 선택, DNS/DNF 버튼이 없음

---

## TC-002: group-detail.html 배번 입력

### TC-002-1: 배번 표시 (입력됨)
**Given:** 배번이 있는 참가자  
**When:** 상세 페이지 로드  
**Then:**
- "배번 12345" 라벨 표시
- ✏️ 버튼 표시

### TC-002-2: 배번 표시 (미입력)
**Given:** 배번이 없는 참가자  
**When:** 상세 페이지 로드  
**Then:**
- "배번 미입력" 라벨 표시
- ✏️ 버튼 표시

### TC-002-3: 배번 편집 열기
**Given:** 참가자 row  
**When:** ✏️ 버튼 클릭  
**Then:**
- 인라인 편집 row 표시 (input + 저장/취소)
- 기존 배번이 input에 pre-fill

### TC-002-4: 배번 저장
**Given:** 배번 편집 중  
**When:** 배번 입력 후 [저장] 클릭  
**Then:**
- Toast "배번 저장됨"
- 편집 row 닫힘
- 라벨 업데이트 ("배번 12345")

### TC-002-5: 배번 취소
**Given:** 배번 편집 중  
**When:** [취소] 클릭  
**Then:**
- 편집 row 닫힘
- 라벨 변경 없음

### TC-002-6: 배번 편집 - 모든 참가자
**Given:** 자동 매칭, 동명이인, 기록 없음 참가자  
**When:** 각각 ✏️ 버튼 클릭  
**Then:**
- 모든 경우에 편집 UI 표시

---

## TC-003: Backend API - GET detail

### TC-003-1: 정상 조회
**Given:** 유효한 eventId  
**When:** `GET /race?action=group-events&subAction=detail&eventId=evt_test`  
**Then:**
```json
{
  "ok": true,
  "event": { "id": "evt_test", "eventName": "...", ... },
  "gap": [...],
  "confirmedCount": 0,
  "stats": null
}
```

### TC-003-2: eventId 누락
**Given:** eventId 없음  
**When:** `GET /race?action=group-events&subAction=detail`  
**Then:**
```json
{
  "ok": false,
  "error": "eventId required"
}
```
**Status**: 400

### TC-003-3: 대회 없음
**Given:** 존재하지 않는 eventId  
**When:** `GET /race?action=group-events&subAction=detail&eventId=invalid`  
**Then:**
```json
{
  "ok": false,
  "error": "대회 없음"
}
```
**Status**: 404

### TC-003-4: gap 계산 - 자동 매칭
**Given:** 스크랩 결과와 참가자 매칭 (1:1)  
**When:** detail API 호출  
**Then:**
- `gap[i].gapStatus === "ok"`
- `gap[i].result` 존재

### TC-003-5: gap 계산 - 동명이인
**Given:** 스크랩 결과에 동명 2건  
**When:** detail API 호출  
**Then:**
- `gap[i].gapStatus === "ambiguous"`
- `gap[i].candidates` 배열 (길이 2)

### TC-003-6: gap 계산 - 기록 없음
**Given:** 스크랩 결과에 매칭 없음  
**When:** detail API 호출  
**Then:**
- `gap[i].gapStatus === "missing"`

### TC-003-7: gap 계산 - 확정됨
**Given:** race_results에 이미 저장된 참가자  
**When:** detail API 호출  
**Then:**
- `gap[i].gapStatus === "confirmed"`

---

## TC-004: Backend API - POST bulk-confirm

### TC-004-1: 정상 저장 (85건)
**Given:** 85명 results 배열  
**When:** `POST /race?action=group-events` + `subAction: "bulk-confirm"`  
**Then:**
```json
{
  "ok": true,
  "saved": 85
}
```
- race_results에 85개 문서 생성
- scrape_jobs.status === "confirmed"

### TC-004-2: eventId 누락
**Given:** eventId 없음  
**When:** bulk-confirm API 호출  
**Then:**
```json
{
  "ok": false,
  "error": "eventId and results[] required"
}
```
**Status**: 400

### TC-004-3: results 빈 배열
**Given:** `results: []`  
**When:** bulk-confirm API 호출  
**Then:**
```json
{
  "ok": false,
  "error": "eventId and results[] required"
}
```
**Status**: 400

### TC-004-4: 대회 없음
**Given:** 존재하지 않는 eventId  
**When:** bulk-confirm API 호출  
**Then:**
```json
{
  "ok": false,
  "error": "대회 없음"
}
```
**Status**: 404

### TC-004-5: 멱등성 보장 (Idempotent)
- 같은 결과를 2번 저장해도 1건만 존재 (중복 문서 없음)

**Given:** 이미 저장된 85건  
**When:** 동일 데이터로 bulk-confirm 재호출  
**Then:**
```json
{
  "ok": true,
  "saved": 85
}
```
- race_results 중복 생성 없음

### TC-004-6: 재확정 시 이전 기록 삭제 (docId 변경 케이스)
- **시나리오**: 첫 확정 후 배번 입력, 재확정
- **기대 동작**: 이전 기록 삭제 후 새 기록만 저장 (1건 유지)
- **검증**:
  1. 배번 없이 첫 확정: 85명
  2. race_results 확인: 85건
  3. 배번 추가 후 재확정: 85명 (bib 포함)
  4. race_results 확인: 여전히 85건 (배번 포함된 최신 데이터만)
- **자동화 (`scripts/qa-group-detail-api-test.js`)**: 동일 시나리오를 1명 표본으로 검증
- **목적**: docId 생성 로직 변경 시에도 중복 방지 보장

### TC-004-7: 부분 실패
**Given:** 85건 중 2건 realName 누락  
**When:** bulk-confirm API 호출  
**Then:**
```json
{
  "ok": false,
  "saved": 83,
  "errors": ["realName 누락", "realName 누락"],
  "message": "83건 저장, 2건 실패"
}
```
**Status**: 207

### TC-004-8: DNS/DNF 처리
**Given:** `results[i].dnStatus === "DNS"`  
**When:** bulk-confirm API 호출  
**Then:**
- race_results[i].status === "dns"
- finishTime 없음

### TC-004-9: 배번 저장
**Given:** `results[i].bib === "12345"`  
**When:** bulk-confirm API 호출  
**Then:**
- race_results[i].bib === "12345"

---

## TC-005: 통합 시나리오

### TC-005-1: 전체 플로우 (정상)
**Given:** 스크랩 완료된 대회  
**When:**
1. group.html에서 카드 클릭
2. group-detail.html 로드 (detail API)
3. 동명이인 2명 선택
4. 기록 없음 3명 처리 (DNS/DNF/직접입력)
5. [일괄 저장] 클릭 (bulk-confirm API)

**Then:**
- detail API 응답 정상
- 미처리 목록 5명 표시
- 처리 후 진행률 100%
- [일괄 저장] 활성화
- bulk-confirm 성공 (saved: 85)
- 성공 모달 표시

### TC-005-2: 배번 입력 후 저장
**Given:** 참가자 3명에 배번 입력  
**When:**
1. 각 참가자 ✏️ 클릭
2. 배번 입력 (12345, 67890, 99999)
3. [저장] 클릭
4. [일괄 저장] 클릭

**Then:**
- 배번이 race_results에 저장됨
- bulk-confirm API의 results[].bib에 포함

### TC-005-3: 일부 미처리 시 저장 차단
**Given:** 85명 중 3명 미처리  
**When:** [일괄 저장] 버튼 확인  
**Then:**
- 버튼 disabled
- title: "모든 참가자의 기록을 선택해야 저장할 수 있습니다"

### TC-005-4: 네트워크 오류 재시도
**Given:** bulk-confirm API 실패 (네트워크)  
**When:** 실패 모달에서 [다시 시도]  
**Then:**
- bulk-confirm 재호출
- idempotent 보장으로 중복 없음

---

## TC-006: 에러 케이스

### TC-006-1: 참가자 0명 상태
**Given:** 대회 등록했지만 참가자 미선택  
**When:** group-detail.html 로드  
**Then:**
- "참가자가 없습니다" 안내 표시

### TC-006-2: 스크랩 실패 상태
**Given:** groupScrapeStatus === "failed"  
**When:** group-detail.html 로드  
**Then:**
- "스크랩 실패" 안내 표시

### TC-006-3: API 타임아웃
**Given:** bulk-confirm 60초 초과  
**When:** 타임아웃 발생  
**Then:**
- 실패 모달: "서버 응답 시간 초과"

---

## 성공 기준

### 자동 테스트
- [ ] TC-003 (GET detail) 7개 모두 통과
- [ ] TC-004 (POST bulk-confirm) 9개 모두 통과

### 수동 테스트
- [ ] TC-001 (group.html) 6개 모두 통과
- [ ] TC-002 (배번 입력) 6개 모두 통과
- [ ] TC-005 (통합) 4개 모두 통과

### 최소 성공률
**90% 이상 (35개 중 32개 이상 통과)**

---

## 테스트 환경

**로컬:**
```bash
firebase emulators:start
# 브라우저: http://127.0.0.1:5000/group.html
```

**프로덕션:**
```
https://dmc-attendance.web.app/group.html
```
