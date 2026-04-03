const scraper = require("../functions/lib/scraper");

async function test() {
  console.log("고러닝 크롤링 시작...");

  try {
    const events = await scraper.crawlGorunningEvents();
    console.log(`\n총 ${events.length}개 대회 발견:\n`);
    events.slice(0, 5).forEach((e) => {
      console.log(`- ${e.date} ${e.name} (${e.location})`);
    });

    console.log("\n\n이름 유사도 테스트:");
    const testCases = [
      ["춘천마라톤", "춘천마라톤2026"],
      ["서울마라톤", "서울국제마라톤"],
      ["경주벚꽃마라톤", "벚꽃마라톤경주"],
    ];

    testCases.forEach(([n1, n2]) => {
      const sim = scraper.calculateNameSimilarity(n1, n2);
      console.log(`"${n1}" vs "${n2}": ${(sim * 100).toFixed(1)}%`);
    });
  } catch (err) {
    console.error("오류:", err.message);
    process.exitCode = 1;
  }
}

test();
