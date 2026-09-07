#!/usr/bin/env node
/**
 * 제23회 철원DMZ 국제평화마라톤 (2026-09-05) 기록관 인계 패키지.
 * Firestore race_results 에 쓰지 않음. SPCT 실사이트 조회 + 불일치 분류 + CSV/HTML.
 *
 *   node scripts/cheorwon-2026-records-handoff.js
 *   node scripts/cheorwon-2026-records-handoff.js --from-json /tmp/cheorwon-event.json
 *
 * 데이터 출처: 프로덕션 GET group-events (evt_2026-09-05_23_dmz) 또는 --from-json.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const root = path.join(__dirname, "..");
const functionsNm = path.join(root, "functions", "node_modules");
if (!fs.existsSync(functionsNm)) {
  console.error("functions/node_modules 없음. cd functions && npm ci");
  process.exit(1);
}
const requireFromFunctions = createRequire(path.join(functionsNm, "_"));
const { load: cheerioLoad } = requireFromFunctions("cheerio");
const { normalizeRaceDistance } = require("../functions/lib/raceDistance");

const EVENT_ID = "evt_2026-09-05_23_dmz";
const SOURCE = "spct";
const SOURCE_ID = "2026090502";
const EVENT_YEAR = "2026";
const PROD_API = "https://dmc-attendance.web.app/api/race";
const SPCT_ORIGIN = "https://time.spct.kr";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const out = { fromJson: null, outDir: "/opt/cursor/artifacts" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from-json" && argv[i + 1]) out.fromJson = argv[++i];
    if (argv[i] === "--out-dir" && argv[i + 1]) out.outDir = argv[++i];
  }
  return out;
}

/** SPCT DMZ 표기 → canonical */
function canonDist(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const lower = t.toLowerCase().replace(/\s+/g, "");
  if (lower.includes("dmzfull") || lower === "full") return "full";
  if (lower.includes("dmzhalf") || lower === "half") return "half";
  if (/^10k|10km$/.test(lower)) return "10K";
  const n = normalizeRaceDistance(t);
  return n === "unknown" ? "" : n;
}

function padBib(bib) {
  const digits = String(bib || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(6, "0");
}

function isValidBib(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length >= 3 && digits.length <= 6;
}

function personalResultUrl(bib) {
  const padded = padBib(bib);
  if (!padded) return "";
  return `${SPCT_ORIGIN}/m2.php?EVENT_NO=${SOURCE_ID}&TargetYear=${EVENT_YEAR}&currentPage=1&BIB_NO=${padded}`;
}

function searchListUrl(query) {
  return `${SPCT_ORIGIN}/m1.php?TargetYear=${EVENT_YEAR}&EVENT_NO=${SOURCE_ID}&currentPage=1&searchResultsName=${encodeURIComponent(query)}`;
}

function namesMatch(a, b) {
  const na = String(a || "").replace(/\s+/g, "");
  const nb = String(b || "").replace(/\s+/g, "");
  return na.length > 0 && na === nb;
}

function parseDetailHtml(html, fallbackName) {
  const $ = cheerioLoad(html);
  if ($("body").text().includes("데이터가 없습니다")) {
    return null;
  }
  const name =
    $(".content .name").clone().children().remove().end().text().trim() ||
    fallbackName ||
    "";
  const genderDist = $(".content .name span").text().trim();
  const bib = $(".content .tag span").first().text().trim();
  const timeRaw = $(".content .record .time").text().trim();
  const body = $("body").text().replace(/\s+/g, " ");
  const startM = body.match(/Start Time\s*:\s*([0-9:.]+)/i);
  const finishM = body.match(/Finish Time\s*:\s*([0-9:.]*)/i);
  const dist = canonDist(genderDist.replace(/[MF]\s*/i, ""));
  return {
    name,
    bib: String(bib || "").replace(/^0+/, "") || bib,
    distance: dist || genderDist,
    distanceRaw: genderDist,
    netTime: timeRaw ? timeRaw.substring(0, 8) : "",
    startTime: startM ? startM[1] : "",
    finishTime: finishM && finishM[1] ? finishM[1] : "",
    hasOfficialTime: !!timeRaw,
  };
}

async function fetchSpctByBib(bib) {
  const padded = padBib(bib);
  if (!padded) return { hit: false, result: null, personalUrl: "" };
  const personalUrl = personalResultUrl(bib);
  const listUrl = searchListUrl(String(bib).replace(/\D/g, ""));
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    Accept: "text/html,*/*",
    Referer: SPCT_ORIGIN + "/",
  };
  const listHtml = await (await fetch(listUrl, { headers })).text();
  if (listHtml.includes("Something Wrong") || listHtml.length < 200) {
    return { hit: false, result: null, personalUrl };
  }
  let detailUrl = personalUrl;
  const redirectMatch = listHtml.match(/location\.href\s*=\s*"(m2\.php[^"]+)"/);
  if (redirectMatch) {
    detailUrl = `${SPCT_ORIGIN}/${redirectMatch[1]}`;
  } else {
    const $ = cheerioLoad(listHtml);
    const href = $("a[href*='m2.php']").first().attr("href");
    if (href) detailUrl = href.startsWith("http") ? href : `${SPCT_ORIGIN}/${href}`;
    else {
      // 목록에 링크 없으면 직접 m2 시도
      const dHtml = await (await fetch(personalUrl, { headers })).text();
      const parsed = parseDetailHtml(dHtml, "");
      if (!parsed || !parsed.name) return { hit: false, result: null, personalUrl };
      return { hit: true, result: parsed, personalUrl: detailUrl };
    }
  }
  const dHtml = await (await fetch(detailUrl, { headers })).text();
  const parsed = parseDetailHtml(dHtml, "");
  if (!parsed || !parsed.name) return { hit: false, result: null, personalUrl: detailUrl };
  return { hit: true, result: parsed, personalUrl: detailUrl };
}

