#!/usr/bin/env node

/**
 * 배치 스크래핑: 발견된 대회에서 회원 기록을 검색하여 Firestore에 저장
 *
 * 사용법:
 *   node scripts/batch-scrape.js --year 2026
 *   node scripts/batch-scrape.js --year 2026 --source spct
 *   node scripts/batch-scrape.js --year 2026 --dry-run
 *   node scripts/batch-scrape.js --year 2026 --event-index 0-5
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { load: cheerioLoad } = require("cheerio");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "service-account.json");
const DELAY_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 거리/시간 정규화 (scrape-results.js에서 가져옴) ─────────

const DIST_ALIASES = {
  "5km": "5K", "5k": "5K", "5K": "5K",
  "10km": "10K", "10k": "10K", "10K": "10K",
  half: "half", "하프": "half", Half: "half", HALF: "half",
  "하프마라톤": "half", "21.0975km": "half", "21km": "half",
  full: "full", "풀": "full", Full: "full", FULL: "full",
  "풀코스": "full", "42.195km": "full", "42km": "full",
  marathon: "full", Marathon: "full",
  ultra: "ultra", "울트라": "ultra",
  "50km": "ultra", "100km": "ultra",
};

function normDist(raw) {
  const t = String(raw || "").trim();
  if (DIST_ALIASES[t]) return DIST_ALIASES[t];
  for (const [k, v] of Object.entries(DIST_ALIASES)) {
    if (t.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return t || "unknown";
}

function normTime(raw) {
  const t = String(raw || "").trim();
  const m3 = t.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (m3) return `${m3[1].padStart(2, "0")}:${m3[2]}:${m3[3]}`;
  const m2 = t.match(/^(\d{1,2}):(\d{2})(?:\.\d+)?$/);
  if (m2) return `00:${m2[1].padStart(2, "0")}:${m2[2]}`;
  return t;
}

// ─── SPCT 검색 ────────────────────────────────────────────────

async function spctParseDetail(html, fallbackName) {
  const $ = cheerioLoad(html);
  const h3 = $("h3").first().text().trim();
  const name = $(".content table td").eq(1).text().trim() || fallbackName;
  const rows = [];
  $(".content table tbody tr").each((_, row) => {
    const cells = [];
    $(row).find("td").each((__, c) => cells.push($(c).text().trim()));
    if (cells.length >= 3) rows.push(cells);
  });
  const timeCell = rows.length > 0 ? rows[0] : [];
  const distMatch = html.match(/종\s*목[^<]*?<[^>]*>([^<]+)/i);
  const dist = distMatch ? distMatch[1].trim() : "";
  const netTime = $("table").last().find("td").filter((_, el) => {
    return $(el).text().match(/\d{1,2}:\d{2}:\d{2}/);
  }).first().text().trim();

  return { name, distance: normDist(dist), netTime: normTime(netTime) };
}

async function searchSPCT(eventNo, memberName) {
  const year = eventNo.substring(0, 4);
  const url = `https://time.spct.kr/m1.php?TargetYear=${year}&EVENT_NO=${eventNo}&currentPage=1&searchResultsName=${encodeURIComponent(memberName)}`;
  const res = await fetch(url);
  const html = await res.text();

  if (html.includes("alert('Something Wrong") || html.length < 200) return null;

  const redirectMatch = html.match(/location\.href\s*=\s*"(m2\.php[^"]+)"/);
  if (redirectMatch) {
    const detailUrl = `https://time.spct.kr/${redirectMatch[1]}`;
    const detailHtml = await (await fetch(detailUrl)).text();
    const parsed = await spctParseDetail(detailHtml, memberName);
    if (parsed.netTime) return parsed;
  }

  const $ = cheerioLoad(html);
  const links = [];
  $("a[href*='m2.php']").each((_, a) => {
    const href = $(a).attr("href");
    if (href && !links.includes(href)) links.push(href);
  });

  if (links.length > 0) {
    const results = [];
    for (const link of links) {
      const detailUrl = `https://time.spct.kr/${link}`;
      const dHtml = await (await fetch(detailUrl)).text();
      const parsed = await spctParseDetail(dHtml, memberName);
      if (parsed.netTime) results.push(parsed);
      await sleep(200);
    }
    return results.length > 0 ? results : null;
  }

  return null;
}

// ─── SmartChip 검색 ───────────────────────────────────────────

function scDecrypt(secret, html) {
  if (!secret) return "";
  const keyMatch = html.match(/const\s+_k\s*=\s*\[([\d,\s]+)\]/);
  const xorMatch = html.match(/\^\s*(\d+)\s*;/);
  const keyArray = keyMatch
    ? keyMatch[1].split(",").map((n) => parseInt(n.trim()))
    : [1, 4, 11, 14, 0, 9, 8].map((n) => n + 100);
  const xorMask = keyMatch && xorMatch ? parseInt(xorMatch[1]) : keyMatch ? 170 : 0;
  let text = "";
  for (let i = 0; i < secret.length; i += 4) {
    const code = parseInt(secret.substr(i, 4), 16);
    const kCode = keyArray[(i / 4) % keyArray.length] ^ xorMask;
    text += String.fromCharCode(code ^ kCode);
  }
  return text;
}

async function searchSmartChip(eventId, memberName) {
  const params = new URLSearchParams();
  params.append("nameorbibno", memberName);
  params.append("usedata", eventId);

  const res = await fetch("https://www.smartchip.co.kr/return_data_livephoto.asp", {
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

  const name = jamsil[0] || memberName;
  const distance = normDist(jamsil[1] || "");
  let bib = "";
  for (let i = 0; i < jamsil.length; i++) {
    if (jamsil[i] === "BIB" && jamsil[i + 1]) { bib = jamsil[i + 1].trim(); break; }
  }

  const encryptedTime = html.match(/drawTextCanvas\s*\(\s*"targetClock"\s*,\s*"([0-9a-fA-F]+)"\s*\)/);
  const netTime = encryptedTime ? scDecrypt(encryptedTime[1], html) : "";
  const rankData = html.match(/var rawData\s*=\s*\[([^\]]*)\]/);
  const overallRank = rankData ? parseInt(rankData[1].split(",")[0]) : null;

  if (!netTime) return null;

  return { name, distance, netTime: normTime(netTime), bib, overallRank };
}

// ─── MyResult 검색 ────────────────────────────────────────────

async function searchMyResult(eventId, memberName) {
  const url = `https://myresult.co.kr/api/event/${eventId}/player?q=${encodeURIComponent(memberName)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const players = await res.json();
  if (!players || players.length === 0) return null;

  return players.map((p) => ({
    name: p.name,
    bib: p.num || "",
    distance: normDist(p.course_cd || ""),
    netTime: normTime(p.result_nettime || ""),
    gunTime: normTime(p.result_guntime || ""),
    overallRank: p.rank_overall || null,
    genderRank: p.rank_gender || null,
    pace: p.pace_nettime || "",
  }));
}

// ─── Marazone 검색 ───────────────────────────────────────────

async function searchMarazone(compTitle, memberName) {
  const res = await fetch("https://raceresult.co.kr/api/record-info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comp_title: compTitle, name: memberName, bibNum: "" }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.results || data.results.length === 0) return null;

  return data.results.map((r) => ({
    name: r.name || memberName,
    bib: r.bib_num || "",
    distance: normDist(r.comp_div || ""),
    netTime: normTime(r.net_time || r.record || ""),
    gunTime: normTime(r.gun_time || ""),
    overallRank: r.rank_total ? parseInt(r.rank_total) : null,
    genderRank: r.rank_gender ? parseInt(r.rank_gender) : null,
    pace: r.pace || "",
  }));
}

// ─── 검색 라우터 ──────────────────────────────────────────────

async function searchMember(event, memberName) {
  switch (event.source) {
    case "spct":
      return searchSPCT(event.sourceId, memberName);
    case "smartchip":
      return searchSmartChip(event.sourceId, memberName);
    case "myresult":
      return searchMyResult(event.sourceId, memberName);
    case "marazone":
      return searchMarazone(event.sourceId, memberName);
    default:
      return null;
  }
}

// ─── Firestore 저장 ──────────────────────────────────────────

async function saveToFirestore(db, event, member, results) {
  const batch = db.batch();
  const saved = [];

  for (const r of results) {
    const resultData = {
      memberId: member.docId || "",
      eventId: event.firestoreId || "",
      realName: member.realName,
      nickname: member.nickname,
      eventName: event.name,
      eventDate: event.date || "",
      distance: r.distance || "unknown",
      netTime: r.netTime || "",
      gunTime: r.gunTime || "",
      overallRank: r.overallRank || null,
      genderRank: r.genderRank || null,
      bib: r.bib || "",
      pace: r.pace || "",
      hidden: false,
      source: event.source,
      createdAt: new Date().toISOString(),
    };

    const docRef = db.collection("race_results").doc();
    batch.set(docRef, resultData);
    saved.push(resultData);
  }

  if (saved.length > 0) {
    await batch.commit();
  }
  return saved;
}

async function ensureEventInFirestore(db, event) {
  const existing = await db
    .collection("events")
    .where("source", "==", event.source)
    .where("sourceId", "==", event.sourceId)
    .limit(1)
    .get();

  if (!existing.empty) {
    return existing.docs[0].id;
  }

  const yearStr = event.date ? event.date.substring(0, 4) : "";
  const docRef = await db.collection("events").add({
    name: event.name,
    date: event.date || "",
    year: yearStr ? parseInt(yearStr) : null,
    source: event.source,
    sourceId: event.sourceId,
    status: "scraped",
    scrapedAt: new Date().toISOString(),
  });
  return docRef.id;
}

// ─── 메인 ─────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const yearIdx = args.indexOf("--year");
  const sourceIdx = args.indexOf("--source");
  const rangeIdx = args.indexOf("--event-index");
  const dryRun = args.includes("--dry-run");

  const year = yearIdx >= 0 ? parseInt(args[yearIdx + 1]) : new Date().getFullYear();
  const sourceFilter = sourceIdx >= 0 ? args[sourceIdx + 1] : null;

  const eventsPath = path.join(DATA_DIR, `discovered-events-${year}.json`);
  if (!fs.existsSync(eventsPath)) {
    console.error(`발견된 이벤트 파일 없음: ${eventsPath}`);
    console.error(`먼저 node scripts/discover-events.js --year ${year} 실행`);
    process.exit(1);
  }

  const { events: allEvents } = JSON.parse(fs.readFileSync(eventsPath, "utf-8"));
  let events = sourceFilter
    ? allEvents.filter((e) => e.source === sourceFilter)
    : allEvents;

  if (rangeIdx >= 0) {
    const range = args[rangeIdx + 1];
    const [start, end] = range.split("-").map(Number);
    events = events.slice(start, (end || start) + 1);
  }

  const members = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "members.json"), "utf-8")
  ).members;

  console.log(`[배치 스크래핑] ${year}년 | ${events.length}개 대회 | ${members.length}명 회원`);
  if (sourceFilter) console.log(`  소스 필터: ${sourceFilter}`);
  if (dryRun) console.log("  [DRY RUN]\n");

  let db = null;
  let memberDocs = {};

  if (!dryRun) {
    const sa = require(SERVICE_ACCOUNT_PATH);
    initializeApp({ credential: cert(sa), projectId: "dmc-attendance" });
    db = getFirestore();

    const snap = await db.collection("members").get();
    snap.forEach((doc) => {
      const d = doc.data();
      memberDocs[d.realName] = { docId: doc.id, ...d };
    });
    console.log(`  Firestore members 로드: ${Object.keys(memberDocs).length}명\n`);
  }

  let totalFound = 0;
  let totalEvents = 0;

  for (let ei = 0; ei < events.length; ei++) {
    const event = events[ei];
    console.log(`\n[${ei + 1}/${events.length}] ${event.date || "????"} | ${event.source} | ${event.name}`);

    if (!dryRun) {
      event.firestoreId = await ensureEventInFirestore(db, event);
    }

    let eventHits = 0;

    for (let mi = 0; mi < members.length; mi++) {
      const member = members[mi];
      const memberDoc = memberDocs[member.realName] || {};
      member.docId = memberDoc.docId || "";

      if (mi % 20 === 0 && mi > 0) {
        process.stdout.write(`  [${mi}/${members.length}] ${eventHits}건 발견...\r`);
      }

      try {
        await sleep(DELAY_MS);
        const result = await searchMember(event, member.realName);

        if (!result) continue;

        const results = Array.isArray(result) ? result : [result];
        const valid = results.filter((r) => r.netTime);

        if (valid.length > 0) {
          eventHits += valid.length;
          const timeStr = valid.map((r) => `${r.distance} ${r.netTime}`).join(", ");
          console.log(`  ${member.nickname}(${member.realName}): ${timeStr}`);

          if (!dryRun) {
            await saveToFirestore(db, event, member, valid);
          }
        }
      } catch (err) {
        // Silent fail per member - don't spam logs
      }
    }

    console.log(`  → ${eventHits}건 (${event.name})`);
    totalFound += eventHits;
    if (eventHits > 0) totalEvents++;
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`완료: ${totalEvents}개 대회에서 총 ${totalFound}건 기록 발견`);
  console.log(`${"=".repeat(50)}`);
}

main().catch((err) => {
  console.error("배치 스크래핑 오류:", err);
  process.exit(1);
});
