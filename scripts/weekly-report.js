#!/usr/bin/env node

/**
 * 주간 대회 결과 리포트 생성기
 *
 * 사용법:
 *   node scripts/weekly-report.js --event "myresult:144"
 *   node scripts/weekly-report.js --event "spct:20260314009" --event "marazone:2026 춘천 소양강 마라톤"
 *   node scripts/weekly-report.js --event "myresult:144" --confirm    (Firestore에 확정 저장)
 *   node scripts/weekly-report.js --event "myresult:144" --csv        (CSV 파일 출력)
 *   node scripts/weekly-report.js --event "myresult:144" --dry-run    (스크래핑만, Firestore 미접속)
 *
 * 이벤트 포맷: --event "소스:소스ID"
 *   myresult:144, spct:20260314009, smartchip:202650000006, marazone:대회명
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

// ─── 거리/시간 유틸리티 ──────────────────────────────────────

const DIST_ALIASES = {
  "5km": "5K", "5k": "5K", "5K": "5K", "3km": "3K",
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

function timeToSeconds(t) {
  const m = String(t).match(/^(\d+):(\d{2}):(\d{2})/);
  if (!m) return Infinity;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
}

function inferGender(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("남") || t.includes("male") || t === "m") return "M";
  if (t.includes("여") || t.includes("female") || t === "f") return "F";
  return null;
}

// ─── SPCT 검색 ────────────────────────────────────────────────

async function spctParseDetailPage(html, fallbackName) {
  const $ = cheerioLoad(html);
  const name = $(".content .name").clone().children().remove().end().text().trim() || fallbackName;
  const genderDist = $(".content .name span").text().trim();
  const bib = $(".content .tag span").first().text().trim();
  const time = $(".content .record .time").text().trim();
  const gender = inferGender(genderDist);
  const dist = normDist(genderDist.replace(/[MF]\s*/i, ""));

  return {
    name, bib, distance: dist,
    netTime: normTime(time), gunTime: "",
    gender: gender || null,
    overallRank: null, genderRank: null, pace: "",
  };
}

async function searchSPCT(eventNo, memberName) {
  const year = eventNo.substring(0, 4);
  const url = `https://time.spct.kr/m1.php?TargetYear=${year}&EVENT_NO=${eventNo}&currentPage=1&searchResultsName=${encodeURIComponent(memberName)}`;
  const res = await fetch(url);
  const html = await res.text();
  if (html.includes("alert('Something Wrong") || html.length < 200) return [];

  const redirectMatch = html.match(/location\.href\s*=\s*"(m2\.php[^"]+)"/);
  if (redirectMatch) {
    const dHtml = await (await fetch(`https://time.spct.kr/${redirectMatch[1]}`)).text();
    const parsed = await spctParseDetailPage(dHtml, memberName);
    return parsed.netTime ? [parsed] : [];
  }

  const $ = cheerioLoad(html);
  const links = [];
  $("a[href*='m2.php']").each((_, a) => {
    const href = $(a).attr("href");
    if (href && !links.includes(href)) links.push(href);
  });

  const results = [];
  for (const link of links) {
    const dHtml = await (await fetch(`https://time.spct.kr/${link}`)).text();
    const parsed = await spctParseDetailPage(dHtml, memberName);
    if (parsed.netTime) results.push(parsed);
    await sleep(200);
  }
  return results;
}

async function getSPCTEventInfo(eventNo) {
  const year = eventNo.substring(0, 4);
  const url = `https://time.spct.kr/m1.php?TargetYear=${year}&EVENT_NO=${eventNo}&currentPage=1`;
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerioLoad(html);
  const h3 = $("h3").first().text().trim();
  const title = h3.split("\n")[0].trim();
  const dateMatch = h3.match(/(\d{4}-\d{2}-\d{2})/);
  return { title, date: dateMatch ? dateMatch[1] : null };
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
  if (html.includes("검색 결과가 없습니다") || html.length < 5000) return [];

  const $ = cheerioLoad(html);
  const jamsil = [];
  $(".jamsil-bold-center").each((_, el) => {
    const t = $(el).text().replace(/&nbsp;/g, "").trim();
    if (t) jamsil.push(t);
  });

  const name = jamsil[0] || memberName;
  const distance = normDist(jamsil[1] || "");
  let bib = "";
  for (let i = 0; i < jamsil.length; i++) {
    if (jamsil[i] === "BIB" && jamsil[i + 1]) { bib = jamsil[i + 1].trim(); break; }
  }

  const enc = html.match(/drawTextCanvas\s*\(\s*"targetClock"\s*,\s*"([0-9a-fA-F]+)"\s*\)/);
  const netTime = enc ? scDecrypt(enc[1], html) : "";
  const rankData = html.match(/var rawData\s*=\s*\[([^\]]*)\]/);
  const overallRank = rankData ? parseInt(rankData[1].split(",")[0]) : null;

  if (!netTime) return [];
  return [{ name, bib, distance, netTime: normTime(netTime), gunTime: "", overallRank, genderRank: null, gender: null, pace: "" }];
}

