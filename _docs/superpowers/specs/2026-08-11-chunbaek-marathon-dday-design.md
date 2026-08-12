# 춘백 홈화면 마라톤 D-day 카드 설계

**날짜:** 2026-08-11  
**상태:** 승인됨 (스펙 리뷰 반영)

---

## 개요

춘백 S3 홈화면(`chunbaek/index.html`) 주간 점수 섹션 아래에, 개인 목표 대회까지 남은 날짜(D-day)를 보여주는 카드를 추가한다. 목표 대회는 사용자가 프로필에서 설정한 `goalRace` 기준으로 결정한다.

---

## 목표 및 성공 기준

- 홈화면에서 목표 마라톤까지 남은 일수를 확인할 수 있다
- 개인 목표 대회에 맞춰 자동으로 해당 대회 날짜가 표시된다
- 기타 대회 선택자도 날짜를 직접 입력해 D-day를 볼 수 있다

---

## 변경 범위

### 백엔드

1. **`my-profile` API 응답에 `goalRaceDate` 추가**

   날짜는 Firestore 조회 없이 **코드 상수**로 관리한다 (DB 마이그레이션 불필요):

   ```js
   const SEASON_RACE_DATES = {
     chuncheon: { label: "춘천마라톤",          date: "2026-10-26" },
     jtbc:      { label: "JTBC 서울마라톤",     date: "2026-11-01" },
   };
   ```

   - `goalRace === "chuncheon"` → `SEASON_RACE_DATES.chuncheon.date`
   - `goalRace === "jtbc"` → `SEASON_RACE_DATES.jtbc.date`
   - `goalRace === "other"` → `members.chunbaekS3.goalRaceDate` 반환 (없으면 `null`)

   - `goalRace === "other"` + 날짜 있음 → 카드 레이블로 기존 `goalRaceNote` 텍스트를 사용
     - `goalRaceNote`가 없으면 "내 목표 대회" 고정 문자열로 fallback
   - 알 수 없는 `goalRace` 값(레거시 등) → `goalRaceDate: null` 반환, 카드 숨김

   응답 예 (기타 + 날짜 있음):
   ```json
   { "goalRace": "other", "goalRaceLabel": "경주 마라톤", "goalRaceDate": "2026-10-11" }
   ```

   `memberProfilePayload` 함수에 날짜 조회를 추가하므로 `update-profile` 응답에도 `goalRaceDate`가 자동으로 포함된다 (의도적).

2. **`update-profile` API에 `goalRaceDate` 필드 수용**

   - `goalRace === "other"`일 때만 `chunbaekS3.goalRaceDate`에 저장
   - `goalRace !== "other"`일 때 기존 stale 값 방지를 위해 **`FieldValue.delete()`로 명시 삭제**
     - 기존 `goalRaceNote` 처리(`buildProfileUpdate`)와 동일한 패턴
   - 저장 형식: ISO 날짜 문자열 (`YYYY-MM-DD`)

   유효성 검사:
   - 형식이 `YYYY-MM-DD`가 아니면 400 에러
   - 과거 날짜도 허용 (이미 신청한 대회일 수 있음)
   - 10년 초과 미래 날짜는 400 에러 (명백한 입력 오류 방지)
   - `goalRace !== "other"`일 때 요청 body에 `goalRaceDate`가 포함돼도 **무시(silently ignore)**

### Firestore 스키마

- `members.chunbaekS3.goalRaceDate` (string, optional) — 기타 사용자만 사용, ISO 날짜 문자열

### 프론트엔드

1. **홈화면 D-day 카드 추가** (`chunbaek/js/app.js`)
   - 위치: 주간 점수 섹션(`weekly-score`) 아래
   - `my-profile` 응답의 `goalRaceDate`로 D-day 계산

