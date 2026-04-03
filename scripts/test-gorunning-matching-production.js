// 고러닝 매칭 테스트 (캐시 무시하고 강제 크롤링)
// Functions의 ops-gorunning-events를 직접 시뮬레이션

const scraper = require("../functions/lib/scraper");
const fs = require("fs");
const path = require("path");

async function testGorunningMatching() {
  console.log("=== 고러닝 매칭 테스트 (로컬) ===\n");

  // 1. 고러닝 크롤링
  console.log("[1/3] 고러닝 크롤링...");
  const gorunningEvents = await scraper.crawlGorunningEvents();
  console.log(`✓ ${gorunningEvents.length}개 대회 발견\n`);

  // 2. discovered-events.json 로드
  console.log("[2/3] discovered-events.json 로드...");
  const discoveredPath = path.join(__dirname, "../functions/data/discovered-events-2026.json");
  const discoveredData = JSON.parse(fs.readFileSync(discoveredPath, "utf8"));
  const discoveredEvents = discoveredData.events || [];
  console.log(`✓ ${discoveredEvents.length}개 발견된 대회\n`);

  // 3. 매칭
  console.log("[3/3] 매칭 수행...");
  let scraped = 0;
  let discovered = 0;
  let notMatched = 0;

  const samples = [];

  gorunningEvents.forEach((e) => {
    // Step 1: scrape_jobs 매칭 (생략, 로컬에서는 테스트 불가)
    // scraped++; 

    // Step 2: discovered-events 매칭
    const discoveredMatch = scraper.matchGorunningToDiscovered(e, discoveredEvents);
    if (discoveredMatch) {
      discovered++;
      if (samples.length < 5) {
        samples.push({
          name: e.name,
          date: e.date,
          matched: discoveredMatch.event.name,
          similarity: (discoveredMatch.similarity * 100).toFixed(1) + "%",
        });
      }
      return;
    }

    // Step 3: 매칭 실패
    notMatched++;
  });

  console.log(`\n결과:`);
  console.log(`  - scraped: ${scraped}개 (로컬 테스트에서는 0)`);
  console.log(`  - discovered: ${discovered}개`);
  console.log(`  - not_matched: ${notMatched}개`);
  console.log(`  - 총: ${gorunningEvents.length}개\n`);

  console.log(`매칭률: ${((discovered / gorunningEvents.length) * 100).toFixed(1)}%\n`);

  if (samples.length > 0) {
    console.log("샘플 매칭 결과:");
    samples.forEach((s) => {
      console.log(`  ✓ ${s.date} ${s.name}`);
      console.log(`    → ${s.matched} (${s.similarity})`);
    });
  }

  console.log("\n✅ 테스트 완료");
  console.log("\n프로덕션 배포 후 API 호출 시 discovered 개수가 위와 비슷하게 나와야 합니다.");
}

testGorunningMatching().catch((err) => {
  console.error("오류:", err);
  process.exit(1);
});
