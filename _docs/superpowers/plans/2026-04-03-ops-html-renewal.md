# ops.html 리뉴얼 구현 계획 (v2 - 고러닝 통합)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ops.html 스크래핑 모니터링 강화 + 주말 대회 자동 알림 + 고러닝 예정 대회 UI 구현

**Architecture:** Backend API 2개 신규 (`ops-scrape-health`, `ops-gorunning-events`) + Cloud Function 1개 (`weekendScrapeReadinessCheck`) + ops.html 7개 섹션 재설계

**Tech Stack:** Firebase Functions v2, Node.js 18+, Nodemailer, Cheerio, Vanilla JS

---

## Task 1: Backend - ops-scrape-health API

**Files:**
- Modify: `functions/index.js` (신규 API 엔드포인트 추가, race 함수 내)
- Test: 로컬 에뮬레이터 수동 테스트

- [ ] **Step 1: API 엔드포인트 스켈레톤 작성**

`functions/index.js`의 `exports.race` 함수 내에 추가 (line ~1900, `data-integrity` 다음):

```javascript
if (action === "ops-scrape-health") {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  // TODO: 구현
  
  return res.json({
    ok: true,
    period: { start: sevenDaysAgo, end: new Date().toISOString() },
    overall: {},
    bySource: {},
    upcomingWeekend: [],
    lastCheck: new Date().toISOString()
  });
}
```

- [ ] **Step 2: 최근 7일 scrape_jobs 조회 및 집계**

```javascript
if (action === "ops-scrape-health") {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  // 최근 7일 jobs 조회
  const recentJobsSnap = await db.collection("scrape_jobs")
    .where("createdAt", ">=", sevenDaysAgo)
    .get();
  
  let totalJobs = 0;
  let successJobs = 0;
  let failedJobs = 0;
  const bySource = {
    smartchip: { total: 0, success: 0 },
    myresult: { total: 0, success: 0 },
    spct: { total: 0, success: 0 },
    marazone: { total: 0, success: 0 },
    manual: { total: 0 }
  };
  
  recentJobsSnap.forEach(doc => {
    const d = doc.data();
    const status = d.status;
    const source = d.source || "unknown";
    
    if (status === "queued") return; // 대기중은 제외
    
    totalJobs++;
    const isSuccess = (status === "complete" || status === "confirmed");
    if (isSuccess) successJobs++;
    if (status === "failed") failedJobs++;
    
    if (bySource[source]) {
      bySource[source].total++;
      if (isSuccess) bySource[source].success++;
    }
  });
  
  const overallRate = totalJobs > 0 ? Math.round((successJobs / totalJobs) * 100) : 0;
  
  // bySource rate 계산
  for (const src in bySource) {
    if (src === "manual") continue;
    const s = bySource[src];
    s.rate = s.total > 0 ? Math.round((s.success / s.total) * 100) : 0;
  }
  
  // ... (계속)
}
```

- [ ] **Step 3: Stale/Stuck jobs 조회**

```javascript
  // Stale jobs: status=complete + completedAt 3일 이상
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const staleSnap = await db.collection("scrape_jobs")
    .where("status", "==", "complete")
    .where("completedAt", "<=", threeDaysAgo)
    .get();
  
  const staleJobs = [];
  staleSnap.forEach(doc => {
    const d = doc.data();
    if (d.completedAt) {
      staleJobs.push({ jobId: doc.id, eventName: d.eventName, completedAt: d.completedAt });
    }
  });
  
  // Stuck jobs: status=running + createdAt 1시간 이상
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const stuckSnap = await db.collection("scrape_jobs")
    .where("status", "==", "running")
    .where("createdAt", "<=", oneHourAgo)
    .get();
  
  const stuckJobs = [];
  stuckSnap.forEach(doc => {
    const d = doc.data();
    stuckJobs.push({ jobId: doc.id, eventName: d.eventName, createdAt: d.createdAt });
  });
```

- [ ] **Step 4: 주말 대회 목록 조회 (기존 로직 재사용)**

```javascript
  // 주말 대회 (토/일 개최, 최근 2주 윈도우)
  const year = new Date().getFullYear();
  const events = await scraper.discoverAllEvents(year);
  const now = new Date();
  const { filtered: recentEvents, todayKst } = scraper.filterEventsWeeklyScrapeWindow(events, year, now);
  
  const upcomingWeekend = recentEvents
    .filter(e => {
      if (!e.date) return false;
      const eventDate = new Date(e.date);
      const dayOfWeek = eventDate.getDay();
      return (dayOfWeek === 0 || dayOfWeek === 6) && eventDate >= now; // 토/일, 미래
    })
    .slice(0, 10) // 최대 10개
    .map(e => ({
      date: e.date,
      eventName: e.name,
      source: e.source
    }));
```

- [ ] **Step 5: 응답 JSON 구성 및 반환**

```javascript
  return res.json({
    ok: true,
    period: { start: sevenDaysAgo, end: new Date().toISOString() },
    overall: {
      total: totalJobs,
      success: successJobs,
      failed: failedJobs,
      stale: staleJobs.length,
      stuck: stuckJobs.length,
      rate: overallRate
    },
    bySource,
    upcomingWeekend,
    lastCheck: new Date().toISOString()
  });
}
```

- [ ] **Step 6: 로컬 테스트**

```bash
# 에뮬레이터 시작
firebase emulators:start --only functions,firestore

# 별도 터미널에서 API 호출
curl "http://localhost:5001/dmc-attendance/asia-northeast3/race?action=ops-scrape-health" | jq
```

**Expected**: `ok: true`, `overall.rate` 값, `bySource` 각 소스별 rate 확인

- [ ] **Step 7: 커밋**

```bash
git add functions/index.js
git commit -m "feat(api): ops-scrape-health API 구현

- 최근 7일 scrape_jobs 분석
- 소스별 success rate 계산
- stale/stuck jobs 조회
- 주말 대회 목록 (토/일, 미래)"
```

---

## Task 2: Backend - 고러닝 크롤러 및 매칭 로직

