# 대회 정보 매핑 시스템 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고러닝 등 대회 정보 소스를 race_events와 연결하여, 기록 사이트보다 2~3개월 먼저 대회를 파악하고 사전 준비 활동을 지원

**Architecture:** 
- `event_info_mappings` Firestore 컬렉션 생성 (대회 정보 소스 → canonicalEventId)
- 고러닝 URL slug 기반 안정적 식별자 추출
- `ops-gorunning-events` API 수정 (매핑 우선순위 적용)
- ops.html + races.html UI 업데이트

**Tech Stack:** 
- Firestore (event_info_mappings 컬렉션)
- Firebase Cloud Functions (Node.js)
- Vanilla JS (프론트엔드)

---

## 파일 구조

### 새로 생성
- `scripts/import-gorunning-mappings.js` - 16개 수동 매핑 투입 스크립트
- `gorunning-mappings-2026-04-04.json` - 매핑 데이터 (레포 루트)

### 수정
- `functions/index.js` - ops-gorunning-events API 로직 수정
- `functions/lib/scraper.js` - 고러닝 ID 추출 로직 추가
- `ops.html` - 매칭 상태 표시 업데이트
- `races.html` - highlight 쿼리 파라미터 처리 추가

---

## Task 1: 매핑 데이터 준비

**Files:**
- Create: `/Users/taylor/git/dmc_attendance_log/gorunning-mappings-2026-04-04.json`

- [ ] **Step 1: 매핑 데이터 파일 생성**

기존 `/Users/taylor/Downloads/gorunning-mappings-2026-04-04.json`을 레포 루트로 복사하고,
URL 필드 추가 검증:

```bash
cp /Users/taylor/Downloads/gorunning-mappings-2026-04-04.json /Users/taylor/git/dmc_attendance_log/
```

- [ ] **Step 2: 데이터 형식 검증**

각 매핑이 다음 필드를 포함하는지 확인:
```json
{
  "gorunning": {
    "id": "gorunning_2026-04-04_1",
    "name": "2026 글로컬 건양대학교 K-국방 마라톤",
    "date": "2026-04-04",
    "url": "https://gorunning.kr/races/1019/..."
  },
  "discovered": {
    "source": "spct",
    "sourceId": "20260404001",
    "name": "k 국방마라톤",
    "date": "2026-04-04"
  }
}
```

`url` 필드가 없으면 수동으로 추가 필요.

- [ ] **Step 3: Commit**

```bash
git add gorunning-mappings-2026-04-04.json
git commit -m "data: 고러닝 매핑 데이터 16건 추가"
```

---

## Task 2: URL slug 추출 헬퍼 함수

**Files:**
- Modify: `functions/lib/scraper.js`

- [ ] **Step 1: extractGorunningSlug 함수 추가**

`functions/lib/scraper.js`의 `crawlGorunningEvents` 함수 위에 추가:

```javascript
/**
 * 고러닝 URL에서 안정적인 slug 추출
 * @param {string} url - https://gorunning.kr/races/1019/2026-glocal-konyang-k-defense-marathon/
 * @returns {string} - "1019"
 */
function extractGorunningSlug(url) {
  if (!url) return "";
  const m = url.match(/\/races\/(\d+)\//);
  return m ? m[1] : "";
}
```

- [ ] **Step 2: crawlGorunningEvents 수정**

`id` 생성 로직을 slug 기반으로 변경:

```javascript
async function crawlGorunningEvents() {
  const rows = await discoverGoRunningThisAndNextMonth();
  const sorted = [...rows].sort((x, y) => {
    const da = String(x.date || "");
    const db = String(y.date || "");
    if (da !== db) return da.localeCompare(db);
    return String(x.name || "").localeCompare(String(y.name || ""));
  });

  return sorted.map((row) => {
    const slug = extractGorunningSlug(row.gorunningUrl);
    return {
      id: slug ? `gorunning_${slug}` : `gorunning_${row.date}_${Math.random().toString(36).slice(2)}`,
      name: row.name,
      date: row.date,
      location: "",
      distance: [],
      url: row.gorunningUrl || "",
    };
  });
}
```

