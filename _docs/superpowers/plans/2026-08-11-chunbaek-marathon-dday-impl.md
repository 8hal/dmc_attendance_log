# 춘백 홈화면 마라톤 D-day 카드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 춘백 S3 홈화면 주간 점수 아래에 개인 목표 마라톤까지 남은 D-day 카드를 표시한다.

**Architecture:** 백엔드(`my-profile` API)가 `goalRace` 유형에 따라 `goalRaceDate`를 응답에 추가하고, 프론트엔드가 기존 `daysUntilKst()` 유틸로 D-day를 계산해 카드를 렌더링한다. "기타" 사용자는 프로필 수정 폼에서 날짜를 직접 입력할 수 있다.

**Tech Stack:** Node.js 22, Firebase Functions v2, Firestore, Vanilla JS (ES모듈 없음, 인라인 IIFE 패턴), HTML/CSS

**Spec:** `_docs/superpowers/specs/2026-08-11-chunbaek-marathon-dday-design.md`

---

## 파일 목록

| 파일 | 변경 유형 | 주요 내용 |
|---|---|---|
| `functions/lib/chunbaek-handlers.js` | 수정 | `SEASON_RACE_DATES` 상수, `memberProfilePayload` goalRaceDate 반환, `parseGoalRace`/`buildProfileUpdate` goalRaceDate 처리 |
| `chunbaek/index.html` | 수정 | 홈 D-day 카드 HTML, 프로필 폼 날짜 입력 필드 |
| `chunbaek/js/app.js` | 수정 | D-day 카드 렌더링 로직, 프로필 폼 날짜 필드 sync/fill/read |

---

## Task 1: 백엔드 — `memberProfilePayload`에 `goalRaceDate` 추가

**Files:**
- Modify: `functions/lib/chunbaek-handlers.js:1-70` (상수·헬퍼), `functions/lib/chunbaek-handlers.js:137-153` (memberProfilePayload)

### 맥락

`memberProfilePayload` 함수(line 137)는 `my-profile` 및 `update-profile` API 응답을 만든다.
`formatGoalRaceLabel` 함수(line 62)가 이미 `goalRace`를 레이블로 변환하는 패턴이 있다.
"other" 사용자의 `goalRaceDate`는 Firestore `s3.goalRaceDate`에서 읽고, chuncheon/jtbc는 코드 상수에서 조회한다.

- [ ] **Step 1: `SEASON_RACE_DATES` 상수 추가**

`functions/lib/chunbaek-handlers.js` 상단(line 1 근처, 기존 상수들 옆)에 추가:

```js
const SEASON_RACE_DATES = {
  chuncheon: "2026-10-26",
  jtbc:      "2026-11-01",
};
```

- [ ] **Step 2: `memberProfilePayload`에 `goalRaceDate` 반환 추가**

`functions/lib/chunbaek-handlers.js` line 137의 `memberProfilePayload` 함수 내부에 추가.
기존 `goalRaceLabel: formatGoalRaceLabel(...)` 줄 바로 아래에 삽입:

```js
// 기존 코드 (변경 없음)
goalRaceLabel: formatGoalRaceLabel(s3.goalRace, s3.goalRaceNote),
// 추가할 코드
goalRaceDate: SEASON_RACE_DATES[s3.goalRace] ?? (s3.goalRaceDate || null),
```

- [ ] **Step 3: 수동 검증 — `my-profile` 응답 확인**

에뮬레이터 시작 + 시드 후 curl로 확인:
```bash
# 에뮬레이터가 실행 중이어야 함
TOKEN="..."  # 로그인 토큰
curl -s "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/chunbaek?action=my-profile" \
  -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
```

응답에 `"goalRaceDate": "2026-10-26"` (또는 `"2026-11-01"`) 키가 있으면 통과.

- [ ] **Step 4: 커밋**

```bash
git add functions/lib/chunbaek-handlers.js
git commit -m "feat(chunbaek): my-profile에 goalRaceDate 반환 추가"
```

---

## Task 2: 백엔드 — `goalRaceDate` 저장·삭제 처리

**Files:**
- Modify: `functions/lib/chunbaek-handlers.js:52-59` (parseGoalRace), `functions/lib/chunbaek-handlers.js:214-236` (buildProfileUpdate)

### 맥락

