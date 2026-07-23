# 춘백 슬롯 dayIndex↔date SSOT 설계

> **상태:** 승인 대기 (2026-07-23 사고 후 설계)  
> **관련 사고:** dayIndex 1·2·3의 `date`가 7일 밀려 before-season UI 오표시  
> **복구:** `scripts/fix-chunbaek-slot-dates.js`로 CSV 기준 date/week 복구 완료

## 1. 배경

춘백 S3 본시즌은 **고정 100일**이다.

| 항목 | 값 |
|---|---|
| `startDate` | `2026-07-20` |
| `endDate` | `2026-10-27` |
| dayIndex | 1 … 100 |
| 0주차(베타) | dayIndex 901 … 907 → `2026-07-13` … `2026-07-19` |

그런데 Firestore `chunbaek_slots`는 `dayIndex`와 `date`를 **독립 필드**로 저장하고, admin 훈련 저장 API가 클라이언트가 보낸 `date`를 **검증 없이 덮어쓴다.**  
그 결과 dayIndex 1이 `2026-07-27`이 될 수 있고, `seasonBounds`가 이를 시즌 시작일로 사용해 홈이 before-season으로 깨진다.

동시에 `computeMemberStats`는 `config.startDate`를 우선 사용해 「4일차」는 정상처럼 보이는 **이중 기준**이 생겼다.

## 2. 목표

1. **dayIndex(+ config.startDate)를 SSOT**로 두고 date/week는 파생값으로 취급한다.
2. admin/import가 date를 오염시키지 못하게 한다.
3. 읽기 경로가 슬롯 date 오염에 견디게 한다.
4. 불일치를 탐지하는 감사 스크립트·테스트를 둔다.

## 3. 비목표

- `date` 필드를 Firestore에서 삭제하지 않는다 (표시·기존 클라이언트 호환).
- 스키마/컬렉션 재설계, 대규모 마이그레이션 UI는 하지 않는다.
- 프론트에서 date를 자체 계산하도록 전면 이관하지 않는다 (서버가 올바른 date를 내려주면 충분).

## 4. 파생 규칙 (확정)

```text
# 본시즌 dayIndex ∈ [1, 100]
date(dayIndex) = addDaysIso(config.startDate, dayIndex - 1)
week(dayIndex) = ceil(dayIndex / 7)

# 베타 dayIndex ∈ [901, 907]
betaStart = config.betaWeekStartDate
           || addDaysIso(config.startDate, -7)
date(dayIndex) = addDaysIso(betaStart, dayIndex - 901)
week = 0
```

`generate-chunbaek-slot-skeleton.js` / `seed-chunbaek-week0.js`와 동일하다.

## 5. 취약점 → 대응

| ID | 취약점 | 대응 |
|---|---|---|
| V1 | dayIndex·date 독립 저장 | date는 denormalized 캐시. 쓰기 시 서버 파생 |
| V2 | `admin-save-week-slots`가 client date 덮어씀 | title/content/off만 갱신. date/week는 서버 파생·기존 유지 |
| V3 | import가 잘못된 date 허용 | 파생값과 다르면 교정 + warning (또는 400 — 구현은 교정+warning) |
| V4 | `seasonBounds`가 슬롯 date만 사용 | `config.startDate` / 파생 endDate 우선 |
| V5 | stats vs 홈 이중 기준 | 시즌 경계 판정 전부 config/파생 통일 |
| V6 | 출석 가드가 슬롯 seasonBounds 사용 | 동일하게 config.startDate 우선 |

## 6. API / 코드 변경 요약

### 6.1 공통 헬퍼 (`chunbaek-stats.js`)

추가:

- `deriveSeasonDate(config, dayIndex) → iso | null`
- `deriveSeasonWeek(dayIndex) → number`
- `deriveSlotDate(slot, config, slots) → iso`  
  - 베타: 기존 beta bounds 로직  
  - 시즌: `deriveSeasonDate`  
  - 최후: 저장된 `slot.date` (정규화)
- `effectiveSeasonStart(config, slots) → iso`  
  - `config.startDate || seasonBounds(...).startDate`
- `effectiveSeasonEnd(config, slots) → iso`  
  - `config.endDate || addDaysIso(start, 99) || seasonBounds.endDate`

### 6.2 쓰기

