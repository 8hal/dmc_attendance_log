#!/usr/bin/env node

/**
 * DMC 대회 기록 스크래핑 도구
 *
 * 지원 소스:
 *   spct      : time.spct.kr     — 전체 카테고리 자동 순회 + 이름 검색 + 상세 페이지
 *   smartchip : smartchip.co.kr  — 이름/배번 검색 + XOR 암호 해독
 *   myresult  : myresult.co.kr   — REST API 이름/배번 검색 (JTBC 마라톤 등)
 *   irunman   : irunman.kr       — form POST 이름 검색
 *   liverun   : liverun.co.kr    — 이름/배번 검색 + 상세 스플릿
 *   marazone  : raceresult.co.kr — REST API 기반 기록 조회
 *   manual    : 수동 JSON 파일 가져오기
 *
 * 사용법:
 *   node scrape-results.js --source spct --url <URL> [옵션]
 *   node scrape-results.js --source smartchip --event <ID> --search-members
 *   node scrape-results.js --list-members
 *   node scrape-results.js --help
 */

const fs = require("fs");
const path = require("path");
const { load: cheerioLoad } = require("cheerio");

const DATA_DIR = path.join(__dirname, "..", "data");
const MEMBERS_PATH = path.join(DATA_DIR, "members.json");
const RACES_PATH = path.join(DATA_DIR, "races.json");

// ─── Utilities ───────────────────────────────────────────────

const DIST_ALIASES = {
  "5km": "5K", "5k": "5K", "5K": "5K",
  "10km": "10K", "10k": "10K", "10K": "10K",
  "half": "half", "하프": "half", "Half": "half", "HALF": "half",
  "하프마라톤": "half", "Half Marathon": "half",
  "21.0975km": "half", "21km": "half", "21.1km": "half",
  "full": "full", "풀": "full", "Full": "full", "FULL": "full",
  "풀코스": "full", "42.195km": "full", "42km": "full",
  "marathon": "full", "Marathon": "full",
  "ultra": "ultra", "울트라": "ultra", "Ultra": "ultra",
  "20km": "20K", "20k": "20K", "20K": "20K", "20Km": "20K",
  "50km": "ultra", "50k": "ultra", "100km": "ultra", "100k": "ultra",
};

