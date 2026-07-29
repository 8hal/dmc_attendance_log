# 춘백 S3 출석 점수 제도 도입

날짜: 2026-07-29
상태: **승인됨** (2026-07-29)
관련: `2026-07-12-chunbaek-season3-attendance-design.md` §예외, `2026-07-20-chunbaek-exception-request-design.md`

---

## 1. 배경 및 문제

### 현재 정책의 문제

현재 예외 처리는 분모·분자 모두 제외하는 방식이다.

```
weekTarget = min(3, 훈련일 수 − 예외 수)
```

주 7일 모두 훈련이 있는 춘백 S3 구조에서, 예외 1~4일이어도 weekTarget은 여전히 3으로 유지된다.

```
예외 2일 + 실제 출석 2회 → weekTarget = min(3, 5) = 3 → 2/3 미달 → 패널티 발생
```

회원 입장에서는 "사전 인폼하고 예외 처리까지 받았는데 왜 패널티를 내야 하나"는 피드백이 발생한다.

### 운영진 원칙과의 괴리

운영진이 회원에게 전달하는 원칙:
> "사전 인폼만 해주시면 왠만해선 결석벌금 낼 일은 없을 거예요."

그러나 현재 시스템에서는 예외 2일 + 실제 출석 2회면 패널티가 나온다.

---

## 2. 목표

- 예외 처리를 받은 날이 주간 목표 달성에 기여하도록 한다.
- "예외 = 완전 면제"가 아닌 "예외 = 0.5점"으로, 완전 출석보다는 덜하되 미출석보다는 낫게 처리한다.
- 기존 시즌 출석률(출석 횟수 ÷ 훈련일 수)은 변경하지 않는다. 출석 점수는 **주간 목표 판단에만 사용**하는 별도 지표다.

---

## 3. 정책 변경 — 출석 점수 도입

### 3.1 출석 점수 공식

```
주간 출석 점수 = (실제 출석 수 × 1.0) + (예외 수 × 0.5)
```

| 슬롯 상태 | 점수 |
|------|------|
| 출석 (`attended: true`) | 1.0점 |
| 예외 (`exception: true`) | 0.5점 |
| 미출석 | 0점 |
| 프로그램 휴무 (`isProgramOff: true`) | 집계 제외 |

### 3.2 주간 목표 달성 기준

```
weekScore    = (실제 출석 수 × 1.0) + (예외 수 × 0.5)
             = (훈련일 수 − 예외 수) × 1.0 + (예외 수) × 0.5
             = 훈련일 수 − 예외 수 × 0.5
maxScore     = (훈련일 수 − 예외 수) × 1.0 + (예외 수) × 0.5   // 해당 주 달성 가능 최대 점수
weekTarget   = min(weeklyTarget(=3.0), maxScore)                // 훈련일이 매우 적은 주 보정
달성 조건    = weekScore >= weekTarget
```

여기서 "훈련일 수"는 `isProgramOff: false`인 전체 슬롯 수(예외 포함)를 말한다.
예외 슬롯을 1.0점 대상에 포함하면 이중 계산이 되므로, 반드시 분리 계산한다.

**날짜 경계 처리:**
- 출석(`attended: true`): `slot.date <= today`인 슬롯만 카운팅 (미래 출석은 불가).
- **예외(`exception: true`): 해당 주 안이면 미래 날짜여도 즉시 0.5점 반영.**  
  → 주말에 예외가 잡혀 있어도, 주중에 이미 「이번 주 목표 달성」 여부를 확인할 수 있다.
- `maxScore` / `weekTarget` cap: **주 전체** 훈련일 기준 (`date` 필터 없음). 예외를 미리 넣어도 목표가 줄어 조기 달성되는 구멍을 막는다.

**`weekBar` 소수 처리:**
- `weekBar` 함수에 `weekScore`(소수)를 전달할 때는 `Math.floor(weekScore)`로 변환해서 전달한다.
- 예: `weekScore = 2.5` → `weekBar(2, 3)` → `"██░"` (3칸 유지).

**이전 방식과 비교 (주 7일 훈련 기준):**

| 예외 | 실제 출석 | 출석 점수 | 결과 |
|------|------|------|------|
| 0일 | 3회 | 3.0 | ✅ |
| 1일 | 2회 | 2.5 | ❌ |
| 1일 | 3회 | 3.5 | ✅ |
| 2일 | 2회 | 3.0 | ✅ ← 기존 ❌에서 변경 |
| 2일 | 1회 | 2.0 | ❌ |
| 4일 | 1회 | 3.0 | ✅ ← 기존 ❌에서 변경 |
| 6일 | 0회 | 3.0 | ✅ (예외는 운영 승인 필요로 통제) |

