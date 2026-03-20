/**
 * 스크래핑 공통 모듈 - Cloud Function + CLI 공용
 *
 * 소스별 회원 검색, 이벤트 정보 조회, 거리/시간 유틸리티
 */

const { load: cheerioLoad } = require("cheerio");

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
    overallRank: null, genderRank: null,
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
    gender: null, pace: r.pace || "",
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

async function getSmartChipEventInfo(sourceId) {
  try {
    const res = await fetch(
      `https://www.smartchip.co.kr/Search_Ballyno.html?usedata=${sourceId}`
    );
    const html = await res.text();
    const nameMatch = html.match(/class="box white"[^>]*>\s*([^\n<]{2,80})\s*<\/div>/);
    const title = nameMatch ? nameMatch[1].trim() : `SmartChip ${sourceId}`;

    // main.html selectItem 드롭다운에서 날짜 찾기
    const mainRes = await fetch("https://www.smartchip.co.kr/main.html");
    const mainHtml = await mainRes.text();
    const dateMatch = mainHtml.match(
      new RegExp(`selectItem\\s*\\(\\s*'\\((\\d{4}-\\d{2}-\\d{2})\\)[^']*'\\s*,\\s*'${sourceId}'`)
    );

    return { title, date: dateMatch ? dateMatch[1] : null };
  } catch {
    return { title: `SmartChip ${sourceId}`, date: null };
  }
}

async function getEventInfo(source, sourceId) {
  switch (source) {
    case "spct": return getSPCTEventInfo(sourceId);
    case "myresult": return getMyResultEventInfo(sourceId);
    case "smartchip": return getSmartChipEventInfo(sourceId);
    case "marazone": {
      const comps = await (await fetch("https://raceresult.co.kr/api/record-competitions")).json();
      const match = comps.find((c) => c.comp_title === sourceId);
      return { title: sourceId, date: match?.comp_date || null };
    }
    default: return { title: sourceId, date: null };
  }
}

// ─── PB 유틸리티 ──────────────────────────────────────────────

function buildPBMap(confirmedResults) {
  const pbMap = {};
  for (const d of confirmedResults) {
    const key = `${d.realName}__${d.distance}`;
    const sec = timeToSeconds(d.netTime);
    if (!pbMap[key] || sec < pbMap[key]) {
      pbMap[key] = sec;
    }
  }
  return pbMap;
}

function isPB(pbMap, realName, distance, netTime) {
  const key = `${realName}__${distance}`;
  const sec = timeToSeconds(netTime);
  if (sec === Infinity) return false;
  if (!pbMap[key]) return true;
  return sec < pbMap[key];
}

// ─── 이벤트 발견 ─────────────────────────────────────────────

async function discoverMarazone(year) {
  const res = await fetch("https://raceresult.co.kr/api/record-competitions");
  const data = await res.json();
  return data
    .filter((e) => e.comp_date && e.comp_date.startsWith(String(year)))
    .map((e) => ({
      source: "marazone", sourceId: e.comp_title, name: e.comp_title,
      date: e.comp_date, distances: e.comp_div_ls || "", location: e.comp_place || "",
    }));
}

async function discoverMyResult(year) {
  const res = await fetch("https://myresult.co.kr/api/event", { headers: { Accept: "application/json" } });
  const data = await res.json();
  const events = data.results || data;
  return events
    .filter((e) => e.date && e.date.startsWith(String(year)))
    .map((e) => ({
      source: "myresult", sourceId: String(e.id), name: e.name,
      date: e.date, distances: "", location: e.place_area || "",
    }));
}

async function discoverSPCT(year) {
  const allEvents = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `https://time.spct.kr/main.php?TargetYear=${year}&searchEventName=&currentPage=${page}`;
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerioLoad(html);

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
          source: "spct", sourceId: eventNo, name: text,
          date: dateStr, distances: "", location: "",
        });
      }
    });

    if (page < totalPages) await sleep(DELAY_MS);
    page++;
  }

  return allEvents;
}