function normalizeDistance(raw) {
  const trimmed = String(raw || "").trim();
  if (DIST_ALIASES[trimmed]) return DIST_ALIASES[trimmed];
  for (const [key, val] of Object.entries(DIST_ALIASES)) {
    if (trimmed.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return trimmed || "unknown";
}

function normalizeTime(raw) {
  const t = String(raw || "").trim();
  const m3 = t.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (m3) return `${m3[1].padStart(2, "0")}:${m3[2]}:${m3[3]}`;
  const m2 = t.match(/^(\d{1,2}):(\d{2})(?:\.\d+)?$/);
  if (m2) return `00:${m2[1].padStart(2, "0")}:${m2[2]}`;
  return t;
}

function inferGender(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("남") || t.includes("male")) return "M";
  if (t.includes("여") || t.includes("female")) return "F";
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadMembers() {
  return JSON.parse(fs.readFileSync(MEMBERS_PATH, "utf-8")).members || [];
}

function loadRaces() {
  if (!fs.existsSync(RACES_PATH)) return [];
  return JSON.parse(fs.readFileSync(RACES_PATH, "utf-8")).races || [];
}

function saveRaces(races) {
  fs.writeFileSync(RACES_PATH, JSON.stringify({ races }, null, 2) + "\n", "utf-8");
}

function generateRaceId(date, name) {
  const d = (date || "unknown").replace(/-/g, "");
  const n = name.replace(/[^a-zA-Z0-9가-힣]/g, "").slice(0, 20).toLowerCase();
  return `${d}-${n || "race"}`;
}

// ─── SPCT Scraper (time.spct.kr) ─────────────────────────────

async function spctFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function spctParseEventInfo(html) {
  const $ = cheerioLoad(html);
  const h3 = $("h3").first().text().trim();
  const title = h3.split("\n")[0].trim();
  const dateMatch = h3.match(/(\d{4}-\d{2}-\d{2})/);
  return { title, date: dateMatch ? dateMatch[1] : null };
}

function spctParseCourses(html) {
  const $ = cheerioLoad(html);
  const courses = [];
  $("select[name='rankingcourse'] option").each((_, el) => {
    const val = $(el).attr("value");
    const label = $(el).text().trim();
    if (val) courses.push({ value: val, label });
  });
  return courses;
}

function spctParseResultsTable(html, courseLabel) {
  const $ = cheerioLoad(html);
  const results = [];
  $(".content table tbody tr").each((_, row) => {
    const cells = [];
    $(row).find("td").each((__, cell) => {
      cells.push($(cell).text().trim());
    });
    if (cells.length < 3) return;
    if (cells.join("").includes("※") || cells.join("").includes("위 기록은")) return;

    const rank = parseInt(cells[0]);
    if (isNaN(rank) || rank <= 0) return;

    const bib = cells[1].replace(/\D/g, "");
    const name = cells[2];
    const time = cells[3] || "";

    const dist = normalizeDistance(courseLabel);
    const gender = inferGender(courseLabel);

    results.push({
      realName: name,
      bib,
      distance: dist,
      netTime: normalizeTime(time),
      gunTime: "",
      overallRank: rank,
      gender: gender || "M",
    });
  });
  return results;
}

async function spctParseDetailPage(html) {
  const $ = cheerioLoad(html);
  const nameSpan = $(".content .name").text().trim();
  const nameMatch = nameSpan.match(/^(.+?)\s*$/);
  const name = $(".content .name").clone().children().remove().end().text().trim();
  const genderDist = $(".content .name span").text().trim();
  const bib = $(".content .tag span").first().text().trim();
  const time = $(".content .record .time").text().trim();

  const startMatch = $(".content .record").text().match(/Start Time\s*:\s*([\d:.]+)/);
  const finishMatch = $(".content .record").text().match(/Finish Time\s*:\s*([\d:.]+)/);

  const rankings = {};
  $(".content .rank li").each((_, li) => {
    const label = $(li).find("p").first().text().replace(/\s+/g, " ").trim();
    const spans = $(li).find("p").last().find("span");
    const rank = parseInt(spans.first().text().trim());
    const total = parseInt(spans.last().text().replace("/", "").trim());
    if (!isNaN(rank)) rankings[label] = { rank, total: isNaN(total) ? null : total };
  });

  const splits = [];
  $(".content table tbody tr").each((_, row) => {
    const cells = [];
    $(row).find("td").each((__, cell) => cells.push($(cell).text().trim()));
    if (cells.length >= 2) splits.push({ section: cells[0], time: cells[1] });
  });

  const gender = inferGender(genderDist);
  const dist = normalizeDistance(genderDist.replace(/[MF]\s*/i, ""));

  return {
    realName: name,
    bib,
    distance: dist,
    netTime: normalizeTime(time),
    gunTime: "",
    gender: gender || "M",
    startTime: startMatch ? startMatch[1] : null,
    finishTime: finishMatch ? finishMatch[1] : null,
    rankings,
    splits,
  };
}

async function spctSearchMember(baseUrl, memberName) {
  const url = new URL(baseUrl);
  url.searchParams.set("searchResultsName", memberName);
  const html = await spctFetch(url.toString());

  const redirectMatch = html.match(/location\.href\s*=\s*"(m2\.php[^"]+)"/);
  if (redirectMatch) {
    const detailUrl = new URL(redirectMatch[1], url.origin);
    const detailHtml = await spctFetch(detailUrl.toString());
    return await spctParseDetailPage(detailHtml);
  }

  const $ = cheerioLoad(html);
  const links = [];
  $(".content table a[href*='m2.php']").each((_, a) => {
    const href = $(a).attr("href");
    if (href && !links.includes(href)) links.push(href);
  });

  if (links.length > 0) {
    const results = [];
    const seen = new Set();
    for (const link of links) {
      const bibMatch = link.match(/BIB_NO=(\d+)/);
      const bibKey = bibMatch ? bibMatch[1] : link;
      if (seen.has(bibKey)) continue;
      seen.add(bibKey);
      const detailUrl = new URL(link, url.origin);
      const detailHtml = await spctFetch(detailUrl.toString());
      results.push(await spctParseDetailPage(detailHtml));
      await sleep(300);
    }
    return results.length === 1 ? results[0] : results;
  }

  return null;
}

async function scrapeSPCT(url, flags, members) {
  console.log(`[SPCT] Fetching: ${url}`);
  const html = await spctFetch(url);
  const { title, date } = spctParseEventInfo(html);
  console.log(`[SPCT] 대회: ${title} (${date || "날짜 미확인"})`);

  if (flags["search-members"]) {
    console.log(`[SPCT] 회원 이름 검색 모드 (${members.length}명)`);
    const results = [];
    for (const m of members) {
      process.stdout.write(`  검색: ${m.realName} ... `);
      await sleep(500);
      try {
        const found = await spctSearchMember(url, m.realName);
        if (!found) {
          console.log("❌ 미발견");
        } else if (Array.isArray(found)) {
          console.log(`✅ ${found.length}건`);
          results.push(...found);
        } else {
          console.log(`✅ ${found.distance} ${found.netTime}`);
          results.push(found);
        }
      } catch (e) {
        console.log(`⚠️ 오류: ${e.message}`);
      }
    }
    return { title, date, results, source: "spct", sourceUrl: url };
  }

  const courses = spctParseCourses(html);
  if (courses.length === 0) {
    console.log("[SPCT] 카테고리를 찾을 수 없습니다. 현재 페이지를 파싱합니다.");
    const results = spctParseResultsTable(html, "unknown");
    return { title, date, results, source: "spct", sourceUrl: url };
  }

  console.log(`[SPCT] ${courses.length}개 카테고리 발견: ${courses.map(c => c.label).join(", ")}`);
  const allResults = [];
  for (const course of courses) {
    const courseUrl = new URL(url);
    courseUrl.searchParams.set("rankingcourse", course.value);
    courseUrl.searchParams.set("currentPage", "1");
    process.stdout.write(`  [${course.label}] ... `);
    await sleep(300);

    const courseHtml = await spctFetch(courseUrl.toString());
    const results = spctParseResultsTable(courseHtml, course.label);
    console.log(`${results.length}건`);
    allResults.push(...results);
  }

  return { title, date, results: allResults, source: "spct", sourceUrl: url };
}

// ─── SmartChip Scraper (smartchip.co.kr) ─────────────────────

function smartchipDecryptWithKey(secret, keyArray, xorMask) {
  if (!secret) return "";
  let text = "";
  for (let i = 0; i < secret.length; i += 4) {
    const code = parseInt(secret.substr(i, 4), 16);
    const kCode = keyArray[(i / 4) % keyArray.length] ^ xorMask;
    text += String.fromCharCode(code ^ kCode);
  }
  return text;
}

function smartchipExtractKeyAndDecrypt(html, secret) {
  const keyMatch = html.match(/const\s+_k\s*=\s*\[([\d,\s]+)\]/);
  const xorMatch = html.match(/\^\s*(\d+)\s*;/);
  if (keyMatch) {
    const keyArray = keyMatch[1].split(",").map(n => parseInt(n.trim()));
    const xorMask = xorMatch ? parseInt(xorMatch[1]) : 170;
    return smartchipDecryptWithKey(secret, keyArray, xorMask);
  }
  const legacyKey = [1, 4, 11, 14, 0, 9, 8].map(n => n + 100);
  return smartchipDecryptWithKey(secret, legacyKey, 0);
}

async function scrapeSmartChip(eventId, flags, members) {
  const baseUrl = "https://www.smartchip.co.kr/return_data_livephoto.asp";
  const searchTargets = flags["search-members"] ? members : [];
  const singleName = flags.name;

  if (!searchTargets.length && !singleName && !flags.bib) {
    console.log("[SmartChip] --search-members, --name, 또는 --bib 옵션이 필요합니다.");
    return { title: "", date: null, results: [], source: "smartchip" };
  }

  const results = [];
  const queries = flags.bib
    ? [{ label: `BIB ${flags.bib}`, query: flags.bib }]
    : singleName
      ? [{ label: singleName, query: singleName }]
      : searchTargets.map(m => ({ label: m.realName, query: m.realName }));

  let eventTitle = "";

  for (const { label, query } of queries) {
    process.stdout.write(`[SmartChip] 검색: ${label} ... `);
    await sleep(500);

    try {
      const params = new URLSearchParams();
      params.append("nameorbibno", query);
      params.append("usedata", eventId);

      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const html = await res.text();

      if (html.includes("검색 결과가 없습니다") || html.length < 5000) {
        console.log("❌ 미발견");
        continue;
      }

      const $ = cheerioLoad(html);

      if (!eventTitle) {
        eventTitle = $(".box.white").first().text().trim() ||
                     $("title").text().replace("스마트칩 마라톤기록조회", "").trim();
      }

      const jamsil = [];
      $(".jamsil-bold-center").each((_, el) => {
        const text = $(el).text().replace(/&nbsp;/g, "").trim();
        if (text) jamsil.push(text);
      });

      const name = jamsil[0] || label;
      const distance = normalizeDistance(jamsil[1] || "");
      let bib = "";
      for (let i = 0; i < jamsil.length; i++) {
        if (jamsil[i] === "BIB" && jamsil[i + 1]) { bib = jamsil[i + 1].trim(); break; }
      }

      let pace = "", speed = "";
      for (let i = 0; i < jamsil.length; i++) {
        if (jamsil[i].startsWith("Pace")) pace = jamsil[i + 1] || "";
        if (jamsil[i].startsWith("Speed")) speed = jamsil[i + 1] || "";
      }

      const encryptedTime = html.match(/drawTextCanvas\s*\(\s*"targetClock"\s*,\s*"([0-9a-fA-F]+)"\s*\)/);
      let netTime = "";
      if (encryptedTime) {
        netTime = smartchipExtractKeyAndDecrypt(html, encryptedTime[1]);
      }

      const rankData = html.match(/var rawData\s*=\s*\[([^\]]*)\]/);
      const rankLabels = html.match(/var rawLabels\s*=\s*\[([^\]]*)\]/);

      const overallRank = rankData ? parseInt(rankData[1].split(",")[0]) : null;

      const splitSecrets = [];
      $(".img-text-cell[data-secret]").each((_, el) => {
        splitSecrets.push(smartchipExtractKeyAndDecrypt(html, $(el).attr("data-secret")));
      });

      console.log(`✅ ${distance} ${netTime || "(시간 해독 실패)"}`);

      results.push({
        realName: name,
        bib,
        distance,
        netTime: normalizeTime(netTime),
        gunTime: "",
        overallRank,
        gender: inferGender(name) || "M",
        pace,
        speed,
        splits: splitSecrets,
      });
    } catch (e) {
      console.log(`⚠️ 오류: ${e.message}`);
    }
  }

  return { title: eventTitle, date: flags.date || null, results, source: "smartchip" };
}

