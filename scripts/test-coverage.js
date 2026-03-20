#!/usr/bin/env node

/**
 * DMC 스크래핑 커버리지 테스트 v2
 *
 * event-sources.json의 매핑을 활용하여 GT 대회별로 적절한 소스에서 검색.
 * SmartChip(이벤트 ID 기반), Chuncheon API(시간 매칭), Marazone/Liverun(sweep) 지원.
 *
 * 사용법:
 *   node test-coverage.js                       # 전체 GT 대회 테스트
 *   node test-coverage.js --race chuncheon-2025  # 특정 대회만
 *   node test-coverage.js --race asia-open-2025  # 특정 대회만
 *   node test-coverage.js --sample 5             # 회원 5명 샘플
 */

const fs = require("fs");
const path = require("path");
const { load: cheerioLoad } = require("cheerio");

const DATA_DIR = path.join(__dirname, "..", "data");
const GT_PATH = path.join(DATA_DIR, "ground-truth.json");
const EVENTS_PATH = path.join(DATA_DIR, "event-sources.json");
const REPORT_PATH = path.join(DATA_DIR, "coverage-report.json");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalizeTime(raw) {
  const t = String(raw || "").trim().replace(/^(\d):/, "0$1:");
  const m3 = t.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (m3) return `${m3[1].padStart(2, "0")}:${m3[2]}:${m3[3]}`;
  return t;
}

