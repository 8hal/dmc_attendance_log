# 정모 훈련 API 추가 필요성 검증 (Admin-1b)

> 날짜: 2026-07-19  
> 관련: `_docs/superpowers/specs/2026-07-17-attendance-admin-hub-design.md` §7.2  
> 게이트: `new-api-validation` — **사용자 승인 전 구현 금지**

---

## 1. 유사 API 전역 검색 (완료)

| 패턴 | 결과 |
|------|------|
| `meeting-training` / `meeting_training` / `trainBefore` | **HTTP API·컬렉션 없음**. 설계 스펙·계획에만 존재 |
| `parse-cafe` / `cafe.*training` | **없음** (붙여넣기 파싱은 미구현) |
| `admin-week-slots` / `admin-save-week-slots` | **춘백** `exports.chunbaek` — `chunbaek_slots` 시즌 슬롯 (`trainingTitle`/`trainingContent`) |
| `MEETING_INFO` / 정모 시간표 | `docs/MEETING_INFO.md` 정적 문서만. 당일 훈련 저장 API 없음 |
| `exports.attendance` GET/POST | 출석 등록·status·history·stats·sessionCount·delete. **훈련 필드 없음** |

---

## 2. 기존 API 사용처

### A. 춘백 `admin-week-slots` / `admin-save-week-slots`

- **호출처:** `chunbaek/admin.html` (`chunbaek/js/admin.js`)
- **컬렉션:** `chunbaek_slots` (시즌·주차 키)
- **스키마:** `trainingTitle` + `trainingContent` (전·본·후·서포터즈 분리 없음)
- **용도:** 춘천 100일 프로그램 주간 훈련 입력
- **인증:** 춘백 adminPw

### B. `docs/MEETING_INFO.md`

- **용도:** 화·목·토 정모 **기본** 시간·장소 문서
- **한계:** 주간마다 바뀌는 코스·서포터즈·메모를 저장·회원앱에 표시할 수 없음

### C. 출석 `status` / `history` / `stats`

- **용도:** 누가 왔는지·개인 통계
- **한계:** 그날 **무엇을 할지**(훈련 공지)와 무관

---

## 3. 신규 API 제안

| action (가칭) | 메서드 | 용도 | 호출처 |
|---------------|--------|------|--------|
| `meeting-training` (get) | `GET /attendance?action=meeting-training&meetingDate=&meetingType=` 또는 `week=` | 단일 세션 또는 주간(화·목·토) 조회 | 출석 셸 `#today`, 운영 허브 `#training` |
| `meeting-training` (save) | `POST /attendance?action=meeting-training` + `{ pw, rows[] }` | 주간 일괄 저장 (verify-admin) | `attendance-admin.html` |
| `parse-cafe-training` (선택·1차 클라) | 서버 불필요 시 **순수 파서 모듈**만 | 카페 공지 붙여넣기 → 주간 JSON | 허브 훈련 탭 (1차 A안) |

**문서 키 SSOT:** `meeting_training/{YYYY-MM-DD}_{TUE|THU|SAT}` (또는 slash dateKey)

**필드 SSOT (설계서 §7.2):**  
`time`, `place`, `trainBefore`, `trainMain`, `trainAfter`, `supporters`, `note`  
(+ `meetingDateKey`, `meetingType`, `updatedAt`)

**1차 입력 UX (잠김):** 카페 본문 **붙여넣기 파싱(A)** → 검토 → 저장. URL fetch는 이후.

---

## 4. 기존 API로 대체 불가능한 이유

### 왜 춘백 `admin-week-slots`를 재사용하지 않는가?

- **도메인 분리:** 춘백 = 시즌 100일 슬롯. 정모 = 클럽 정기 모임 `(date, TUE|THU|SAT)`.
- **스키마 불일치:** 춘백은 title/content 2필드. 정모 공지는 **전·본·후·서포터즈·시간/장소** 표 구조.
- **소비자 불일치:** 회원 출석 앱 `#today`는 춘백 그리드가 아니라 정모 세션 공지가 필요.
- **권한·엔드포인트:** 춘백 admin과 출석 허브 `verify-admin { pw }` / `exports.attendance` 경로가 다름.

### 왜 `MEETING_INFO.md` / 하드코드만으로 부족한가?

- 주간마다 코스·서포터즈·메모가 바뀜 → 정적 문서로는 회원앱 «오늘» 실시간 표시 불가.
- 운영진이 허브에서 저장·수정할 UI/저장소가 없음.

### 왜 클라이언트가 Firestore 직접 쓰면 안 되는가?

- 프로젝트 패턴: Hosting 정적 HTML + Cloud Functions API (`api-patterns.md`).
- 저장은 운영진 인증·감사 필요 → Functions에서 `verify-admin` 후 쓰기.

### `parse-cafe-training`을 서버 API로 둘지

- **1차 권장:** 붙여넣기 파싱은 **순수 JS 모듈**(테스트 가능)로 클라이언트/공유 모듈. 서버 POST 불필요.
- URL 자동 fetch가 필요해지면 그때 별도 justification (쿠키·비공개 카페 제약).

---

## 5. 신규 API 추가 결정 (승인 대기)

- ✅ **추가 필요:** `meeting-training` get + save (attendance 엔드포인트)
- ⚠️ **파서:** 1차는 서버 API 없이 공유 모듈 (`parseCafeTrainingPaste`)
- ⚠️ **대안 없음** (춘백 week-slots·MEETING_INFO로는 UX/스키마 미충족)

### 잠긴 제품 규칙

- 키: `(meetingDateKey, meetingType ∈ {TUE,THU,SAT})`
- 입력: 붙여넣기 파싱 → 검토 → 주간 보드 저장
- 회원앱: `#today` 읽기 전용 표
- Admin save: `{ pw }` = 기존 `verify-admin`과 동일

---

## 6. 구현 시 참조 패턴

- Admin 인증: `verify-admin` / Delete-1 `verifyAdminPassword` (`{ pw }`)
- 배치 저장: `_docs/development/batch-save-pattern.md` (주간 3건)
- 파서 TDD: `scripts/test/` + 샘플 카페 본문 fixture
- 셸 표시: Admin-1b 승인·저장 후 `#today` 연동

---

## 승인

- ⏳ **승인 대기** — 승인 전에는 Admin-1b 코드(API·허브 훈련 저장) 구현 금지
- Shell-2/Shell-3(기존 history/stats/status/members)은 본 justification과 무관하게 진행 가능