async function discoverSmartChip(year) {
  const yearPrefix = String(year);
  const usedataPattern = /usedata=(\d+)/g;
  const eventMap = new Map(); // id → {name, date}

  // main.html만 사용 (result.html은 404)
  const html = await fetch("https://www.smartchip.co.kr/main.html").then((r) => r.text());

  const ids = [...new Set([...html.matchAll(usedataPattern)].map((m) => m[1]))];

  for (const id of ids.filter((id) => id.startsWith(yearPrefix))) {
    // 우선 selectItem 형식 (PAST EVENTS 드롭다운): 날짜와 이름 모두 포함
    // e.g. selectItem('(2026-03-08) 2026 이벤트명', '202650000009')
    const selectMatch = html.match(new RegExp(`selectItem\\s*\\(\\s*'([^']*)'\\s*,\\s*'${id}'`));
    if (selectMatch) {
      const raw = selectMatch[1];
      const dateMatch = raw.match(/(\d{4}-\d{2}-\d{2})/);
      const name = raw.replace(/^\(\d{4}-\d{2}-\d{2}\)\s*/, "").trim();
      eventMap.set(id, { name, date: dateMatch ? dateMatch[1] : "" });
      continue;
    }

    // swiper 슬라이드 형식 (현재/최근 대회): Search_Ballyno.html에서 실제 대회명 가져오기
    const swiperIsPresent = new RegExp(`usedata=${id}'`).test(html);
    if (swiperIsPresent) {
      try {
        await sleep(DELAY_MS);
        const pageHtml = await fetch(
          `https://www.smartchip.co.kr/Search_Ballyno.html?usedata=${id}`
        ).then((r) => r.text());

        // <div class="box white" ...>대회명</div> 패턴
        const nameMatch = pageHtml.match(
          /class="box white"[^>]*>\s*([^\n<]{2,60})\s*<\/div>/
        );
        const realName = nameMatch ? nameMatch[1].trim() : `SmartChip ${id}`;
        eventMap.set(id, { name: realName, date: null });
      } catch {
        eventMap.set(id, { name: `SmartChip ${id}`, date: null });
      }
    }
  }

  return [...eventMap.entries()].map(([id, { name, date }]) => ({
    source: "smartchip", sourceId: id, name, date, distances: "", location: "",
  }));
}

async function discoverAllEvents(year) {
  const sources = [
    { name: "marazone", fn: discoverMarazone },
    { name: "myresult", fn: discoverMyResult },
    { name: "spct", fn: discoverSPCT },
    { name: "smartchip", fn: discoverSmartChip },
  ];

  const allEvents = [];
  for (const { name, fn } of sources) {
    try {
      const events = await fn(year);
      allEvents.push(...events);
    } catch (err) {
      console.error(`[discover:${name}] error: ${err.message}`);
    }
  }

  allEvents.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return allEvents;
}

// ─── 전체 스크래핑 (이벤트 1개 + 회원 N명) ──────────────────

async function scrapeEvent({ source, sourceId, members, pbMap, onProgress }) {
  const info = await getEventInfo(source, sourceId);
  const results = [];

  for (let i = 0; i < members.length; i++) {
    const m = members[i];

    try {
      await sleep(DELAY_MS);
      const found = await searchMember(source, sourceId, m.realName);
      if (!found || found.length === 0) continue;

      const isAmbiguous = found.length > 1;

      for (const r of found) {
        const pb = pbMap ? isPB(pbMap, m.realName, r.distance, r.netTime) : false;
        results.push({
          name: r.name,
          bib: r.bib,
          distance: r.distance,
          netTime: r.netTime,
          gunTime: r.gunTime || "",
          overallRank: r.overallRank || null,
          genderRank: r.genderRank || null,
          pace: r.pace || "",
          memberRealName: m.realName,
          memberNickname: m.nickname,
          memberGender: m.gender || "",
          status: isAmbiguous ? "ambiguous" : "auto",
          candidateCount: found.length,
          isPB: pb,
        });
      }
    } catch (err) {
      // silent per-member error
    }

    if (onProgress && (i + 1) % 10 === 0) {
      await onProgress({ searched: i + 1, total: members.length, found: results.length });
    }
  }

  // 정렬: 종목 순 (full → half → 10K → 5K) → 기록 빠른 순
  results.sort((a, b) => {
    const dOrder = { full: 0, half: 1, "10K": 2, "5K": 3 };
    const da = dOrder[a.distance] ?? 9;
    const db = dOrder[b.distance] ?? 9;
    if (da !== db) return da - db;
    return timeToSeconds(a.netTime) - timeToSeconds(b.netTime);
  });

  return { eventName: info.title, eventDate: info.date, source, sourceId, results };
}

module.exports = {
  normDist, normTime, timeToSeconds, inferGender,
  searchMember, getEventInfo,
  buildPBMap, isPB,
  discoverAllEvents, discoverMarazone, discoverMyResult, discoverSPCT, discoverSmartChip,
  scrapeEvent,
  sleep, DELAY_MS,
};