**`handleAdminSaveWeekSlots`**
- 기존 슬롯: `trainingTitle` / `trainingContent` / `isProgramOff` / `updatedAt`만 merge. **date·week 필드 쓰지 않음.**
- 신규 슬롯: dayIndex 확정 후 서버가 date·week 파생해 저장. body.date 무시.
- (베타 주차) dayIndex는 계속 `betaDayIndexForDate`로 해석 가능하되, 저장 date는 파생값.

**`handleAdminImportSlots`**
- 각 row: `expected = derive…(dayIndex)`  
- `row.date !== expected`이면 `row.date = expected`로 교정하고 warning에 기록.
- week도 파생 week로 맞춤.

### 6.3 읽기

| 함수 | 변경 |
|---|---|
| `resolveSlotDate` | 시즌도 dayIndex 파생 fallback (저장된 date가 있어도 **불일치 시 파생 우선**할지 정책: **파생 우선**) |
| `seasonBounds` 호출부 (`todaySlotPayload`, 출석 가드, timeline, admin default week) | `effectiveSeasonStart/End` 사용 |
| `findTodaySlot` | date 매칭 실패 시 `dayIndex = offsetFromStart + 1`로 season 슬롯 탐색 |
| `todaySlotPayload` meta.`startDate` | `effectiveSeasonStart` |

**파생 우선 정책:** 저장된 date와 파생 date가 다르면 파생을 사용한다. denormalized 오염이 런타임 증상을 만들지 않게 한다. 감사가 불일치를 리포트한다.

### 6.4 프론트

- admin 훈련 저장 payload에서 `date`를 보내도 서버가 무시하므로 **필수 변경 없음.**
- (선택) admin UI는 표시용 date만 보여주고, 저장 row에서 date 필드를 빼도 됨.

## 7. 감사 (C)

### 7.1 스크립트

`scripts/verify-chunbaek-slot-dates.js`

- Firestore season 슬롯 1–100 (+ optional beta) 로드
- 각 문서: 저장 date/week vs 파생값 비교
- exit 0 = 불일치 0, exit 1 = 불일치 > 0
- `--fix` 옵션은 **별도 스크립트** `fix-chunbaek-slot-dates.js`에 유지 (이미 존재 시 재사용)

### 7.2 테스트

`scripts/verify-chunbaek-stats.js` 또는 `scripts/test/chunbaek-slot-date-ssot.test.js`:

1. dayIndex 1의 date를 고의로 `startDate+7`로 둔 슬롯 배열 → `todaySlotPayload`가 beforeSeason 아님 (today ∈ season)
2. admin save 시뮬: 기존 슬롯에 잘못된 date를 body로 보내도 저장 patch에 date 없음 (단위/에뮬)
3. derive 헬퍼: dayIndex 1→start, 100→start+99, 901→betaStart

## 8. 롤아웃

1. functions만 배포 (`chunbaek`) — 쓰기 방어 + 읽기 견고화  
2. verify 스크립트로 프로덕션 불일치 0 확인 (이미 fix 스크립트로 복구됨)  
3. hosting은 admin 선택 변경 시에만

## 9. 성공 기준

- [ ] dayIndex 1 date를 7/27로 오염시켜도 홈이 before-season이 되지 않는다
- [ ] admin 1주차 훈련 저장 후 date/week가 변하지 않는다
- [ ] import 잘못된 date → 교정 + warning
- [ ] verify 스크립트 불일치 0건
- [ ] 기존 chunbaek 테스트·verify-chunbaek-stats 통과

## 10. 리스크

| 리스크 | 완화 |
|---|---|
| config.startDate 누락 | seasonBounds / CSV fallback 유지 |
| 베타 dayIndex 규칙 변경 | BETA_* 상수 단일 사용 |
| 과거 출석가 슬롯 date에 묶인 가정 | 출석 문서는 slotId(dayIndex) 기준 — date 무관 |

## 11. 결정 문서

- `_docs/superpowers/specs/2026-07-16-chunbaek-season3-ops-prep.md` — 7/20 시작
- `_docs/superpowers/specs/2026-07-12-chunbaek-season3-admin-api.md` — admin-save-week-slots
- `scripts/data/chunbaek-s3-slots-100days.csv` — SSOT 샘플
- `docs/superpowers/plans/2026-07-23-chunbaek-slot-date-ssot.md` — 구현 계획