// ─── MyResult Scraper (myresult.co.kr) ───────────────────────

const MYRESULT_API = "https://myresult.co.kr/api";

async function myresultSearchPlayer(eventId, query) {
  const url = `${MYRESULT_API}/event/${eventId}/player?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  return await res.json();
}

async function scrapeMyResult(eventId, flags, members) {
  console.log(`[MyResult] event=${eventId}`);

  let eventInfo;
  try {
    const res = await fetch(`${MYRESULT_API}/event/${eventId}`, { headers: { Accept: "application/json" } });
    if (res.ok) eventInfo = await res.json();
  } catch (_) { /* ignore */ }

  const eventTitle = eventInfo?.name || `MyResult event ${eventId}`;
  const eventDate = eventInfo?.date || flags.date || null;
  console.log(`[MyResult] 대회: ${eventTitle} (${eventDate || "날짜 미확인"})`);

  const searchTargets = flags["search-members"] ? members : [];
  const singleName = flags.name;

  if (!searchTargets.length && !singleName && !flags.bib) {
    console.log("[MyResult] --search-members, --name, 또는 --bib 옵션이 필요합니다.");
    return { title: eventTitle, date: eventDate, results: [], source: "myresult" };
  }

  const results = [];
  const queries = flags.bib
    ? [{ label: `BIB ${flags.bib}`, query: flags.bib }]
    : singleName
      ? [{ label: singleName, query: singleName }]
      : searchTargets.map(m => ({ label: m.realName, query: m.realName }));

  for (const { label, query } of queries) {
    process.stdout.write(`[MyResult] 검색: ${label} ... `);
    await sleep(300);

    try {
      const players = await myresultSearchPlayer(eventId, query);
      if (!players.length) {
        console.log("❌ 미발견");
        continue;
      }

      for (const p of players) {
        const netTime = normalizeTime(p.result_nettime || "");
        const dist = normalizeDistance(p.course_cd || "");
        console.log(`✅ ${dist} ${netTime} (#${p.num})`);

        results.push({
          realName: p.name || label,
          bib: String(p.num || ""),
          distance: dist,
          netTime,
          gunTime: normalizeTime(p.result_guntime || ""),
          overallRank: null,
          gender: (p.gender || "M").toUpperCase(),
          pace: p.pace_nettime || "",
        });
      }
    } catch (e) {
      console.log(`⚠️ 오류: ${e.message}`);
    }
  }

  return {
    title: eventTitle,
    date: eventDate,
    results,
    source: "myresult",
    sourceUrl: `https://myresult.co.kr/${eventId}`,
  };
}