**Files:**
- Modify: `functions/lib/scraper.js` (신규 함수 추가)
- Modify: `functions/package.json` (cheerio 의존성 추가)
- Test: `scripts/test-gorunning-crawler.js` (신규, 수동 테스트용)

- [ ] **Step 1: Cheerio 의존성 추가**

```bash
cd functions
npm install cheerio@^1.0.0
cd ..
```

- [ ] **Step 2: 고러닝 크롤러 함수 작성**

`functions/lib/scraper.js` 맨 아래에 추가:

```javascript
/**
 * 고러닝 향후 2개월 대회 목록 크롤링
 * @returns {Promise<Array<{id, name, date, location, distance, url}>>}
 */
async function crawlGorunningEvents() {
  const cheerio = require("cheerio");
  const https = require("https");
  
  const url = "https://gorunning.co.kr/race/event";
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let html = "";
      res.on("data", (chunk) => { html += chunk; });
      res.on("end", () => {
        try {
          const $ = cheerio.load(html);
          const events = [];
          
          // TODO: 실제 HTML 구조에 맞춰 selector 조정 필요
          $(".event-item").each((i, elem) => {
            const name = $(elem).find(".event-name").text().trim();
            const date = $(elem).find(".event-date").text().trim(); // YYYY-MM-DD 형식 가정
            const location = $(elem).find(".event-location").text().trim();
            const detailUrl = $(elem).find("a").attr("href");
            
            if (name && date) {
              events.push({
                id: `gorunning_${Date.now()}_${i}`,
                name,
                date,
                location: location || "",
                distance: [], // Phase 2
                url: detailUrl ? `https://gorunning.co.kr${detailUrl}` : ""
              });
            }
          });
          
          resolve(events);
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}
```

- [ ] **Step 3: Levenshtein distance 함수 구현**

```javascript
/**
 * Levenshtein distance 계산
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // 삭제
          dp[i][j - 1] + 1,    // 삽입
          dp[i - 1][j - 1] + 1 // 치환
        );
      }
    }
  }
  
  return dp[m][n];
}
```

- [ ] **Step 4: 이름 정규화 및 유사도 함수**

```javascript
/**
 * 대회 이름 정규화
 */
function normalizeEventName(name) {
  return name
    .replace(/\s+/g, '')           // 공백 제거
    .toLowerCase()
    .replace(/\d{4}/g, '')         // 연도 제거 (2026 등)
    .replace(/마라톤|대회|레이스|러닝/g, ''); // 공통 단어 제거
}

/**
 * 이름 유사도 계산 (0~1)
 */
function calculateNameSimilarity(name1, name2) {
  const n1 = normalizeEventName(name1);
  const n2 = normalizeEventName(name2);
  
  const distance = levenshteinDistance(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);
  
  if (maxLen === 0) return 0;
  return 1 - (distance / maxLen);
}
```

- [ ] **Step 5: 자동 매칭 함수**

```javascript
/**
 * 고러닝 이벤트와 scrape_jobs 자동 매칭
 * @param {Object} gorunningEvent
 * @param {Array} scrapeJobs
 * @returns {Object|null} 매칭된 job 또는 null
 */
function matchGorunningToJob(gorunningEvent, scrapeJobs) {
  // Step 1: 날짜 필터 (±2일)
  const eventDate = new Date(gorunningEvent.date);
  const candidates = scrapeJobs.filter(job => {
    if (!job.eventDate) return false;
    const jobDate = new Date(job.eventDate);
    const diffDays = Math.abs((eventDate - jobDate) / (1000 * 60 * 60 * 24));
    return diffDays <= 2;
  });
  
  if (candidates.length === 0) return null;
  
  // Step 2: 이름 유사도 계산 및 점수화
  const scored = candidates.map(job => ({
    job,
    similarity: calculateNameSimilarity(job.eventName, gorunningEvent.name)
  }));
  
  // Step 3: 임계치 적용 (>0.7)
  const qualified = scored.filter(s => s.similarity > 0.7);
  
  if (qualified.length === 0) return null;
  
  // Step 4: 최고 점수 반환
  qualified.sort((a, b) => b.similarity - a.similarity);
  return {
    job: qualified[0].job,
    similarity: qualified[0].similarity
  };
}
```

- [ ] **Step 6: exports 추가**

```javascript
module.exports = {
  // ... 기존 exports
  crawlGorunningEvents,
  matchGorunningToJob,
  calculateNameSimilarity // 테스트용
};
```

- [ ] **Step 7: 테스트 스크립트 작성**

`scripts/test-gorunning-crawler.js` 신규 생성:

```javascript
const scraper = require("../functions/lib/scraper");

async function test() {
  console.log("고러닝 크롤링 시작...");
  
  try {
    const events = await scraper.crawlGorunningEvents();
    console.log(`\n총 ${events.length}개 대회 발견:\n`);
    events.slice(0, 5).forEach(e => {
      console.log(`- ${e.date} ${e.name} (${e.location})`);
    });
    
    // 이름 유사도 테스트
    console.log("\n\n이름 유사도 테스트:");
    const testCases = [
      ["춘천마라톤", "춘천마라톤2026"],
      ["서울마라톤", "서울국제마라톤"],
      ["경주벚꽃마라톤", "벚꽃마라톤경주"]
    ];
    
    testCases.forEach(([n1, n2]) => {
      const sim = scraper.calculateNameSimilarity(n1, n2);
      console.log(`"${n1}" vs "${n2}": ${(sim * 100).toFixed(1)}%`);
    });
    
  } catch (err) {
    console.error("오류:", err.message);
  }
}

test();
```

- [ ] **Step 8: 로컬 테스트 실행**

```bash
cd functions && node ../scripts/test-gorunning-crawler.js
```

**Expected**: 고러닝 대회 목록 출력 + 유사도 테스트 결과

**주의**: 고러닝 HTML 구조에 따라 selector 수정 필요. 실패 시 HTML 구조 확인 후 Step 2 재수정.

- [ ] **Step 9: 커밋**

```bash
git add functions/lib/scraper.js functions/package.json scripts/test-gorunning-crawler.js
git commit -m "feat(scraper): 고러닝 크롤러 및 자동 매칭 로직