function timeToSeconds(t) {
  const parts = (t || "").split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function timesMatch(a, b, toleranceSec = 10) {
  if (!a || !b) return false;
  const na = normalizeTime(a);
  const nb = normalizeTime(b);
  if (na === nb) return true;
  return Math.abs(timeToSeconds(na) - timeToSeconds(nb)) <= toleranceSec;
}

// ─── SmartChip Source ────────────────────────────────────────

const SMARTCHIP_URL = "https://www.smartchip.co.kr/return_data_livephoto.asp";

async function smartchipSearch(eventId, name) {
  const params = new URLSearchParams();
  params.append("nameorbibno", name);
  params.append("usedata", eventId);

  const res = await fetch(SMARTCHIP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const html = await res.text();

  if (html.includes("검색 결과가 없습니다") || html.length < 5000) return null;

  const $ = cheerioLoad(html);
  const jamsil = [];
  $(".jamsil-bold-center").each((_, el) => {
    const text = $(el).text().replace(/&nbsp;/g, "").trim();
    if (text) jamsil.push(text);
  });

  function extractKeyAndDecrypt(pageHtml, secret) {
    if (!secret) return "";
    const keyMatch = pageHtml.match(/const\s+_k\s*=\s*\[([\d,\s]+)\]/);
    const xorMatch = pageHtml.match(/\^\s*(\d+)\s*;/);
    let keyArray, xorMask;
    if (keyMatch) {
      keyArray = keyMatch[1].split(",").map(n => parseInt(n.trim()));
      xorMask = xorMatch ? parseInt(xorMatch[1]) : 170;
    } else {
      keyArray = [1, 4, 11, 14, 0, 9, 8].map(n => n + 100);
      xorMask = 0;
    }
    let text = "";
    for (let i = 0; i < secret.length; i += 4) {
      const code = parseInt(secret.substr(i, 4), 16);
      const kCode = keyArray[(i / 4) % keyArray.length] ^ xorMask;
      text += String.fromCharCode(code ^ kCode);
    }
    return text;
  }

  const encMatch = html.match(/drawTextCanvas\s*\(\s*"targetClock"\s*,\s*"([0-9a-fA-F]+)"\s*\)/);
  const netTime = encMatch ? extractKeyAndDecrypt(html, encMatch[1]) : "";
  const distance = jamsil[1] || "";
  let bib = "";
  for (let i = 0; i < jamsil.length; i++) {
    if (jamsil[i] === "BIB" && jamsil[i + 1]) { bib = jamsil[i + 1].trim(); break; }
  }

  return {
    realName: jamsil[0] || name,
    bib,
    distance,
    netTime: normalizeTime(netTime),
  };
}

// ─── MyResult Source (myresult.co.kr) ────────────────────────

const MYRESULT_API = "https://myresult.co.kr/api";

async function myresultSearch(eventId, name) {
  const url = `${MYRESULT_API}/event/${eventId}/player?q=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const players = await res.json();
  return players.map(p => ({
    realName: p.name || "",
    bib: String(p.num || ""),
    distance: p.course_cd || "",
    netTime: normalizeTime(p.result_nettime || ""),
    gender: (p.gender || "M").toUpperCase(),
  }));
}

// ─── Chuncheon Marathon Source ────────────────────────────────

const CHUNCHEON_API = "https://marathonapi.chosun.com/v1/record";

async function chuncheonFetchPage(year, code, gender, page) {
  const res = await fetch(`${CHUNCHEON_API}/current`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "year", code, year, gender, age: "all", page }),
  });
  if (!res.ok) return { records: [], totalCnt: 0 };
  const json = await res.json();
  if (!json.data?.recordDtoList?.length) return { records: [], totalCnt: json.data?.totalCnt || 0 };
  const records = json.data.recordDtoList.map(r => ({
    bib: r.baebun,
    netTime: normalizeTime((r.netFull || "").replace(/^(\d):/, "0$1:")),
    gunTime: normalizeTime((r.gunFull || "").replace(/^(\d):/, "0$1:")),
    gender, rank: r.rankTotal, distance: code === "1" ? "full" : "10K",
  }));
  return { records, totalCnt: json.data.totalCnt };
}

async function chuncheonFetchUntilTime(year, code, gender, maxTimeSec) {
  const results = [];
  let page = 0;
  const maxPages = 200;
  while (page < maxPages) {
    const { records, totalCnt } = await chuncheonFetchPage(year, code, gender, page);
    if (!records.length) break;
    results.push(...records);
    const lastTime = timeToSeconds(records[records.length - 1].netTime);
    if (lastTime > maxTimeSec + 300) break;
    if (results.length >= totalCnt) break;
    page++;
    await sleep(150);
  }
  return results;
}

// ─── SPCT Source (time.spct.kr) ──────────────────────────────

async function spctSearch(eventId, name) {
  const url = `https://time.spct.kr/m1.php?TargetYear=${eventId.slice(0, 4)}&EVENT_NO=${eventId}&currentPage=1&searchResultsName=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  const html = await res.text();

  const redirect = html.match(/location\.href\s*=\s*"(m2\.php[^"]+)"/);
  if (redirect) {
    const detail = await fetch(`https://time.spct.kr/${redirect[1]}`);
    const dhtml = await detail.text();
    return spctParseDetail(dhtml, name);
  }

  const { load } = require("cheerio");
  const $ = load(html);
  const links = [];
  $("a[href*='m2.php']").each((_, a) => {
    const href = $(a).attr("href");
    if (href && !links.includes(href)) links.push(href);
  });

  if (links.length > 0) {
    const results = [];
    for (const link of links) {
      const detail = await fetch(`https://time.spct.kr/${link}`);
      const dhtml = await detail.text();
      results.push(spctParseDetail(dhtml, name));
      await sleep(300);
    }
    return results;
  }

  return null;
}

function spctParseDetail(html, fallbackName) {
  const nameEl = html.match(/<p class='name'>\s*([\s\S]*?)<\/p>/);
  let realName = fallbackName;
  let genderDist = "";
  if (nameEl) {
    const spanMatch = nameEl[1].match(/<span>(.*?)<\/span>/);
    genderDist = spanMatch ? spanMatch[1].trim() : "";
    realName = nameEl[1].replace(/<span>.*?<\/span>/, "").trim() || fallbackName;
  }
  const timeEl = html.match(/<div class='time'>\s*([\s\S]*?)<\/div>/);
  const rawTime = timeEl ? timeEl[1].trim() : "";

  return {
    realName,
    distance: genderDist,
    netTime: normalizeTime(rawTime),
  };
}

// ─── Test Logic ──────────────────────────────────────────────

async function testSmartChipRace(raceGT, eventConfig, sampleMembers) {
  const eventId = eventConfig.sourceId;
  console.log(`\n  [SmartChip] event=${eventId}`);

  const gtRecords = sampleMembers
    ? raceGT.records.filter(r => sampleMembers.has(r.realName))
    : raceGT.records;

  let found = 0;
  const details = [];

  for (const rec of gtRecords) {
    if (!rec.time) {
      details.push({ ...rec, status: "SKIP_NO_TIME" });
      continue;
    }
    await sleep(300);
    process.stdout.write(`    ${rec.realName} ... `);
    try {
      const result = await smartchipSearch(eventId, rec.realName);
      if (result && timesMatch(rec.time, result.netTime)) {
        found++;
        console.log(`FOUND ${result.netTime}`);
        details.push({ ...rec, status: "FOUND", scrapedTime: result.netTime });
      } else if (result) {
        console.log(`TIME_MISMATCH (GT:${rec.time} vs SC:${result.netTime})`);
        details.push({ ...rec, status: "TIME_MISMATCH", scrapedTime: result.netTime });
      } else {
        console.log(`NOT_FOUND`);
        details.push({ ...rec, status: "NOT_FOUND" });
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      details.push({ ...rec, status: "ERROR" });
    }
  }

  const withTime = gtRecords.filter(r => r.time);
  const recall = withTime.length > 0 ? (found / withTime.length * 100).toFixed(1) : "N/A";
  console.log(`    결과: ${found}/${withTime.length} (recall: ${recall}%)`);

  return { source: "smartchip", eventId, found, total: withTime.length, recall, details };
}

async function testChuncheonRace(raceGT, eventConfig, sampleMembers) {
  console.log(`\n  [춘천마라톤 API] 시간 매칭 방식`);

  const gtRecords = sampleMembers
    ? raceGT.records.filter(r => sampleMembers.has(r.realName))
    : raceGT.records;

  const year = eventConfig.sourceId?.replace("year=", "") || "2025";

  const fullGTTimes = gtRecords.filter(r => r.distance === "full" && r.time).map(r => timeToSeconds(r.time));
  const tenGTTimes = gtRecords.filter(r => r.distance === "10K" && r.time).map(r => timeToSeconds(r.time));
  const maxFullTime = fullGTTimes.length ? Math.max(...fullGTTimes) : 0;
  const maxTenTime = tenGTTimes.length ? Math.max(...tenGTTimes) : 0;

  console.log(`    기록 다운로드 중 (GT 시간 범위까지만)...`);
  const fullM = maxFullTime > 0 ? await chuncheonFetchUntilTime(year, "1", "M", maxFullTime) : [];
  const fullF = maxFullTime > 0 ? await chuncheonFetchUntilTime(year, "1", "F", maxFullTime) : [];
  const tenM = maxTenTime > 0 ? await chuncheonFetchUntilTime(year, "2", "M", maxTenTime) : [];
  const tenF = maxTenTime > 0 ? await chuncheonFetchUntilTime(year, "2", "F", maxTenTime) : [];

  const allResults = [...fullM, ...fullF, ...tenM, ...tenF];
  console.log(`    ${allResults.length}건 다운로드 (full M:${fullM.length} F:${fullF.length}, 10K M:${tenM.length} F:${tenF.length})`);

  let found = 0;
  const details = [];

  for (const rec of gtRecords) {
    if (!rec.time) {
      details.push({ ...rec, status: "SKIP_NO_TIME" });
      continue;
    }

    const match = allResults.find(r => timesMatch(rec.time, r.netTime, 5));
    if (match) {
      found++;
      details.push({ ...rec, status: "FOUND", scrapedTime: match.netTime, bib: match.bib });
    } else {
      const gunMatch = allResults.find(r => timesMatch(rec.time, r.gunTime, 5));
      if (gunMatch) {
        found++;
        details.push({ ...rec, status: "FOUND_GUN", scrapedTime: gunMatch.gunTime, bib: gunMatch.bib });
      } else {
        details.push({ ...rec, status: "NOT_FOUND" });
      }
    }
  }

  const withTime = gtRecords.filter(r => r.time);
  const recall = withTime.length > 0 ? (found / withTime.length * 100).toFixed(1) : "N/A";
  console.log(`    결과: ${found}/${withTime.length} (recall: ${recall}%)`);

  return { source: "chuncheon", found, total: withTime.length, recall, details };
}

async function testSPCTRace(raceGT, eventConfig, sampleMembers) {
  const eventId = eventConfig.sourceId;
  console.log(`\n  [SPCT] event=${eventId}`);

  const gtRecords = sampleMembers
    ? raceGT.records.filter(r => sampleMembers.has(r.realName))
    : raceGT.records;

  let found = 0;
  const details = [];

  for (const rec of gtRecords) {
    if (!rec.time) {
      details.push({ ...rec, status: "SKIP_NO_TIME" });
      continue;
    }
    await sleep(500);
    process.stdout.write(`    ${rec.realName} ... `);
    try {
      const result = await spctSearch(eventId, rec.realName);
      if (!result) {
        console.log(`NOT_FOUND`);
        details.push({ ...rec, status: "NOT_FOUND" });
        continue;
      }

      const results = Array.isArray(result) ? result : [result];
      const match = results.find(r => timesMatch(rec.time, r.netTime));
      if (match) {
        found++;
        console.log(`FOUND ${match.netTime}`);
        details.push({ ...rec, status: "FOUND", scrapedTime: match.netTime });
      } else {
        console.log(`TIME_MISMATCH (GT:${rec.time} vs SPCT:${results[0].netTime})`);
        details.push({ ...rec, status: "TIME_MISMATCH", scrapedTime: results[0].netTime });
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      details.push({ ...rec, status: "ERROR" });
    }
  }

  const withTime = gtRecords.filter(r => r.time);
  const recall = withTime.length > 0 ? (found / withTime.length * 100).toFixed(1) : "N/A";
  console.log(`    결과: ${found}/${withTime.length} (recall: ${recall}%)`);

  return { source: "spct", eventId, found, total: withTime.length, recall, details };
}

async function testMyResultRace(raceGT, eventConfig, sampleMembers) {
  const eventId = eventConfig.sourceId;
  console.log(`\n  [MyResult] event=${eventId}`);

  const gtRecords = sampleMembers
    ? raceGT.records.filter(r => sampleMembers.has(r.realName))
    : raceGT.records;

  let found = 0;
  const details = [];

  for (const rec of gtRecords) {
    if (!rec.time) {
      details.push({ ...rec, status: "SKIP_NO_TIME" });
      continue;
    }
    await sleep(300);
    process.stdout.write(`    ${rec.realName} ... `);
    try {
      const results = await myresultSearch(eventId, rec.realName);
      const match = results.find(r => timesMatch(rec.time, r.netTime));
      if (match) {
        found++;
        console.log(`FOUND ${match.netTime} (#${match.bib})`);
        details.push({ ...rec, status: "FOUND", scrapedTime: match.netTime, bib: match.bib });
      } else if (results.length > 0) {
        console.log(`TIME_MISMATCH (GT:${rec.time} vs API:${results[0].netTime})`);
        details.push({ ...rec, status: "TIME_MISMATCH", scrapedTime: results[0].netTime });
      } else {
        console.log(`NOT_FOUND`);
        details.push({ ...rec, status: "NOT_FOUND" });
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      details.push({ ...rec, status: "ERROR" });
    }
  }

  const withTime = gtRecords.filter(r => r.time);
  const recall = withTime.length > 0 ? (found / withTime.length * 100).toFixed(1) : "N/A";
  console.log(`    결과: ${found}/${withTime.length} (recall: ${recall}%)`);

  return { source: "myresult", eventId, found, total: withTime.length, recall, details };
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
      flags[key] = val;
    }
  }

  const gt = JSON.parse(fs.readFileSync(GT_PATH, "utf-8"));
  const eventSources = JSON.parse(fs.readFileSync(EVENTS_PATH, "utf-8"));

  const totalRecords = gt.races.reduce((s, r) => s + r.records.length, 0);
  const recordsWithTime = gt.races.reduce((s, r) => s + r.records.filter(x => x.time).length, 0);

  console.log(`\n${"━".repeat(60)}`);
  console.log(`DMC 스크래핑 커버리지 테스트 v2`);
  console.log(`${"━".repeat(60)}`);
  console.log(`Ground Truth: ${gt.races.length}개 대회, ${totalRecords}건 기록 (시간 있는 것: ${recordsWithTime}건)`);

  let sampleMembers = null;
  if (flags.sample) {
    const memberCounts = new Map();
    for (const race of gt.races) {
      for (const rec of race.records) {
        memberCounts.set(rec.realName, (memberCounts.get(rec.realName) || 0) + 1);
      }
    }
    const sorted = [...memberCounts.entries()].sort((a, b) => b[1] - a[1]);
    const n = parseInt(flags.sample);
    sampleMembers = new Set(sorted.slice(0, n).map(([name]) => name));
    console.log(`샘플 모드: ${n}명 — ${[...sampleMembers].join(", ")}`);
  }

  const targetRace = flags.race;
  const races = targetRace
    ? gt.races.filter(r => r.id === targetRace)
    : gt.races;

  const report = {
    timestamp: new Date().toISOString(),
    totalGT: recordsWithTime,
    raceResults: [],
    overallFound: 0,
    overallTotal: 0,
  };

  for (const race of races) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`대회: ${race.name} (${race.date}) — ${race.records.length}건`);

    const eventConfig = eventSources.events.find(e => e.gtId === race.id);
    if (!eventConfig) {
      console.log(`  ⚠️ event-sources.json에 매핑 없음`);
      report.raceResults.push({ race: race.id, status: "NO_MAPPING" });
      continue;
    }

    if (!eventConfig.scrapable) {
      console.log(`  ⛔ 스크래핑 불가: ${eventConfig.source} — ${eventConfig.apiNotes || ""}`);
      report.raceResults.push({ race: race.id, status: "NOT_SCRAPABLE", source: eventConfig.source });
      continue;
    }

    let result;
    switch (eventConfig.source) {
      case "spct":
        result = await testSPCTRace(race, eventConfig, sampleMembers);
        break;
      case "smartchip":
        result = await testSmartChipRace(race, eventConfig, sampleMembers);
        break;
      case "chuncheon":
        result = await testChuncheonRace(race, eventConfig, sampleMembers);
        break;
      case "myresult":
        result = await testMyResultRace(race, eventConfig, sampleMembers);
        break;
      default:
        console.log(`  ⚠️ 지원되지 않는 소스: ${eventConfig.source}`);
        result = { source: eventConfig.source, found: 0, total: 0, recall: "N/A" };
    }

    report.raceResults.push({ race: race.id, ...result });
    report.overallFound += result.found || 0;
    report.overallTotal += result.total || 0;
  }

  // Summary
  console.log(`\n${"━".repeat(60)}`);
  console.log(`종합 결과`);
  console.log(`${"━".repeat(60)}`);

  let scrapableTotal = 0, scrapableFound = 0;
  for (const r of report.raceResults) {
    if (r.status === "NOT_SCRAPABLE") {
      console.log(`  ⛔ ${r.race}: 스크래핑 불가 (${r.source})`);
    } else if (r.status === "NO_MAPPING") {
      console.log(`  ⚠️ ${r.race}: 매핑 없음`);
    } else {
      const icon = parseFloat(r.recall) >= 80 ? "✅" : parseFloat(r.recall) >= 50 ? "🟡" : "❌";
      console.log(`  ${icon} ${r.race}: recall ${r.recall}% (${r.found}/${r.total})`);
      scrapableTotal += r.total || 0;
      scrapableFound += r.found || 0;
    }
  }

  const overallRecall = scrapableTotal > 0
    ? (scrapableFound / scrapableTotal * 100).toFixed(1) + "%"
    : "N/A";
  const theoreticalMax = recordsWithTime > 0
    ? (scrapableTotal / recordsWithTime * 100).toFixed(1) + "%"
    : "N/A";

  console.log(`\n  스크래핑 가능 대회 recall: ${overallRecall} (${scrapableFound}/${scrapableTotal})`);
  console.log(`  이론적 최대 커버리지: ${theoreticalMax} (${scrapableTotal}/${recordsWithTime} GT 기록)`);
  console.log(`  스크래핑 불가: ${recordsWithTime - scrapableTotal}건 (MyResult, 자체사이트, 해외 등)`);

  report.overallRecall = overallRecall;
  report.theoreticalMax = theoreticalMax;

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf-8");
  console.log(`\n💾 상세 리포트: ${REPORT_PATH}`);
}

main().catch(e => {
  console.error(`\n❌ 오류: ${e.message}`);
  process.exit(1);
});
