# ohmyrace.co.kr 지원 추가 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ohmyrace.co.kr을 완전 지원하여 군산새만금마라톤 기록을 자동으로 수집하고 confirm할 수 있도록 함

**Architecture:** 
- discover-events.js에 ohmyrace 스크래퍼 추가 (로컬 대회 발견)
- functions/lib/scraper.js에 searchOhmyrace() 구현 (HTML 파싱)
- report.html의 기존 워크플로우로 confirm 가능

**Tech Stack:** Node.js, cheerio (HTML 파싱), Firebase Cloud Functions

---

## File Structure

### Modified Files
- `scripts/discover-events.js` — ohmyrace 대회 발견 로직 추가
- `data/discovered-events-2026.json` — 발견된 대회 목록 (자동 생성)
- `functions/lib/scraper.js` — ohmyrace 기록 검색 로직 추가

### Investigation Docs
- `_docs/investigations/2026-04-03-ohmyrace-api-investigation.md` — API 조사 결과

---

## Task 1: discover-events.js에 ohmyrace 스크래퍼 추가

**Files:**
- Modify: `scripts/discover-events.js:1-200`

- [ ] **Step 1: discoverOhmyrace() 함수 작성**

`scripts/discover-events.js`의 다른 스크래퍼 함수들 다음에 추가:

```javascript
async function discoverOhmyrace(year) {
  const res = await fetch("http://record.ohmyrace.co.kr/event");
  const html = await res.text();
  const $ = cheerio.load(html);
  
  const events = [];
  $("li").each((_, el) => {
    const nameEl = $(el).find(".new_sbj a");
    if (!nameEl.length) return;
    
    const name = nameEl.text()
      .replace(/예정|종료/g, "")
      .trim();
    const dateText = $(el).find(".new_data").text().trim(); // "2026. 04. 05"
    
    if (name && dateText.startsWith(String(year))) {
      const date = dateText.replace(/\.\s*/g, "-").trim(); // "2026-04-05"
      
      // 대회 ID 추출
      const href = nameEl.attr("href") || "";
      const idMatch = href.match(/event\/(\d+)/);
      
      if (idMatch) {
        events.push({
          source: "ohmyrace",
          sourceId: idMatch[1],
          name,
          date,
          distances: "",
          location: "",
        });
      }
    }
  });
  
  return events;
}
```

- [ ] **Step 2: sources 객체에 ohmyrace 등록**

`scripts/discover-events.js`의 `sources` 객체에 추가:

```javascript
const sources = {
  marazone: discoverMarazone,
  myresult: discoverMyResult,
  liverun: discoverLiveRun,
  spct: discoverSPCT,
  smartchip: discoverSmartChip,
  chuncheon: discoverChuncheon,
  ohmyrace: discoverOhmyrace, // 추가
};
```

- [ ] **Step 3: 테스트 실행**

Run: `cd /Users/taylor/git/dmc_attendance_log && node scripts/discover-events.js --year 2026 --source ohmyrace`

Expected output:
```
  [ohmyrace] 조회 중...
  [ohmyrace] N개 발견

총 N개 대회 발견

2026-04-05 | ohmyrace   | 2026 군산 새만금 마라톤 대회
...
```

- [ ] **Step 4: 전체 실행 및 검증**

Run: `cd /Users/taylor/git/dmc_attendance_log && node scripts/discover-events.js --year 2026`

Expected:
- `/Users/taylor/git/dmc_attendance_log/data/discovered-events-2026.json` 업데이트됨
- ohmyrace 소스 대회들 포함 확인
- 군산새만금마라톤 (sourceId: "118") 존재 확인

Run: `grep -c '"source": "ohmyrace"' /Users/taylor/git/dmc_attendance_log/data/discovered-events-2026.json`

Expected: `N` (ohmyrace 대회 개수)

- [ ] **Step 5: Commit**