- crawlGorunningEvents: 향후 2개월 대회 크롤링
- matchGorunningToJob: 이름/날짜 유사도 기반 매칭
- Levenshtein distance 직접 구현
- 테스트 스크립트 추가"
```

---

## Task 3: Backend - ops-gorunning-events API

**Files:**
- Modify: `functions/index.js` (race 함수 내 신규 엔드포인트)
- Test: 로컬 에뮬레이터

- [ ] **Step 1: API 엔드포인트 추가**

`functions/index.js`의 `exports.race` 내, `ops-scrape-health` 다음에 추가:

```javascript
if (action === "ops-gorunning-events") {
  // 캐시 확인 (6시간 유효)
  const cacheDoc = await db.collection("ops_meta").doc("last_gorunning_crawl").get();
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  
  let cachedData = null;
  if (cacheDoc.exists) {
    const d = cacheDoc.data();
    const crawledAt = new Date(d.crawledAt);
    if (crawledAt >= sixHoursAgo) {
      cachedData = d;
    }
  }
  
  if (cachedData) {
    return res.json({
      ok: true,
      events: cachedData.events || [],
      lastCrawled: cachedData.crawledAt,
      cached: true
    });
  }
  
  // 캐시 없음 → 크롤링 + 매칭
  try {
    const gorunningEvents = await scraper.crawlGorunningEvents();
    
    // 최근 3개월 scrape_jobs 조회
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const jobsSnap = await db.collection("scrape_jobs")
      .where("createdAt", ">=", threeMonthsAgo)
      .get();
    
    const scrapeJobs = [];
    jobsSnap.forEach(doc => {
      const d = doc.data();
      scrapeJobs.push({
        jobId: doc.id,
        source: d.source,
        sourceId: d.sourceId,
        eventName: d.eventName,
        eventDate: d.eventDate
      });
    });
    
    // 각 고러닝 이벤트 매칭
    const enrichedEvents = gorunningEvents.map(e => {
      const match = scraper.matchGorunningToJob(e, scrapeJobs);
      
      return {
        id: e.id,
        name: e.name,
        date: e.date,
        location: e.location,
        distance: e.distance,
        url: e.url,
        matchStatus: match ? "matched" : "not_matched",
        matchedJob: match ? {
          source: match.job.source,
          sourceId: match.job.sourceId,
          jobId: match.job.jobId,
          similarity: match.similarity
        } : null
      };
    });
    
    // 캐시 저장
    await db.collection("ops_meta").doc("last_gorunning_crawl").set({
      crawledAt: new Date().toISOString(),
      events: enrichedEvents,
      stats: {
        total: enrichedEvents.length,
        matched: enrichedEvents.filter(e => e.matchStatus === "matched").length,
        notMatched: enrichedEvents.filter(e => e.matchStatus === "not_matched").length
      }
    });
    
    return res.json({
      ok: true,
      events: enrichedEvents,
      lastCrawled: new Date().toISOString(),
      cached: false
    });
    
  } catch (err) {
    console.error("[ops-gorunning-events] error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
```

- [ ] **Step 2: 로컬 테스트**

```bash
# 에뮬레이터 실행 중 상태에서
curl "http://localhost:5001/dmc-attendance/asia-northeast3/race?action=ops-gorunning-events" | jq .events[0]
```

**Expected**: 
```json
{
  "id": "gorunning_...",
  "name": "춘천마라톤",
  "date": "2026-04-05",
  "matchStatus": "matched",
  "matchedJob": {
    "source": "smartchip",
    "sourceId": "202650000006",
    "jobId": "smartchip_202650000006"
  }
}
```

- [ ] **Step 3: 캐싱 동작 확인**

```bash
# 1차 호출 (크롤링)
curl "..." | jq .cached
# Expected: false

# 즉시 2차 호출 (캐시)
curl "..." | jq .cached
# Expected: true
```

- [ ] **Step 4: 커밋**

```bash
git add functions/index.js
git commit -m "feat(api): ops-gorunning-events API 구현

- 고러닝 크롤링 + 자동 매칭
- 6시간 캐싱 (ops_meta.last_gorunning_crawl)
- matched/not_matched 상태 반환"
```

---

## Task 4: Backend - 이메일 서비스 설정

**Files:**
- Modify: `functions/package.json` (nodemailer 추가)
- Create: `functions/.env` (환경 변수)
- Modify: `functions/index.js` (sendEmail 헬퍼)

- [ ] **Step 1: Nodemailer 의존성 추가**

```bash
cd functions
npm install nodemailer@^6.9.0
cd ..
```

- [ ] **Step 2: 환경 변수 설정**

`functions/.env`에 추가:

```bash
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
ADMIN_EMAIL=taylor@example.com
```

**주의**: 실제 Gmail 앱 비밀번호로 교체 필요 (Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호)

- [ ] **Step 3: sendEmail 헬퍼 함수 작성**

`functions/index.js` 상단 (initializeApp 다음)에 추가:

```javascript
/**
 * 이메일 발송 헬퍼
 */
async function sendEmail({ to, subject, html }) {
  const nodemailer = require("nodemailer");
  
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
  
  await transporter.sendMail({
    from: `"DMC Ops" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html
  });
}
```

- [ ] **Step 4: 테스트 스크립트 작성**

`scripts/test-email.js` 신규:

```javascript
require("dotenv").config({ path: "./functions/.env" });
const nodemailer = require("nodemailer");

async function testEmail() {
  const to = process.env.ADMIN_EMAIL;
  
  if (!to || !process.env.GMAIL_USER) {
    console.error(".env 파일에 GMAIL_USER, ADMIN_EMAIL 설정 필요");
    return;
  }
  
  console.log(`테스트 이메일 발송 중... (to: ${to})`);
  
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
  
  await transporter.sendMail({
    from: `"DMC Ops Test" <${process.env.GMAIL_USER}>`,
    to,
    subject: "[테스트] ops.html 이메일 알림",
    html: "<h2>테스트 이메일</h2><p>이메일 발송이 정상 동작합니다.</p>"
  });
  
  console.log("✅ 발송 완료! 받은편지함 확인하세요.");
}

testEmail().catch(console.error);
```

- [ ] **Step 5: 로컬 테스트**

```bash
cd functions && npm install dotenv
node ../scripts/test-email.js
```

**Expected**: "✅ 발송 완료" + 실제 이메일 수신 확인

- [ ] **Step 6: 커밋**

```bash
git add functions/package.json functions/index.js scripts/test-email.js
git commit -m "feat(email): Nodemailer 이메일 서비스 설정

- sendEmail 헬퍼 함수
- Gmail SMTP 연동
- 테스트 스크립트 추가"
```

**주의**: `functions/.env`는 커밋하지 않음 (.gitignore 확인)

---

## Task 5: Backend - weekendScrapeReadinessCheck Cloud Function

**Files:**
- Modify: `functions/index.js` (신규 scheduled function)
- Test: Firebase Console 수동 트리거

- [ ] **Step 1: Cloud Function 스켈레톤 작성**

`functions/index.js`에서 `exports.scrapeHealthCheck` 다음에 추가:

```javascript
/**
 * 주말 대회 스크래핑 준비 상태 체크 (목/금 18:00 KST)
 */
exports.weekendScrapeReadinessCheck = onSchedule({
  schedule: "0 18 * * 4,5", // 목/금 18:00
  timeZone: "Asia/Seoul",
  timeoutSeconds: 120,
  memory: "512MiB",
  region: "asia-northeast3"
}, async (event) => {
  const now = new Date();
  console.log(`[weekendScrapeReadinessCheck] ${now.toISOString()}`);
  
  try {
    // TODO: 구현
    
  } catch (err) {
    console.error("[weekendScrapeReadinessCheck] error:", err);
  }
});
```

- [ ] **Step 2: ops-scrape-health 로직 재사용**

```javascript
  try {
    // 스크래핑 건강도 체크 (ops-scrape-health 로직 재사용)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentJobsSnap = await db.collection("scrape_jobs")
      .where("createdAt", ">=", sevenDaysAgo)
      .get();
    
    let totalJobs = 0;
    let successJobs = 0;
    const bySource = {
      smartchip: { total: 0, success: 0 },
      myresult: { total: 0, success: 0 },
      spct: { total: 0, success: 0 },
      marazone: { total: 0, success: 0 }
    };
    
    recentJobsSnap.forEach(doc => {
      const d = doc.data();
      const status = d.status;
      const source = d.source;
      
      if (status === "queued") return;
      
      totalJobs++;
      if (status === "complete" || status === "confirmed") successJobs++;
      
      if (bySource[source]) {
        bySource[source].total++;
        if (status === "complete" || status === "confirmed") bySource[source].success++;
      }
    });
    
    for (const src in bySource) {
      const s = bySource[src];
      s.rate = s.total > 0 ? Math.round((s.success / s.total) * 100) : 0;
    }
    
    const overallSuccessRate = totalJobs > 0 ? Math.round((successJobs / totalJobs) * 100) : 0;
    
    // 주말 대회 목록
    const year = new Date().getFullYear();
    const events = await scraper.discoverAllEvents(year);
    const { filtered: recentEvents } = scraper.filterEventsWeeklyScrapeWindow(events, year, now);
    
    const upcomingWeekend = recentEvents.filter(e => {
      if (!e.date) return false;
      const eventDate = new Date(e.date);
      const dayOfWeek = eventDate.getDay();
      return (dayOfWeek === 0 || dayOfWeek === 6) && eventDate >= now;
    }).slice(0, 5);
    
    // ... (계속)
  }
```

- [ ] **Step 3: 이슈 판정 로직**

```javascript
    // 이슈 판정
    let overallStatus = "info"; // "info" | "warning" | "error"
    const issues = [];
    
    // Critical: 주말 대회 소스 Success Rate <80%
    for (const e of upcomingWeekend) {
      const src = e.source;
      if (bySource[src] && bySource[src].rate < 80) {
        overallStatus = "error";
        issues.push(`🔴 ${src} success rate ${bySource[src].rate}% (임계치: 80%)`);
      } else if (bySource[src] && bySource[src].rate < 90) {
        if (overallStatus === "info") overallStatus = "warning";
        issues.push(`⚠️ ${src} success rate ${bySource[src].rate}% (임계치: 90%)`);
      }
    }
    
    // Stale jobs ≥5
    const staleCount = 0; // TODO: stale 조회 (Task 1에서 구현한 로직 재사용)
    if (staleCount >= 5) {
      if (overallStatus !== "error") overallStatus = "warning";
      issues.push(`⚠️ Stale jobs ${staleCount}건 (임계치: 5건)`);
    }
```

- [ ] **Step 4: 이메일 HTML 템플릿 생성**

```javascript
    // 이메일 템플릿
    const statusEmoji = { info: "✅", warning: "⚠️", error: "🔴" };
    const statusText = { info: "정상", warning: "주의", error: "긴급" };
    
    const subject = `[DMC Ops] 주말 대회 준비 체크 - ${statusEmoji[overallStatus]} ${statusText[overallStatus]}`;
    
    const html = `
<h2>🏃 주말 대회 스크래핑 준비 상태</h2>

<div style="background: #f0f0f0; padding: 15px; border-radius: 8px;">
  <h3>체크 시각: ${now.toISOString().slice(0, 16).replace('T', ' ')}</h3>
  <p><strong>주말 예정 대회:</strong> ${upcomingWeekend.length}개</p>
</div>

<h3>📊 스크래핑 건강도 (최근 7일)</h3>
<table border="1" cellpadding="5" style="border-collapse: collapse;">
  <tr><th>소스</th><th>Success Rate</th><th>상태</th></tr>
  ${Object.entries(bySource).map(([src, s]) => {
    const status = s.rate >= 90 ? "✅ 정상" : s.rate >= 80 ? "⚠️ 주의" : "🔴 긴급";
    return `<tr><td>${src}</td><td>${s.rate}% (${s.success}/${s.total})</td><td>${status}</td></tr>`;
  }).join('')}
</table>

<h3>${issues.length > 0 ? '⚠️ 발견된 이슈' : '✅ 이슈 없음'}</h3>
${issues.length > 0 ? `<ul>${issues.map(i => `<li>${i}</li>`).join('')}</ul>` : '<p>모든 메트릭이 정상입니다.</p>'}

<h3>🔗 액션</h3>
<ul>
  <li>ops.html 확인: <a href="https://dmc-attendance.web.app/ops.html">바로가기</a></li>
  <li>report.html에서 stale jobs 확정: <a href="https://dmc-attendance.web.app/report.html">바로가기</a></li>
</ul>

<hr/>
<p style="color: #999; font-size: 12px;">
  이 알림은 매주 목/금 18:00에 자동 발송됩니다.<br/>
  문제가 있으면 ops.html에서 상세 내역을 확인하세요.
</p>
`;
```

- [ ] **Step 5: 이메일 발송 및 로그 기록**

```javascript
    // 이메일 발송
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject,
      html
    });
    
    // event_logs에 기록
    await db.collection("event_logs").add({
      type: "weekend_check",
      severity: overallStatus,
      message: `주말 준비 체크 완료: ${upcomingWeekend.length}개 대회, ${overallSuccessRate}% 건강도`,
      checkedAt: now.toISOString(),
      upcomingWeekend: upcomingWeekend.map(e => ({ date: e.date, name: e.name, source: e.source })),
      healthSummary: { overall: { rate: overallSuccessRate }, bySource },
      emailSent: true,
      timestamp: FieldValue.serverTimestamp()
    });
    
    // ops_meta 저장
    await db.collection("ops_meta").doc("last_weekend_check").set({
      checkedAt: now.toISOString(),
      upcomingWeekend,
      healthSummary: { overall: { rate: overallSuccessRate }, bySource },
      emailSent: true,
      emailRecipient: process.env.ADMIN_EMAIL
    }, { merge: true });
    
    console.log(`[weekendScrapeReadinessCheck] 완료: ${upcomingWeekend.length}개 대회, ${issues.length}개 이슈`);
    
  } catch (emailError) {
    // 이메일 실패 시에도 로그는 기록
    await db.collection("event_logs").add({
      type: "weekend_check",
      severity: "error",
      message: `주말 준비 체크 완료했으나 이메일 발송 실패: ${emailError.message}`,
      checkedAt: now.toISOString(),
      emailSent: false,
      emailError: emailError.message,
      timestamp: FieldValue.serverTimestamp()
    });
    
    console.error("[weekendScrapeReadinessCheck] 이메일 실패:", emailError.message);
  }
```

- [ ] **Step 6: 로컬 테스트 (수동 트리거)**

에뮬레이터에서는 scheduled function을 직접 트리거할 수 없으므로, 임시 HTTP 래퍼 추가:

```javascript
// functions/index.js (테스트용, 배포 전 제거 또는 주석)
exports.testWeekendCheck = onRequest(async (req, res) => {
  try {
    // weekendScrapeReadinessCheck 로직 복사 또는 별도 함수로 추출
    // ... (동일 로직)
    
    res.json({ ok: true, message: "테스트 완료, 이메일 확인" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
```

```bash
# 에뮬레이터에서 테스트
curl "http://localhost:5001/dmc-attendance/asia-northeast3/testWeekendCheck"
```

**Expected**: 이메일 수신 + event_logs에 weekend_check 기록

- [ ] **Step 7: 커밋**

```bash
git add functions/index.js
git commit -m "feat(cron): weekendScrapeReadinessCheck 구현

- 목/금 18:00 자동 실행
- 스크래핑 건강도 + 주말 대회 체크
- 이메일 발송 (HTML 템플릿)
- event_logs + ops_meta 기록"
```

---

## Task 6: Frontend - ops.html Section 1-3 구현

**Files:**
- Modify: `ops.html` (기존 파일 전체 개편)
- Test: 로컬 에뮬레이터 + 브라우저

- [ ] **Step 1: 기존 ops.html 백업**

```bash
cp ops.html ops.html.backup
```

- [ ] **Step 2: HTML 구조 재설계 (Section 1-3)**

`ops.html`의 `<body>` 내용 교체:

```html
<body>
  <div class="header">
    <h1>⚙️ DMC Ops Console</h1>
    <div>
      <button class="refresh-btn" onclick="loadAll()">↻ 새로고침</button>
      <a href="report.html">← report</a>
    </div>
  </div>

  <!-- Section 1: 시스템 건강도 -->
  <div id="systemHealth"></div>
  
  <!-- Section 2: 스크래핑 건강도 -->
  <div class="card" id="scrapeHealthCard"><div class="loading">로딩 중...</div></div>
  
  <!-- Section 3: 주말 준비 상태 -->
  <div class="card" id="weekendReadinessCard" style="display: none;"><div class="loading">로딩 중...</div></div>
  
  <!-- 기존 Section 4-7은 Task 7에서 처리 -->
  <div class="card" id="memberStatsCard"><div class="loading">로딩 중...</div></div>
  <div class="card" id="scrapeAlertsCard"><div class="loading">로딩 중...</div></div>
  <div class="card" id="integrityCard"><div class="loading">로딩 중...</div></div>
  <div class="card" id="logsCard"><div class="loading">로딩 중...</div></div>

  <script>
    const API_BASE = location.hostname === "localhost"
      ? "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race"
      : "https://race-nszximpvtq-du.a.run.app";

    function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
    
    // TODO: 구현
  </script>
</body>
```

- [ ] **Step 3: Section 1 렌더링 함수**

```javascript
    function renderSystemHealth(intData) {
      const issues = intData.issues || [];
      const totalJobs = intData.totalJobs || 0;
      const totalResults = intData.totalResults || 0;
      
      let status = "✅ 시스템 정상 운영 중";
      let statusColor = "#064E3B"; // 초록
      
      if (issues.length >= 6) {
        status = "🔴 긴급: 시스템 점검 필요";
        statusColor = "#7C2D12"; // 빨강
      } else if (issues.length >= 1) {
        status = "⚠️ 주의: 데이터 무결성 이슈";
        statusColor = "#78350F"; // 노랑
      }
      
      document.getElementById("systemHealth").innerHTML = `
        <div class="stat-row" style="margin-bottom: 16px;">
          <div class="card" style="flex: 1; background: ${statusColor};">
            <div style="font-size: 15px; font-weight: 700; color: #F8FAFC;">${status}</div>
            <div style="font-size: 13px; color: #E2E8F0; margin-top: 4px;">
              총 Jobs: ${totalJobs} | 총 Records: ${totalResults} | Phantom Jobs: ${issues.length}
            </div>
          </div>
        </div>`;
    }
```

- [ ] **Step 4: Section 2 렌더링 함수**

```javascript
    async function renderScrapeHealth() {
      const res = await fetch(`${API_BASE}?action=ops-scrape-health`);
      const data = await res.json();
      
      if (!data.ok) {
        document.getElementById("scrapeHealthCard").innerHTML = 
          '<div class="card-title">🔍 스크래핑 건강도</div><span class="badge-warn">로드 실패</span>';
        return;
      }
      
      const overall = data.overall || {};
      const bySource = data.bySource || {};
      
      const statusBadge = (rate) => {
        if (rate >= 90) return '<span class="badge-ok">✅ 정상</span>';
        if (rate >= 80) return '<span class="badge-partial">⚠️ 주의</span>';
        return '<span class="badge-warn">🔴 긴급</span>';
      };
      
      let html = `
        <div class="card-title">🔍 스크래핑 건강도 (최근 7일) <button class="refresh-btn" onclick="renderScrapeHealth()">↻</button></div>
        
        <div style="margin-bottom: 12px;">
          <div style="font-size: 16px; font-weight: 700; color: #F8FAFC;">
            전체 Success Rate: ${overall.rate || 0}% (${overall.success || 0}/${overall.total || 0} jobs)
          </div>
          <div style="font-size: 13px; color: #94A3B8; margin-top: 4px;">
            Failed: ${overall.failed || 0}건 | Stale: ${overall.stale || 0}건 | Stuck: ${overall.stuck || 0}건
          </div>
        </div>
        
        <div style="font-size: 11px; color: #64748B; margin: 10px 0 6px; font-weight: 600;">소스별 건강도:</div>
        <table><tr><th>소스</th><th class="num">Success Rate</th><th>상태</th></tr>`;
      
      for (const [src, s] of Object.entries(bySource)) {
        if (src === "manual") {
          html += `<tr><td>${src}</td><td class="num">—</td><td>수동 입력</td></tr>`;
        } else {
          html += `<tr><td>${src}</td><td class="num">${s.rate || 0}% (${s.success || 0}/${s.total || 0})</td><td>${statusBadge(s.rate || 0)}</td></tr>`;
        }
      }
      
      html += `</table>
        <div style="font-size: 11px; color: #64748B; margin-top: 10px;">
          마지막 업데이트: ${new Date(data.lastCheck).toLocaleString('ko-KR')}
        </div>`;
      
      document.getElementById("scrapeHealthCard").innerHTML = html;
    }
```

- [ ] **Step 5: Section 3 렌더링 함수 (목/금만 표시)**

```javascript
    async function renderWeekendReadiness() {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0=일, 4=목, 5=금
      
      // 목/금이 아니면 숨김
      if (dayOfWeek !== 4 && dayOfWeek !== 5) {
        document.getElementById("weekendReadinessCard").style.display = "none";
        return;
      }
      
      document.getElementById("weekendReadinessCard").style.display = "block";
      
      const res = await fetch(`${API_BASE}?action=ops-scrape-health`);
      const data = await res.json();
      
      if (!data.ok) return;
      
      const upcomingWeekend = data.upcomingWeekend || [];
      const bySource = data.bySource || {};
      
      // 전체 준비 상태 판정
      let overallStatus = "✅ 정상";
      for (const e of upcomingWeekend) {
        const src = e.source;
        if (bySource[src] && bySource[src].rate < 80) {
          overallStatus = "🔴 긴급 (점검 필요)";
          break;
        } else if (bySource[src] && bySource[src].rate < 90) {
          overallStatus = "⚠️ 주의 (모니터링 필요)";
        }
      }
      
      let html = `
        <div class="card-title">🏃 주말 대회 준비 상태</div>
        
        <div style="margin-bottom: 12px;">
          <div style="font-size: 15px; font-weight: 700; color: #F8FAFC;">
            다가오는 주말 대회: ${upcomingWeekend.length}개
          </div>
          <div style="font-size: 13px; color: #94A3B8; margin-top: 4px;">
            전체 준비 상태: ${overallStatus}
          </div>
        </div>
        
        <div style="font-size: 11px; color: #64748B; margin: 10px 0 6px; font-weight: 600;">예정 대회:</div>`;
      
      if (upcomingWeekend.length === 0) {
        html += '<div style="color: #64748B;">주말 예정 대회 없음</div>';
      } else {
        upcomingWeekend.forEach(e => {
          const srcHealth = bySource[e.source];
          const srcStatus = srcHealth && srcHealth.rate >= 90 ? "✅" : srcHealth && srcHealth.rate >= 80 ? "⚠️" : "🔴";
          html += `<div style="padding: 5px 0; border-bottom: 1px solid #334155;">
            ${e.date} (${["일","월","화","수","목","금","토"][new Date(e.date).getDay()]}) ${esc(e.eventName)} [${e.source} ${srcStatus}]
          </div>`;
        });
      }
      
      // 마지막 이메일 알림
      const metaRes = await fetch(`${API_BASE}?action=ops-meta-last-weekend-check`).catch(() => null);
      if (metaRes && metaRes.ok) {
        const metaData = await metaRes.json();
        if (metaData.checkedAt) {
          html += `<div style="font-size: 11px; color: #64748B; margin-top: 10px;">
            📧 마지막 이메일 알림: ${new Date(metaData.checkedAt).toLocaleString('ko-KR')}
          </div>`;
        }
      }
      
      document.getElementById("weekendReadinessCard").innerHTML = html;
    }
```

- [ ] **Step 6: loadAll 함수 업데이트**

```javascript
    async function loadAll() {
      // 병렬 호출
      const [intRes] = await Promise.all([
        fetch(`${API_BASE}?action=data-integrity`),
        renderScrapeHealth(),
        renderWeekendReadiness()
      ]);
      
      const intData = await intRes.json();
      renderSystemHealth(intData);
      
      // 기존 섹션 (Task 7에서 처리)
      // renderMemberStats, renderScrapeAlerts, renderIntegrity, renderLogs...
    }
    
    loadAll();
```

- [ ] **Step 7: 로컬 테스트**

```bash
# 에뮬레이터 실행 중
open http://localhost:5000/ops.html
```

**Expected**:
- Section 1: 시스템 건강도 요약 카드 표시
- Section 2: 스크래핑 건강도 (소스별 success rate)
- Section 3: 주말 준비 (목/금만, 다른 요일은 숨김)

- [ ] **Step 8: 커밋**

```bash
git add ops.html
git commit -m "feat(ops-ui): Section 1-3 구현

- Section 1: 시스템 건강도 (Phantom Jobs)
- Section 2: 스크래핑 건강도 (소스별 success rate)
- Section 3: 주말 준비 상태 (목/금만 표시)"
```

---

## Task 7: Frontend - ops.html Section 5 (고러닝) 구현

**Files:**
- Modify: `ops.html` (Section 5 추가)
- Test: 로컬 에뮬레이터

- [ ] **Step 1: HTML 섹션 추가**

`ops.html`의 `memberStatsCard` 다음에 추가:

```html
  <!-- Section 5: 고러닝 예정 대회 -->
  <div class="card" id="gorunningEventsCard"><div class="loading">로딩 중...</div></div>
```

- [ ] **Step 2: 렌더링 함수 작성**

```javascript
    async function renderGorunningEvents() {
      try {
        const res = await fetch(`${API_BASE}?action=ops-gorunning-events`);
        const data = await res.json();
        
        if (!data.ok) {
          document.getElementById("gorunningEventsCard").innerHTML = 
            '<div class="card-title">📅 고러닝 예정 대회</div><span class="badge-warn">로드 실패</span>';
          return;
        }
        
        const events = data.events || [];
        const matched = events.filter(e => e.matchStatus === "matched").length;
        const notMatched = events.filter(e => e.matchStatus === "not_matched").length;
        
        let html = `
          <div class="card-title">
            📅 고러닝 예정 대회 (향후 2개월)
            <button class="refresh-btn" onclick="renderGorunningEvents()">↻</button>
          </div>
          
          <div style="font-size: 11px; color: #94A3B8; margin-bottom: 10px;">
            마지막 업데이트: ${new Date(data.lastCrawled).toLocaleString('ko-KR')} ${data.cached ? "(캐시)" : ""}<br/>
            총 ${events.length}개 대회 | 스크랩 가능: ${matched}개 | 수동 필요: ${notMatched}개
          </div>`;
        
        if (events.length === 0) {
          html += '<div style="color: #64748B;">예정 대회 없음</div>';
        } else {
          events.slice(0, 20).forEach(e => {
            const isMatched = e.matchStatus === "matched";
            const statusIcon = isMatched ? "✅" : "🔍";
            const statusText = isMatched ? "스크랩 가능" : "수동 검색 필요";
            
            html += `
              <div style="padding: 10px; margin: 8px 0; background: #1E293B; border-radius: 6px; border-left: 3px solid ${isMatched ? '#6EE7B7' : '#FCA5A5'};">
                <div style="font-size: 13px; font-weight: 700; color: #F8FAFC;">
                  ${e.date} (${["일","월","화","수","목","금","토"][new Date(e.date).getDay()]}) ${esc(e.name)}
                </div>
                <div style="font-size: 12px; color: #94A3B8; margin-top: 4px;">
                  ${statusIcon} ${statusText}`;
            
            if (isMatched) {
              html += ` (${e.matchedJob.source}_${e.matchedJob.sourceId})`;
              html += ` <a href="report.html" style="color: #60A5FA; text-decoration: none;">[발견 완료 →]</a>`;
            } else {
              html += `<br/><span style="font-size: 11px; color: #64748B;">
                💡 액션: report.html "발견"에서 수동 검색 또는 기록 사이트(smartchip, myresult 등)에서 직접 확인 필요
              </span>`;
              html += ` <a href="report.html" style="color: #60A5FA; text-decoration: none;">[수동 검색 →]</a>`;
            }
            
            html += `</div></div>`;
          });
        }
        
        document.getElementById("gorunningEventsCard").innerHTML = html;
        
      } catch (err) {
        console.error("고러닝 로드 실패:", err);
        document.getElementById("gorunningEventsCard").innerHTML = 
          '<div class="card-title">📅 고러닝 예정 대회</div><span class="badge-warn">오류 발생</span>';
      }
    }
```

- [ ] **Step 3: loadAll에 추가**

```javascript
    async function loadAll() {
      const [intRes] = await Promise.all([
        fetch(`${API_BASE}?action=data-integrity`),
        renderScrapeHealth(),
        renderWeekendReadiness(),
        // ... 기존 섹션들
        renderGorunningEvents() // 추가
      ]);
      
      // ... 나머지
    }
```

- [ ] **Step 4: 로컬 테스트**

```bash
open http://localhost:5000/ops.html
```

**Expected**:
- Section 5 표시 (고러닝 예정 대회)
- ✅ 스크랩 가능 / 🔍 수동 필요 구분
- [발견 완료 →] / [수동 검색 →] 링크

- [ ] **Step 5: 커밋**

```bash
git add ops.html
git commit -m "feat(ops-ui): Section 5 고러닝 예정 대회 구현

- 향후 2개월 대회 목록 표시
- matched/not_matched 상태별 아이콘
- 액션 가이드 + report.html 링크"
```

---

## Task 8: Frontend - Section 4, 6, 7 정리 및 최종 테스트

**Files:**
- Modify: `ops.html` (기존 섹션 정리)
- Test: 프로덕션 배포 준비

- [ ] **Step 1: Section 4 (전환율) 간소화**

기존 `renderMemberStats` 함수에서 "검색했지만 결과 없음" 제거:

```javascript
    function renderMemberStats(s) {
      // ... 기존 코드 유지
      
      // 제거: searchCoverage 섹션 (noResult)
      // 유지: 배포 후 전환율, 퍼널, 확정 경로
    }
```

- [ ] **Step 2: Section 6 (최근 알림) 필터링 개선**

`renderScrapeAlerts` 함수 수정:

```javascript
    function renderScrapeAlerts(logsData) {
      const logs = logsData.logs || [];
      const alerts = logs.filter(l => l.type === "scrape_alert" || l.type === "weekend_check").slice(0, 10);
      
      // ... (기존 렌더링 로직 유지)
    }
```

- [ ] **Step 3: Section 7 (이벤트 로그) 간소화**

기존 `renderLogs` 유지 (이미 일별 요약)

- [ ] **Step 4: "다음 실행 시" 섹션 제거**

기존 `scrapeScheduleCard` 및 `renderScrapeSchedule` 함수 제거 또는 주석 처리

- [ ] **Step 5: 섹션 순서 최종 확인**

HTML 순서:
1. systemHealth (Section 1)
2. scrapeHealthCard (Section 2)
3. weekendReadinessCard (Section 3)
4. memberStatsCard (Section 4)
5. gorunningEventsCard (Section 5)
6. scrapeAlertsCard (Section 6)
7. logsCard (Section 7)
8. integrityCard (하단 - 상세)

- [ ] **Step 6: 전체 통합 테스트**

```bash
# 에뮬레이터에서 전체 확인
open http://localhost:5000/ops.html
```

**체크리스트**:
- [ ] Section 1-7 모두 표시
- [ ] Section 3은 목/금만 (다른 요일은 숨김)
- [ ] Section 2, 5 [새로고침] 버튼 동작
- [ ] 고러닝 대회 링크 클릭 시 report.html 이동
- [ ] 모든 API 응답 정상

- [ ] **Step 7: 커밋**

```bash
git add ops.html
git commit -m "refactor(ops-ui): Section 4, 6, 7 정리 및 최종 통합

- Section 4: searchCoverage 제거
- Section 6: weekend_check 필터 추가
- scrapeScheduleCard 제거 (자동 스크랩 없음)
- 7개 섹션 순서 확정"
```

---

## Task 9: 배포 및 검증

**Files:**
- N/A (배포 작업)
- Test: 프로덕션 환경

- [ ] **Step 1: Pre-deploy 테스트**

```bash
bash scripts/pre-deploy-test.sh
```

**Expected**: `✅ 전체 통과 — 배포 가능`

- [ ] **Step 2: Firestore 백업**

```bash
cd functions && node ../scripts/backup-firestore.js
```

**Expected**: `backup/2026-04-XX/` 폴더 생성 확인

- [ ] **Step 3: Git 상태 확인**

```bash
git status
git diff
```

**Expected**: Clean working directory 또는 의도한 변경만

- [ ] **Step 4: Functions 배포**

```bash
firebase deploy --only functions
```

**Expected**: 
- `weekendScrapeReadinessCheck` 배포 성공
- 기존 functions (race, attendance, etc.) 정상

- [ ] **Step 5: Hosting 배포**

```bash
firebase deploy --only hosting
```

**Expected**: ops.html 배포 성공

- [ ] **Step 6: 프로덕션 검증 - ops.html**

```bash
open https://dmc-attendance.web.app/ops.html
```

**체크리스트**:
- [ ] Section 1-7 모두 표시
- [ ] ops-scrape-health API 정상 응답
- [ ] ops-gorunning-events API 정상 응답 (크롤링 성공)
- [ ] 고러닝 매칭 결과 확인 (matched/not_matched)

- [ ] **Step 7: 프로덕션 검증 - 이메일 알림**

목요일 또는 금요일 18:00 대기 또는 Firebase Console에서 수동 트리거:

1. Firebase Console → Functions
2. `weekendScrapeReadinessCheck` 선택
3. "함수 실행" 버튼 (테스트 탭)

**Expected**: ADMIN_EMAIL로 이메일 수신

- [ ] **Step 8: 버전 태그**

```bash
# 현재 버전 확인
git tag -l 'v*' --sort=-v:refname | head -1

# 새 버전 (예: v1.2.0)
git tag -a v1.2.0 -m "feat: ops.html 리뉴얼 + 고러닝 통합

- 스크래핑 모니터링 강화 (소스별 success rate)
- 주말 대회 자동 알림 (목/금 18:00 이메일)
- 고러닝 예정 대회 UI (향후 2개월)
- 7개 섹션 재설계"

git push origin v1.2.0
```

- [ ] **Step 9: 배포 완료 문서화**

`_docs/log/2026-04-XX.md`에 배포 기록 추가

---

## 완료 기준

- [ ] 모든 Task 1-9 체크박스 완료
- [ ] Pre-deploy 테스트 통과
- [ ] 프로덕션 배포 성공 (functions + hosting)
- [ ] ops.html 7개 섹션 정상 동작
- [ ] 주말 알림 이메일 수신 확인
- [ ] 버전 태그 생성 (v1.2.0 또는 상위)

---

## 참고 자료

- 스펙 문서: `_docs/superpowers/specs/2026-04-03-ops-html-renewal-design.md`
- API 명세: `_docs/api/http-api-actions.md`
- 기존 코드: `functions/index.js`, `functions/lib/scraper.js`