// ─── iRunMan Scraper (irunman.kr) ────────────────────────────

async function scrapeIRunMan(contestName, flags, members) {
  const baseUrl = "http://irunman.kr/sub3_1.php";
  const searchTargets = flags["search-members"] ? members : [];

  if (!searchTargets.length && !flags.name) {
    console.log("[iRunMan] --search-members 또는 --name (검색할 이름) 옵션이 필요합니다.");
    return { title: contestName, date: null, results: [], source: "irunman" };
  }

  const results = [];
  const queries = flags.searchName
    ? [{ label: flags.searchName, query: flags.searchName }]
    : searchTargets.map(m => ({ label: m.realName, query: m.realName }));

  for (const { label, query } of queries) {
    process.stdout.write(`[iRunMan] 검색: ${label} ... `);
    await sleep(500);

    try {
      const params = new URLSearchParams();
      params.append("contest", contestName);
      params.append("name", query);
      params.append("sex", "");

      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const html = await res.text();
      const $ = cheerioLoad(html);

      const rows = $("table.result_list tr, table.listTable tr");
      if (rows.length <= 1) {
        console.log("❌ 미발견");
        continue;
      }

      rows.each((i, row) => {
        if (i === 0) return;
        const cells = [];
        $(row).find("td").each((_, cell) => cells.push($(cell).text().trim()));
        if (cells.length < 4) return;

        const rank = parseInt(cells[0]) || null;
        const bib = cells[1] || "";
        const name = cells[2] || "";
        const time = cells[cells.length - 1] || "";
        const course = cells.length > 4 ? cells[3] : "";

        results.push({
          realName: name,
          bib,
          distance: normalizeDistance(course),
          netTime: normalizeTime(time),
          gunTime: "",
          overallRank: rank,
          gender: "M",
        });
      });

      console.log(`✅ ${results.length}건`);
    } catch (e) {
      console.log(`⚠️ 오류: ${e.message}`);
    }
  }

  return { title: contestName, date: flags.date || null, results, source: "irunman" };
}

// ─── Liverun Scraper (liverun.co.kr) ─────────────────────────

const LIVERUN_BASE = "http://liverun.co.kr/liveview";

async function liverunFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function liverunListEvents() {
  const html = await liverunFetch(`${LIVERUN_BASE}/`);
  const $ = cheerioLoad(html);
  const events = [];
  $("table tr").each((_, row) => {
    const link = $(row).find("a[href*='query.php']").attr("href");
    if (!link) return;
    const pidMatch = link.match(/pid=(\d+)/);
    const rtypeMatch = link.match(/rtype=(\d+)/);
    if (!pidMatch) return;
    const cells = [];
    $(row).find("td").each((__, td) => cells.push($(td).text().trim()));
    const name = cells[0] || "";
    const date = cells[cells.length - 1] || "";
    events.push({
      pid: pidMatch[1],
      rtype: rtypeMatch ? rtypeMatch[1] : "1",
      name: name.replace(/\s+/g, " ").trim(),
      date: date.replace(/\./g, "-").trim(),
    });
  });
  return events;
}

async function liverunSearchName(pid, rtype, name) {
  const url = `${LIVERUN_BASE}/userSelect.php?rtype=${rtype}&pid=${pid}&name=${encodeURIComponent(name)}`;
  const html = await liverunFetch(url);

  if (html.includes("없습니다")) return [];

  const $ = cheerioLoad(html);
  const entries = [];
  $("table tr").each((_, row) => {
    const link = $(row).find("a[href*='liveView.php']").attr("href");
    if (!link) return;
    const bibMatch = link.match(/bib=(\d+)/);
    const genderMatch = link.match(/gender=(\w)/);
    const uPidMatch = link.match(/uPid=(\d+)/);
    entries.push({
      link,
      bib: bibMatch ? bibMatch[1] : "",
      gender: genderMatch ? genderMatch[1] : "M",
      uPid: uPidMatch ? uPidMatch[1] : "",
    });
  });
  return entries;
}