### 3.3 변경하지 않는 것

- **시즌 출석률**: `seasonAttendCount / seasonDenom` — 예외 제외, 출석 횟수 기반 유지
- **`chunbaek_attendance` 스키마**: 필드 추가 없음. `exception: true`는 기존 그대로
- **예외 처리 절차**: 회원 상신 → 운영 승인 흐름 변경 없음

### 3.4 `weeklyTarget` 의미 변화

`chunbaek_season_config.weeklyTarget: 3` 숫자값은 유지되지만, 의미가 "3회 출석"에서 **"3.0점"**으로 바뀐다.
향후 목표값 변경 시(예: `weeklyTarget: 4`)도 동일하게 "4.0점"으로 해석한다.

### 3.5 `exception: true` + `attended: true` 동시 발생 (방어 로직)

데이터 이상(anomaly) 방어: `exception: true`이면 출석 여부와 무관하게 **0.5점**으로 처리.
(`exception`이 `attended`보다 우선순위가 높다.) 이 케이스는 테스트에 명시적으로 포함한다.

---

## 4. UI 표시 변경

### 4.1 주간 출석 표시 (분리 표시)

점수는 소수 1자리 고정(`toFixed(1)`) 표시.

```
달성:  이번 주  출석 2회 · 예외 2회  3.0 / 3점  ✓
미달:  이번 주  출석 2회 · 예외 1회  2.5 / 3점
```

예외가 없는 경우 기존 표시 유지:
```
이번 주  출석 3회  3.0 / 3점  ✓
```

출석 완료 토스트 변경:
```
현재: "이번 주 3/3 ✓"
변경: "이번 주 3.0/3점 ✓" (예외 없을 때) 또는 "이번 주 3.0/3점 ✓ (출석 2·예외 2)"
```

### 4.2 적용 화면

| 화면 | 변경 내용 |
|------|------|
| **홈 탭** | 하단 "이번 주 N/3회" → "이번 주 N회(+예외 M회) / 3점" |
| **내 100일** | 주차별 요약 줄 — `attendSummary` 포맷 변경. 예: `"출석 2회 · 예외 2회 / 3.0점"`. 예외 0일 때는 `"출석 3회 / 3.0점"` |
| **팀 탭** | 팀원 행의 달성 표시(출석 점수 기반). `weekBar` 막대는 `weekScore`를 기준으로 변경 |
| **나 탭** | 이번 주 요약 동일 패턴 |

---

## 5. Admin 변경

### 5.1 주 3회 미달 필터

```
현재: 실제 출석 수 < 3
변경: 주간 출석 점수 < weekTarget  (하드코딩 < 3 지양, weeklyTarget 변경에 대응)
```

### 5.2 그리드 표시

- 예외가 있는 회원의 경우 점수 표시 추가
- 달성/미달 뱃지는 출석 점수 기준으로 변경

---

## 6. 코드 변경 범위