`parseGoalRace(body)` 함수(line 52)가 요청 body에서 `goalRace`·`goalRaceNote`를 파싱한다.
`buildProfileUpdate(parsed)` 함수(line 214)가 Firestore 업데이트 객체를 만든다.
`goalRaceNote`는 `FieldValue.delete()`로 other 이외 케이스를 처리하는 동일 패턴을 따른다.

- [ ] **Step 1: `parseGoalRace`에 `goalRaceDate` 파싱 추가**

`functions/lib/chunbaek-handlers.js:52-60`의 `parseGoalRace` 함수를 수정:

```js
function parseGoalRace(body) {
  const goalRace = String(body.goalRace || "").trim();
  if (!GOAL_RACES.has(goalRace)) {
    return { error: "goalRace must be chuncheon, jtbc, or other" };
  }
  const noteRaw = String(body.goalRaceNote || "").trim().slice(0, GOAL_RACE_NOTE_MAX);
  const goalRaceNote = goalRace === "other" ? (noteRaw || null) : null;

  // goalRaceDate: "other"일 때만 파싱·저장
  let goalRaceDate = null;
  if (goalRace === "other" && body.goalRaceDate) {
    const d = String(body.goalRaceDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return { error: "goalRaceDate must be YYYY-MM-DD" };
    }
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) {
      return { error: "goalRaceDate is not a valid date" };
    }
    const tenYearsLater = new Date();
    tenYearsLater.setFullYear(tenYearsLater.getFullYear() + 10);
    if (parsed > tenYearsLater) {
      return { error: "goalRaceDate is too far in the future" };
    }
    goalRaceDate = d;
  }

  return { goalRace, goalRaceNote, goalRaceDate };
}
```

- [ ] **Step 2: `parseProfileFields`에 `goalRaceDate` 전파 확인**

`functions/lib/chunbaek-handlers.js:182-212`의 `parseProfileFields` 함수를 확인.
`goalRaceParsed.goalRace`, `goalRaceParsed.goalRaceNote`를 이미 사용하므로, `goalRaceDate`도 전파:

```js
return {
  goalMarathonNetTime,
  existingPbNetTime,
  resolutionText,
  goalRace: goalRaceParsed.goalRace,
  goalRaceNote: goalRaceParsed.goalRaceNote,
  goalRaceDate: goalRaceParsed.goalRaceDate,   // 추가
  goalBodyWeightKg,
  goalBodyWeightPrivate,
};
```

- [ ] **Step 3: `buildProfileUpdate`에 `goalRaceDate` 저장·삭제 추가**

`functions/lib/chunbaek-handlers.js:214-236`의 `buildProfileUpdate` 함수에 추가.
`goalRaceNote` 처리 블록(line 220-224) 바로 다음에 삽입:

```js
// goalRaceDate: other + 날짜 있을 때만 저장, 그 외엔 삭제 (stale 방지)
if (parsed.goalRace === "other" && parsed.goalRaceDate) {
  update["chunbaekS3.goalRaceDate"] = parsed.goalRaceDate;
} else {
  update["chunbaekS3.goalRaceDate"] = FieldValue.delete();
}
```

- [ ] **Step 4: 수동 검증 — `update-profile` 저장 확인**

에뮬레이터에서 "기타" 선택 + 날짜 포함 요청 후 Firestore에 `goalRaceDate` 저장 확인:
```bash
curl -s -X POST \
  "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/chunbaek?action=update-profile" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"goalRace":"other","goalRaceNote":"경주 마라톤","goalRaceDate":"2026-10-11","goalMarathonNetTime":14400}'
```

응답에 `"goalRaceDate": "2026-10-11"`이 있으면 통과.
이후 `?action=my-profile`로 다시 조회해서 `goalRaceDate`가 유지되는지도 확인.

- [ ] **Step 5: 커밋**

```bash
git add functions/lib/chunbaek-handlers.js
git commit -m "feat(chunbaek): update-profile goalRaceDate 저장·삭제 처리"
```

---

## Task 3: 프론트엔드 — 프로필 폼 날짜 입력 필드

**Files:**
- Modify: `chunbaek/index.html:108` (goal-race-note 필드 바로 다음)
- Modify: `chunbaek/js/app.js:335-339` (syncGoalRaceNote), `chunbaek/js/app.js:404-428` (fillProfileForm), `chunbaek/js/app.js:431-474` (readProfileFormFromDom)

### 맥락