async function liverunParseDetail(detailUrl) {
  const html = await liverunFetch(detailUrl);
  const $ = cheerioLoad(html);

  let eventName = $("h3").first().text().trim() || $(".inner.cover h1").text().trim();

  const infoTable = $("table").eq(0);
  let name = "", bib = "", gender = "M", distance = "";
  infoTable.find("tr").each((i, row) => {
    if (i === 0) return;
    const cells = [];
    $(row).find("td").each((__, td) => cells.push($(td).text().trim()));
    if (cells.length >= 1) distance = cells[0] || "";
    if (cells.length >= 2) name = cells[1] || name;
    if (cells.length >= 3) bib = cells[2] || bib;
    if (cells.length >= 4) gender = cells[3] === "F" ? "F" : "M";
  });

  const imgs = [];
  $("img[src*='img/digits']").each((_, el) => {
    const src = $(el).attr("src") || "";
    const m = src.match(/digits\/(\w+)\.png/);
    if (m) imgs.push(m[1]);
  });
  let finishTime = "";
  for (const d of imgs) {
    finishTime += d === "sep" ? ":" : d;
  }

  const splits = [];
  const splitTable = $("table").eq(3);
  splitTable.find("tr").each((_, row) => {
    const cells = [];
    $(row).find("td").each((__, td) => cells.push($(td).text().replace(/\u00a0/g, "").trim()));
    if (cells.length >= 3 && cells[1] && cells[2]) {
      splits.push({ section: cells[1], time: cells[2] });
    }
  });

  const shareText = $("script:contains('ShareBand')").text();
  const shareMatch = shareText.match(/text":\s*"([^"]+)/);
  if (shareMatch && !eventName) {
    eventName = shareMatch[1].split(",")[0].trim();
  }

  return {
    eventName,
    realName: name,
    bib,
    distance: normalizeDistance(distance),
    netTime: normalizeTime(finishTime),
    gunTime: "",
    gender,
    splits,
  };
}

async function scrapeLiverun(pid, flags, members) {
  const rtype = flags.rtype || "1";
  console.log(`[Liverun] pid=${pid}, rtype=${rtype}`);

  if (flags["list-events"]) {
    console.log("[Liverun] 대회 목록 조회 중...");
    const events = await liverunListEvents();
    for (const e of events) {
      console.log(`  pid=${e.pid} rtype=${e.rtype} ${e.date} ${e.name}`);
    }
    console.log(`\n총 ${events.length}개 대회`);
    return { title: "", date: null, results: [], source: "liverun" };
  }

  const searchTargets = flags["search-members"] ? members : [];
  const singleName = flags.name;

  if (!searchTargets.length && !singleName && !flags.bib) {
    console.log("[Liverun] --search-members, --name, 또는 --bib 옵션이 필요합니다.");
    return { title: "", date: null, results: [], source: "liverun" };
  }

  const results = [];
  let eventTitle = "";

  const queries = flags.bib
    ? [{ label: `BIB ${flags.bib}`, type: "bib", query: flags.bib }]
    : singleName
      ? [{ label: singleName, type: "name", query: singleName }]
      : searchTargets.map(m => ({ label: m.realName, type: "name", query: m.realName }));

  for (const { label, type, query } of queries) {
    process.stdout.write(`[Liverun] 검색: ${label} ... `);
    await sleep(500);

    try {
      let detailLinks;
      if (type === "bib") {
        detailLinks = [{
          link: `${LIVERUN_BASE}/liveView.php?pid=${pid}&rtype=${rtype}&bib=${query}&gender=M&uPid=0`,
          bib: query, gender: "M",
        }];
      } else {
        detailLinks = await liverunSearchName(pid, rtype, query);
      }

      if (!detailLinks.length) {
        console.log("❌ 미발견");
        continue;
      }

      for (const entry of detailLinks) {
        const fullUrl = entry.link.startsWith("http")
          ? entry.link
          : `${LIVERUN_BASE}/${entry.link.replace(/^\.\//, "")}`;
        const detail = await liverunParseDetail(fullUrl);
        if (!eventTitle && detail.eventName) eventTitle = detail.eventName;

        console.log(`✅ ${detail.distance} ${detail.netTime}`);
        results.push({
          realName: detail.realName || label,
          bib: detail.bib || entry.bib,
          distance: detail.distance,
          netTime: detail.netTime,
          gunTime: "",
          overallRank: null,
          gender: detail.gender || entry.gender || "M",
          splits: detail.splits,
        });
        await sleep(300);
      }
    } catch (e) {
      console.log(`⚠️ 오류: ${e.message}`);
    }
  }

  return {
    title: eventTitle || `Liverun pid=${pid}`,
    date: flags.date || null,
    results,
    source: "liverun",
    sourceUrl: `${LIVERUN_BASE}/query.php?pid=${pid}&rtype=${rtype}`,
  };
}

// ─── Chuncheon Marathon Scraper (marathonapi.chosun.com) ─────

const CHUNCHEON_API = "https://marathonapi.chosun.com/v1/record";

async function chuncheonFetchAllResults(year, code, gender) {
  const results = [];
  let page = 0;
  while (true) {
    const res = await fetch(`${CHUNCHEON_API}/current`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "year", code, year, gender, age: "all", page }),
    });
    if (!res.ok) break;
    const json = await res.json();
    if (!json.data?.recordDtoList?.length) break;
    results.push(...json.data.recordDtoList);
    if (results.length >= json.data.totalCnt) break;
    page++;
    await sleep(200);
  }
  return results;
}

function chuncheonNormalizeTime(raw) {
  if (!raw) return "";
  const t = raw.replace(/^(\d):/, "0$1:");
  return normalizeTime(t);
}