- [ ] **Step 3: exports에 extractGorunningSlug 추가**

```javascript
module.exports = {
  // ... 기존 exports
  extractGorunningSlug,
};
```

- [ ] **Step 4: Commit**

```bash
git add functions/lib/scraper.js
git commit -m "feat(scraper): 고러닝 URL slug 기반 ID 생성

- extractGorunningSlug 함수 추가
- crawlGorunningEvents ID를 slug 기반으로 변경
- 인덱스 밀림 문제 해결"
```

---

## Task 3: 매핑 임포트 스크립트

**Files:**
- Create: `scripts/import-gorunning-mappings.js`

- [ ] **Step 1: 스크립트 파일 생성**

```javascript
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

async function main() {
  // 1. 매핑 데이터 로드
  const mappingsPath = path.join(__dirname, "../gorunning-mappings-2026-04-04.json");
  const rawData = JSON.parse(fs.readFileSync(mappingsPath, "utf8"));
  const mappings = rawData.mappings || [];

  console.log(`📥 ${mappings.length}개 매핑 로드됨`);

  // 2. discovered-events 로드
  const discoveredPath = path.join(__dirname, "../data/discovered-events-2026.json");
  const discoveredData = JSON.parse(fs.readFileSync(discoveredPath, "utf8"));
  const discoveredEvents = discoveredData.events || [];

  console.log(`📥 discovered-events: ${discoveredEvents.length}개`);

  // 3. 각 매핑 처리
  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    console.log(`\n[${i + 1}/${mappings.length}] 처리 중: ${mapping.gorunning.name}`);

    try {
      await processMapping(mapping, discoveredEvents);
      console.log(`  ✅ 완료`);
    } catch (err) {
      console.error(`  ❌ 실패: ${err.message}`);
    }
  }

  console.log(`\n✅ 전체 완료`);
}

async function processMapping(mapping, discoveredEvents) {
  const { gorunning, discovered } = mapping;

  // 1. URL에서 slug 추출
  const urlMatch = gorunning.url.match(/\/races\/(\d+)\//);
  if (!urlMatch) {
    throw new Error("URL에서 slug 추출 실패");
  }
  const slug = urlMatch[1];
  const infoSourceId = slug;

  console.log(`  Slug: ${slug}`);

  // 2. discovered-events에서 (source, sourceId) 찾기
  const discoveredEvent = discoveredEvents.find(
    (e) => e.source === discovered.source && e.sourceId === discovered.sourceId
  );

  if (!discoveredEvent) {
    throw new Error(`discovered-events에 (${discovered.source}, ${discovered.sourceId}) 없음`);
  }

  console.log(`  Discovered: ${discoveredEvent.name} (${discovered.source}/${discovered.sourceId})`);

  // 3. race_events에서 해당 sourceMappings 찾기
  const raceEventsSnap = await db
    .collection("race_events")
    .where("sourceMappings", "array-contains", {
      source: discovered.source,
      sourceId: discovered.sourceId,
    })
    .get();

  let canonicalEventId;

  if (!raceEventsSnap.empty) {
    // 기존 race_events 있음
    canonicalEventId = raceEventsSnap.docs[0].id;
    console.log(`  기존 race_events: ${canonicalEventId}`);
  } else {
    // race_events 스텁 생성
    canonicalEventId = generateCanonicalEventId(discoveredEvent.date, discoveredEvent.name);
    await db.collection("race_events").doc(canonicalEventId).set({
      primaryName: discoveredEvent.name,
      eventDate: discoveredEvent.date,
      sourceMappings: [
        { source: discovered.source, sourceId: discovered.sourceId },
      ],
      createdAt: new Date().toISOString(),
    });
    console.log(`  새 race_events 스텁: ${canonicalEventId}`);
  }

  // 4. 날짜 검증 (±7일)
  const daysDiff = Math.abs(
    (new Date(gorunning.date) - new Date(discoveredEvent.date)) / (1000 * 60 * 60 * 24)
  );
  if (daysDiff > 7) {
    console.warn(`  ⚠️  날짜 차이 ${daysDiff}일 (경고만)`);
  }

  // 5. event_info_mappings 중복 체크
  const existingSnap = await db
    .collection("event_info_mappings")
    .where("infoSource", "==", "gorunning")
    .where("infoSourceId", "==", infoSourceId)
    .where("status", "==", "active")
    .get();

  if (!existingSnap.empty) {
    throw new Error(`이미 active 매핑 존재: (gorunning, ${infoSourceId})`);
  }

  // 6. event_info_mappings 생성
  const mappingRef = db.collection("event_info_mappings").doc();
  await mappingRef.set({
    infoSource: "gorunning",
    infoSourceId,
    infoName: gorunning.name,
    infoDate: gorunning.date,
    infoUrl: gorunning.url,
    infoLocation: "",
    infoDistance: "",
    canonicalEventId,
    mappedBy: "manual",
    confirmedBy: "operator",
    status: "active",
    confidence: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log(`  event_info_mappings 생성: ${mappingRef.id}`);
}

function generateCanonicalEventId(date, name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return `evt_${date}_${slug}`;
}

main().catch((err) => {
  console.error("❌ 에러:", err);
  process.exit(1);
});
```