// ─── MyResult 검색 ────────────────────────────────────────────

async function searchMyResult(eventId, memberName) {
  const url = `https://myresult.co.kr/api/event/${eventId}/player?q=${encodeURIComponent(memberName)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const players = await res.json();
  return (players || []).map((p) => ({
    name: p.name || memberName,
    bib: String(p.num || ""),
    distance: normDist(p.course_cd || ""),
    netTime: normTime(p.result_nettime || ""),
    gunTime: normTime(p.result_guntime || ""),
    overallRank: null,
    genderRank: null,
    gender: p.gender ? p.gender.toUpperCase() : null,
    pace: p.pace_nettime || "",
  }));
}

async function getMyResultEventInfo(eventId) {
  const res = await fetch(`https://myresult.co.kr/api/event/${eventId}`, { headers: { Accept: "application/json" } });
  if (!res.ok) return { title: `MyResult #${eventId}`, date: null };
  const data = await res.json();
  return { title: data.name || `MyResult #${eventId}`, date: data.date || null };
}

// ─── Marazone 검색 ───────────────────────────────────────────

async function searchMarazone(compTitle, memberName) {
  const res = await fetch("https://raceresult.co.kr/api/record-info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comp_title: compTitle, name: memberName, bibNum: "" }),
  });
  if (!res.ok) return [];
  const records = await res.json();
  return (records || []).map((r) => ({
    name: r.name || memberName,
    bib: r.bib_num || "",
    distance: normDist(r.Division || ""),
    netTime: normTime(r.Time || ""),
    gunTime: "",
    overallRank: r.rank_total ? parseInt(r.rank_total) : null,
    genderRank: r.rank_gender ? parseInt(r.rank_gender) : null,
    gender: null,
    pace: r.pace || "",
  }));
}

// ─── 검색 라우터 + 이벤트 정보 ───────────────────────────────

async function searchMember(source, sourceId, memberName) {
  switch (source) {
    case "spct": return searchSPCT(sourceId, memberName);
    case "smartchip": return searchSmartChip(sourceId, memberName);
    case "myresult": return searchMyResult(sourceId, memberName);
    case "marazone": return searchMarazone(sourceId, memberName);
    default: return [];
  }
}

async function getEventInfo(source, sourceId) {
  switch (source) {
    case "spct": return getSPCTEventInfo(sourceId);
    case "myresult": return getMyResultEventInfo(sourceId);
    case "marazone": {
      const comps = await (await fetch("https://raceresult.co.kr/api/record-competitions")).json();
      const match = comps.find((c) => c.comp_title === sourceId);
      return { title: sourceId, date: match?.comp_date || null };
    }
    default: return { title: sourceId, date: null };
  }
}

// ─── PB 판별 ──────────────────────────────────────────────────

async function loadPBData(db) {
  if (!db) return {};
  const snap = await db.collection("race_results").where("status", "==", "confirmed").get();
  const pbMap = {};
  snap.forEach((doc) => {
    const d = doc.data();
    const key = `${d.realName}__${d.distance}`;
    const sec = timeToSeconds(d.netTime);
    if (!pbMap[key] || sec < pbMap[key]) {
      pbMap[key] = sec;
    }
  });
  return pbMap;
}

function isPB(pbMap, realName, distance, netTime) {
  const key = `${realName}__${distance}`;
  const sec = timeToSeconds(netTime);
  if (sec === Infinity) return false;
  if (!pbMap[key]) return true;
  return sec < pbMap[key];
}

// ─── 리포트 생성 ──────────────────────────────────────────────

function generateReport(eventResults, pbMap) {
  const rows = [];
  let no = 0;

  for (const { eventName, eventDate, source, sourceId, results } of eventResults) {
    const dateStr = eventDate ? eventDate.replace(/^\d{4}-/, "").replace("-", "/") : "";

    const sorted = [...results].sort((a, b) => {
      const dOrder = { full: 0, half: 1, "10K": 2, "5K": 3 };
      const da = dOrder[a.distance] ?? 9;
      const db = dOrder[b.distance] ?? 9;
      if (da !== db) return da - db;
      return timeToSeconds(a.netTime) - timeToSeconds(b.netTime);
    });

    for (const r of sorted) {
      no++;
      const pb = isPB(pbMap, r.memberRealName, r.distance, r.netTime);
      const distLabel = { full: "full", half: "half", "10K": "10km", "5K": "5km" }[r.distance] || r.distance;

      rows.push({
        no,
        date: dateStr,
        event: eventName,
        nickname: r.memberNickname,
        realName: r.memberRealName,
        distance: distLabel,
        netTime: r.netTime,
        gunTime: r.gunTime,
        bib: r.bib,
        pb: pb ? "PB" : "",
        status: r.status,
        source,
        sourceId,
        candidateCount: r.candidateCount || 1,
      });
    }
  }

  return rows;
}