async function scrapeChuncheon(year, flags, members) {
  console.log(`[춘천마라톤] ${year}년 기록 조회`);

  if (flags["search-members"]) {
    const allResults = [];
    const courses = [
      { code: "1", label: "42.195km (full)" },
      { code: "2", label: "10km" },
    ];
    const genders = ["M", "F"];

    for (const course of courses) {
      for (const g of genders) {
        process.stdout.write(`  [${course.label} ${g}] 페이지 로딩 ... `);
        const records = await chuncheonFetchAllResults(year, course.code, g);
        console.log(`${records.length}건`);
        for (const r of records) {
          allResults.push({
            baebun: r.baebun,
            distance: course.code === "1" ? "full" : "10K",
            netTime: chuncheonNormalizeTime(r.netFull),
            gunTime: chuncheonNormalizeTime(r.gunFull),
            gender: g,
            overallRank: r.rankTotal,
            age: r.age,
            splits: {
              "5km": r.rec5km, "10km": r.rec10km, "15km": r.rec15km,
              "20km": r.rec20km, half: r.recHalf, "25km": r.rec25km,
              "30km": r.rec30km, "35km": r.rec35km, "40km": r.rec40km,
            },
          });
        }
      }
    }

    console.log(`\n  전체 ${allResults.length}건 로드 완료. 회원 시간 매칭 시작...`);
    const matched = [];
    for (const m of members) {
      const memberGender = m.gender || "M";
      const candidatesByGender = allResults.filter(r => r.gender === memberGender);
      for (const r of candidatesByGender) {
        matched.push({
          realName: m.realName,
          bib: r.baebun,
          distance: normalizeDistance(r.distance),
          netTime: r.netTime,
          gunTime: r.gunTime,
          overallRank: r.overallRank,
          gender: r.gender,
        });
      }
    }

    console.log(`  ⚠️ 춘천마라톤은 이름이 포함되지 않아 시간 매칭이 필요합니다.`);
    console.log(`  전체 기록 ${allResults.length}건 중 gender 매칭: ${matched.length}건`);

    return {
      title: `${year} 춘천마라톤`,
      date: `${year}-10-26`,
      results: allResults.map(r => ({
        realName: "",
        bib: r.baebun,
        distance: normalizeDistance(r.distance),
        netTime: r.netTime,
        gunTime: r.gunTime,
        overallRank: r.overallRank,
        gender: r.gender,
      })),
      source: "chuncheon",
      sourceUrl: "https://www.chuncheonmarathon.com/record/tournament.html",
    };
  }

  const singleName = flags.name;
  const birth = flags.birth;

  if (singleName && birth) {
    console.log(`  개인 조회: ${singleName} (${birth})`);
    const res = await fetch(`${CHUNCHEON_API}/current`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "personal", year, name: singleName, birth }),
    });
    if (!res.ok) {
      console.log("  ❌ 조회 실패");
      return { title: `${year} 춘천마라톤`, date: null, results: [], source: "chuncheon" };
    }
    const json = await res.json();
    if (!json.data) {
      console.log("  ❌ 결과 없음");
      return { title: `${year} 춘천마라톤`, date: null, results: [], source: "chuncheon" };
    }
    const d = json.data;
    const dist = d.code === "1" ? "full" : d.code === "2" ? "10K" : "unknown";
    console.log(`  ✅ ${dist} ${chuncheonNormalizeTime(d.netFull)}`);
    return {
      title: `${year} 춘천마라톤`,
      date: `${year}-10-26`,
      results: [{
        realName: singleName,
        bib: d.baebun,
        distance: normalizeDistance(dist),
        netTime: chuncheonNormalizeTime(d.netFull),
        gunTime: chuncheonNormalizeTime(d.gunFull),
        overallRank: d.rankTotal,
        gender: d.gender === "F" ? "F" : "M",
      }],
      source: "chuncheon",
      sourceUrl: "https://www.chuncheonmarathon.com/record/tournament.html",
    };
  }

  console.log("  [춘천마라톤] --search-members 또는 --name + --birth 옵션이 필요합니다.");
  return { title: `${year} 춘천마라톤`, date: null, results: [], source: "chuncheon" };
}

// ─── Marazone Scraper (raceresult.co.kr) ─────────────────────

const MARAZONE_API = "https://raceresult.co.kr/api";

