/**
 * 스크래핑 공통 모듈 - Cloud Function + CLI 공용
 *
 * 소스별 회원 검색, 이벤트 정보 조회, 거리/시간 유틸리티
 */

const { load: cheerioLoad } = require("cheerio");

const DELAY_MS = 200;
// SmartChip은 대량 요청 시 IP 차단 → 별도 딜레이 (3초)
const SMARTCHIP_DELAY_MS = 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 봇 감지 우회 유틸리티 ───────────────────────────────────

// 랜덤 지터: base ± jitter 범위에서 무작위 딜레이 (기계적 고정 패턴 제거)
function randomDelay(baseMs, jitterMs = baseMs * 0.4) {
  const delta = (Math.random() * 2 - 1) * jitterMs;
  return Math.max(100, Math.round(baseMs + delta));
}

// User-Agent 풀: 실제 브라우저 UA 로테이션
const USER_AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// 소스별 브라우저처럼 보이는 헤더 세트
function browserHeaders(source) {
  const ua = randomUA();
  const base = {
    "User-Agent": ua,
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
  };
  const sourceReferers = {
    smartchip: "https://smartchip.co.kr/",
    myresult: "https://myresult.co.kr/",
    spct: "https://time.spct.kr/",
    marazone: "https://raceresult.co.kr/",
  };
  if (sourceReferers[source]) base["Referer"] = sourceReferers[source];
  return base;
}

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

  // 순위 파싱: .rank li 순서 → 전체/성별/연령부
  let overallRank = null, genderRank = null, ageGroupRank = null;
  $(".rank li").each((i, el) => {
    const spans = $(el).find("span");
    const rankNum = parseInt($(spans[0]).text().trim());
    const totalText = $(spans[1]).text().replace("/", "").trim();
    const total = parseInt(totalText) || null;
    const label = $(el).find("p").first().text();
    if (i === 0) {
      overallRank = isNaN(rankNum) ? null : rankNum;
    } else if (i === 1) {
      genderRank = isNaN(rankNum) ? null : rankNum;
    } else if (i === 2) {
      ageGroupRank = isNaN(rankNum) ? null : (total ? `${rankNum}/${total}` : String(rankNum));
    }
  });

  // 구간 스플릿: Section 1/2/3 테이블
  const splits = [];
  $("table tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 2) return;
    const label = $(cells[0]).text().trim();
    const rawCell = $(cells[1]).text().trim();
    const elapsedMatch = rawCell.match(/\((\d{2}:\d{2}:\d{2}(?:\.\d+)?)\)/);
    if (label && elapsedMatch) {
      splits.push({ label, time: elapsedMatch[1].substring(0, 8) });
    }
  });

  return {
    name, bib, distance: dist,
    netTime: normTime(time), gunTime: "",
    gender: gender || null,
    overallRank, genderRank, ageGroupRank,
    splits, pace: "",
  };
}