```bash
cd /Users/taylor/git/dmc_attendance_log
git add scripts/discover-events.js data/discovered-events-2026.json
git commit -m "feat(scraper): add ohmyrace event discovery

- discoverOhmyrace() 추가
- event list 페이지에서 대회명, 날짜, ID 추출
- 군산새만금마라톤(118) 발견 가능"
```

---

## Task 2: functions/lib/scraper.js에 searchOhmyrace() 추가

**Files:**
- Modify: `functions/lib/scraper.js:1-1200`

- [ ] **Step 1: searchOhmyrace() 함수 구현**

`functions/lib/scraper.js`의 다른 search 함수들 다음에 추가:

```javascript
// ─── Ohmyrace 검색 ────────────────────────────────────────────
async function searchOhmyrace(eventId, memberName) {
  const url = "http://record.ohmyrace.co.kr/theme/ohmyrace/mobile/skin/board/event/view.data.php";
  
  const params = new URLSearchParams();
  params.append("table", "event");
  params.append("wr_id", eventId);
  params.append("bib", memberName);
  params.append("cate", "");
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Referer": `http://record.ohmyrace.co.kr/event/${eventId}`,
    },
    body: params.toString(),
  });
  
  if (!res.ok) return [];
  const html = await res.text();
  
  // "검색 결과가 없습니다" 등 체크
  if (html.includes("검색 결과가 없습니다") || html.includes("조회된 데이터가 없습니다")) {
    return [];
  }
  
  const $ = cheerioLoad(html);
  const results = [];
  
  // HTML 구조 파싱 (실제 응답 확인 후 조정 필요)
  $("tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 4) return;
    
    const bib = $(cells[0]).text().trim();
    const name = $(cells[1]).text().trim();
    const distance = $(cells[2]).text().trim();
    const time = $(cells[3]).text().trim();
    
    if (name && time) {
      results.push({
        name,
        bib,
        distance: normDist(distance),
        netTime: normTime(time),
        gunTime: normTime(time),
        overallRank: null,
        genderRank: null,
        ageGroupRank: null,
        gender: null,
        splits: [],
        pace: "",
      });
    }
  });
  
  return results;
}
```

- [ ] **Step 2: searchMember() 라우터에 ohmyrace 추가**

`functions/lib/scraper.js`의 `searchMember()` 함수 수정:

```javascript
async function searchMember(source, sourceId, memberName, { session = "" } = {}) {
  switch (source) {
    case "spct": return searchSPCT(sourceId, memberName);
    case "smartchip": return searchSmartChip(sourceId, memberName, session);
    case "myresult": return searchMyResult(sourceId, memberName);
    case "marazone": return searchMarazone(sourceId, memberName);
    case "ohmyrace": return searchOhmyrace(sourceId, memberName); // 추가
    default: return [];
  }
}
```

- [ ] **Step 3: getEventInfo()에 ohmyrace 추가**

`functions/lib/scraper.js`의 `getEventInfo()` 함수 (약 507행) 수정:

⚠️ **중요:** 기존 `marazone`, `default` 케이스는 건드리지 마세요. `case "ohmyrace"` 한 줄만 추가.

```javascript
async function getEventInfo(source, sourceId) {
  switch (source) {
    case "spct": return getSPCTEventInfo(sourceId);
    case "myresult": return getMyResultEventInfo(sourceId);
    case "smartchip": return getSmartChipEventInfo(sourceId);
    case "ohmyrace": return getOhmyraceEventInfo(sourceId); // 추가 (이 줄만)
    case "marazone": {
      // 기존 marazone 로직 유지 (인라인 fetch)
      const comps = await (await fetch("https://raceresult.co.kr/api/record-competitions", {
        headers: { ...browserHeaders("marazone"), Accept: "application/json" },
      })).json();
      const match = comps.find((c) => c.comp_title === sourceId);
      return { title: sourceId, date: match?.comp_date || null };
    }
    default: return { title: sourceId, date: null }; // 기존 유지
  }
}