| 파일 | 변경 내용 |
|------|------|
| `functions/lib/chunbaek-stats.js` | `computeWeekStats` — 예외 슬롯을 0.5점으로 카운팅. `weekScore` 신규 필드 추가 (실출석×1 + 예외×0.5, `slot.date <= today` 가드 적용). `weekTarget = min(3.0, maxScore)`. `weekTargetMet = weekScore >= weekTarget`. `weekAttendCount`는 실출석만으로 유지 (하위 호환) |
| `functions/lib/chunbaek-stats.js` | `computeWeekStatsFull` — `today` 파라미터 추가. `attendCount`(실출석)·`target` 외 `weekScore`·`exceptionCount` 추가. `attendSummary` 포맷 변경. `buildTimelineWeeks` 호출부도 `today` 전달하도록 수정 |
| `functions/lib/chunbaek-stats.js` | `computeMemberStats` — 동일 패턴 적용 |
| `functions/lib/chunbaek-stats.js` | `weekBar(attendCount, target)` — `weekScore` 기준 막대 표시 시 호출부에서 `Math.floor(weekScore)` 변환. `target` 파라미터 하드코딩(`const slots = 3`) 제거 |
| `functions/lib/chunbaek-stats.js` | `emptyStats()` — `weekScore: 0` 추가 |
| `functions/lib/chunbaek-admin.js` | `admin-grid` 핸들러 (456~458번 줄) — `weekScore: weekStats.weekScore` 명시적 추가 |
| `functions/lib/chunbaek-handlers.js` | `team-summary` 핸들러 — `weekScore` 추가, `bar` 계산을 `weekBar(Math.floor(stats.weekScore), stats.weekTarget)`으로 변경 |
| `functions/lib/chunbaek-handlers.js` | `my-profile` 핸들러 — `weekScore` 추가. `emptyStats()` 폴백 포함 |
| `chunbaek/js/app.js` | 홈/내 100일/나 탭 — 출석 점수 표시 로직. 토스트 메시지 업데이트 |
| `chunbaek/js/admin.js` | 미달 필터: `weekCount < 3` → `weekScore < weekTarget` (실제 렌더 경로 `normalizeGridFromApi()` line ~163 + mock 경로 `viewGrid()` line ~211 두 곳) |
| `chunbaek/exception-guide.html` | "출석 점수 안내" 섹션 추가 (§7.1) |
| `chunbaek/onboarding-guide.html` (또는 온보딩 내 가이드 화면) | "주 3회 이상 출석 목표" 문구 → "주 3점 이상 출석 목표 (출석 1점, 예외 0.5점)" |
| `chunbaek/js/api.js` | MOCK 데이터 — `weekAttendCount`, `attendSummary`, `weekScore` 업데이트 |
| 테스트 — `scripts/test/chunbaek-attendance-score.test.js` (신규) | 시나리오: ① 예외 2+실출석 2=달성, ② 예외 1+실출석 2=미달, ③ 예외 0+실출석 3=달성, ④ maxScore 상한 테스트(훈련일 적은 주), ⑤ `exception:true && attended:true` 동시 발생 시 0.5점 처리 |

### API 응답 스키마 변경

아래 API 응답에 `weekScore` 필드 추가 (기존 `weekAttendCount` 유지, 하위 호환):

| API | 추가 필드 | 기존 필드 처리 | 수정 파일 |
|------|------|------|------|
| `my-profile` | `weekScore: 2.5` | `weekAttendCount` 유지 | `chunbaek-handlers.js` (`emptyStats()` 포함) |
| `team-summary` | `weekScore` per 회원, `bar` 재계산 | `weekAttendCount` 유지 | `chunbaek-handlers.js` |
| `admin-grid` | `weekScore` per 회원 | `weekCount` 유지 | `chunbaek-admin.js` (456~458번 줄 명시적 추가 필요) |
| `my-timeline` (`buildTimelineWeeks`) | `weekScore`·`exceptionCount`·변경된 `attendSummary` | `attendCount` 유지 | `chunbaek-stats.js` |

**`emptyStats()` 업데이트**: 슬롯이 없는 주의 폴백 함수에 `weekScore: 0` 추가.

---

## 7. 안내 페이지

### 7.1 `exception-guide.html` 섹션 추가

기존 "알아두면 좋아요" 섹션 위에 "출석 점수 안내" 섹션 추가:

```
출석 점수 안내

예외 처리를 받은 날도 주간 목표에 반영됩니다.

  출석     1점
  예외     0.5점
  미출석   0점

주간 목표: 3점 이상

[ 예시 ]
출석 2회 + 예외 2일 = 3.0점 → 달성 ✓
출석 2회 + 예외 1일 = 2.5점 → 미달
출석 3회               = 3.0점 → 달성 ✓
```

### 7.2 앱 홈 1회성 안내 배너

정책 도입 시점에 홈 탭 상단에 1회성 배너 표시:

```
[출석 점수 제도가 도입됐습니다]
예외 처리된 날이 0.5점으로 주간 목표에 반영됩니다.
→ [자세히 보기]  ×
```

- `localStorage` 키: `chunbaek_score_notice_v1`
- 닫기(`×`) 또는 "자세히 보기" 탭 시 더 이상 표시 안 함
- 링크: `exception-guide.html`

---

## 8. 성공 기준

1. 예외 2일 + 실제 출석 2회 → 주간 달성 판정
2. 예외 1일 + 실제 출석 2회 → 주간 미달 판정 (0.5점 부족)
3. 기존 시즌 출석률 계산 변경 없음
4. Admin 미달 필터가 출석 점수 기준으로 동작
5. 안내 페이지에서 새 정책이 명확히 설명됨
6. 홈 1회성 배너가 정책 도입 후 첫 방문 시 표시됨

---

## 9. 미결

- [x] 베타(0주차) 슬롯 — 동일 출석 점수 적용 (확정)
- [ ] 팀 탭 점수 표시 상세 레이아웃 확정 (구현 시 결정)