- [ ] **Step 2: 실행 권한 추가**

```bash
chmod +x scripts/import-gorunning-mappings.js
```

- [ ] **Step 3: Commit**

```bash
git add scripts/import-gorunning-mappings.js
git commit -m "feat(scripts): 고러닝 매핑 임포트 스크립트 추가

- 16개 매핑 일괄 투입
- race_events 스텁 자동 생성
- 날짜 검증 (±7일 경고)
- active 중복 체크"
```

---

## Task 4: 매핑 임포트 실행

**Files:**
- Execute: `scripts/import-gorunning-mappings.js`

- [ ] **Step 1: Firestore 에뮬레이터 시작**

```bash
cd /Users/taylor/git/dmc_attendance_log
firebase emulators:start --only firestore
```

터미널을 새로 열어 에뮬레이터를 백그라운드로 유지.

- [ ] **Step 2: 스크립트 dry-run (에뮬레이터)**

```bash
export FIRESTORE_EMULATOR_HOST="localhost:8080"
cd functions && node ../scripts/import-gorunning-mappings.js
```

Expected: 16개 매핑 성공 메시지

- [ ] **Step 3: 에뮬레이터 데이터 확인**

Firestore 에뮬레이터 UI에서 확인:
- `event_info_mappings`: 16개 문서
- `race_events`: 스텁 문서들 (sourceMappings 있는 것)

- [ ] **Step 4: 프로덕션 실행 (사용자 승인 후)**

```bash
unset FIRESTORE_EMULATOR_HOST
cd functions && node ../scripts/import-gorunning-mappings.js
```

**⚠️  주의**: 실행 전 사용자에게 명시적 승인 받을 것!

- [ ] **Step 5: 프로덕션 검증**

Firebase Console에서 확인:
- `event_info_mappings`: 16개
- `race_events`: 새 스텁 또는 기존 문서 업데이트

---

## Task 5: ops-gorunning-events API 수정

**Files:**
- Modify: `functions/index.js:2243-2400` (ops-gorunning-events 섹션)

- [ ] **Step 1: 매핑 조회 로직 추가**

`ops-gorunning-events` API의 enrichedEvents 생성 부분 수정:

```javascript
// 현재 위치: functions/index.js:2298 (enrichedEvents 생성 시작)

// 3. event_info_mappings 로드
const mappingsSnap = await db.collection("event_info_mappings")
  .where("infoSource", "==", "gorunning")
  .where("status", "==", "active")
  .get();

const mappingsMap = new Map();
mappingsSnap.forEach((doc) => {
  const data = doc.data();
  // gorunning_1019 → data
  mappingsMap.set(`gorunning_${data.infoSourceId}`, data);
});

// 4. 매핑 우선순위 적용
const enrichedEvents = gorunningEvents.map((e) => {
  // Step 1: event_info_mappings 조회
  const mapping = mappingsMap.get(e.id);
  
  if (mapping) {
    // Step 2: race_events의 sourceMappings 확인
    // (이미 race_events 조회는 나중에 필요하므로, 여기서는 canonicalEventId만 반환)
    
    return {
      id: e.id,
      name: e.name,
      date: e.date,
      location: e.location,
      distance: e.distance,
      url: e.url,
      matchStatus: "mapped",
      canonicalEventId: mapping.canonicalEventId,
      mappedBy: mapping.mappedBy,
    };
  }
  
  // Step 3: 기존 로직 (scrape_jobs → discovered)
  const jobMatch = scraper.matchGorunningToJob(e, scrapeJobs);
  if (jobMatch) {
    return {
      id: e.id,
      name: e.name,
      date: e.date,
      location: e.location,
      distance: e.distance,
      url: e.url,
      matchStatus: "scraped",
      matchedJob: {
        source: jobMatch.job.source,
        sourceId: jobMatch.job.sourceId,
        jobId: jobMatch.job.jobId,
        similarity: jobMatch.similarity,
      },
    };
  }

  const discMatch = scraper.matchGorunningToDiscovered(e, discoveredEvents);
  if (discMatch) {
    return {
      id: e.id,
      name: e.name,
      date: e.date,
      location: e.location,
      distance: e.distance,
      url: e.url,
      matchStatus: "discovered",
      matchedEvent: {
        source: discMatch.event.source,
        sourceId: discMatch.event.sourceId,
        name: discMatch.event.name,
        similarity: discMatch.similarity,
      },
    };
  }

  return {
    id: e.id,
    name: e.name,
    date: e.date,
    location: e.location,
    distance: e.distance,
    url: e.url,
    matchStatus: "not_matched",
  };
});
```

- [ ] **Step 2: recordSources 추가 (mapped 케이스)**

매핑된 이벤트에 대해 race_events의 sourceMappings를 조회하여 추가:

```javascript
// enrichedEvents 생성 후, mapped 이벤트에 대해 race_events 조회
const mappedEvents = enrichedEvents.filter((e) => e.matchStatus === "mapped");
const eventIds = [...new Set(mappedEvents.map((e) => e.canonicalEventId))];

const raceEventsMap = new Map();
if (eventIds.length > 0) {
  const raceEventsSnap = await db.collection("race_events")
    .where(admin.firestore.FieldPath.documentId(), "in", eventIds)
    .get();
  
  raceEventsSnap.forEach((doc) => {
    raceEventsMap.set(doc.id, doc.data());
  });
}

// enrichedEvents에 recordSources 추가
const finalEvents = enrichedEvents.map((e) => {
  if (e.matchStatus !== "mapped") return e;
  
  const raceEvent = raceEventsMap.get(e.canonicalEventId);
  if (!raceEvent) return e;
  
  return {
    ...e,
    recordSources: raceEvent.sourceMappings || [],
  };
});
```

- [ ] **Step 3: 응답 형식 업데이트**

```javascript
// 통계 계산
const mapped = finalEvents.filter((e) => e.matchStatus === "mapped").length;
const scraped = finalEvents.filter((e) => e.matchStatus === "scraped").length;
const discovered = finalEvents.filter((e) => e.matchStatus === "discovered").length;
const notMatched = finalEvents.filter((e) => e.matchStatus === "not_matched").length;

await db.collection("ops_meta").doc("last_gorunning_crawl").set({
  crawledAt,
  events: finalEvents,
});

return res.json({
  ok: true,
  events: finalEvents,
  stats: {
    total: finalEvents.length,
    mapped,
    scraped,
    discovered,
    notMatched,
  },
  lastCrawled: crawledAt,
  cached: false,
});
```

