// 고러닝 매칭 디버깅 스크립트
// 목적: matchGorunningToJob 로직의 각 단계를 검증

const admin = require("firebase-admin");

// Firebase Admin 초기화
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://dmc-attendance.firebaseio.com",
  });
}

const db = admin.firestore();
const scraper = require("../functions/lib/scraper");

async function debug() {
  console.log("=== 고러닝 매칭 디버깅 ===\n");

  // 1. 고러닝 크롤링
  console.log("[1/4] 고러닝 대회 크롤링...");
  const gorunningEvents = await scraper.crawlGorunningEvents();
  console.log(`✓ ${gorunningEvents.length}개 대회 발견\n`);

  // 2. 최근 3개월 scrape_jobs 조회
  console.log("[2/4] 최근 3개월 scrape_jobs 조회...");
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const jobsSnap = await db.collection("scrape_jobs").where("createdAt", ">=", threeMonthsAgo).get();

  const scrapeJobs = [];
  jobsSnap.forEach((doc) => {
    const d = doc.data();
    scrapeJobs.push({
      jobId: doc.id,
      source: d.source,
      sourceId: d.sourceId,
      eventName: d.eventName,
      eventDate: d.eventDate,
    });
  });
  console.log(`✓ ${scrapeJobs.length}개 jobs 발견\n`);

  // 3. 군산새만금 매칭 상세 분석
  console.log("[3/4] 군산새만금 매칭 상세 분석...");
  const gunsanEvent = gorunningEvents.find((e) => e.name.includes("군산"));
  if (!gunsanEvent) {
    console.log("✗ 군산새만금 대회를 찾을 수 없습니다.\n");
  } else {
    console.log(`고러닝 대회: ${gunsanEvent.name} (${gunsanEvent.date})`);

    // 날짜 필터
    const eventDate = new Date(gunsanEvent.date);
    const candidates = scrapeJobs.filter((job) => {
      if (!job.eventDate) return false;
      const jobDate = new Date(job.eventDate);
      const diffDays = Math.abs((eventDate - jobDate) / (1000 * 60 * 60 * 24));
      return diffDays <= 2;
    });

    console.log(`\n날짜 필터 (±2일): ${candidates.length}개 후보`);
    if (candidates.length > 0) {
      console.log("후보 목록:");
      candidates.slice(0, 3).forEach((c) => {
        console.log(`  - ${c.eventName} (${c.eventDate}) [${c.source}_${c.sourceId}]`);
      });
    }

    // 이름 유사도
    if (candidates.length > 0) {
      console.log("\n이름 유사도:");
      candidates.slice(0, 5).forEach((c) => {
        const similarity = scraper.calculateNameSimilarity(c.eventName, gunsanEvent.name);
        const status = similarity > 0.7 ? "✓" : "✗";
        console.log(`  ${status} ${(similarity * 100).toFixed(1)}% - ${c.eventName}`);
      });
    }

    // 최종 매칭
    const match = scraper.matchGorunningToJob(gunsanEvent, scrapeJobs);
    console.log(`\n최종 매칭 결과: ${match ? "매칭됨" : "매칭 실패"}`);
    if (match) {
      console.log(`  - Job: ${match.job.eventName}`);
      console.log(`  - Similarity: ${(match.similarity * 100).toFixed(1)}%`);
    }
  }
  console.log();

  // 4. 전체 매칭 통계
  console.log("[4/4] 전체 매칭 통계...");
  let matched = 0;
  let notMatched = 0;
  let noDateCandidate = 0;
  let lowSimilarity = 0;

  gorunningEvents.forEach((e) => {
    const eventDate = new Date(e.date);
    const candidates = scrapeJobs.filter((job) => {
      if (!job.eventDate) return false;
      const jobDate = new Date(job.eventDate);
      const diffDays = Math.abs((eventDate - jobDate) / (1000 * 60 * 60 * 24));
      return diffDays <= 2;
    });

    if (candidates.length === 0) {
      noDateCandidate++;
    } else {
      const scored = candidates.map((job) => ({
        job,
        similarity: scraper.calculateNameSimilarity(job.eventName, e.name),
      }));
      const qualified = scored.filter((s) => s.similarity > 0.7);

      if (qualified.length === 0) {
        lowSimilarity++;
      } else {
        matched++;
      }
    }
  });
  notMatched = gorunningEvents.length - matched;

  console.log(`총 ${gorunningEvents.length}개 대회:`);
  console.log(`  - 매칭됨: ${matched}개`);
  console.log(`  - 날짜 후보 없음: ${noDateCandidate}개`);
  console.log(`  - 이름 유사도 낮음: ${lowSimilarity}개`);
  console.log(`  - 매칭 실패: ${notMatched}개`);

  // 5. 샘플 대회 3개 상세
  console.log("\n=== 샘플 대회 3개 상세 ===");
  gorunningEvents.slice(0, 3).forEach((e) => {
    console.log(`\n대회: ${e.name} (${e.date})`);
    const eventDate = new Date(e.date);
    const candidates = scrapeJobs.filter((job) => {
      if (!job.eventDate) return false;
      const jobDate = new Date(job.eventDate);
      const diffDays = Math.abs((eventDate - jobDate) / (1000 * 60 * 60 * 24));
      return diffDays <= 2;
    });

    if (candidates.length === 0) {
      console.log("  → 날짜 후보 없음");
    } else {
      const scored = candidates.map((job) => ({
        job,
        similarity: scraper.calculateNameSimilarity(job.eventName, e.name),
      }));
      scored.sort((a, b) => b.similarity - a.similarity);
      console.log(`  → ${candidates.length}개 날짜 후보, 최고 유사도: ${(scored[0].similarity * 100).toFixed(1)}%`);
      console.log(`     (${scored[0].job.eventName})`);
    }
  });

  process.exit(0);
}

debug().catch((err) => {
  console.error("오류:", err);
  process.exit(1);
});