async function fetchSpctByName(name) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    Accept: "text/html,*/*",
    Referer: SPCT_ORIGIN + "/",
  };
  const listUrl = searchListUrl(name);
  const listHtml = await (await fetch(listUrl, { headers })).text();
  if (listHtml.includes("Something Wrong") || listHtml.length < 200) return [];

  const redirectMatch = listHtml.match(/location\.href\s*=\s*"(m2\.php[^"]+)"/);
  const hrefs = [];
  if (redirectMatch) hrefs.push(redirectMatch[1]);
  else {
    const $ = cheerioLoad(listHtml);
    $("a[href*='m2.php']").each((_, a) => {
      const href = $(a).attr("href");
      if (href && !hrefs.includes(href)) hrefs.push(href);
    });
  }

  const out = [];
  for (const href of hrefs.slice(0, 5)) {
    const detailUrl = href.startsWith("http") ? href : `${SPCT_ORIGIN}/${href}`;
    const dHtml = await (await fetch(detailUrl, { headers })).text();
    const parsed = parseDetailHtml(dHtml, name);
    if (parsed && parsed.name) {
      out.push({ ...parsed, personalUrl: detailUrl });
    }
    await sleep(150);
  }
  return out;
}

async function loadEvent(fromJson) {
  if (fromJson) {
    const ev = JSON.parse(fs.readFileSync(fromJson, "utf8"));
    return ev;
  }
  const res = await fetch(`${PROD_API}?action=group-events`);
  const data = await res.json();
  if (!data.ok) throw new Error("group-events failed");
  const ev = (data.groupEvents || []).find((e) => e.id === EVENT_ID);
  if (!ev) throw new Error(`event ${EVENT_ID} not found`);
  return ev;
}

/**
 * 우선순위: 배번 미입력 > 배번 오입력 > 종목 오입력 > 기록없음 > OK
 */