2. **프로필 수정 폼** (`chunbaek/js/app.js` 내 프로필 관련 함수)
   - `goalRace === "other"` 선택 시 날짜 입력 필드(`<input type="date">`) 노출
   - `goalRaceDate` 값을 `update-profile` 요청에 포함

---

## D-day 계산 방식

**KST 기준 날짜 문자열 비교** (off-by-one 방지):

```js
// 오늘 날짜를 KST YYYY-MM-DD 문자열로
const todayKst = new Date().toLocaleDateString("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric", month: "2-digit", day: "2-digit"
}).replace(/\. /g, "-").replace(".", "");
// 또는 서버에서 todayKst를 응답에 포함해도 됨

const raceDate = new Date(goalRaceDate + "T00:00:00+09:00");
const today    = new Date(todayKst   + "T00:00:00+09:00");
const D = Math.ceil((raceDate - today) / 86400000);
```

| D 값 | 표시 |
|---|---|
| D > 0 | D-day 카드 |
| D = 0 | 당일 카드 |
| D < 0 | 카드 숨김 |

---

## 화면 설계

### 정상 케이스 (날짜 있음, D > 0)

```
┌──────────────────────────────────┐
│ 🏃 춘천마라톤             D-75   │
│    2026. 10. 26 (월)             │
└──────────────────────────────────┘
```

- 배경: 옅은 주황-레드 계열 (춘백 브랜드 컬러 활용)
- 대회명 + 날짜: 왼쪽 정렬
- D-N 숫자: 오른쪽, 크게 표시

### 기타 + 날짜 있음 케이스 (goalRaceNote 사용)

```
┌──────────────────────────────────┐
│ 🏃 경주 마라톤            D-61   │
│    2026. 10. 11 (일)             │
└──────────────────────────────────┘
```

### 기타 + 날짜 미입력 케이스

```
┌──────────────────────────────────┐
│ 📅 목표 대회 날짜를 입력하면      │
│    D-day를 볼 수 있어요  [입력하기]│
└──────────────────────────────────┘
```

- 배경: 회색 계열
- [입력하기] 버튼 → 프로필 수정 화면으로 이동

### D-day 당일 (D = 0)

```
┌──────────────────────────────────┐
│ 🎉 오늘이 춘천마라톤 당일이에요!  │
│    완주를 응원합니다!             │
└──────────────────────────────────┘
```

### 대회 종료 후 (D < 0)

카드 숨김.

---

## 엣지 케이스

| 상황 | 처리 |
|---|---|
| goalRace 미설정 (프로필 미완성) | 카드 숨김 |
| 기타 + goalRaceDate 없음 | 유도 메시지 카드 표시 |
| 기타 + goalRaceDate 있음 | 정상 D-day 카드 |
| D = 0 (당일) | 축하 메시지 카드 |
| D < 0 (대회 후) | 카드 숨김 |
| goalRace "other" → 다른 값으로 변경 | goalRaceDate를 FieldValue.delete()로 삭제 |

---

## 데이터 흐름

```
홈 진입
  → my-profile API 호출
  → 응답: { goalRace, goalRaceLabel, goalRaceDate }
  → goalRaceDate 없음 && goalRace === "other" → 유도 메시지 카드
  → goalRaceDate 없음 && goalRace !== "other" → 카드 숨김
  → goalRaceDate 있음:
      D = KST 기준 날짜 차이 계산
      D > 0 → D-day 카드
      D = 0 → 당일 카드
      D < 0 → 카드 숨김
```

---

## 구현 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `functions/lib/chunbaek-handlers.js` | `SEASON_RACE_DATES` 상수 추가, `memberProfilePayload`에 `goalRaceDate` 반환, `buildProfileUpdate`에 `goalRaceDate` 저장/삭제 추가 |
| `chunbaek/index.html` | 홈 D-day 카드 HTML + CSS |
| `chunbaek/js/app.js` | D-day 카드 렌더링 로직, 프로필 폼 날짜 필드 노출 |

---

## 미결 사항

- 없음
