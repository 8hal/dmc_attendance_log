// 고러닝 매칭 로컬 테스트 (에뮬레이터 불필요)
// 목적: 매칭 로직의 각 단계를 샘플 데이터로 검증

const scraper = require("../functions/lib/scraper");

async function testMatching() {
  console.log("=== 고러닝 매칭 로직 테스트 ===\n");

  // 1. 샘플 고러닝 대회
  const gorunningEvent = {
    id: "gorunning_2026-04-05_8",
    name: "2026 군산새만금마라톤",
    date: "2026-04-05",
    location: "",
    distance: [],
    url: "https://gorunning.kr/races/871/",
  };

  console.log(`테스트 대회: ${gorunningEvent.name} (${gorunningEvent.date})\n`);

  // 2. 샘플 scrape_jobs (가상 데이터)
  const scrapeJobs = [
    {
      jobId: "smartchip_202650000100",
      source: "smartchip",
      sourceId: "202650000100",
      eventName: "2026 군산 새만금 마라톤",
      eventDate: "2026-04-05",
    },
    {
      jobId: "smartchip_202650000101",
      source: "smartchip",
      sourceId: "202650000101",
      eventName: "2026 서울마라톤",
      eventDate: "2026-04-06",
    },
    {
      jobId: "myresult_20260405001",
      source: "myresult",
      sourceId: "20260405001",
      eventName: "2026 경주벚꽃마라톤",
      eventDate: "2026-04-04",
    },
    {
      jobId: "spct_2026040501",
      source: "spct",
      sourceId: "2026040501",
      eventName: "제20회 군산새만금마라톤대회",
      eventDate: "2026-04-05",
    },
  ];

  console.log(`샘플 Jobs: ${scrapeJobs.length}개\n`);

  // 3. Step 1: 날짜 필터 (±2일)
  console.log("[Step 1] 날짜 필터 (±2일)");
  const eventDate = new Date(gorunningEvent.date);
  const candidates = scrapeJobs.filter((job) => {
    if (!job.eventDate) return false;
    const jobDate = new Date(job.eventDate);
    const diffDays = Math.abs((eventDate - jobDate) / (1000 * 60 * 60 * 24));
    console.log(`  ${job.eventName}: ${job.eventDate} → diffDays=${diffDays.toFixed(1)} ${diffDays <= 2 ? "✓" : "✗"}`);
    return diffDays <= 2;
  });
  console.log(`\n결과: ${candidates.length}개 후보\n`);

  // 4. Step 2: 이름 유사도
  console.log("[Step 2] 이름 유사도");
  const scored = candidates.map((job) => {
    const similarity = scraper.calculateNameSimilarity(job.eventName, gorunningEvent.name);
    console.log(`  ${(similarity * 100).toFixed(1)}% - ${job.eventName}`);
    return { job, similarity };
  });
  console.log();

  // 5. Step 3: 임계치 (>0.7)
  console.log("[Step 3] 임계치 필터 (>0.7)");
  const qualified = scored.filter((s) => s.similarity > 0.7);
  console.log(`  ${qualified.length}개 qualified\n`);

  if (qualified.length > 0) {
    qualified.sort((a, b) => b.similarity - a.similarity);
    console.log("[Step 4] 최고 점수 매칭");
    console.log(`  ✓ 매칭됨: ${qualified[0].job.eventName}`);
    console.log(`  Similarity: ${(qualified[0].similarity * 100).toFixed(1)}%`);
    console.log(`  Job ID: ${qualified[0].job.jobId}\n`);
  } else {
    console.log("[Step 4] 매칭 실패: 유사도 임계치 미달\n");
  }

  // 6. 이름 정규화 확인
  console.log("=== 이름 정규화 확인 ===");
  const name1 = "2026 군산새만금마라톤";
  const name2 = "2026 군산 새만금 마라톤";
  const name3 = "제20회 군산새만금마라톤대회";

  console.log(`원본: "${name1}"`);
  console.log(`정규화: "${normalize(name1)}"\n`);

  console.log(`비교 1: "${name1}" vs "${name2}"`);
  console.log(`유사도: ${(scraper.calculateNameSimilarity(name1, name2) * 100).toFixed(1)}%\n`);

  console.log(`비교 2: "${name1}" vs "${name3}"`);
  console.log(`유사도: ${(scraper.calculateNameSimilarity(name1, name3) * 100).toFixed(1)}%\n`);

  // 7. 실제 고러닝 데이터 크롤링 테스트
  console.log("=== 실제 고러닝 크롤링 ===");
  try {
    const gorunningEvents = await scraper.crawlGorunningEvents();
    console.log(`✓ ${gorunningEvents.length}개 대회 발견`);
    console.log("\n샘플 3개:");
    gorunningEvents.slice(0, 3).forEach((e) => {
      console.log(`  - ${e.date} ${e.name}`);
    });
  } catch (err) {
    console.log(`✗ 크롤링 실패: ${err.message}`);
  }
}

function normalize(name) {
  return name
    .replace(/\s+/g, "") // 공백 제거
    .toLowerCase()
    .replace(/\d{4}/g, "") // 연도 제거
    .replace(/마라톤|대회|레이스|러닝/g, ""); // 공통 단어 제거
}

testMatching().catch((err) => {
  console.error("오류:", err);
  process.exit(1);
});