function classify(row) {
  const flags = [];
  if (row.scrapeStatus === "missing_bib") flags.push("배번 미입력");
  if (row.scrapeStatus === "wrong_bib") flags.push("배번 오입력");
  if (row.scrapeStatus === "wrong_distance") flags.push("종목 오입력");
  if (row.scrapeStatus === "no_official_time") flags.push("공식기록 없음");
  if (row.scrapeStatus === "ok") flags.push("OK");
  if (row.scrapeStatus === "name_candidate") flags.push("배번 미입력(이름후보)");
  return flags.join("; ") || row.scrapeStatus;
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const headers = [
    "nickname",
    "realName",
    "memberBib",
    "memberDistance",
    "scrapeStatus",
    "mismatchLabel",
    "scrapedName",
    "scrapedBib",
    "scrapedDistance",
    "scrapedNetTime",
    "note",
    "personalResultUrl",
    "nameCandidates",
    "confirmedInApp",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

function toHtml(rows, summary, event) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const statusClass = (st) => {
    if (st === "ok") return "ok";
    if (st === "missing_bib" || st === "name_candidate") return "miss";
    if (st === "wrong_bib") return "wrong-bib";
    if (st === "wrong_distance") return "wrong-dist";
    if (st === "no_official_time") return "no-time";
    return "";
  };
  const body = rows
    .map((r) => {
      const link = r.personalResultUrl
        ? `<a href="${esc(r.personalResultUrl)}" target="_blank" rel="noopener">개인기록</a>`
        : "";
      return `<tr class="${statusClass(r.scrapeStatus)}">
  <td>${esc(r.nickname)}</td>
  <td>${esc(r.realName)}</td>
  <td>${esc(r.memberBib)}</td>
  <td>${esc(r.memberDistance)}</td>
  <td><strong>${esc(r.mismatchLabel)}</strong></td>
  <td>${esc(r.scrapedName)}</td>
  <td>${esc(r.scrapedBib)}</td>
  <td>${esc(r.scrapedDistance)}</td>
  <td>${esc(r.scrapedNetTime)}</td>
  <td>${esc(r.note)}</td>
  <td>${link}</td>
  <td>${esc(r.nameCandidates)}</td>
</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>철원DMZ 2026 기록관 인계</title>
<style>
  :root { --bg:#f7f4ef; --ink:#1a1a1a; --ok:#1b5e20; --miss:#6d4c41; --wb:#b71c1c; --wd:#e65100; --nt:#455a64; }
  body { font-family: "Pretendard", "Noto Sans KR", sans-serif; background: linear-gradient(160deg,#e8f0e6,#f7f4ef 40%,#eef3f8); color:var(--ink); margin:0; padding:24px; }
  h1 { font-size:1.5rem; margin:0 0 8px; }
  .meta { margin-bottom:16px; line-height:1.5; }
  .counts { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 20px; }
  .counts span { background:#fff; border:1px solid #ccc; padding:6px 10px; border-radius:4px; font-size:0.9rem; }
  table { border-collapse:collapse; width:100%; background:#fff; font-size:0.85rem; }
  th, td { border:1px solid #ddd; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#263238; color:#fff; position:sticky; top:0; }
  tr.ok td:nth-child(5) { color:var(--ok); }
  tr.miss td:nth-child(5) { color:var(--miss); }
  tr.wrong-bib td:nth-child(5) { color:var(--wb); }
  tr.wrong-dist td:nth-child(5) { color:var(--wd); }
  tr.no-time td:nth-child(5) { color:var(--nt); }
  a { color:#0d47a1; }
</style>
</head>
<body>
  <h1>${esc(event.eventName || "철원DMZ")} — 기록관 인계</h1>
  <div class="meta">
    <div>이벤트: <code>${esc(EVENT_ID)}</code> · 일자 ${esc(event.eventDate || "")}</div>
    <div>소스: SPCT <code>${esc(SOURCE_ID)}</code> · 생성 ${esc(new Date().toISOString())}</div>
    <div>참가자 ${summary.total}명 · Firestore 미기록(내보내기 전용)</div>
  </div>
  <div class="counts">
    <span>OK ${summary.ok}</span>
    <span>배번 미입력 ${summary.missing_bib}</span>
    <span>배번 오입력 ${summary.wrong_bib}</span>
    <span>종목 오입력 ${summary.wrong_distance}</span>
    <span>공식기록 없음 ${summary.no_official_time}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>닉네임</th><th>실명</th><th>회원배번</th><th>회원종목</th><th>분류</th>
        <th>스크랩이름</th><th>스크랩배번</th><th>스크랩종목</th><th>기록</th>
        <th>비고</th><th>개인페이지</th><th>이름검색후보</th>
      </tr>
    </thead>
    <tbody>
${body}
    </tbody>
  </table>
</body>
</html>
`;
}

function toMarkdown(rows, summary, event) {
  const lines = [];
  lines.push(`# ${event.eventName} — 기록관 인계`);
  lines.push("");
  lines.push(`- 이벤트: \`${EVENT_ID}\` (${event.eventDate})`);
  lines.push(`- SPCT: \`${SOURCE}/${SOURCE_ID}\``);
  lines.push(`- 생성: ${new Date().toISOString()}`);
  lines.push(`- **Firestore 미기록** (내보내기 전용)`);
  lines.push("");
  lines.push("## 요약");
  lines.push("");
  lines.push(`| 분류 | 인원 |`);
  lines.push(`|------|------|`);
  lines.push(`| 전체 | ${summary.total} |`);
  lines.push(`| OK | ${summary.ok} |`);
  lines.push(`| 배번 미입력 | ${summary.missing_bib} |`);
  lines.push(`| 배번 오입력 | ${summary.wrong_bib} |`);
  lines.push(`| 종목 오입력 | ${summary.wrong_distance} |`);
  lines.push(`| 공식기록 없음 (배번·이름 일치) | ${summary.no_official_time} |`);
  lines.push("");
  lines.push("## 기록관 사용법");
  lines.push("");
  lines.push("1. HTML/CSV에서 분류 열을 기준으로 처리.");
  lines.push("2. **OK**: SPCT 개인페이지 링크로 기록 확인 후 확정.");
  lines.push("3. **배번 미입력**: 이름검색후보·링크를 보고 배번 보완 요청.");
  lines.push("4. **배번 오입력**: 회원 배번과 SPCT 실주자 불일치 — 배번 수정 후 재조회.");
  lines.push("5. **종목 오입력**: 이름은 맞지만 종목 다름 — 회원 종목 수정 또는 SPCT 기준 확정.");
  lines.push("6. **공식기록 없음**: 배번·이름·종목은 맞으나 SPCT에 netTime 없음(미완주/칩이슈) — 대회측 확인.");
  lines.push("");
  const problems = rows.filter((r) => r.scrapeStatus !== "ok");
  lines.push(`## 이상 건 (${problems.length})`);
  lines.push("");
  for (const r of problems) {
    lines.push(
      `- **${r.nickname}**(${r.realName}): ${r.mismatchLabel}` +
        (r.memberBib ? ` · 배번 ${r.memberBib}` : "") +
        (r.scrapedName ? ` · SPCT ${r.scrapedName}/${r.scrapedBib}/${r.scrapedDistance}/${r.scrapedNetTime || "-"}` : "") +
        (r.personalResultUrl ? ` · [링크](${r.personalResultUrl})` : "") +
        (r.nameCandidates ? ` · 후보: ${r.nameCandidates}` : "") +
        (r.note ? ` · ${r.note}` : "")
    );
  }
  lines.push("");
  return lines.join("\n");
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const event = await loadEvent(args.fromJson);
  const participants = Array.isArray(event.participants) ? event.participants : [];
  console.log(
    JSON.stringify({
      eventId: event.id || EVENT_ID,
      eventName: event.eventName,
      groupSource: event.groupSource,
      participants: participants.length,
    })
  );

  // gap API for confirmed flags (read-only)
  let confirmedByName = {};
  try {
    const gapRes = await fetch(
      `${PROD_API}?action=group-events&subAction=gap&canonicalEventId=${encodeURIComponent(EVENT_ID)}`
    );
    const gapData = await gapRes.json();
    for (const g of gapData.gap || []) {
      if (g.confirmed) confirmedByName[g.realName] = true;
    }
  } catch (_) {
    /* optional */
  }

  const rows = [];
  for (const p of participants) {
    const nickname = p.nickname || "";
    const realName = p.realName || "";
    const memberBibRaw = p.bib == null ? "" : String(p.bib).trim();
    const memberDist = canonDist(p.distance) || String(p.distance || "").trim();
    const validBib = isValidBib(memberBibRaw);

    const row = {
      nickname,
      realName,
      memberBib: memberBibRaw,
      memberDistance: memberDist || "",
      scrapeStatus: "",
      mismatchLabel: "",
      scrapedName: "",
      scrapedBib: "",
      scrapedDistance: "",
      scrapedNetTime: "",
      note: "",
      personalResultUrl: "",
      nameCandidates: "",
      confirmedInApp: confirmedByName[realName] ? "Y" : "",
    };

    if (!validBib) {
      row.scrapeStatus = "missing_bib";
      if (memberBibRaw) {
        row.note = `배번 형식 오류: "${memberBibRaw}"`;
        row.scrapeStatus = "wrong_bib";
      }
      const candidates = realName ? await fetchSpctByName(realName) : [];
      await sleep(200);
      if (candidates.length === 1 && !memberBibRaw) {
        const c = candidates[0];
        row.scrapeStatus = "name_candidate";
        row.scrapedName = c.name;
        row.scrapedBib = c.bib;
        row.scrapedDistance = c.distance;
        row.scrapedNetTime = c.netTime;
        row.personalResultUrl = c.personalUrl || personalResultUrl(c.bib);
        row.nameCandidates = `${c.name}/${c.bib}/${c.distance}/${c.netTime || "-"}`;
        row.note = (row.note ? row.note + "; " : "") + "이름 검색 단일 후보 — 배번 입력 권장";
      } else if (candidates.length > 1) {
        row.nameCandidates = candidates
          .map((c) => `${c.name}/${c.bib}/${c.distance}/${c.netTime || "-"}`)
          .join(" | ");
        row.note =
          (row.note ? row.note + "; " : "") +
          `이름 검색 ${candidates.length}건 (동명이인) — 수동 확인`;
        // pick first personal url for convenience? better leave empty or list search
        row.personalResultUrl = searchListUrl(realName);
      } else if (!memberBibRaw) {
        row.note = (row.note ? row.note + "; " : "") + "SPCT 이름 검색 결과 없음";
      }
      row.mismatchLabel = classify(row);
      rows.push(row);
      console.log("ROW", row.nickname, row.scrapeStatus, row.note);
      continue;
    }

    const { hit, result, personalUrl } = await fetchSpctByBib(memberBibRaw);
    await sleep(200);
    row.personalResultUrl = personalUrl || personalResultUrl(memberBibRaw);

    if (!hit || !result) {
      row.scrapeStatus = "wrong_bib";
      row.note = "배번으로 SPCT 조회 결과 없음";
      const candidates = realName ? await fetchSpctByName(realName) : [];
      await sleep(200);
      if (candidates.length) {
        row.nameCandidates = candidates
          .map((c) => `${c.name}/${c.bib}/${c.distance}/${c.netTime || "-"}`)
          .join(" | ");
        row.note += "; 이름 검색 후보 있음";
      }
      row.mismatchLabel = classify(row);
      rows.push(row);
      console.log("ROW", row.nickname, row.scrapeStatus);
      continue;
    }

    row.scrapedName = result.name;
    row.scrapedBib = result.bib;
    row.scrapedDistance = result.distance;
    row.scrapedNetTime = result.netTime;

    if (!namesMatch(result.name, realName)) {
      row.scrapeStatus = "wrong_bib";
      row.note = `배번 ${memberBibRaw} 의 SPCT 주자는 "${result.name}" (회원 "${realName}" 과 불일치)`;
      const candidates = realName ? await fetchSpctByName(realName) : [];
      await sleep(200);
      if (candidates.length) {
        row.nameCandidates = candidates
          .map((c) => `${c.name}/${c.bib}/${c.distance}/${c.netTime || "-"}`)
          .join(" | ");
      }
    } else {
      const scrapedDist = canonDist(result.distance);
      if (memberDist && scrapedDist && memberDist !== scrapedDist) {
        row.scrapeStatus = "wrong_distance";
        row.note = `회원 종목 ${memberDist} ≠ SPCT ${scrapedDist} (${result.distanceRaw || result.distance})`;
      } else if (!result.hasOfficialTime) {
        row.scrapeStatus = "no_official_time";
        row.note = `이름·배번·종목 일치하나 공식 netTime 없음 (start=${result.startTime || "-"}, finish=${result.finishTime || "-"})`;
      } else {
        row.scrapeStatus = "ok";
        if (memberDist && !scrapedDist) {
          row.note = "SPCT 종목 파싱 불명확 — 링크 확인";
        }
      }
    }

    row.mismatchLabel = classify(row);
    rows.push(row);
    console.log(
      "ROW",
      row.nickname,
      row.scrapeStatus,
      row.scrapedName,
      row.scrapedNetTime || "-"
    );
  }

  // Treat name_candidate as subset of missing_bib for summary counts
  const summary = {
    total: rows.length,
    ok: rows.filter((r) => r.scrapeStatus === "ok").length,
    missing_bib: rows.filter(
      (r) => r.scrapeStatus === "missing_bib" || r.scrapeStatus === "name_candidate"
    ).length,
    wrong_bib: rows.filter((r) => r.scrapeStatus === "wrong_bib").length,
    wrong_distance: rows.filter((r) => r.scrapeStatus === "wrong_distance").length,
    no_official_time: rows.filter((r) => r.scrapeStatus === "no_official_time").length,
  };

  fs.mkdirSync(args.outDir, { recursive: true });
  const stamp = "2026-09-07";
  const base = `cheorwon_dmz_2026_records_handoff_${stamp}`;
  const csvPath = path.join(args.outDir, `${base}.csv`);
  const htmlPath = path.join(args.outDir, `${base}.html`);
  const mdPath = path.join(args.outDir, `${base}.md`);
  const jsonPath = path.join(args.outDir, `${base}.json`);

  fs.writeFileSync(csvPath, toCsv(rows), "utf8");
  fs.writeFileSync(htmlPath, toHtml(rows, summary, event), "utf8");
  fs.writeFileSync(mdPath, toMarkdown(rows, summary, event), "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ eventId: EVENT_ID, sourceId: SOURCE_ID, summary, rows }, null, 2),
    "utf8"
  );

  // also copy under backup/
  const backupDir = path.join(__dirname, "..", "backup", stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const p of [csvPath, htmlPath, mdPath, jsonPath]) {
    fs.copyFileSync(p, path.join(backupDir, path.basename(p)));
  }

  console.log("SUMMARY", JSON.stringify(summary));
  console.log("WRITTEN", csvPath, htmlPath, mdPath, jsonPath);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