async function searchSPCT(eventNo, memberName) {
  const year = eventNo.substring(0, 4);
  const url = `https://time.spct.kr/m1.php?TargetYear=${year}&EVENT_NO=${eventNo}&currentPage=1&searchResultsName=${encodeURIComponent(memberName)}`;
  const spctHeaders = {
    ...browserHeaders("spct"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
  const res = await fetch(url, { headers: spctHeaders });
  const html = await res.text();
  if (html.includes("alert('Something Wrong") || html.length < 200) return [];

  const redirectMatch = html.match(/location\.href\s*=\s*"(m2\.php[^"]+)"/);
  if (redirectMatch) {
    const dHtml = await (await fetch(`https://time.spct.kr/${redirectMatch[1]}`, { headers: spctHeaders })).text();
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
    const dHtml = await (await fetch(`https://time.spct.kr/${link}`, { headers: spctHeaders })).text();
    const parsed = await spctParseDetailPage(dHtml, memberName);
    if (parsed.netTime) results.push(parsed);
    await sleep(randomDelay(200));
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

function parseSmartChipResult(html, memberName) {
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

  // Total_Rank URL의 gender= 파라미터에서 성별 추출
  const genderUrlMatch = html.match(/Total_Rank\.asp[^"']*gender=([^&"']+)/i);
  let gender = null;
  if (genderUrlMatch) {
    const genderRaw = decodeURIComponent(genderUrlMatch[1]);
    if (genderRaw === "남" || genderRaw.toLowerCase() === "male" || genderRaw.toLowerCase() === "m") gender = "M";
    else if (genderRaw === "여" || genderRaw.toLowerCase() === "female" || genderRaw.toLowerCase() === "f") gender = "F";
  }

  if (!netTime) return null;
  return {
    name, bib, distance, netTime: normTime(netTime), gunTime: "",
    overallRank, genderRank: null, ageGroupRank: null,
    gender, splits: [], pace: "",
  };
}

// SmartChip 세션 쿠키 발급 (dongma.html 방문 → ASPSESSIONID 쿠키 수령)
// 호출 당 1회만 발급하고 재사용한다.
async function getSmartChipSession() {
  try {
    const resp = await fetch("https://smartchip.co.kr/dongma.html", {
      headers: {
        ...browserHeaders("smartchip"),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const setCookie = resp.headers.get("set-cookie") || "";
    // "ASPSESSIONIDXXXX=YYYY; secure; path=/" → "ASPSESSIONIDXXXX=YYYY"
    const sessionCookie = setCookie.split(";")[0].trim();
    if (sessionCookie) {
      console.log(`[SmartChip] 세션 발급 완료: ${sessionCookie.substring(0, 20)}...`);
    }
    return sessionCookie;
  } catch (e) {
    console.warn(`[SmartChip] 세션 발급 실패: ${e.message}`);
    return "";
  }
}

// SmartChip 응답이 "잘못된 접속 경로" (세션 만료) 인지 확인
function isSmartChipSessionExpired(html) {
  return html.includes("잘못된 접속 경로") || html.includes("goHome=1");
}

async function searchSmartChip(eventId, memberName, session = "") {
  const commonHeaders = {
    ...browserHeaders("smartchip"),
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...(session ? { "Cookie": session } : {}),
  };

  const params = new URLSearchParams();
  params.append("nameorbibno", memberName);
  params.append("usedata", eventId);
  const res = await fetch("https://www.smartchip.co.kr/return_data_livephoto.asp", {
    method: "POST",
    headers: commonHeaders,
    body: params.toString(),
  });
  const html = await res.text();

  // 세션 만료 감지 → 호출자에게 알림 (null 반환으로 구분)
  if (isSmartChipSessionExpired(html)) {
    console.warn(`[SmartChip] 세션 만료 감지 (${memberName})`);
    return null;
  }

  // 동명이인: name_search_result.asp로 리다이렉트 → 배번 목록 파싱 후 각각 재검색
  if (html.includes("name_search_result.asp")) {
    const yearGbn = eventId.slice(0, 4);
    const rallyNo = eventId.slice(4);
    const listUrl = `https://www.smartchip.co.kr/name_search_result.asp?name=${encodeURIComponent(memberName)}&Year_Gbn=${yearGbn}&Rally_no=${rallyNo}`;
    try {
      const listRes = await fetch(listUrl, { headers: { ...commonHeaders } });
      const listHtml = await listRes.text();
      const $ = cheerioLoad(listHtml);
      const bibs = [];
      $("td").each((_, el) => {
        const text = $(el).text().trim();
        if (/^\d{3,6}$/.test(text)) bibs.push(text);
      });

      const results = [];
      for (const bib of bibs) {
        await sleep(DELAY_MS);
        const bibParams = new URLSearchParams();
        bibParams.append("nameorbibno", bib);
        bibParams.append("usedata", eventId);
        const bibRes = await fetch("https://www.smartchip.co.kr/return_data_livephoto.asp", {
          method: "POST",
          headers: commonHeaders,
          body: bibParams.toString(),
        });
        const bibHtml = await bibRes.text();
        const r = parseSmartChipResult(bibHtml, memberName);
        if (r) results.push(r);
      }
      return results;
    } catch {
      return [];
    }
  }

  if (html.includes("기록이 없습니다") || html.length < 5000) return [];

  const r = parseSmartChipResult(html, memberName);
  return r ? [r] : [];
}

// ─── MyResult 검색 ────────────────────────────────────────────

async function searchMyResult(eventId, memberName) {
  const url = `https://myresult.co.kr/api/event/${eventId}/player?q=${encodeURIComponent(memberName)}`;
  const res = await fetch(url, {
    headers: {
      ...browserHeaders("myresult"),
      "Accept": "application/json, text/plain, */*",
    },
  });
  if (!res.ok) return [];
  const players = await res.json();
  return (players || []).map((p) => ({
    name: p.name || memberName,
    bib: String(p.num || ""),
    distance: normDist(p.course_cd || ""),
    netTime: normTime(p.result_nettime || ""),
    gunTime: normTime(p.result_guntime || ""),
    overallRank: null, genderRank: null, ageGroupRank: null,
    gender: p.gender ? p.gender.toUpperCase() : null,
    splits: [],
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
    headers: {
      ...browserHeaders("marazone"),
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
    },
    body: JSON.stringify({ comp_title: compTitle, name: memberName, bibNum: "" }),
  });
  if (!res.ok) return [];
  const records = await res.json();
  return (records || []).map((r) => {
    // O_rank / G_rank / A_rank: "931/2605" 형식 → rank, total 분리
    const parseRankStr = (s) => {
      if (!s || s === "-") return { rank: null, total: null };
      const [a, b] = String(s).split("/");
      return { rank: parseInt(a) || null, total: parseInt(b) || null };
    };
    const oRank = parseRankStr(r.O_rank);
    const gRank = parseRankStr(r.G_rank);
    const aRank = parseRankStr(r.A_rank);

    // 성별: "M"/"F" 또는 "남"/"여" 처리
    let gender = null;
    if (r.Sex) {
      const s = r.Sex.trim();
      if (s === "M" || s === "남" || s.toLowerCase() === "male") gender = "M";
      else if (s === "F" || s === "여" || s.toLowerCase() === "female") gender = "F";
    }

    // 구간 스플릿: CP_01~CP_04_TIME (값이 "-" 아닌 것만)
    const splits = [];
    for (let i = 1; i <= 4; i++) {
      const pad = String(i).padStart(2, "0");
      const t = r[`CP_${pad}_TIME`];
      const label = r[`CP_${pad}_NAME`] || `CP${pad}`;
      if (t && t !== "-") splits.push({ label, time: t });
    }

    return {
      name: r.Name || r.name || memberName,
      bib: r.Bib || r.bib_num || "",
      distance: normDist(r.Division || ""),
      netTime: normTime(r.Time || ""),
      gunTime: "",
      overallRank: oRank.rank,
      genderRank: gRank.rank,
      ageGroupRank: aRank.rank !== null ? `${aRank.rank}/${aRank.total}` : null,
      gender, splits,
      pace: r.Pace || r.pace || "",
    };
  });
}

// ─── 검색 라우터 + 이벤트 정보 ───────────────────────────────

async function searchMember(source, sourceId, memberName, { session = "" } = {}) {
  switch (source) {
    case "spct": return searchSPCT(sourceId, memberName);
    case "smartchip": return searchSmartChip(sourceId, memberName, session);
    case "myresult": return searchMyResult(sourceId, memberName);
    case "marazone": return searchMarazone(sourceId, memberName);
    default: return [];
  }
}

async function getSmartChipEventInfo(sourceId) {
  let title = `SmartChip ${sourceId}`;
  let date = null;

  // 1) Search_Ballyno.html에서 정확한 대회명
  try {
    const res = await fetch(
      `https://www.smartchip.co.kr/Search_Ballyno.html?usedata=${sourceId}`
    );
    const html = await res.text();
    const nameMatch = html.match(/class="box white"[^>]*>\s*([^\n<]{2,80})\s*<\/div>/);
    if (nameMatch) title = nameMatch[1].trim();
  } catch { /* ignore */ }

  // 2) main.html selectItem 드롭다운에서 날짜 (과거 대회)
  try {
    const mainRes = await fetch("https://www.smartchip.co.kr/main.html");
    const mainHtml = await mainRes.text();
    const dateMatch = mainHtml.match(
      new RegExp(`selectItem\\s*\\(\\s*'\\((\\d{4}-\\d{2}-\\d{2})\\)[^']*'\\s*,\\s*'${sourceId}'`)
    );
    if (dateMatch) date = dateMatch[1];
  } catch { /* ignore */ }

  // 3) 날짜 못 찾으면: Smart_Member_Recorddata_Select.asp로 rally_date 추출
  //    인증 불필요. sourceId = Year_Gbn(4자리) + Rally_Id(나머지).
  //    참가 기록이 있는 회원의 memberid가 필요하므로 여러 명 시도.
  if (!date) {
    const yearGbn = sourceId.slice(0, 4);
    const rallyId = sourceId.slice(4);
    const PROBE_IDS = ["79813", "78498", "80001", "75000", "82000"];

    for (const mid of PROBE_IDS) {
      try {
        const memberRes = await fetch(
          "https://smartchip.co.kr/data/Smart_Member_Recorddata_Select.asp",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
            body: `memberid=${mid}`,
          }
        );
        const records = await memberRes.json();
        const match = records.find(
          (r) => r.Year_Gbn === yearGbn && r.Rally_Id === rallyId
        );
        if (match?.rally_date) {
          date = match.rally_date;
          if (match.rally_name && title.startsWith("SmartChip")) title = match.rally_name;
          break;
        }
      } catch { /* ignore, try next */ }
    }
  }

  return { title, date };
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
  const allEvents = [];
  let page = 1;
  const maxPages = 20;

  while (page <= maxPages) {
    const res = await fetch(`https://myresult.co.kr/api/event?page=${page}`, { headers: { Accept: "application/json" } });
    const data = await res.json();
    const events = data.results || data;
    if (!events || events.length === 0) break;
    allEvents.push(...events);
    const total = data.total || 0;
    if (allEvents.length >= total) break;
    page++;
    await sleep(DELAY_MS);
  }

  return allEvents
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

  // 1) dongma.html — 동아일보 전용 대회 (일반 main.html에 노출 안 됨)
  // e.g. 서울마라톤, SEOUL RACE, 공주백제마라톤, 경주국제마라톤 등
  try {
    const dongmaHtml = await fetch("https://smartchip.co.kr/dongma.html").then((r) => r.text());

    // PAST EVENT 드롭다운: <option value="202550000218">(2025-10-18) 2025 경주국제마라톤</option>
    const optionMatches = [...dongmaHtml.matchAll(/<option\s+value="(\d+)">\((\d{4}-\d{2}-\d{2})\)\s*([^<]+)<\/option>/g)];
    for (const m of optionMatches) {
      const id = m[1];
      const date = m[2];
      const name = m[3].trim();
      if (id.startsWith(yearPrefix)) eventMap.set(id, { name, date });
    }

    // 현재 대회 슬라이드 (swiper): onclick="location.href='Search_Ballyno.html?usedata=XXXXXXXXX'"
    const swiperMatches = [...dongmaHtml.matchAll(/usedata=(\d+)['"`]/g)];
    for (const m of swiperMatches) {
      const id = m[1];
      if (id.startsWith(yearPrefix) && !eventMap.has(id)) {
        // 날짜는 드롭다운에 없으니 일단 name만 등록 (getSmartChipEventInfo에서 보완)
        eventMap.set(id, { name: `SmartChip ${id}`, date: null });
      }
    }
  } catch (err) {
    console.warn(`[discoverSmartChip] dongma.html fetch failed: ${err.message}`);
  }

  // 2) main.html — 일반 대회 (현재 리다이렉트 이슈 있어 실패해도 무시)
  try {
    const html = await fetch("https://www.smartchip.co.kr/main.html").then((r) => r.text());

    // selectItem 형식 (PAST EVENTS 드롭다운): 날짜와 이름 모두 포함
    const selectMatches = [...html.matchAll(/selectItem\s*\(\s*'([^']*)'\s*,\s*'(\d+)'/g)];
    for (const m of selectMatches) {
      const raw = m[1];
      const id = m[2];
      if (!id.startsWith(yearPrefix) || eventMap.has(id)) continue;
      const dateMatch = raw.match(/(\d{4}-\d{2}-\d{2})/);
      const name = raw.replace(/^\(\d{4}-\d{2}-\d{2}\)\s*/, "").trim();
      eventMap.set(id, { name, date: dateMatch ? dateMatch[1] : "" });
    }

    // swiper 슬라이드 형식 (현재/최근 대회): selectItem에 없는 것만
    const ids = [...new Set([...html.matchAll(usedataPattern)].map((m) => m[1]))];
    for (const id of ids.filter((id) => id.startsWith(yearPrefix) && !eventMap.has(id))) {
      const swiperIsPresent = new RegExp(`usedata=${id}'`).test(html);
      if (swiperIsPresent) {
        try {
          await sleep(DELAY_MS);
          const pageHtml = await fetch(
            `https://www.smartchip.co.kr/Search_Ballyno.html?usedata=${id}`
          ).then((r) => r.text());

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
  } catch (err) {
    console.warn(`[discoverSmartChip] main.html fetch failed: ${err.message}`);
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

async function scrapeEvent({ source, sourceId, members, pbMap, onProgress, db, serverTimestamp, skipCached = false }) {
  const info = await getEventInfo(source, sourceId);
  const results = [];

  // skipCached=true 이면 이미 search_cache에 있는 회원은 건너뜀 (재개 용도)
  let cachedKeys = new Set();
  if (skipCached && db) {
    try {
      const snap = await db.collection("search_cache")
        .where("source", "==", source)
        .where("sourceId", "==", sourceId)
        .get();
      snap.forEach((doc) => cachedKeys.add(doc.data().realName));
      console.log(`[scrapeEvent] 캐시 ${cachedKeys.size}명 건너뜀 (${source}_${sourceId})`);
    } catch (e) {
      console.warn(`[scrapeEvent] cache check failed: ${e.message}`);
    }
  }

  // SmartChip은 차단 방지를 위해 긴 딜레이 + 랜덤 지터 사용
  const baseDelay = source === "smartchip" ? SMARTCHIP_DELAY_MS : DELAY_MS;
  let smartchipSession = "";
  if (source === "smartchip") {
    smartchipSession = await getSmartChipSession();
  }

  let failCount = 0;
  const FAIL_THRESHOLD = 0.2; // 실패율 20% 초과 시 partial_failure

  for (let i = 0; i < members.length; i++) {
    const m = members[i];

    // 이미 캐시된 회원 건너뜀
    if (skipCached && cachedKeys.has(m.realName)) continue;

    // ② 재시도 포함 검색 (최대 2회: 최초 시도 + 1회 재시도)
    let found = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          // 재시도 전 약간 더 기다림
          await sleep(randomDelay(baseDelay * 1.5));
          console.warn(`[scrapeEvent] 재시도 ${attempt}회 (${m.realName})`);
        } else {
          await sleep(randomDelay(baseDelay));
        }

        found = await searchMember(source, sourceId, m.realName, { session: smartchipSession });

        // SmartChip 세션 만료 감지 → 재발급 후 즉시 재시도
        if (found === null && source === "smartchip") {
          console.warn(`[scrapeEvent] SmartChip 세션 재발급 시도 (${m.realName})`);
          smartchipSession = await getSmartChipSession();
          await sleep(randomDelay(baseDelay));
          found = await searchMember(source, sourceId, m.realName, { session: smartchipSession });
          if (found === null) found = [];
        }

        lastErr = null;
        break; // 성공 시 재시도 루프 탈출
      } catch (err) {
        lastErr = err;
      }
    }

    // ③ 재시도 후에도 실패 시 failCount 누적
    if (lastErr !== null) {
      failCount++;
      console.warn(`[scrapeEvent] 실패 (${m.realName}): ${lastErr.message}`);
      if (onProgress && (i + 1) % 10 === 0) {
        await onProgress({ searched: i + 1, total: members.length, found: results.length, failCount });
      }
      continue;
    }

    if (!found || found.length === 0) {
      // search_cache에 결과 없음 기록
      if (db) {
        const cacheKey = `${source}_${sourceId}_${m.realName}`.substring(0, 1500);
        db.collection("search_cache").doc(cacheKey).set({
          realName: m.realName, source, sourceId,
          found: false, result: null,
          cachedAt: serverTimestamp || new Date(),
        }).catch(() => {});
      }
      if (onProgress && (i + 1) % 10 === 0) {
        await onProgress({ searched: i + 1, total: members.length, found: results.length, failCount });
      }
      continue;
    }

    // search_cache 동시 쓰기 (Dual-Write Rule)
    if (db) {
      const cacheKey = `${source}_${sourceId}_${m.realName}`.substring(0, 1500);
      db.collection("search_cache").doc(cacheKey).set({
        realName: m.realName,
        source,
        sourceId,
        found: true,
        result: {
          eventName: info.title,
          eventDate: info.date,
          source,
          sourceId,
          records: found.map((r) => ({
            ...r,
            memberRealName: m.realName,
            memberNickname: m.nickname,
            memberGender: m.gender || "",
          })),
        },
        cachedAt: serverTimestamp || new Date(),
      }).catch(() => {});
    }

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

    if (onProgress && (i + 1) % 10 === 0) {
      await onProgress({ searched: i + 1, total: members.length, found: results.length, failCount });
    }
  }

  // ③ 실패율 계산 → partial_failure 플래그
  const searched = members.length - cachedKeys.size;
  const failRate = searched > 0 ? failCount / searched : 0;
  const hasPartialFailure = failRate > FAIL_THRESHOLD && failCount >= 5;
  if (hasPartialFailure) {
    console.warn(`[scrapeEvent] 실패율 ${Math.round(failRate * 100)}% (${failCount}/${searched}명) → partial_failure`);
  }

  // 정렬: 종목 순 (full → half → 10K → 5K) → 기록 빠른 순
  results.sort((a, b) => {
    const dOrder = { full: 0, half: 1, "10K": 2, "5K": 3 };
    const da = dOrder[a.distance] ?? 9;
    const db2 = dOrder[b.distance] ?? 9;
    if (da !== db2) return da - db2;
    return timeToSeconds(a.netTime) - timeToSeconds(b.netTime);
  });

  return {
    eventName: info.title, eventDate: info.date, source, sourceId, results,
    failCount, failRate: Math.round(failRate * 100),
    jobStatus: hasPartialFailure ? "partial_failure" : "complete",
  };
}

module.exports = {
  normDist, normTime, timeToSeconds, inferGender,
  searchMember, getEventInfo,
  buildPBMap, isPB,
  discoverAllEvents, discoverMarazone, discoverMyResult, discoverSPCT, discoverSmartChip,
  scrapeEvent, getSmartChipSession,
  sleep, DELAY_MS, SMARTCHIP_DELAY_MS,
};
