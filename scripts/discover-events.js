/**
 * 타이밍 사이트별 대회 목록 자동 발견 스크립트
 *
 * 사용법:
 *   node scripts/discover-events.js --year 2026
 *   node scripts/discover-events.js --year 2025 --source spct
 *   node scripts/discover-events.js --year 2026 --all
 *
 * 출력: data/discovered-events-{year}.json
 */

const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const DELAY_MS = 300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Marazone (raceresult.co.kr) ─────────────────────────────

async function discoverMarazone(year) {
  const res = await fetch("https://raceresult.co.kr/api/record-competitions");
  const data = await res.json();
  return data
    .filter((e) => e.comp_date && e.comp_date.startsWith(String(year)))
    .map((e) => ({
      source: "marazone",
      sourceId: e.comp_title,
      name: e.comp_title,
      date: e.comp_date,
      distances: e.comp_div_ls || "",
      location: e.comp_place || "",
    }));
}

// ─── MyResult (myresult.co.kr) ───────────────────────────────

async function discoverMyResult(year) {
  const res = await fetch("https://myresult.co.kr/api/event", {
    headers: { Accept: "application/json" },
  });
  const data = await res.json();
  const events = data.results || data;
  return events
    .filter((e) => e.date && e.date.startsWith(String(year)))
    .map((e) => ({
      source: "myresult",
      sourceId: String(e.id),
      name: e.name,
      date: e.date,
      distances: "",
      location: e.place_area || "",
    }));
}

// ─── LiveRun (liverun.co.kr) ─────────────────────────────────

async function discoverLiveRun(year) {
  const res = await fetch("http://liverun.co.kr/liveview/");
  const html = await res.text();
  const $ = cheerio.load(html);
  const events = [];

  $("tr").each((_, row) => {
    const link = $(row).find('a[href*="query.php"]');
    if (!link.length) return;

    const href = link.attr("href") || "";
    const pidMatch = href.match(/pid=(\d+)/);
    const rtypeMatch = href.match(/rtype=(\d+)/);
    if (!pidMatch) return;

    const cells = $(row).find("td");
    const name = cells.eq(1).text().trim() || link.text().trim();
    const dateText = cells.eq(2).text().trim();
    const location = cells.eq(3).text().trim();

    if (dateText && dateText.startsWith(String(year))) {
      events.push({
        source: "liverun",
        sourceId: pidMatch[1],
        sourceExtra: { rtype: rtypeMatch ? rtypeMatch[1] : "1" },
        name,
        date: dateText,
        distances: "",
        location,
      });
    }
  });

  return events;
}

// ─── SPCT (time.spct.kr) ─────────────────────────────────────

async function discoverSPCT(year) {
  const allEvents = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `https://time.spct.kr/main.php?TargetYear=${year}&searchEventName=&currentPage=${page}`;
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    if (page === 1) {
      const totalText = $(".paging .total").text().trim().replace("/", "");
      if (totalText) totalPages = parseInt(totalText) || 1;
    }

    $('a[href*="EVENT_NO"]').each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      const match = href.match(/EVENT_NO=([^&]+)/);
      if (match && text) {
        const eventNo = match[1];
        const dateStr = eventNo.replace(/^(\d{4})(\d{2})(\d{2}).*/, "$1-$2-$3");
        allEvents.push({
          source: "spct",
          sourceId: eventNo,
          name: text,
          date: dateStr,
          distances: "",
          location: "",
        });
      }
    });

    if (page < totalPages) await sleep(DELAY_MS);
    page++;
  }

  return allEvents;
}

// ─── SmartChip (smartchip.co.kr) ─────────────────────────────

