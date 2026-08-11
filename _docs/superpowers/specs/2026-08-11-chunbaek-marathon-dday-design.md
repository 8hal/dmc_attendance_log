# 춘백 홈화면 마라톤 D-day 카드 설계

**날짜:** 2026-08-11  
**상태:** 승인됨

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
   - `goalRace === "chuncheon"` → `chunbaek_season_config.races[]`에서 날짜 조회 (`2026-10-25`)
   - `goalRace === "jtbc"` → 같은 방식 (`2026-11-01`)
   - `goalRace === "other"` → `members.chunbaekS3.goalRaceDate` 반환 (없으면 `null`)
   - 응답 예: `{ goalRace: "chuncheon", goalRaceLabel: "춘천 마라톤", goalRaceDate: "2026-10-25" }`

2. **`update-profile` API에 `goalRaceDate` 필드 수용**
   - `goalRace === "other"`일 때만 저장
   - 형식: ISO 날짜 문자열 (`YYYY-MM-DD`)
   - 기타 이외 선택 시 기존 `goalRaceDate` 필드 무시 (저장 안 함)

### Firestore 스키마

- `members.chunbaekS3.goalRaceDate` (string, optional) — 기타 사용자만 사용

### 프론트엔드

1. **홈화면 D-day 카드 추가** (`chunbaek/js/app.js` 또는 `chunbaek/index.html`)
   - 위치: 주간 점수 섹션(`weekly-score`) 아래
   - `my-profile` 응답에서 `goalRaceDate`로 D-day 계산

2. **프로필 수정 폼** — `goalRace === "other"` 선택 시 날짜 입력 필드 노출

---

## 화면 설계

### 정상 케이스 (날짜 있음, D > 0)

```
┌──────────────────────────────────┐
│ 🏃 춘천 마라톤          D-75     │
│    2026. 10. 25 (일)             │
└──────────────────────────────────┘
```

- 배경: 옅은 주황-레드 계열 (춘백 브랜드 컬러 활용)
- 대회명 + 날짜: 왼쪽 정렬
- D-N 숫자: 오른쪽, 크게 표시

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
│ 🎉 오늘이 춘천 마라톤 당일이에요! │
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

---

## 데이터 흐름

```
홈 진입
  → my-profile API 호출
  → 응답: { goalRace, goalRaceLabel, goalRaceDate }
  → goalRaceDate 없음: 기타+날짜없음 카드 또는 숨김
  → goalRaceDate 있음:
      D = Math.ceil((raceDate - today) / 86400000)
      D > 0 → D-day 카드
      D = 0 → 당일 카드
      D < 0 → 숨김
```

---

## 구현 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `functions/chunbaek-handlers.js` | `my-profile`: goalRaceDate 추가 반환 / `update-profile`: goalRaceDate 저장 |
| `chunbaek/index.html` | 홈 D-day 카드 HTML + CSS |
| `chunbaek/js/app.js` | D-day 카드 렌더링 로직 |
| `chunbaek/js/profile.js` (또는 동일 파일) | 프로필 폼 기타 선택 시 날짜 필드 노출 |

---

## 미결 사항

- 없음