`chunbaek/index.html:108`에 `goal-race-note` 텍스트 입력이 있다. 그 바로 다음에 날짜 입력을 추가한다.
`syncGoalRaceNote()`(app.js:335)가 note 필드 노출을 제어한다. 날짜 필드도 같이 동기화한다.
`fillProfileForm()`(app.js:404)이 폼을 채운다. `readProfileFormFromDom()`(app.js:431)이 폼을 읽는다.

- [ ] **Step 1: HTML에 날짜 입력 필드 추가**

`chunbaek/index.html:108` 기존 코드:
```html
<input type="text" class="input" id="goal-race-note" maxlength="80" placeholder="기타 대회명 (80자)" hidden />
```

바로 다음 줄에 추가:
```html
<input type="date" class="input" id="goal-race-date" hidden />
<p class="section-sub" id="goal-race-date-hint" hidden>기타 대회 날짜 (D-day 표시에 사용됩니다)</p>
```

- [ ] **Step 2: `syncGoalRaceNote` 함수 내부 확장 (함수 이름은 그대로 유지)**

`chunbaek/js/app.js:335-339` 기존 코드:
```js
function syncGoalRaceNote() {
  const noteEl = document.getElementById("goal-race-note");
  if (!noteEl) return;
  noteEl.hidden = selectedGoalRace() !== "other";
}
```

수정 후:
```js
function syncGoalRaceNote() {
  const noteEl = document.getElementById("goal-race-note");
  const dateEl = document.getElementById("goal-race-date");
  const hintEl = document.getElementById("goal-race-date-hint");
  const isOther = selectedGoalRace() === "other";
  if (noteEl) noteEl.hidden = !isOther;
  if (dateEl) dateEl.hidden = !isOther;
  if (hintEl) hintEl.hidden = !isOther;
}
```

- [ ] **Step 3: `fillProfileForm`에 날짜 필드 채우기 추가**

`chunbaek/js/app.js:404-428`의 `fillProfileForm` 함수 내 `syncGoalRaceNote()` 호출(line 428) 바로 위에 추가:

```js
const dateEl = document.getElementById("goal-race-date");
if (dateEl) dateEl.value = p.goalRaceDate || "";
```

- [ ] **Step 4: `readProfileFormFromDom`에 날짜 필드 읽기 추가**

`chunbaek/js/app.js:431-474`의 `readProfileFormFromDom` 함수에서,
`goalRaceNote` 읽는 줄(line 453) 바로 다음에 추가:

```js
const goalRaceDateRaw = (document.getElementById("goal-race-date")?.value || "").trim();
const goalRaceDate = goalRace === "other" ? (goalRaceDateRaw || null) : null;
```

그리고 반환 객체(line 465-473)에 추가:
```js
return {
  goalRace,
  goalRaceNote: goalRace === "other" ? (goalRaceNote || null) : null,
  goalRaceDate,   // 추가
  goalMarathonNetTime,
  existingPbNetTime,
  resolutionText: resolutionText || null,
  goalBodyWeightKg,
  goalBodyWeightPrivate,
};
```

- [ ] **Step 5: 수동 검증 — 프로필 폼 UI 확인**

에뮬레이터 + 시드 후 `http://localhost:5000/chunbaek/`에서:
1. "기타" 선택 시 대회명 + 날짜 입력 필드 노출 확인
2. "춘천 마라톤" 선택 시 두 필드 모두 숨김 확인
3. 기타 + 날짜 입력 후 저장 → 프로필 수정 다시 열 때 날짜 유지 확인

- [ ] **Step 6: 커밋**

```bash
git add chunbaek/index.html chunbaek/js/app.js
git commit -m "feat(chunbaek): 프로필 폼에 기타 대회 날짜 입력 필드 추가"
```

---

## Task 4: 프론트엔드 — 홈화면 D-day 카드 HTML·CSS

**Files:**
- Modify: `chunbaek/index.html:205-211` (`#week-bar` div 바로 다음)
- Modify: `chunbaek/index.html` CSS 섹션 (또는 인라인 `<style>`)

### 맥락

`chunbaek/index.html:205-211`:
```html
<div class="week-summary" id="week-bar" aria-label="이번 주 출석 현황">
  <span class="week-summary-label">이번 주 출석</span>
  <span class="week-summary-right">
    <span class="week-summary-count" id="week-bar-count">2.0 / 3점</span><span class="week-summary-hint" id="week-bar-hint" hidden></span>
  </span>
</div>
```

이 블록 바로 다음(`</div><!-- closes #today-active --> line 211` 직전)에 D-day 카드를 삽입한다.

- [ ] **Step 1: D-day 카드 HTML 삽입**