- [ ] **Step 4: Commit**

```bash
git add functions/index.js
git commit -m "feat(api): ops-gorunning-events 매핑 우선순위 적용

- event_info_mappings 조회 우선
- canonicalEventId + recordSources 반환
- 통계에 mapped 추가"
```

---

## Task 6: ops.html 매칭 상태 표시

**Files:**
- Modify: `ops.html` (renderGorunningEvents 함수)

- [ ] **Step 1: 매칭 상태별 렌더링 로직 추가**

`renderGorunningEvents` 함수에서 `mapped` 상태 처리:

```javascript
function renderGorunningEvents(data) {
  const events = data.events || [];
  const stats = data.stats || {};
  
  const mapped = events.filter(e => e.matchStatus === "mapped");
  const scraped = events.filter(e => e.matchStatus === "scraped");
  const discovered = events.filter(e => e.matchStatus === "discovered");
  const notMatched = events.filter(e => e.matchStatus === "not_matched");
  
  let html = `
    <div style="margin-bottom: 20px; padding: 15px; background: #1E293B; border-radius: 8px;">
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px;">
        <div>
          <div style="font-size: 24px; font-weight: bold; color: #10B981;">${mapped.length}</div>
          <div style="font-size: 12px; color: #94A3B8;">✅ 매핑됨</div>
        </div>
        <div>
          <div style="font-size: 24px; font-weight: bold; color: #3B82F6;">${scraped.length}</div>
          <div style="font-size: 12px; color: #94A3B8;">✅ 스크랩됨</div>
        </div>
        <div>
          <div style="font-size: 24px; font-weight: bold; color: #F59E0B;">${discovered.length}</div>
          <div style="font-size: 12px; color: #94A3B8;">🔍 발견됨</div>
        </div>
        <div>
          <div style="font-size: 24px; font-weight: bold; color: #EF4444;">${notMatched.length}</div>
          <div style="font-size: 12px; color: #94A3B8;">❓ 매칭 불가</div>
        </div>
      </div>
    </div>
  `;
  
  // 매핑된 이벤트
  if (mapped.length > 0) {
    html += `<div style="margin-bottom: 30px;">`;
    html += `<h3 style="color: #10B981; margin-bottom: 15px;">✅ 매핑된 대회 (${mapped.length}개)</h3>`;
    mapped.forEach(e => {
      const recordSourcesStr = (e.recordSources || [])
        .map(r => `${r.source}/${r.sourceId}`)
        .join(", ");
      
      html += `
        <div style="border: 2px solid #10B981; background: #0F172A; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">
              <div style="font-size: 16px; font-weight: bold; color: #F8FAFC; margin-bottom: 5px;">
                ${e.name}
              </div>
              <div style="font-size: 13px; color: #94A3B8;">
                📅 ${e.date}
                ${e.location ? `| 📍 ${e.location}` : ""}
              </div>
              <div style="font-size: 12px; color: #64748B; margin-top: 5px;">
                🔗 <a href="races.html?highlight=${e.canonicalEventId}" target="_blank" style="color: #3B82F6;">${e.canonicalEventId}</a>
              </div>
              ${recordSourcesStr ? `<div style="font-size: 11px; color: #64748B; margin-top: 3px;">기록: ${recordSourcesStr}</div>` : ""}
            </div>
            <div>
              <span style="background: #10B981; color: white; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold;">
                매핑됨
              </span>
            </div>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  // 기존 상태들 (scraped, discovered, notMatched) 동일하게 렌더링...
  
  document.getElementById("gorunningList").innerHTML = html;
}
```

- [ ] **Step 2: Commit**

```bash
git add ops.html
git commit -m "feat(ops): 고러닝 매핑 상태 표시

