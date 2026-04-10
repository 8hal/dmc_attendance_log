#!/usr/bin/env node
/**
 * 러닝위키 크롤러 테스트
 * 
 * 사용: node scripts/test-runningwikii-crawler.js
 */

const scraper = require("../functions/lib/scraper");

(async () => {
  console.log("[test-runningwikii-crawler] 시작...\n");

  try {
    const events = await scraper.crawlRunningwikiiEvents();
    console.log(`✅ 총 ${events.length}개 대회 수집\n`);

    const april19 = events.filter(e => e.date === "2026-04-19");
    console.log(`📅 2026-04-19 대회 (${april19.length}개):`);
    april19.forEach(e => {
      console.log(`  - ${e.name}`);
      console.log(`    URL: ${e.runningwikiiUrl}`);
    });

    const gyeonggi = events.find(e => e.name.includes("경기마라톤"));
    if (gyeonggi) {
      console.log(`\n🎯 경기마라톤 찾음:`);
      console.log(`  이름: ${gyeonggi.name}`);
      console.log(`  날짜: ${gyeonggi.date}`);
      console.log(`  URL: ${gyeonggi.runningwikiiUrl}`);
    } else {
      console.log(`\n⚠️  경기마라톤을 찾지 못했습니다.`);
    }

    console.log(`\n--- 통합 크롤 테스트 ---`);
    const combined = await scraper.crawlAllUpcomingEvents();
    console.log(`✅ 통합 수집: 총 ${combined.length}개`);
    
    const sources = combined.reduce((acc, e) => {
      acc[e.source] = (acc[e.source] || 0) + 1;
      return acc;
    }, {});
    console.log(`소스별: ${JSON.stringify(sources)}`);

    const gyeonggiCombined = combined.find(e => e.name.includes("경기마라톤"));
    if (gyeonggiCombined) {
      console.log(`\n🎯 통합 목록에서 경기마라톤 찾음 (소스: ${gyeonggiCombined.source})`);
    }

  } catch (err) {
    console.error("❌ 에러:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