function printReport(rows, eventResults) {
  console.log("\n" + "━".repeat(90));
  console.log("  주간 대회 결과 리포트");
  console.log("━".repeat(90));

  const header = "날짜\t대회명\tNo.\t닉네임\t이름\t종목\t기록\t비고";
  console.log("\n" + header);
  console.log("─".repeat(90));

  for (const r of rows) {
    const flag = r.status === "ambiguous" ? "[확인필요] " : "";
    const pbMark = r.pb ? "PB" : "";
    console.log(
      `${r.date}\t${r.event}\t${r.no}\t${flag}${r.nickname}\t${r.realName}\t${r.distance}\t${r.netTime}\t${pbMark}`
    );
  }

  // 통계
  console.log("\n" + "━".repeat(90));
  console.log("  통계");
  console.log("━".repeat(90));

  const confirmed = rows.filter((r) => r.status !== "ambiguous");
  const fullRows = confirmed.filter((r) => r.distance === "full");
  const uniqueMembers = new Set(confirmed.map((r) => r.realName));
  const pbRows = confirmed.filter((r) => r.pb === "PB");

  console.log(`  참가: ${uniqueMembers.size}명 (${rows.length}건)`);
  console.log(`  PB 달성: ${pbRows.length}명`);
  if (pbRows.length > 0) {
    console.log(`    → ${pbRows.map((r) => r.nickname).join(", ")}`);
  }

  if (fullRows.length > 0) {
    const sub3 = fullRows.filter((r) => timeToSeconds(r.netTime) < 3 * 3600);
    const sub330 = fullRows.filter((r) => timeToSeconds(r.netTime) < 3.5 * 3600);
    const sub4 = fullRows.filter((r) => timeToSeconds(r.netTime) < 4 * 3600);
    console.log(`\n  풀코스 (${fullRows.length}명):`);
    console.log(`    Sub-3: ${sub3.length}명 (${((sub3.length / fullRows.length) * 100).toFixed(1)}%)`);
    console.log(`    Sub-3:30: ${sub330.length}명 (${((sub330.length / fullRows.length) * 100).toFixed(1)}%)`);
    console.log(`    Sub-4: ${sub4.length}명 (${((sub4.length / fullRows.length) * 100).toFixed(1)}%)`);
  }

  const ambiguous = rows.filter((r) => r.status === "ambiguous");
  if (ambiguous.length > 0) {
    console.log(`\n  ⚠ 동명이인 확인 필요: ${ambiguous.length}건`);
    ambiguous.forEach((r) =>
      console.log(`    ${r.nickname}(${r.realName}): ${r.distance} ${r.netTime} [${r.candidateCount}명 중]`)
    );
  }

  console.log("━".repeat(90));
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function writeCSV(rows, outputPath) {
  const columns = ["날짜", "대회명", "No", "닉네임", "이름", "종목", "Net기록", "Gun기록", "배번", "PB", "상태", "소스", "후보수"];
  const header = columns.join(",");
  const lines = rows.map((r) =>
    [r.date, r.event, r.no, r.nickname, r.realName, r.distance, r.netTime, r.gunTime, r.bib, r.pb, r.status, r.source, r.candidateCount]
      .map(csvEscape)
      .join(",")
  );
  const csv = [header, ...lines].join("\n");
  fs.writeFileSync(outputPath, "\uFEFF" + csv, "utf-8");
  console.log(`\nCSV 저장: ${outputPath}`);
}

// ─── Firestore 확정 저장 ─────────────────────────────────────

async function confirmToFirestore(db, rows, memberDocs) {
  let saved = 0;
  const batch = db.batch();

  for (const r of rows) {
    if (r.status === "ambiguous") continue;

    const memberDoc = memberDocs[r.realName];
    const eventSnap = await db.collection("events")
      .where("source", "==", r.source)
      .where("sourceId", "==", r.sourceId)
      .limit(1).get();

    let eventDocId;
    if (eventSnap.empty) {
      const ref = await db.collection("events").add({
        name: r.event, date: r.date, year: parseInt(r.date?.substring(0, 4)) || null,
        source: r.source, sourceId: r.sourceId,
        status: "scraped", scrapedAt: new Date().toISOString(),
      });
      eventDocId = ref.id;
    } else {
      eventDocId = eventSnap.docs[0].id;
    }

    const docRef = db.collection("race_results").doc();
    batch.set(docRef, {
      memberId: memberDoc?.docId || "",
      eventId: eventDocId,
      realName: r.realName,
      nickname: r.nickname,
      eventName: r.event,
      eventDate: r.date || "",
      distance: r.distance,
      netTime: r.netTime,
      gunTime: r.gunTime || "",
      bib: r.bib || "",
      pace: "",
      overallRank: null,
      genderRank: null,
      hidden: false,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    });
    saved++;
  }

  if (saved > 0) await batch.commit();
  console.log(`\nFirestore에 ${saved}건 확정 저장 완료`);
}

// ─── 메인 ─────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const doConfirm = args.includes("--confirm");
  const doCSV = args.includes("--csv");

  const eventArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--event" && args[i + 1]) {
      eventArgs.push(args[i + 1]);
      i++;
    }
  }

  if (eventArgs.length === 0) {
    console.log(`주간 대회 결과 리포트 생성기

사용법:
  node scripts/weekly-report.js --event "소스:소스ID" [--event ...] [옵션]

이벤트 소스:
  myresult:이벤트ID     예: myresult:144
  spct:이벤트번호       예: spct:20260314009
  smartchip:이벤트ID    예: smartchip:202650000006
  marazone:대회명       예: marazone:2026 춘천 소양강 마라톤

옵션:
  --csv          CSV 파일로 출력
  --confirm      확정 기록을 Firestore에 저장
  --dry-run      Firestore 미접속 (PB 비교 없이 실행)
`);
    process.exit(0);
  }

  const members = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "members.json"), "utf-8")).members;
  console.log(`회원: ${members.length}명 로드`);

  let db = null;
  let pbMap = {};
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
    console.log(`Firestore members: ${Object.keys(memberDocs).length}명`);

    console.log("PB 데이터 로딩...");
    pbMap = await loadPBData(db);
    console.log(`기존 확정 기록: ${Object.keys(pbMap).length}개 PB 기준`);
  }

  const eventResults = [];

  for (const arg of eventArgs) {
    const colonIdx = arg.indexOf(":");
    if (colonIdx < 0) {
      console.error(`잘못된 이벤트 포맷: ${arg} (소스:ID 형식 필요)`);
      continue;
    }
    const source = arg.substring(0, colonIdx);
    const sourceId = arg.substring(colonIdx + 1);

    console.log(`\n${"═".repeat(60)}`);
    console.log(`  이벤트: ${source}:${sourceId}`);

    const info = await getEventInfo(source, sourceId);
    console.log(`  대회명: ${info.title}`);
    console.log(`  날짜: ${info.date || "미확인"}`);
    console.log(`${"═".repeat(60)}`);

    const results = [];

    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (i > 0 && i % 30 === 0) {
        process.stdout.write(`  [${i}/${members.length}] ${results.length}건 발견...\r`);
      }

      try {
        await sleep(DELAY_MS);
        const found = await searchMember(source, sourceId, m.realName);
        if (!found || found.length === 0) continue;

        const isAmbiguous = found.length > 1;

        for (const r of found) {
          results.push({
            ...r,
            memberRealName: m.realName,
            memberNickname: m.nickname,
            memberGender: m.gender,
            status: isAmbiguous ? "ambiguous" : "auto",
            candidateCount: found.length,
          });
        }

        const tag = isAmbiguous ? `[${found.length}명]` : "";
        const times = found.map((r) => `${r.distance} ${r.netTime}`).join(", ");
        console.log(`  ${m.nickname}(${m.realName}): ${times} ${tag}`);
      } catch (err) {
        // silent per-member error
      }
    }

    console.log(`  → 총 ${results.length}건 (${info.title})`);

    eventResults.push({
      eventName: info.title,
      eventDate: info.date,
      source,
      sourceId,
      results,
    });
  }

  const rows = generateReport(eventResults, pbMap);
  printReport(rows, eventResults);

  if (doCSV) {
    const today = new Date().toISOString().slice(0, 10);
    const csvPath = path.join(DATA_DIR, `weekly-report-${today}.csv`);
    writeCSV(rows, csvPath);
  }

  if (doConfirm && db) {
    await confirmToFirestore(db, rows, memberDocs);
  }
}

main().catch((err) => {
  console.error("오류:", err);
  process.exit(1);
});