async function marazoneListCompetitions() {
  const res = await fetch(`${MARAZONE_API}/record-competitions`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function marazoneSearchRecord(compTitle, name, bibNum) {
  const res = await fetch(`${MARAZONE_API}/record-info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      comp_title: compTitle,
      name: name || "",
      bibNum: bibNum || "",
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function scrapeMarazone(compTitle, flags, members) {
  if (flags["list-events"]) {
    console.log("[Marazone] 대회 목록 조회 중...");
    const comps = await marazoneListCompetitions();
    const sorted = comps.sort((a, b) => (b.comp_date || "").localeCompare(a.comp_date || ""));
    for (const c of sorted) {
      console.log(`  ${c.comp_date} | ${c.comp_title} | ${c.comp_div_ls || ""} | ${c.comp_place || ""}`);
    }
    console.log(`\n총 ${comps.length}개 대회`);
    return { title: "", date: null, results: [], source: "marazone" };
  }

  if (!compTitle) {
    console.log("[Marazone] --comp <대회명> 옵션이 필요합니다. (--list-events로 대회 확인)");
    return { title: "", date: null, results: [], source: "marazone" };
  }

  console.log(`[Marazone] 대회: ${compTitle}`);

  const searchTargets = flags["search-members"] ? members : [];
  const singleName = flags.name;

  if (!searchTargets.length && !singleName && !flags.bib) {
    console.log("[Marazone] --search-members, --name, 또는 --bib 옵션이 필요합니다.");
    return { title: compTitle, date: null, results: [], source: "marazone" };
  }

  const results = [];
  const queries = flags.bib
    ? [{ label: `BIB ${flags.bib}`, name: "", bib: flags.bib }]
    : singleName
      ? [{ label: singleName, name: singleName, bib: "" }]
      : searchTargets.map(m => ({ label: m.realName, name: m.realName, bib: "" }));

  let compDate = flags.date || null;

  if (!compDate) {
    try {
      const comps = await marazoneListCompetitions();
      const match = comps.find(c => c.comp_title === compTitle);
      if (match) compDate = match.comp_date;
    } catch (_) { /* ignore */ }
  }

  for (const q of queries) {
    process.stdout.write(`[Marazone] 검색: ${q.label} ... `);
    await sleep(300);

    try {
      const records = await marazoneSearchRecord(compTitle, q.name, q.bib);
      if (!records.length) {
        console.log("❌ 미발견");
        continue;
      }

      for (const r of records) {
        const time = normalizeTime(r.Time || "");
        const dist = normalizeDistance(r.Division || "");
        console.log(`✅ ${dist} ${time}`);

        results.push({
          realName: r.Name || q.label,
          bib: r.Bib || "",
          distance: dist,
          netTime: time,
          gunTime: normalizeTime(r.Net_finish || ""),
          overallRank: r.O_rank ? parseInt(r.O_rank) || null : null,
          gender: (r.Sex || "").toUpperCase() === "F" ? "F" : "M",
          pace: r.Pace || "",
          genderRank: r.G_rank ? parseInt(r.G_rank) || null : null,
          ageRank: r.A_rank ? parseInt(r.A_rank) || null : null,
        });
      }
    } catch (e) {
      console.log(`⚠️ 오류: ${e.message}`);
    }
  }

  return {
    title: compTitle,
    date: compDate,
    results,
    source: "marazone",
    sourceUrl: `https://raceresult.co.kr/record`,
  };
}

// ─── Manual Import ───────────────────────────────────────────

function importManual(filePath) {
  console.log(`[Manual] Loading: ${filePath}`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  if (data.races) return data;

  if (Array.isArray(data.results)) {
    return {
      title: data.name || data.title || "수동 입력",
      date: data.date || null,
      results: data.results.map(r => ({
        realName: r.realName || r.name || "",
        bib: r.bib || "",
        distance: normalizeDistance(r.distance),
        netTime: normalizeTime(r.netTime || r.time || r.chipTime || ""),
        gunTime: normalizeTime(r.gunTime || ""),
        overallRank: r.rank || r.overallRank || null,
        gender: r.gender || "M",
      })),
      source: "manual",
    };
  }

  throw new Error("알 수 없는 파일 형식입니다. { results: [...] } 또는 { races: [...] } 형식이 필요합니다.");
}

// ─── Member Matching ─────────────────────────────────────────

function matchMembers(results, members) {
  const nameSet = new Set(members.map(m => m.realName));
  const matched = results.filter(r => nameSet.has(r.realName));
  const unmatched = results.filter(r => !nameSet.has(r.realName));

  console.log(`\n[매칭] 전체 ${results.length}명 중 DMC 회원 ${matched.length}명`);
  if (matched.length > 0) {
    console.log("  ✅ 매칭:");
    for (const r of matched) {
      const m = members.find(mm => mm.realName === r.realName);
      console.log(`     ${r.realName} → ${m.nickname} (${r.distance} ${r.netTime})`);
    }
  }
  if (unmatched.length > 0 && unmatched.length <= 20) {
    console.log("  ❌ 미매칭:");
    for (const r of unmatched.slice(0, 10)) {
      console.log(`     ${r.realName} (${r.distance} ${r.netTime})`);
    }
    if (unmatched.length > 10) console.log(`     ... 외 ${unmatched.length - 10}명`);
  }
  return matched;
}

// ─── CLI ─────────────────────────────────────────────────────

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

  if (flags["list-members"]) {
    const members = loadMembers();
    console.log("\n📋 DMC 회원 목록:");
    console.log("─".repeat(50));
    for (const m of members) {
      const team = m.team ? ` (${m.team})` : "";
      console.log(`  ${m.realName.padEnd(6)} → ${m.nickname.padEnd(10)} ${m.gender}${team}`);
    }
    console.log(`\n총 ${members.length}명`);
    return;
  }

  if (flags.help || (!flags.source && !flags.url)) {
    console.log(`
DMC 대회 기록 스크래핑 도구
━━━━━━━━━━━━━━━━━━━━━━━━━━

사용법:
  node scrape-results.js --source <소스> [옵션]

━━ SPCT (time.spct.kr) ━━━━━━━━━━━━━━━━━━━━

  # 전체 카테고리 순회 (리스트 Top N)
  node scrape-results.js --source spct --url <URL>

  # DMC 회원 이름으로 검색 (상세 기록 포함)
  node scrape-results.js --source spct --url <URL> --search-members

━━ SmartChip (smartchip.co.kr) ━━━━━━━━━━━━

  # DMC 회원 이름으로 검색
  node scrape-results.js --source smartchip --event <ID> --search-members

  # 배번으로 검색
  node scrape-results.js --source smartchip --event <ID> --bib 1001

━━ MyResult (myresult.co.kr) ━━━━━━━━━━━━━

  # DMC 회원 이름으로 검색 (JTBC 마라톤 등)
  node scrape-results.js --source myresult --event 133 --search-members

  # 특정 이름 검색
  node scrape-results.js --source myresult --event 133 --name "김성한"

  # BIB 검색
  node scrape-results.js --source myresult --event 133 --bib 1567

━━ iRunMan (irunman.kr) ━━━━━━━━━━━━━━━━━━━

  # DMC 회원 이름으로 검색
  node scrape-results.js --source irunman --contest "대회명" --search-members

━━ Liverun (liverun.co.kr) ━━━━━━━━━━━━━━━━

  # 대회 목록 보기
  node scrape-results.js --source liverun --list-events

  # DMC 회원 이름으로 검색
  node scrape-results.js --source liverun --pid 10691 --search-members

  # 특정 이름 검색
  node scrape-results.js --source liverun --pid 10691 --name "김철수"

  # BIB 검색
  node scrape-results.js --source liverun --pid 10691 --bib 20581

━━ Marazone (raceresult.co.kr) ━━━━━━━━━━━

  # 대회 목록 보기
  node scrape-results.js --source marazone --list-events

  # DMC 회원 이름으로 검색
  node scrape-results.js --source marazone --comp "2024플라이업" --search-members

  # 특정 이름 검색
  node scrape-results.js --source marazone --comp "2024홍천사랑" --name "김철수"

  # BIB 검색
  node scrape-results.js --source marazone --comp "2024플라이업" --bib 1

━━ 춘천마라톤 (chuncheonmarathon.com) ━━━━━━

  # 전체 기록 다운로드 (이름 없음, 시간 매칭)
  node scrape-results.js --source chuncheon --year 2025 --search-members

  # 개인 조회 (이름 + 생년월일 필요)
  node scrape-results.js --source chuncheon --year 2025 --name "김성한" --birth "901215"

━━ 수동 가져오기 ━━━━━━━━━━━━━━━━━━━━━━━━━━

  node scrape-results.js --source manual --file results.json

━━ 공통 옵션 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  --date <YYYY-MM-DD>    대회일 (자동감지 실패시)
  --location <장소>      대회 장소
  --dry-run              저장하지 않고 미리보기
  --all                  회원 매칭 없이 전체 저장
  --search-members       members.json의 회원 이름으로 검색
  --list-members         등록된 회원 목록 표시

예시:
  node scrape-results.js --source spct \\
    --url "https://time.spct.kr/m1.php?TargetYear=2026&EVENT_NO=20260314009" \\
    --search-members --location "금산"
    `);
    return;
  }

  const source = flags.source || "spct";
  const members = loadMembers();
  let scraped;

  switch (source) {
    case "spct":
      if (!flags.url) throw new Error("--url 옵션이 필요합니다.");
      scraped = await scrapeSPCT(flags.url, flags, members);
      break;

    case "smartchip":
      if (!flags.event) throw new Error("--event <이벤트ID> 옵션이 필요합니다.");
      scraped = await scrapeSmartChip(flags.event, flags, members);
      break;

    case "myresult":
      if (!flags.event) throw new Error("--event <이벤트ID> 옵션이 필요합니다.");
      scraped = await scrapeMyResult(flags.event, flags, members);
      break;

    case "irunman":
      if (!flags.contest) throw new Error("--contest <대회명> 옵션이 필요합니다.");
      scraped = await scrapeIRunMan(flags.contest, flags, members);
      break;

    case "liverun":
      if (!flags.pid && !flags["list-events"]) throw new Error("--pid <대회ID> 옵션이 필요합니다. (--list-events로 확인)");
      scraped = await scrapeLiverun(flags.pid, flags, members);
      break;

    case "marazone":
      scraped = await scrapeMarazone(flags.comp, flags, members);
      break;

    case "chuncheon":
      scraped = await scrapeChuncheon(flags.year || "2025", flags, members);
      break;

    case "manual":
      if (!flags.file) throw new Error("--file 옵션이 필요합니다.");
      scraped = importManual(flags.file);
      if (scraped.races) {
        console.log(`[Manual] ${scraped.races.length}개 대회 직접 가져오기`);
        if (!flags["dry-run"]) {
          const existing = loadRaces();
          const existingIds = new Set(existing.map(r => r.id));
          let added = 0;
          for (const race of scraped.races) {
            if (!existingIds.has(race.id)) { existing.push(race); added++; }
          }
          saveRaces(existing);
          console.log(`\n✅ ${added}개 대회 추가됨 (총 ${existing.length}개)`);
        }
        return;
      }
      break;

    default:
      throw new Error(`알 수 없는 소스: ${source}`);
  }

  if (flags["list-events"]) return;

  if (!scraped.results.length) {
    console.log("\n⚠️  스크래핑 결과가 없습니다.");
    return;
  }

  const matchedResults = (flags.all || flags["search-members"])
    ? scraped.results
    : matchMembers(scraped.results, members);

  if (!matchedResults.length) {
    console.log("\n⚠️  매칭된 DMC 회원이 없습니다.");
    return;
  }

  const raceName = flags.raceName || scraped.title || "이름 없는 대회";
  const raceDate = flags.date || scraped.date || new Date().toISOString().slice(0, 10);
  const raceId = generateRaceId(raceDate, raceName);

  const cleanResults = matchedResults.map(r => ({
    realName: r.realName,
    bib: r.bib || "",
    distance: r.distance,
    netTime: r.netTime,
    gunTime: r.gunTime || "",
    overallRank: r.overallRank || null,
    gender: r.gender || "M",
  }));

  const newRace = {
    id: raceId,
    name: raceName,
    date: raceDate,
    location: flags.location || "",
    source,
    sourceUrl: flags.url || scraped.sourceUrl || "",
    results: cleanResults,
  };

  console.log(`\n📋 대회 정보:`);
  console.log(`  ID:       ${newRace.id}`);
  console.log(`  이름:     ${newRace.name}`);
  console.log(`  날짜:     ${newRace.date}`);
  console.log(`  장소:     ${newRace.location || "(미입력)"}`);
  console.log(`  소스:     ${newRace.source}`);
  console.log(`  기록 수:  ${newRace.results.length}명`);

  if (flags["dry-run"]) {
    console.log("\n🔍 [DRY RUN] 저장하지 않습니다.");
    console.log(JSON.stringify(newRace, null, 2));
    return;
  }

  const existing = loadRaces();
  const idx = existing.findIndex(r => r.id === raceId);
  if (idx >= 0) {
    existing[idx] = newRace;
    console.log(`\n♻️  기존 대회 (${raceId}) 업데이트됨`);
  } else {
    existing.push(newRace);
    console.log(`\n✅ 새 대회 추가됨 (총 ${existing.length}개)`);
  }
  saveRaces(existing);
  console.log(`💾 저장 완료: ${RACES_PATH}`);
}

main().catch(e => {
  console.error(`\n❌ 오류: ${e.message}`);
  process.exit(1);
});
