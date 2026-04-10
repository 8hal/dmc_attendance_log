# QA 테스트 케이스 — 단체 대회 파이프라인

> 작성일: 2026-04-07  
> 대상 브랜치: `feature/group-event-pipeline`  
> 환경: Firebase 로컬 에뮬레이터 (`bash scripts/pre-deploy-test.sh` 통과 전제)  
> 선행 조건: `functions/.env`에 `DMC_OWNER_PW`, `DMC_ADMIN_PW` 설정됨

---

## 테스트 환경 세팅

```bash
# 에뮬레이터 시작
firebase emulators:start --only functions,hosting,firestore

# 에뮬레이터 URL
# API:     http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race
# Hosting: http://localhost:5000
```

테스트 전 Firestore 에뮬레이터에 아래 시드 데이터 준비:
- `members` 컬렉션에 회원 3명 이상 (hidden: false)
- `ops_meta/last_gorunning_crawl` 문서에 `events: [{ id: "gr_001", name: "2026 테스트마라톤", date: "2026-04-20" }]`

---

## 1. 인증 (ops.html 오너 / group.html 운영자)

| TC | 시나리오 | 기대 결과 | PRD |
|---|---|---|---|
| AUTH-01 | ops.html 접속 | 로그인 오버레이 표시, 페이지 콘텐츠 숨겨짐 | O-01 |
| AUTH-02 | ops.html에서 **운영자** 비밀번호 입력 | "비밀번호가 올바르지 않습니다" 에러 표시, 페이지 진입 불가 | O-01 |
| AUTH-03 | ops.html에서 **오너** 비밀번호 입력 | 오버레이 사라지고 ops.html 콘텐츠 로드 | O-01 |
| AUTH-04 | ops.html에서 authPw 입력 후 Enter 키 | tryAuth() 호출 (버튼 클릭과 동일 동작) | O-01 |
| AUTH-05 | ops.html 네트워크 오류 시 로그인 시도 | "비밀번호가 올바르지 않습니다" 에러 표시 (미처리 예외 없음) | O-01 |
| AUTH-06 | ops.html 오너 로그인 후 탭 닫고 재접속 | 로그인 오버레이 다시 표시 (sessionStorage 소멸) | O-01 |
| AUTH-07 | group.html 접속 | 로그인 오버레이 표시 | — |
| AUTH-08 | group.html에서 **운영자** 비밀번호 입력 | 오버레이 사라지고 group.html 콘텐츠 로드 (operator 허용) | — |
| AUTH-09 | group.html에서 **오너** 비밀번호 입력 | 오버레이 사라지고 group.html 콘텐츠 로드 (owner도 허용) | — |
| AUTH-10 | group.html에서 틀린 비밀번호 입력 | 에러 표시, 진입 불가 | — |

---

## 2. API — group-events (에뮬레이터 직접 호출)

```bash
API="http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race"
OWNER_PW="<DMC_OWNER_PW 값>"
OPERATOR_PW="<DMC_ADMIN_PW 값>"
```

### 2-1. GET 목록 조회

| TC | 명령 | 기대 결과 |
|---|---|---|
| API-01 | `curl "$API?action=group-events"` | `{ ok: true, groupEvents: [], availableGorunning: [...] }` |
| API-02 | 단체 대회 1건 생성 후 GET | `groupEvents`에 해당 대회 포함 |
| API-03 | GET 응답에서 `availableGorunning` | 아직 승격되지 않은 고러닝 이벤트만 포함 |

### 2-2. POST promote

| TC | 명령 / 조건 | 기대 결과 |
|---|---|---|
| API-04 | gorunningId + eventName + eventDate 포함 | `{ ok: true, canonicalEventId: "evt_..." }` |
| API-05 | gorunningId 누락 | `400 { ok: false, error: "gorunningId, eventName, eventDate required" }` |
| API-06 | 같은 eventName + eventDate로 다시 promote | 충돌 없이 새 canonicalEventId 발급 (suffix `-2` 등) |
| API-07 | promote 후 GET | `availableGorunning`에서 해당 gorunningId 제거됨 |

### 2-3. POST participants