async function getOhmyraceEventInfo(sourceId) {
  // 단순 구현
  return { title: `Ohmyrace Event ${sourceId}`, date: null };
}
```

- [ ] **Step 4: 로컬 테스트 준비**

Firebase 에뮬레이터로 테스트하기 위한 준비:

Run: `cd /Users/taylor/git/dmc_attendance_log/functions && npm ci`

- [ ] **Step 5: Commit**

```bash
cd /Users/taylor/git/dmc_attendance_log
git add functions/lib/scraper.js
git commit -m "feat(scraper): add ohmyrace record search

- searchOhmyrace() 구현 (HTML 파싱 - Task 5에서 검증 필요)
- POST /theme/ohmyrace/.../view.data.php 호출
- searchMember(), getEventInfo()에 ohmyrace 케이스 추가"
```

---

## Task 3: discoverAllEvents()에 ohmyrace 추가 (Functions)

**Files:**
- Modify: `/Users/taylor/git/dmc_attendance_log/functions/lib/scraper.js:854-860`

- [ ] **Step 1: discoverOhmyrace() 복사**

`scripts/discover-events.js`의 `discoverOhmyrace()`를 `functions/lib/scraper.js`에 복사:

```javascript
// ─── Ohmyrace 대회 발견 ──────────────────────────────────────
async function discoverOhmyrace(year) {
  const res = await fetch("http://record.ohmyrace.co.kr/event");
  const html = await res.text();
  const $ = cheerioLoad(html);
  
  const events = [];
  $("li").each((_, el) => {
    const nameEl = $(el).find(".new_sbj a");
    if (!nameEl.length) return;
    
    const name = nameEl.text()
      .replace(/예정|종료/g, "")
      .trim();
    const dateText = $(el).find(".new_data").text().trim();
    
    if (name && dateText.startsWith(String(year))) {
      const date = dateText.replace(/\.\s*/g, "-").trim();
      const href = nameEl.attr("href") || "";
      const idMatch = href.match(/event\/(\d+)/);
      
      if (idMatch) {
        events.push({
          source: "ohmyrace",
          sourceId: idMatch[1],
          name,
          date,
          distances: "",
          location: "",
        });
      }
    }
  });
  
  return events;
}
```

- [ ] **Step 2: discoverAllEvents() sources 배열에 추가**

`functions/lib/scraper.js`의 `discoverAllEvents()` 함수 (약 854행) 수정:

```javascript
async function discoverAllEvents(year) {
  const sources = [
    { name: "marazone", fn: discoverMarazone },
    { name: "myresult", fn: discoverMyResult },
    { name: "spct", fn: discoverSPCT },
    { name: "smartchip", fn: discoverSmartChip },
    { name: "ohmyrace", fn: discoverOhmyrace }, // 추가
  ];

  // ... (나머지 로직 동일)
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/taylor/git/dmc_attendance_log
git add functions/lib/scraper.js
git commit -m "feat(scraper): add ohmyrace to discoverAllEvents

- report.html에서 대회 발견 시 ohmyrace 포함
- 실시간 대회 목록 조회 지원"
```

---

## Task 4: 로컬 에뮬레이터 테스트

**Files:**
- Test: `/Users/taylor/git/dmc_attendance_log/functions/lib/scraper.js`

- [ ] **Step 1: pre-deploy-test 스크립트 실행**

⚠️ **중요:** Firebase 에뮬레이터는 Functions + Hosting + **Firestore**가 모두 필요합니다.

Run: `cd /Users/taylor/git/dmc_attendance_log && bash scripts/pre-deploy-test.sh`

Expected:
```
[1/4] 에뮬레이터 시작 중...
[2/4] API 테스트 실행 중...
...
━━━ 테스트 결과 ━━━
✅ 전체 통과 — 배포 가능
```

- [ ] **Step 2: report.html에서 수동 테스트 (선택)**

브라우저: `http://localhost:5000/report.html`

1. 🔍 수집 가능 탭 확인
   - ohmyrace 대회 표시 확인
   - 군산새만금(118) 존재 확인

2. 대회 스크랩 시도 (대회가 예정이면 기록 없음 — 정상)
   - 군산새만금 선택
   - 회원 이름 입력 (테스트용)
   - 스크랩 실행

Expected:
- ⚠️ 대회가 예정이면 기록 없음 (정상)
- ✅ searchOhmyrace() 호출 성공 (에러 없음)

---

## Task 5: HTML 파싱 로직 검증 및 수정

**Files:**
- Modify: `functions/lib/scraper.js:searchOhmyrace()`

⚠️ **Critical:** Task 4에서 실제 응답 HTML 확인 후 파싱 로직 조정 필요

- [ ] **Step 1: 실제 응답 HTML 확인**

대회 후 (4/6~4/7) 실제 기록으로 테스트:

```bash
cd /Users/taylor/git/dmc_attendance_log
curl -X POST "http://record.ohmyrace.co.kr/theme/ohmyrace/mobile/skin/board/event/view.data.php" \
  -H "Content-Type: application/x-www-form-urlencoded; charset=UTF-8" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  -d "table=event&wr_id=118&bib=김철수&cate=" \
  > _docs/investigations/ohmyrace-response-sample.html
```

Open: `_docs/investigations/ohmyrace-response-sample.html` in browser

- [ ] **Step 2: HTML 구조 분석**

`_docs/investigations/ohmyrace-response-sample.html` 파일에서:
- 테이블 구조 확인
- 컬럼 순서 (배번, 이름, 거리, 기록 등)
- 빈 결과 메시지

- [ ] **Step 3: searchOhmyrace() 파싱 로직 수정**

실제 HTML 구조에 맞춰 `/Users/taylor/git/dmc_attendance_log/functions/lib/scraper.js`의 `searchOhmyrace()` 함수 내 `$("tr").each()` 로직 조정

- [ ] **Step 4: 재테스트**

Run: Firebase 에뮬레이터 + report.html에서 실제 이름으로 검색

Expected: 정확한 기록 반환

- [ ] **Step 5: Commit**

```bash
cd /Users/taylor/git/dmc_attendance_log
git add functions/lib/scraper.js _docs/investigations/ohmyrace-response-sample.html
git commit -m "fix(scraper): adjust ohmyrace HTML parsing

- 실제 응답 구조에 맞춰 파싱 로직 수정
- 테이블 컬럼 순서 확인
- 샘플 응답 HTML 저장"
```

---

## Task 6: 배포 전 테스트

**Files:**
- Run: `/Users/taylor/git/dmc_attendance_log/scripts/pre-deploy-test.sh`

- [ ] **Step 1: pre-deploy-test 실행**

Run: `cd /Users/taylor/git/dmc_attendance_log && bash scripts/pre-deploy-test.sh`

Expected: 
```
━━━ 테스트 결과 ━━━
✅ 전체 통과 — 배포 가능
```

- [ ] **Step 2: 실패 시 오류 수정**

에뮬레이터 로그 확인:
- 스크립트 출력에서 오류 메시지 확인
- 필요 시 Firebase 에뮬레이터 UI: `http://localhost:4000`

---

## Task 7: Functions 배포

**Files:**
- Deploy: Cloud Functions

⚠️ **전제조건:** 
- Task 6 통과 필수
- **AI는 `firebase deploy` 명령을 실행하지 않습니다** — 사용자가 직접 실행

- [ ] **Step 1: 백업**

Run: `cd /Users/taylor/git/dmc_attendance_log/functions && node ../scripts/backup-firestore.js`

Expected: `backup/YYYY-MM-DD/` 폴더 생성 (UTC 날짜 기준)

- [ ] **Step 2: Git 상태 확인**

Run: `cd /Users/taylor/git/dmc_attendance_log && git status`

Expected: 모든 변경사항 커밋됨

- [ ] **Step 3: Functions 배포 (사용자 직접 실행)**

⚠️ **중요:** 이 명령은 사용자가 직접 실행합니다.

Run: `cd /Users/taylor/git/dmc_attendance_log && firebase deploy --only functions`

Expected: 
```
✔  functions: Finished running predeploy script.
✔  Deploy complete!
```

- [ ] **Step 4: 배포 검증**

프로덕션 URL: `https://dmc-attendance-log.web.app/report.html`

1. 🔍 수집 가능 탭 — ohmyrace 대회 확인
2. 대회 스크랩 시도 (대회 후 4/6~4/7)
3. confirm 워크플로우 정상 작동 확인

---

## Task 8: 문서 업데이트

**Files:**
- Modify: `/Users/taylor/git/dmc_attendance_log/.cursor/rules/data-facts.mdc`

- [ ] **Step 1: data-facts.mdc 업데이트**

`race_results.source` 섹션 수정:

```markdown
## race_results.source (6개)

- `smartchip` — smartchip.co.kr
- `myresult` — myresult.co.kr
- `spct` — time.spct.kr
- `marazone` — marazone.com
- `ohmyrace` — record.ohmyrace.co.kr
- `manual` — 수동 입력 (엑셀 임포트 등)

**"source는 N가지" 언급 시 반드시 6개 모두 열거할 것. 빠뜨리지 말 것.**
```

- [ ] **Step 2: Commit**

```bash
cd /Users/taylor/git/dmc_attendance_log
git add .cursor/rules/data-facts.mdc
git commit -m "docs: add ohmyrace to data-facts

- race_results.source에 ohmyrace 추가 (6개로 증가)"
```

---

## Task 9: 버전 태그

**Files:**
- Git tag

- [ ] **Step 1: 현재 버전 확인**

Run: `cd /Users/taylor/git/dmc_attendance_log && git tag -l 'v*' --sort=-v:refname | head -1`

Expected: `v1.X.Y` (현재 최신 버전)

- [ ] **Step 2: 새 버전 태그 생성**

⚠️ **중요:** Step 1의 결과에 따라 버전 번호를 결정하세요 (MINOR 버전 증가 권장).

Run:
```bash
cd /Users/taylor/git/dmc_attendance_log
git tag -a v1.X.0 -m "feat: add ohmyrace.co.kr support

- 대회 발견 (discover-events.js + discoverAllEvents)
- 기록 검색 (searchOhmyrace HTML 파싱)
- 군산새만금마라톤 자동 수집 가능"
```

- [ ] **Step 3: 태그 푸시**

⚠️ **중요:** Step 2에서 생성한 실제 태그 이름으로 바꿔서 실행하세요.

Run: `cd /Users/taylor/git/dmc_attendance_log && git push origin <실제-태그-이름>`

예: `git push origin v1.3.0`

---

## Success Criteria

- ✅ `discover-events.js --source ohmyrace` 성공
- ✅ 군산새만금마라톤(118) 발견됨
- ✅ Functions 배포 성공
- ✅ 프로덕션에서 ohmyrace 대회 스크랩 가능
- ✅ confirm 워크플로우 정상 작동
- ✅ data-facts.mdc 업데이트됨

---

## Rollback Plan

문제 발생 시:

1. 최근 ohmyrace 관련 커밋 개수 확인:
   ```bash
   cd /Users/taylor/git/dmc_attendance_log
   git log --oneline --grep="ohmyrace" -10
   ```

2. 해당 커밋들 되돌리기:
   ```bash
   git revert <commit-hash>..HEAD
   ```

3. Functions 재배포:
   ```bash
   firebase deploy --only functions
   ```

4. 수동 워크플로우로 복귀

---

## Notes

### HTML 파싱 불확실성
Task 5에서 실제 응답 HTML을 확인하기 전까지 파싱 로직이 정확하지 않을 수 있습니다.
대회 후 (4/6~4/7) Task 5를 반드시 실행하여 로직을 검증하세요.

### 대회 예정 vs 종료
- 예정 대회: 기록 없음 (정상)
- 종료 대회: searchOhmyrace() 호출하여 기록 조회

### 참고 문서
- `_docs/investigations/2026-04-03-ohmyrace-investigation.md`
- `_docs/investigations/2026-04-03-ohmyrace-api-investigation.md`
- `_docs/superpowers/specs/2026-04-03-ohmyrace-scraper-design.md`