- mapped 상태 추가 (초록색 테두리)
- canonicalEventId 링크 표시
- recordSources 표시"
```

---

## Task 7: races.html highlight 처리

**Files:**
- Modify: `races.html`

- [ ] **Step 1: 쿼리 파라미터 파싱 로직 추가**

`races.html` 스크립트 섹션 상단에 추가:

```javascript
// URL 쿼리 파라미터 파싱
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// highlight 처리
function handleHighlight() {
  const highlightId = getQueryParam("highlight");
  if (!highlightId) return;
  
  // canonicalEventId에 해당하는 카드 찾기
  const cards = document.querySelectorAll('[data-event-id]');
  for (const card of cards) {
    if (card.dataset.eventId === highlightId) {
      // 스크롤
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      
      // 시각적 강조
      card.style.border = "3px solid #F59E0B";
      card.style.boxShadow = "0 0 20px rgba(245, 158, 11, 0.5)";
      
      // 3초 후 강조 제거
      setTimeout(() => {
        card.style.border = "";
        card.style.boxShadow = "";
      }, 3000);
      
      break;
    }
  }
}

// 페이지 로드 후 실행
document.addEventListener("DOMContentLoaded", () => {
  // 기존 로직...
  
  // highlight 처리
  setTimeout(handleHighlight, 500); // 카드 렌더링 후 실행
});
```

- [ ] **Step 2: 카드에 data-event-id 속성 추가**

`renderRacesByEvent` 함수에서 카드 생성 시:

```javascript
function renderRacesByEvent(racesByEvent) {
  // ...
  
  html += `<div class="race-card" data-event-id="${eventId}">`;
  
  // ...
}
```

- [ ] **Step 3: Commit**

```bash
git add races.html
git commit -m "feat(races): highlight 쿼리 파라미터 처리

- URL에서 canonicalEventId 파싱
- 해당 카드로 스크롤 + 시각적 강조
- 3초 후 자동 제거"
```

---

## Task 8: 통합 테스트

**Files:**
- Test: ops.html, races.html, ops-gorunning-events API

- [ ] **Step 1: 로컬 에뮬레이터 테스트**

```bash
# 에뮬레이터 시작
firebase emulators:start

# 새 터미널에서 ops.html 서빙
cd /Users/taylor/git/dmc_attendance_log
python3 -m http.server 8000
```

브라우저: `http://localhost:8000/ops.html`

- [ ] **Step 2: ops-gorunning-events API 응답 확인**

브라우저 개발자 도구 → Network 탭:
- `ops-gorunning-events` 호출
- 응답에 `mapped` 상태 16개 확인
- `canonicalEventId`, `recordSources` 필드 확인

- [ ] **Step 3: ops.html UI 확인**

- 고러닝 섹션에서 "✅ 매핑됨: 16개" 확인
- 매핑된 대회 카드 16개 렌더링 확인
- `canonicalEventId` 링크 클릭 → races.html로 이동

- [ ] **Step 4: races.html highlight 확인**

- `races.html?highlight=evt_2026-04-04_k-defense` URL 직접 접속
- 해당 카드로 스크롤 확인
- 주황색 테두리 + 그림자 확인
- 3초 후 자동 제거 확인

- [ ] **Step 5: 캐시 무효화 테스트**

```bash
# ops_meta/last_gorunning_crawl 삭제
curl -X POST "https://race-nszximpvtq-du.a.run.app?action=clear-gorunning-cache&secret=YOUR_SECRET"

# 재크롤 확인
# ops.html 새로고침 → API 재호출 확인
```

---

## Task 9: 프로덕션 배포 준비

**Files:**
- Execute: pre-deploy-test.sh
- Deploy: functions, hosting

- [ ] **Step 1: pre-deploy-test 실행**

```bash
bash scripts/pre-deploy-test.sh
```

Expected: `✅ 전체 통과 — 배포 가능`

- [ ] **Step 2: 백업**

```bash
cd functions && node ../scripts/backup-firestore.js
```

Expected: `backup/2026-04-04/` 폴더 생성 확인

- [ ] **Step 3: 변경사항 커밋 + 푸시**