| TC | 명령 / 조건 | 기대 결과 |
|---|---|---|
| API-08 | 유효한 memberId 3개 | `{ ok: true }`, `race_events.participants` 업데이트 |
| API-09 | 존재하지 않는 memberId | `400 { ok: false, error: "유효하지 않은 memberId: ..." }` |
| API-10 | participants 배열 누락 | `400 { ok: false, error: "canonicalEventId and participants[] required" }` |
| API-11 | 참가자 0명 빈 배열 | `{ ok: true }`, `race_events.participants = []` |

### 2-4. POST source (오너 전용)

| TC | 명령 / 조건 | 기대 결과 |
|---|---|---|
| API-12 | 올바른 ownerPw + source + sourceId | `{ ok: true }`, `race_events.groupSource` 업데이트 |
| API-13 | ownerPw 누락 | `403 { ok: false, error: "오너 권한 필요" }` |
| API-14 | 운영자 비밀번호로 source 설정 시도 | `403 { ok: false, error: "오너 권한 필요" }` |
| API-15 | DMC_OWNER_PW 환경변수 미설정 시 | `403` (fail-closed) |
| API-16 | source 누락 | `400 { ok: false, error: "canonicalEventId, source, sourceId required" }` |

### 2-5. POST scrape (오너 전용)

| TC | 명령 / 조건 | 기대 결과 |
|---|---|---|
| API-17 | 올바른 ownerPw + 소스 매핑 + 참가자 있음 | `{ ok: true, message: "스크랩 시작됨" }`, `groupScrapeStatus: "running"` |
| API-18 | 운영자 비밀번호 | `403` |
| API-19 | groupSource 없는 대회 | `400 { ok: false, error: "기록 소스 미입력" }` |
| API-20 | participants 빈 대회 | `400 { ok: false, error: "참가자 미등록" }` |
| API-21 | groupScrapeStatus가 "running"인 상태에서 재요청 | `400 { ok: false, error: "이미 스크랩이 진행 중입니다" }` |
| API-22 | 스크랩 완료 후 race_events | `groupScrapeStatus: "done"`, `groupScrapeJobId` 설정됨 |

### 2-6. GET gap

| TC | 명령 / 조건 | 기대 결과 |
|---|---|---|
| API-23 | 스크랩 전 대회 | `{ ok: true, status: "not_scraped", participants: [...] }` |
| API-24 | 스크랩 완료 후 대회, 참가자 기록 있음 | `gap[].gapStatus === "ok"` |
| API-25 | 스크랩 결과에 해당 참가자 없음 | `gap[].gapStatus === "missing"` |
| API-26 | 동명이인 (같은 realName 2개 이상) | `gap[].gapStatus === "ambiguous"`, `candidates` 배열 최대 3개 |
| API-27 | canonicalEventId 없이 GET | `400 { ok: false, error: "canonicalEventId required" }` |

---

## 3. ops.html UI 검증

| TC | 시나리오 | 기대 결과 | PRD |
|---|---|---|---|
| OPS-01 | 오너 로그인 후 "단체 대회 기록 소스 관리" 섹션 표시 | 섹션 표시, groupEventsList 로드 | O-02 |
| OPS-02 | 등록된 단체 대회 없음 | "등록된 단체 대회가 없습니다" 메시지 | O-02 |
| OPS-03 | 단체 대회 있음 | 대회 카드: 이름, 날짜, 상태 배지, 소스 선택 dropbox | O-02 |
| OPS-04 | 소스 선택 dropbox에 6개 소스 목록 확인 | smartchip, myresult, spct, marazone, ohmyrace, manual | O-02 |
| OPS-05 | 소스 선택 + sourceId 입력 후 "저장 + 스크랩" | API-12 + API-17 순서로 호출, 목록 자동 갱신 | O-03 |
| OPS-06 | 소스 없이 "저장 + 스크랩" 클릭 | alert "소스와 sourceId를 모두 입력해주세요" | O-03 |
| OPS-07 | 스크랩 트리거 실패 시 (소스는 저장됨) | "소스 저장 완료. 스크랩 트리거 실패 — 다시 시도하거나 자동 스케줄러(15:00)를 기다리세요." | O-03 |
| OPS-08 | 오늘/내일 날짜의 단체 대회 + groupSource 없음 | 상단 경고 배너 `⚠️ 오늘/내일 단체 대회 N건 기록 소스 미입력` 표시 | O-04 |
| OPS-09 | 소스 입력 완료 후 OPS-08 조건 해소 | 배너 숨겨짐 | O-04 |
| OPS-10 | 기존 ops.html 기능 (scrape health, data integrity 등) | 기존 기능 모두 정상 동작 (regression) | — |