async function discoverSmartChip(year) {
  const res = await fetch("https://smartchip.co.kr/main.html", {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://smartchip.co.kr/',
      'Connection': 'keep-alive'
    },
    redirect: 'follow'
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const events = [];
  const idToMeta = new Map();

  // 포스터 슬라이드에서 이미지와 ID 매핑 추출
  $(".swiper-slide[onclick*='usedata=']").each((_, el) => {
    const onclick = $(el).attr("onclick") || "";
    const style = $(el).attr("style") || "";
    
    const idMatch = onclick.match(/usedata=(\d+)/);
    const imgMatch = style.match(/url\(images\/([^)]+)\)/);
    
    if (idMatch && imgMatch) {
      const id = idMatch[1];
      const posterFile = imgMatch[1];
      // 파일명에서 대회명 추론 (예: "2026경주벚꽃_포스터.jpg" → "경주벚꽃")
      const nameGuess = posterFile
        .replace(/^20\d{2}_?\d*_?/, "") // 연도 제거
        .replace(/_?포스터.*/, "") // 포스터 제거
        .replace(/_poster.*/, "")
        .replace(/\.jpg$/, "")
        .replace(/_/g, " ")
        .trim();
      
      idToMeta.set(id, {
        posterUrl: `https://smartchip.co.kr/images/${posterFile}`,
        nameGuess: nameGuess || null,
      });
    }
  });

  // 리스트에서 대회명과 날짜 추출
  $("li[onclick*='selectItem']").each((_, el) => {
    const onclick = $(el).attr("onclick") || "";
    const match = onclick.match(/selectItem\('([^']+)',\s*'(\d+)'\)/);
    if (match) {
      const fullText = match[1]; // "(2026-03-28) 2026 팀 K리그 런"
      const id = match[2];
      
      const dateMatch = fullText.match(/\((\d{4}-\d{2}-\d{2})\)/);
      const nameMatch = fullText.replace(/^\([^)]+\)\s*/, "");
      
      if (!idToMeta.has(id)) {
        idToMeta.set(id, {});
      }
      const meta = idToMeta.get(id);
      meta.name = nameMatch || null;
      meta.date = dateMatch ? dateMatch[1] : "";
    }
  });

  const yearPrefix = String(year);
  for (const [id, meta] of idToMeta.entries()) {
    if (!id.startsWith(yearPrefix)) continue;
    
    events.push({
      source: "smartchip",
      sourceId: id,
      name: meta.name || meta.nameGuess || `SmartChip Event ${id}`,
      date: meta.date || "",
      distances: "",
      location: "",
      posterUrl: meta.posterUrl || null,
      needsNameResolution: !meta.name,
    });
  }

  return events;
}

// ─── Chuncheon (marathonapi.chosun.com) ──────────────────────

async function discoverChuncheon(year) {
  return [
    {
      source: "chuncheon",
      sourceId: `year=${year}`,
      name: `${year} 춘천마라톤`,
      date: `${year}-10-26`,
      distances: "full,half,10K,5K,3K",
      location: "춘천",
    },
  ];
}

// ─── 메인 ─────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const yearIdx = args.indexOf("--year");
  const sourceIdx = args.indexOf("--source");
  const showAll = args.includes("--all");

  const year = yearIdx >= 0 ? parseInt(args[yearIdx + 1]) : new Date().getFullYear();
  const sourceFilter = sourceIdx >= 0 ? args[sourceIdx + 1] : null;

  console.log(`[이벤트 발견] ${year}년 대회 목록 수집\n`);

  const sources = {
    marazone: discoverMarazone,
    myresult: discoverMyResult,
    liverun: discoverLiveRun,
    spct: discoverSPCT,
    smartchip: discoverSmartChip,
    chuncheon: discoverChuncheon,
  };

  const allEvents = [];

  for (const [name, fn] of Object.entries(sources)) {
    if (sourceFilter && name !== sourceFilter) continue;

    try {
      console.log(`  [${name}] 조회 중...`);
      const events = await fn(year);
      console.log(`  [${name}] ${events.length}개 발견`);
      allEvents.push(...events);
    } catch (err) {
      console.error(`  [${name}] 오류: ${err.message}`);
    }
  }

  allEvents.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  console.log(`\n총 ${allEvents.length}개 대회 발견\n`);

  if (showAll || !sourceFilter) {
    const bySource = {};
    allEvents.forEach((e) => {
      bySource[e.source] = (bySource[e.source] || 0) + 1;
    });
    console.log("소스별:");
    for (const [s, c] of Object.entries(bySource)) {
      console.log(`  ${s}: ${c}개`);
    }
    console.log("");
  }

  allEvents.forEach((e) => {
    console.log(`  ${e.date || "????"} | ${e.source.padEnd(10)} | ${e.name}`);
  });

  const outPath = path.join(__dirname, "..", "data", `discovered-events-${year}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ year, events: allEvents }, null, 2));
  console.log(`\n저장: ${outPath}`);
}

main().catch((err) => {
  console.error("오류:", err);
  process.exit(1);
});