`chunbaek/index.html:211` `</div>` 바로 앞 줄에 삽입 (`#week-bar` 닫힘 태그 다음, `#today-active` 닫힘 태그 직전):
```html
          <!-- 마라톤 D-day 카드 -->
          <div class="marathon-dday-card" id="marathon-dday-card" hidden>
            <div class="marathon-dday-main">
              <div class="marathon-dday-info">
                <span class="marathon-dday-name" id="marathon-dday-name">—</span>
                <span class="marathon-dday-date" id="marathon-dday-date"></span>
              </div>
              <span class="marathon-dday-count" id="marathon-dday-count">D-?</span>
            </div>
          </div>
          <!-- 기타 대회 날짜 미입력 유도 카드 -->
          <div class="marathon-dday-card marathon-dday-nudge" id="marathon-dday-nudge" hidden>
            <span>📅 목표 대회 날짜를 입력하면 D-day를 볼 수 있어요</span>
            <button type="button" class="marathon-dday-nudge-btn" id="btn-dday-nudge">입력하기</button>
          </div>
```

- [ ] **Step 2: CSS 추가**

`chunbaek/index.html`의 `<style>` 섹션(파일 내 기존 CSS 블록)에 추가:

```css
.marathon-dday-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 12px;
}
.marathon-dday-nudge {
  background: #f5f5f5;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  font-size: 14px;
  color: #666;
}
.marathon-dday-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.marathon-dday-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.marathon-dday-name {
  font-weight: 700;
  font-size: 15px;
  color: #bf360c;
}
.marathon-dday-date {
  font-size: 12px;
  color: #8d6e63;
}
.marathon-dday-count {
  font-size: 22px;
  font-weight: 800;
  color: #e64a19;
  letter-spacing: -1px;
}
.marathon-dday-nudge-btn {
  background: #e0e0e0;
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: #333;
}
```

- [ ] **Step 3: 시각 확인 (JS 연결 전)**

에뮬레이터에서 `http://localhost:5000/chunbaek/`를 열고, 브라우저 콘솔에서:
```js
document.getElementById("marathon-dday-card").hidden = false;
document.getElementById("marathon-dday-name").textContent = "춘천마라톤";
document.getElementById("marathon-dday-date").textContent = "2026. 10. 26 (월)";
document.getElementById("marathon-dday-count").textContent = "D-75";
```
카드 레이아웃이 올바르면 통과.

- [ ] **Step 4: 커밋**

```bash
git add chunbaek/index.html
git commit -m "feat(chunbaek): 홈 D-day 카드 HTML·CSS 추가"
```

---

## Task 5: 프론트엔드 — D-day 카드 렌더링 로직

**Files:**
- Modify: `chunbaek/js/app.js:764-818` (`renderTodayData` 함수)

### 맥락

`renderTodayData(prof, slotRes)` 함수(line 764)가 홈화면 전체를 렌더링한다.
`daysUntilKst(isoDate)` 유틸(line 630)이 이미 KST 기준 날짜 차이를 계산한다 — 재사용.
`formatIsoDateKo(isoDate)` 같은 날짜 포매팅 유틸이 있는지 확인 필요.

- [ ] **Step 1: `formatIsoDateKo` 또는 동등 유틸 확인**

```bash
grep -n "formatIsoDateKo\|formatDate\|dateLabel" chunbaek/js/app.js | head -10
```

있으면 재사용, 없으면 아래 헬퍼 추가:
```js
function formatRaceDateKo(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
  return `${y}. ${String(m).padStart(2, "0")}. ${String(d).padStart(2, "0")} (${dow})`;
}
```

- [ ] **Step 2: `renderMarathonDday` 헬퍼 함수 추가**

`chunbaek/js/app.js`에서 `renderTodayData` 함수(line 764) 바로 위에 추가:

```js
function renderMarathonDday(prof) {
  const card    = document.getElementById("marathon-dday-card");
  const nudge   = document.getElementById("marathon-dday-nudge");
  if (!card || !nudge) return;

  const { goalRace, goalRaceDate, goalRaceNote } = prof || {};

  // goalRace 미설정: 둘 다 숨김
  if (!goalRace) {
    card.hidden = true;
    nudge.hidden = true;
    return;
  }

  // 기타 + 날짜 없음: 유도 카드
  if (goalRace === "other" && !goalRaceDate) {
    card.hidden = true;
    nudge.hidden = false;
    return;
  }

  // 날짜가 있을 때 D-day 계산
  const days = daysUntilKst(goalRaceDate);

  // null(유효하지 않은 날짜) 또는 대회 후: 숨김
  if (days === null || days < 0) {
    card.hidden = true;
    nudge.hidden = true;
    return;
  }

  nudge.hidden = true;

  // 레이블 결정
  const label = goalRace === "other"
    ? (goalRaceNote || "내 목표 대회")
    : (goalRace === "chuncheon" ? "춘천마라톤" : "JTBC 서울마라톤");

  document.getElementById("marathon-dday-name").textContent = label;
  document.getElementById("marathon-dday-date").textContent = formatRaceDateKo(goalRaceDate);

  if (days === 0) {
    // D-0: 스펙 상 별도 축하 메시지 레이아웃이 있으나,
    // 카드 내에서 텍스트·배경색 변경으로 처리 (HTML 구조 단순화).
    document.getElementById("marathon-dday-name").textContent = `🎉 오늘이 ${label} 당일이에요!`;
    document.getElementById("marathon-dday-date").textContent = "완주를 응원합니다!";
    document.getElementById("marathon-dday-count").textContent = "D-DAY";
    card.style.background = "linear-gradient(135deg, #fce4ec 0%, #f48fb1 100%)";
    card.hidden = false;
    return;
  } else {
    document.getElementById("marathon-dday-count").textContent = `D-${days}`;
    card.style.background = "";
  }

  card.hidden = false;
}
```

- [ ] **Step 3: `renderTodayData` 내에서 `renderMarathonDday` 호출**

`chunbaek/js/app.js:764`의 `renderTodayData` 함수 시작부 바로 뒤(line 765 이후, `state.profile = prof` 직후)에 추가:

```js
function renderTodayData(prof, slotRes) {
  state.profile = prof;
  state.profileDate = kstTodayIso();
  renderMarathonDday(prof);   // ← 추가

  if (slotRes.beforeSeason) { ... }
  ...
}
```

- [ ] **Step 4: 유도 카드 버튼 이벤트 등록**

`chunbaek/js/app.js`에서 이벤트 리스너가 등록되는 곳(초기화 블록, `DOMContentLoaded` 또는 IIFE 내)에 추가:

```js
document.getElementById("btn-dday-nudge")?.addEventListener("click", () => {
  openProfileEdit();
});
```

- [ ] **Step 5: 당일(D-0) 카드 축하 메시지 표시 확인**

브라우저 콘솔에서 `daysUntilKst` 재정의로 시뮬레이션:
```js
// 임시 테스트
renderMarathonDday({ goalRace: "chuncheon", goalRaceDate: new Date(Date.now() + 9*3600000).toISOString().slice(0,10) });
```
카드가 `D-DAY` 텍스트와 분홍 배경으로 표시되면 통과.

- [ ] **Step 6: 통합 확인**

에뮬레이터에서 멤버 시드 후 전체 플로우 확인:
1. 춘천 선택 멤버 로그인 → 홈 진입 → D-day 카드(`D-75` 내외) 표시
2. 기타 + 날짜 없는 멤버 → 유도 카드 표시 → [입력하기] 탭 → 프로필 폼으로 이동
3. 기타 + 날짜 입력 저장 → 홈으로 돌아옴 → D-day 카드 표시
4. 프로필 없는 멤버(비참가자) → 카드 없음

- [ ] **Step 7: 커밋**

```bash
git add chunbaek/js/app.js
git commit -m "feat(chunbaek): 홈화면 마라톤 D-day 카드 렌더링 로직"
```

---

## Task 6: 최종 검증

- [ ] **Step 1: pre-deploy 테스트 실행**

```bash
bash scripts/pre-deploy-test.sh
```

`✅ 전체 통과 — 배포 가능` 메시지 확인.

- [ ] **Step 2: 브라우저 콘솔 오류 없음 확인**

에뮬레이터 + 시드 후 Chrome DevTools Network·Console 탭 확인.
붉은 에러 없으면 통과.

- [ ] **Step 3: 모바일 뷰포트 확인**

Chrome DevTools 기기 에뮬레이션(375px 폭)으로 D-day 카드 레이아웃 확인.
D-N 숫자가 잘리거나 넘치지 않으면 통과.

- [ ] **Step 4: PR 생성**

```bash
git push -u origin cursor/chunbaek-marathon-dday-a781
```

ManagePullRequest 도구로 PR 생성 (draft).