---

## 4. group.html UI 검증

### 4-1. 고러닝 예정 대회 목록

| TC | 시나리오 | 기대 결과 | PRD |
|---|---|---|---|
| GRP-01 | 로그인 후 "고러닝 예정 대회" 섹션 | ops_meta 캐시에서 이벤트 목록 표시 | G-01 |
| GRP-02 | "단체 대회 등록" 버튼 클릭 | promote API 호출 → 단체 대회 목록에 추가, 예정 목록에서 제거 | G-02 |
| GRP-03 | 이미 등록된 고러닝 이벤트 | 예정 목록에서 해당 이벤트 제거됨 | G-02 |

### 4-2. 단체 대회 카드

| TC | 시나리오 | 기대 결과 | PRD |
|---|---|---|---|
| GRP-04 | 단체 대회 카드 표시 | 이름, 날짜, groupScrapeStatus 배지 표시 | G-07 |
| GRP-05 | 상태 배지: pending | "대기중" 표시 | G-07 |
| GRP-06 | 상태 배지: running | "스크랩중" 표시 | G-07 |
| GRP-07 | 상태 배지: done | "완료" 표시 | G-07 |
| GRP-08 | 상태 배지: failed | "실패" 표시 | S-03 |
| GRP-09 | groupSource 없음 | "소스 미설정, ops.html에서 입력" 안내 | G-05 |
| GRP-10 | groupSource 있음 | "소스: {source} / {sourceId}" 읽기 전용 표시 | G-05 |

### 4-3. 참가자 등록

| TC | 시나리오 | 기대 결과 | PRD |
|---|---|---|---|
| GRP-11 | "참가자 편집" 버튼 클릭 | 회원 선택 모달 열림 | G-03 |
| GRP-12 | 모달에서 회원 목록 | all-members API로 로드, hidden:false 회원만 표시 | G-03 |
| GRP-13 | 모달에서 닉네임 검색 | 실시간 필터링 | G-03 |
| GRP-14 | 회원 체크 후 "확인" | participants API 호출, 카드에 참가자 칩 표시 | G-03 |
| GRP-15 | 다시 편집 클릭 | 이전에 선택된 참가자 pre-selected | G-04 |

### 4-4. 갭 탐지 결과

| TC | 시나리오 | 기대 결과 | PRD |
|---|---|---|---|
| GRP-16 | 스크랩 완료 대회 | gap API 호출 후 결과 표시 | G-07 |
| GRP-17 | gapStatus: ok 항목 | ✅ {닉네임} — {기록} ({순위}위) 표시 | G-07 |
| GRP-18 | gapStatus: missing 항목 | 🔴 {닉네임} — 기록 없음 + [DNS] [DNF] 버튼 | G-10 |
| GRP-19 | gapStatus: ambiguous 항목 | ⚠️ 동명이인, 후보 최대 3개 라디오 버튼 | G-09 |
| GRP-20 | [DNS] 버튼 클릭 | confirm API 호출 (dnStatus: "dns"), 결과 갱신 | G-10 |
| GRP-21 | [DNF] 버튼 클릭 | confirm API 호출 (dnStatus: "dnf"), 결과 갱신 | G-10 |
| GRP-22 | ambiguous에서 후보 선택 후 확정 | confirm API 호출, gapStatus: ok로 갱신 | G-09 |
| GRP-23 | ok 항목만 있는 경우 "일괄 확정" 버튼 | ok 항목 전체 confirm API 일괄 호출 | G-08 |

---

## 5. confirm 액션 dnStatus 지원 (백엔드)