```bash
git status
git diff

# 모든 변경사항이 커밋되었는지 확인
git log --oneline -5

# 푸시
git push origin main
```

- [ ] **Step 4: 배포 명령어 안내 (사용자가 직접 실행)**

**⚠️  AI는 배포 명령어를 직접 실행하지 않습니다.**

사용자에게 다음 명령어를 텍스트로 안내:

```
배포 준비 완료! 아래 명령어를 직접 실행해주세요:

1. Functions 배포:
   firebase deploy --only functions

2. Hosting 배포:
   firebase deploy --only hosting

3. 배포 후 검증:
   - https://race-nszximpvtq-du.a.run.app?action=ops-gorunning-events 호출
   - ops.html에서 "매핑됨: 16개" 확인

4. 버전 태그:
   git tag -a v0.11.0 -m "feat: 대회 정보 매핑 시스템 (고러닝)"
   git push origin v0.11.0
```

---

## Task 10: 배포 후 검증

**Files:**
- Verify: Production ops.html, races.html

- [ ] **Step 1: API 응답 확인**

```bash
curl "https://race-nszximpvtq-du.a.run.app?action=ops-gorunning-events" | jq '.stats'
```

Expected:
```json
{
  "total": 129,
  "mapped": 16,
  "scraped": X,
  "discovered": Y,
  "notMatched": Z
}
```

- [ ] **Step 2: Firestore 데이터 확인**

Firebase Console → Firestore:
- `event_info_mappings`: 16개 문서
- `race_events`: 스텁 문서들 확인

- [ ] **Step 3: ops.html UI 확인**

https://race-nszximpvtq-du.a.run.app/ops.html:
- "✅ 매핑됨: 16개" 표시
- 매핑된 대회 카드들 렌더링
- 링크 클릭 → races.html 이동 확인

- [ ] **Step 4: races.html highlight 확인**

직접 URL 접속:
`https://race-nszximpvtq-du.a.run.app/races.html?highlight=evt_2026-04-04_k-defense`

- 해당 카드로 스크롤
- 시각적 강조 확인

- [ ] **Step 5: event_logs 확인**

Firestore → `event_logs`:
- `page_load` 이벤트 쌓이는지 확인

---

## 완료 조건

- [ ] 16개 고러닝 매핑이 Firestore에 저장됨
- [ ] ops-gorunning-events API가 `mapped` 상태 16개 반환
- [ ] ops.html에서 "매핑됨: 16개" 표시
- [ ] races.html에서 highlight 파라미터 작동
- [ ] 프로덕션 배포 완료 (사용자가 직접 실행)
- [ ] 버전 태그 생성 (v0.11.0)

---

## 트러블슈팅

### 이슈 1: slug 추출 실패

**증상**: `extractGorunningSlug`가 빈 문자열 반환

**원인**: URL 형식이 예상과 다름

**해결**:
```javascript
// URL 로그 출력
console.log("URL:", row.gorunningUrl);

// 정규식 수정
const m = url.match(/\/races\/(\d+)[\/\?#]?/);
```

### 이슈 2: race_events 스텁 생성 실패

**증상**: "Permission denied" 에러

**원인**: Firestore 권한 설정

**해결**:
- Firebase Console → Firestore → Rules 확인
- 로컬은 Admin SDK라서 권한 무시됨
- 프로덕션은 Functions에서 실행이므로 권한 OK

### 이슈 3: ops.html에서 매핑 안 보임

**증상**: mapped: 0

**원인**: 캐시된 응답 사용 중

**해결**:
```bash
# 캐시 삭제
curl -X POST "https://race-nszximpvtq-du.a.run.app?action=clear-gorunning-cache&secret=YOUR_SECRET"
```

---

## 참고

- 스펙: `_docs/superpowers/specs/2026-04-04-event-info-mapping-design.md`
- 데이터 사전: `_docs/knowledge/data-dictionary.md`
- 배포 룰: `.cursor/rules/pre-deploy-checklist.mdc`