| TC | 명령 / 조건 | 기대 결과 |
|---|---|---|
| DNS-01 | `results: [{ memberRealName: "홍길동", dnStatus: "dns" }]` | `race_results.status === "dns"`, `finishTime` 필드 없음 |
| DNS-02 | `results: [{ memberRealName: "홍길동", dnStatus: "dnf" }]` | `race_results.status === "dnf"`, `finishTime` 필드 없음 |
| DNS-03 | `results: [{ memberRealName: "홍길동", finishTime: "3:45:00" }]` (dnStatus 없음) | `race_results.status === "confirmed"`, `finishTime === "3:45:00"` |
| DNS-04 | `dnStatus` 있고 `finishTime`도 함께 전달 | `status === "dns"|"dnf"`, `finishTime` 저장 안 됨 |

---

## 6. Cloud Scheduler 로직 검증 (단위)

에뮬레이터에서 `testGroupScrape` HTTP 엔드포인트 추가 후 검증, 또는 Firestore 상태를 직접 세팅 후 스케줄러 로직을 코드 수준에서 확인.

| TC | 시나리오 | 기대 결과 | PRD |
|---|---|---|---|
| SCH-01 | 오늘 날짜 + groupSource 있음 + groupScrapeStatus: "pending" | 스크랩 실행, `groupScrapeStatus: "running"` | S-01, S-02 |
| SCH-02 | 오늘 날짜 + groupSource 없음 | 건너뜀 (소스 미입력 로그) | S-02 |
| SCH-03 | 오늘 날짜 + groupScrapeStatus: "done" | 건너뜀 (이미 완료 로그) | S-02 |
| SCH-04 | 오늘 날짜 + groupScrapeStatus: "running" | 건너뜀 | S-02 |
| SCH-05 | 오늘 날짜 + participants: [] | 건너뜀 | S-02 |
| SCH-06 | 내일 날짜 대회 | 건너뜀 (오늘 KST 날짜만 처리) | S-02 |

---

## 7. Regression (기존 기능)

| TC | 시나리오 | 기대 결과 |
|---|---|---|
| REG-01 | `pre-deploy-test.sh` 42/42 통과 | 기존 API + 호스팅 테스트 모두 통과 |
| REG-02 | report.html 로그인 + 완료 탭 | 기존 confirmed 잡 목록 정상 표시 |
| REG-03 | report.html 수집/예정 탭 | 기존 기능 정상 |
| REG-04 | races.html 기록 조회 | 기존 기능 정상 |
| REG-05 | confirm API (기존 방식, dnStatus 없음) | 기존 동작 동일 — `status: "confirmed"` 저장 |
| REG-06 | ops.html 기존 기능 (scrape health 등) | 오너 로그인 후 접근 가능, 기능 정상 |

---

## 8. 경계값 / 엣지 케이스

| TC | 시나리오 | 기대 결과 |
|---|---|---|
| EDGE-01 | 단체 대회 동시 스크랩 요청 (중복 클릭) | 두 번째 요청 `400 "이미 스크랩이 진행 중입니다"` |
| EDGE-02 | 스크랩 결과 partial_failure | `race_events.groupScrapeStatus: "partial_failure"` (done 아님) |
| EDGE-03 | 동명이인 4명 이상 | gap 응답에서 candidates 최대 3개만 반환 |
| EDGE-04 | 참가자 0명 상태에서 스크랩 시도 | `400 "참가자 미등록"` |
| EDGE-05 | 한 대회에서 소스 변경 후 재스크랩 | 새 groupSource로 정상 스크랩 |
| EDGE-06 | promote 후 같은 대회를 다시 고러닝 목록에서 승격 시도 | 다른 canonicalEventId로 별도 생성 (충돌 없음) |
| EDGE-07 | ops.html 단체 대회 소스 저장 중 API 오류 | 저장 실패 alert 표시 (스크랩 트리거 없음) |

---

## 9. 성공 기준 체크리스트 (PRD §2)

- [ ] **첫 단체 대회 적용 후 운영자 수동 대조 작업 0회** — 갭 탐지 결과가 모든 참가자를 자동으로 표시함
- [ ] **대회일 오후 3시, 소스 매핑된 단체 대회 자동 스크랩** — SCH-01 통과
- [ ] **스크랩 후 참가자 vs 기록 비교 결과 자동 표시** — GRP-16~23 통과
- [ ] **ops.html은 오너만 접근 가능** — AUTH-02 통과 (운영자 비밀번호로 진입 불가)
- [ ] **group.html은 운영자 이상 접근 가능** — AUTH-08, AUTH-09 통과
