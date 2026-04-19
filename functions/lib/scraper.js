/**
 * 스크래핑 공통 모듈 - Cloud Function + CLI 공용
 *
 * 소스별 회원 검색, 이벤트 정보 조회, 거리/시간 유틸리티
 */

const { load: cheerioLoad } = require("cheerio");
const { normalizeRaceDistance } = require("./raceDistance");

const DELAY_MS = 200;
// SmartChip은 대량 요청 시 IP 차단 → 별도 딜레이 (3초)
const SMARTCHIP_DELAY_MS = 3000;
/** discover / main.html 은 이 호스트 + Referer 조합으로만 전체 HTML 제공 */
const SMARTCHIP_ORIGIN = "https://smartchip.co.kr";
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
    gorunning: "https://gorunning.kr/",
  };
  if (sourceReferers[source]) base["Referer"] = sourceReferers[source];
  return base;
}

// ─── 거리/시간 유틸리티 ──────────────────────────────────────

/** @deprecated use normalizeRaceDistance from ./raceDistance */
function normDist(raw) {
  return normalizeRaceDistance(raw);
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
  const linkTexts = new Map(); // href -> linkText (배번/종목 추출용)
  
  $("a[href*='m2.php']").each((_, a) => {
    const href = $(a).attr("href");
    const text = $(a).text().trim(); // "[ 15881 ] 10KM - 이수진"
    if (href && !links.includes(href)) {
      links.push(href);
      linkTexts.set(href, text);
    }
  });

  const results = [];
  for (const link of links) {
    const dHtml = await (await fetch(`https://time.spct.kr/${link}`, { headers: spctHeaders })).text();
    const parsed = await spctParseDetailPage(dHtml, memberName);
    
    // 목록 페이지 텍스트에서 distance 추출 시도 (fallback)
    // 형식: "[ 15881 ] 10KM - 이수진" 또는 "[ 25186 ] HALF - 이수진"
    if (!parsed.distance || parsed.distance === 'unknown') {
      const linkText = linkTexts.get(link) || '';
      const distMatch = linkText.match(/\]\s*([^-\s]+)\s*-/);
      if (distMatch) {
        const extractedDist = normDist(distMatch[1].trim());
        if (extractedDist && extractedDist !== 'unknown') {
          parsed.distance = extractedDist;
        }
      }
    }
    
    if (parsed.netTime) results.push(parsed);
    await sleep(randomDelay(200));
  }
  return results;
}

async function getSPCTEventInfo(eventNo) {
  const year = eventNo.substring(0, 4);
  const url = `https://time.spct.kr/m1.php?TargetYear=${year}&EVENT_NO=${eventNo}&currentPage=1`;
  const res = await fetch(url, {
    headers: { ...browserHeaders("spct"), Accept: "text/html,*/*" },
  });
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
    const resp = await fetch(`${SMARTCHIP_ORIGIN}/dongma.html`, {
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
  const res = await fetch(`${SMARTCHIP_ORIGIN}/return_data_livephoto.asp`, {
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
    const listUrl = `${SMARTCHIP_ORIGIN}/name_search_result.asp?name=${encodeURIComponent(memberName)}&Year_Gbn=${yearGbn}&Rally_no=${rallyNo}`;
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
        const bibRes = await fetch(`${SMARTCHIP_ORIGIN}/return_data_livephoto.asp`, {
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
  return (players || []).map((p) => {
    const rawNet = p.result_nettime != null ? String(p.result_nettime) : "";
    const rawGun = p.result_guntime != null ? String(p.result_guntime) : "";
    const nNet = normTime(rawNet);
    const nGun = normTime(rawGun);
    return {
    name: p.name || memberName,
    bib: String(p.num || ""),
    distance: normDist(p.course_cd || ""),
    netTime: nNet || nGun,
    gunTime: nGun,
    overallRank: null, genderRank: null, ageGroupRank: null,
    gender: p.gender ? p.gender.toUpperCase() : null,
    splits: [],
    pace: p.pace_nettime || "",
    };
  });
}

async function getMyResultEventInfo(eventId) {
  const res = await fetch(`https://myresult.co.kr/api/event/${eventId}`, {
    headers: { ...browserHeaders("myresult"), Accept: "application/json" },
  });
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

// ─── Ohmyrace 검색 ────────────────────────────────────────────

async function searchOhmyrace(eventId, memberName) {
  const url = "http://record.ohmyrace.co.kr/theme/ohmyrace/mobile/skin/board/event/view.data.php";

  async function postOhmyrace(bib, cate = "") {
    const params = new URLSearchParams();
    params.append("table", "event");
    params.append("wr_id", eventId);
    params.append("bib", bib);
    params.append("cate", cate);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": `http://record.ohmyrace.co.kr/event/${eventId}`,
      },
      body: params.toString(),
    });

    if (!res.ok) return null;
    return res.text();
  }

  function parseNameCards($) {
    const results = [];
    $(".name-card").each((_, card) => {
      const $card = $(card);

      const name = $card.find(".name-box h3").text().trim();
      const bibText = $card.find(".name-box li").last().text().trim();
      const bib = bibText.replace("#", "").trim();

      const infoText = $card.find(".name-box li").first().text().trim();
      const [distance, genderText] = infoText.split("/").map(s => s.trim());

      const timeText = $card.find(".record-box h3").first().text().trim();

      const rankTexts = $card.find(".record-box h4");
      let overallRank = null;
      let genderRank = null;

      rankTexts.each((i, el) => {
        const text = $(el).text().trim();
        if (text.includes("/")) {
          const [rank] = text.split("/").map(s => s.trim());
          if (i === 0) overallRank = parseInt(rank);
          else if (i === 1) genderRank = parseInt(rank);
        }
      });

      if (name && timeText) {
        results.push({
          name,
          bib,
          distance: normDist(distance),
          netTime: normTime(timeText),
          gunTime: "",
          overallRank,
          genderRank,
          ageGroupRank: null,
          gender: genderText === "남" ? "M" : genderText === "여" ? "F" : null,
          splits: [],
          pace: "",
        });
      }
    });
    return results;
  }

  // 1단계: 이름(또는 배번)으로 검색
  const html = await postOhmyrace(memberName, "");
  if (!html) return [];

  const $ = cheerioLoad(html);

  // 직접 기록이 반환된 경우
  const directResults = parseNameCards($);
  if (directResults.length > 0) return directResults;

  // 동명이인 목록이 반환된 경우 — bib별로 중복 제거 후 2차 조회
  const nameEntries = [];
  const seenBibs = new Set();
  $(".name-result").each((_, el) => {
    const bib = $(el).attr("data-bib");
    const cate = $(el).attr("data-cate") || "";
    if (bib && !seenBibs.has(bib)) {
      seenBibs.add(bib);
      nameEntries.push({ bib, cate });
    }
  });

  if (nameEntries.length === 0) return [];

  // 2단계: 각 배번으로 병렬 조회
  const htmls = await Promise.all(nameEntries.map(({ bib, cate }) => postOhmyrace(bib, cate)));

  const results = [];
  for (const html2 of htmls) {
    if (!html2) continue;
    const $2 = cheerioLoad(html2);
    results.push(...parseNameCards($2));
  }

  return results;
}

// ─── 검색 라우터 + 이벤트 정보 ───────────────────────────────

async function searchMember(source, sourceId, memberName, { session = "" } = {}) {
  switch (source) {
    case "spct": return searchSPCT(sourceId, memberName);
    case "smartchip": return searchSmartChip(sourceId, memberName, session);
    case "myresult": return searchMyResult(sourceId, memberName);
    case "marazone": return searchMarazone(sourceId, memberName);
    case "ohmyrace": return searchOhmyrace(sourceId, memberName);
    default: return [];
  }
}

async function getSmartChipEventInfo(sourceId) {
  let title = `SmartChip ${sourceId}`;
  let date = null;
  const scHeaders = browserHeaders("smartchip");

  // 1) Search_Ballyno.html에서 정확한 대회명
  try {
    const res = await fetch(
      `${SMARTCHIP_ORIGIN}/Search_Ballyno.html?usedata=${sourceId}`,
      { headers: scHeaders }
    );
    const html = await res.text();
    const nameMatch = html.match(/class="box white"[^>]*>\s*([^\n<]{2,80})\s*<\/div>/);
    if (nameMatch) title = nameMatch[1].trim();
  } catch { /* ignore */ }

  // 2) main.html selectItem 드롭다운에서 날짜 (과거 대회)
  // Referer 없으면 318B 리다이렉트 스텁만 옴 — discover 와 동일 조건 필수
  try {
    const mainRes = await fetch(`${SMARTCHIP_ORIGIN}/main.html`, { headers: scHeaders });
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

async function getOhmyraceEventInfo(sourceId) {
  let title = `Ohmyrace Event ${sourceId}`;
  let date = null;

  try {
    const res = await fetch(`http://record.ohmyrace.co.kr/event/${sourceId}`);
    const html = await res.text();
    
    // 제목 추출: <title>대회명 > EVENT | (주)오마이레이스</title>
    const titleMatch = html.match(/<title>([^>]+) > EVENT/);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }
    
    // 날짜 추출 시도: 여러 패턴
    // 패턴 1: <span class="new_data">2026. 04. 05</span>
    const dateMatch1 = html.match(/<span class="new_data">(\d{4}\.\s*\d{2}\.\s*\d{2})<\/span>/);
    if (dateMatch1) {
      date = dateMatch1[1].replace(/\.\s*/g, '-'); // "2026. 04. 05" → "2026-04-05"
    }
    
    // 패턴 2: YYYY-MM-DD 형식이 있으면
    if (!date) {
      const dateMatch2 = html.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch2) date = dateMatch2[1];
    }
  } catch (err) {
    // 네트워크 오류 등 무시, 기본값 반환
  }

  return { title, date };
}

async function getEventInfo(source, sourceId) {
  switch (source) {
    case "spct": return getSPCTEventInfo(sourceId);
    case "myresult": return getMyResultEventInfo(sourceId);
    case "smartchip": return getSmartChipEventInfo(sourceId);
    case "ohmyrace": return getOhmyraceEventInfo(sourceId);
    case "marazone": {
      const comps = await (await fetch("https://raceresult.co.kr/api/record-competitions", {
        headers: { ...browserHeaders("marazone"), Accept: "application/json" },
      })).json();
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
  const res = await fetch("https://raceresult.co.kr/api/record-competitions", {
    headers: { ...browserHeaders("marazone"), Accept: "application/json" },
  });
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
  const maxPages = 35;

  while (page <= maxPages) {
    const res = await fetch(`https://myresult.co.kr/api/event?page=${page}`, {
      headers: { ...browserHeaders("myresult"), Accept: "application/json" },
    });
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
    const res = await fetch(url, {
      headers: { ...browserHeaders("spct"), Accept: "text/html,*/*" },
    });
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
  const scHeaders = browserHeaders("smartchip");

  // 1) dongma.html — 동아일보 전용 대회 (일반 main.html에 노출 안 됨)
  // e.g. 서울마라톤, SEOUL RACE, 공주백제마라톤, 경주국제마라톤 등
  try {
    const dongmaHtml = await fetch(`${SMARTCHIP_ORIGIN}/dongma.html`, { headers: scHeaders }).then((r) => r.text());

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

  // 2) main.html — 일반 대회
  // www 또는 Referer 없이 요청하면 318B JS 스텁만 옴. smartchip.co.kr + Referer 필수.
  try {
    const html = await fetch(`${SMARTCHIP_ORIGIN}/main.html`, { headers: scHeaders }).then((r) => r.text());

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
      const swiperIsPresent =
        new RegExp(`usedata=${id}['"]`).test(html) ||
        new RegExp(`usedata=${id}(?=[^0-9])`).test(html);
      if (swiperIsPresent) {
        try {
          await sleep(DELAY_MS);
          const pageHtml = await fetch(
            `${SMARTCHIP_ORIGIN}/Search_Ballyno.html?usedata=${id}`,
            { headers: scHeaders }
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

// ─── Ohmyrace 대회 발견 ──────────────────────────────────────
async function discoverOhmyrace(year) {
  const res = await fetch("http://record.ohmyrace.co.kr/event");
  const html = await res.text();
  const $ = cheerioLoad(html);

  const events = [];
  $("li").each((_, el) => {
    const nameEl = $(el).find(".new_sbj a");
    if (!nameEl.length) return;

    const name = nameEl.text()
      .replace(/예정|종료/g, "")
      .trim();
    const dateText = $(el).find(".new_data").text().trim();

    if (name && dateText.startsWith(String(year))) {
      const date = dateText.replace(/\.\s*/g, "-").trim();
      const href = nameEl.attr("href") || "";
      const idMatch = href.match(/event\/(\d+)/);

      if (idMatch) {
        events.push({
          source: "ohmyrace",
          sourceId: idMatch[1],
          name,
          date,
          distances: "",
          location: "",
        });
      }
    }
  });

  return events;
}

const GORUNNING_ORIGIN = "https://gorunning.kr";
const RUNNINGWIKII_ORIGIN = "https://runningwikii.com";

/**
 * 고러닝 월간 일정 (예: https://gorunning.kr/races/monthly/2026-03/)
 * 날짜 앵커 div#race-YYYY-MM-DD + 데스크톱 표(table.min-w-full)만 사용 (모바일 카드 중복 제외)
 */
async function discoverGoRunningMonthly(yearMonth) {
  const url = `${GORUNNING_ORIGIN}/races/monthly/${yearMonth}/`;
  const res = await fetch(url, {
    headers: { ...browserHeaders("gorunning"), Accept: "text/html,*/*" },
  });
  if (!res.ok) {
    console.warn(`[discoverGoRunningMonthly] ${yearMonth} HTTP ${res.status}`);
    return [];
  }
  const html = await res.text();
  const $ = cheerioLoad(html);
  const out = [];

  $('div[id^="race-"]').each((_, el) => {
    const idAttr = $(el).attr("id") || "";
    const m = idAttr.match(/^race-(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return;
    const dateStr = `${m[1]}-${m[2]}-${m[3]}`;
    $(el).find("table.min-w-full tbody tr").each((__, tr) => {
      const a = $(tr).find('a[href^="/races/"]').first();
      const name = (a.text() || "").trim();
      const href = a.attr("href") || "";
      if (!name) return;
      out.push({
        name,
        date: dateStr,
        gorunningUrl: href.startsWith("http") ? href : `${GORUNNING_ORIGIN}${href}`,
      });
    });
  });

  return out;
}

/** KST 기준 이번 달·다음 달 `YYYY-MM` (날짜 보강은 이 두 페이지만 호출) */
function goRunningThisAndNextMonthKst(now = new Date()) {
  const todayKst = now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const [yy, mm] = todayKst.split("-").map(Number);
  const thisYm = `${yy}-${String(mm).padStart(2, "0")}`;
  let nm = mm + 1;
  let ny = yy;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  const nextYm = `${ny}-${String(nm).padStart(2, "0")}`;
  return [thisYm, nextYm];
}

async function discoverGoRunningThisAndNextMonth(now = new Date()) {
  const months = goRunningThisAndNextMonthKst(now);
  const all = [];
  for (let i = 0; i < months.length; i++) {
    const ym = months[i];
    try {
      all.push(...(await discoverGoRunningMonthly(ym)));
    } catch (err) {
      console.warn(`[discoverGoRunningThisAndNextMonth] ${ym}: ${err.message}`);
    }
    if (i < months.length - 1) await sleep(DELAY_MS);
  }
  return all;
}

/** 해당 연도 1~12월 (스크립트·수동 점검용 — discover 기본 경로는 이번달+다음달만) */
async function discoverGoRunningYear(year) {
  const y = parseInt(String(year), 10);
  if (Number.isNaN(y)) return [];
  const all = [];
  for (let mo = 1; mo <= 12; mo++) {
    const yearMonth = `${y}-${String(mo).padStart(2, "0")}`;
    try {
      const rows = await discoverGoRunningMonthly(yearMonth);
      all.push(...rows);
    } catch (err) {
      console.warn(`[discoverGoRunningYear] ${yearMonth}: ${err.message}`);
    }
    if (mo < 12) await sleep(DELAY_MS);
  }
  return all;
}

function normalizeForGoRunningMatch(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\s\u3000]/g, "")
    .replace(/[·•\-_/.,()[\]「」'"“”]/g, "");
}

/** 스마트칩 플레이스홀더 이름은 매칭 불가 */
function isUnmatchableDiscoverName(name) {
  return /^smartchip\s*\d+$/i.test(String(name || "").trim());
}

/**
 * discover 병합 결과에서 date 가 비어 있는 행만 고러닝 대회명으로 개최일 보강.
 * 고러닝은 KST 기준 이번 달·다음 달 월간 목록만 조회 (`year` 인자는 호환용).
 */
async function enrichMissingDatesFromGoRunning(events, _year) {
  const need = events.filter((e) => !(e.date && String(e.date).trim()));
  if (need.length === 0) return events;

  let grRows;
  try {
    grRows = await discoverGoRunningThisAndNextMonth();
  } catch (err) {
    console.warn(`[enrichMissingDatesFromGoRunning] gorunning 실패: ${err.message}`);
    return events;
  }
  if (grRows.length === 0) return events;

  return events.map((e) => {
    if (e.date && String(e.date).trim()) return e;
    if (isUnmatchableDiscoverName(e.name)) return e;
    const n = normalizeForGoRunningMatch(e.name);
    if (n.length < 4) return e;

    let bestDate = null;
    let bestKeyLen = 0;

    for (const row of grRows) {
      const g = normalizeForGoRunningMatch(row.name);
      if (!g.length) continue;
      if (n === g) {
        return { ...e, date: row.date, gorunningUrl: row.gorunningUrl };
      }
      if (g.length >= 6 && n.includes(g) && g.length > bestKeyLen) {
        bestKeyLen = g.length;
        bestDate = row.date;
      } else if (n.length >= 6 && g.includes(n) && n.length > bestKeyLen) {
        bestKeyLen = n.length;
        bestDate = row.date;
      }
    }

    if (bestDate) return { ...e, date: bestDate };
    return e;
  });
}

async function discoverAllEvents(year) {
  const sources = [
    { name: "marazone", fn: discoverMarazone },
    { name: "myresult", fn: discoverMyResult },
    { name: "spct", fn: discoverSPCT },
    { name: "smartchip", fn: discoverSmartChip },
    { name: "ohmyrace", fn: discoverOhmyrace },
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

  await enrichMissingDatesFromGoRunning(allEvents, year);

  allEvents.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return allEvents;
}

// ─── 주간 자동 스크랩: KST 윈도 + 큐 우선순위 ─────────────────
// 과거엔 UTC 오늘까지만 포함해 '이번 주 일요일 대회'가 큐에서 빠졌음 → KST + 앞으로 N일 포함

const WEEKLY_LOOKBACK_DAYS = 14;
const WEEKLY_LOOKAHEAD_DAYS = 7;
/** ops 미리보기·문서용 “수동 수집 시 참고 순서” 상한 (자동 배치 스크랩은 사용 안 함) */
const WEEKLY_MAX_JOBS_PER_RUN = 5;

function kstTodayYmd(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function kstAddDays(ymdStr, deltaDays) {
  const m = String(ymdStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymdStr;
  const t = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+09:00`);
  t.setTime(t.getTime() + deltaDays * 864e5);
  return t.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/**
 * 주간 스케줄 후보: 개최일이 KST 기준 [오늘-lookback .. 오늘+lookahead] 안에 드는 대회
 * (날짜 없는 올해 SmartChip 등은 기존과 동일하게 포함)
 */
function filterEventsWeeklyScrapeWindow(events, year, now = new Date(), lookback = WEEKLY_LOOKBACK_DAYS, lookahead = WEEKLY_LOOKAHEAD_DAYS) {
  const todayKst = kstTodayYmd(now);
  const startKst = kstAddDays(todayKst, -lookback);
  const endKst = kstAddDays(todayKst, lookahead);
  const filtered = events.filter((e) => {
    if (e.date) return e.date >= startKst && e.date <= endKst;
    if (e.sourceId && String(e.sourceId).startsWith(String(year))) return true;
    return false;
  });
  return { filtered, todayKst, startKst, endKst };
}

/**
 * 신규 큐 정렬: ① 오늘~endKst 다가오는 개최일 오름차순 ② 그 전 2주 지난 대회(누락 스크랩) 최신순 ③ 날짜 없음
 */
function sortWeeklyScrapeQueue(events, todayKst, startKst, endKst) {
  const hasYmd = (d) => d && /^\d{4}-\d{2}-\d{2}$/.test(String(d));
  const tier = (e) => {
    const d = e.date;
    if (!hasYmd(d)) return 3;
    if (d >= todayKst && d <= endKst) return 1;
    if (d >= startKst && d < todayKst) return 2;
    return 4;
  };
  return [...events].sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    if (ta === 1) return String(a.date).localeCompare(String(b.date));
    if (ta === 2) return String(b.date).localeCompare(String(a.date));
    return 0;
  });
}

function takeWeeklyScrapeSlice(sortedNewEvents, maxJobs = WEEKLY_MAX_JOBS_PER_RUN) {
  return sortedNewEvents.slice(0, maxJobs);
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
      snap.forEach((doc) => {
        const d = doc.data();
        if (d && d.found === true && d.realName) cachedKeys.add(d.realName);
      });
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

    // Distance 매칭 필터링: 참가자 종목과 검색 결과 종목이 일치하는 것만 선택
    const participantDistance = normalizeRaceDistance(m.distance);
    let filteredResults = found;
    
    if (participantDistance && participantDistance !== 'unknown') {
      const matched = found.filter(r => {
        const resultDistance = normalizeRaceDistance(r.distance);
        return resultDistance === participantDistance;
      });
      
      // Fallback: 매칭 실패 시 원본 유지
      if (matched.length > 0) {
        filteredResults = matched;
      } else {
        console.warn(
          `[scrapeEvent] distance 매칭 실패, 원본 유지: ${m.realName} ` +
          `(참가자: ${m.distance}, 검색: ${found.map(r => r.distance).join(', ')})`
        );
      }
    }

    const isAmbiguous = filteredResults.length > 1;
    for (const r of filteredResults) {
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
        filteredCount: filteredResults.length,
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

  // 정렬: 종목 순 (full → half → 10K → 30K → 5K → …) → 기록 빠른 순
  results.sort((a, b) => {
    const dOrder = { full: 0, half: 1, "10K": 2, "30K": 3, "32K": 4, "5K": 5, "3K": 6, "20K": 7 };
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

// ─── 고러닝 예정 대회 크롤 + scrape_jobs 매칭 (ops-gorunning-events) ──

/**
 * Levenshtein distance 계산
 * @param {string} str1
 * @param {string} str2
 * @returns {number}
 */
function levenshteinDistance(str1, str2) {
  const a = String(str1 || "");
  const b = String(str2 || "");
  const m = a.length;
  const n = b.length;
  const dp = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * 대회 이름 정규화 (유사도 비교용)
 * @param {string} name
 * @returns {string}
 */
function normalizeEventName(name) {
  return String(name || "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/\d{4}/g, "")
    .replace(/마라톤|대회|레이스|러닝/g, "");
}

/**
 * 이름 유사도 계산 (0~1)
 * @param {string} name1
 * @param {string} name2
 * @returns {number}
 */
function calculateNameSimilarity(name1, name2) {
  const n1 = normalizeEventName(name1);
  const n2 = normalizeEventName(name2);

  const distance = levenshteinDistance(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);

  if (maxLen === 0) return 0;
  return 1 - distance / maxLen;
}

/**
 * 고러닝 이벤트와 scrape_jobs 자동 매칭
 * @param {{ date: string, name: string }} gorunningEvent
 * @param {Array<{ jobId: string, eventName?: string, eventDate?: string }>} scrapeJobs
 * @returns {{ job: object, similarity: number } | null}
 */
function matchGorunningToJob(gorunningEvent, scrapeJobs) {
  if (!gorunningEvent?.date || !Array.isArray(scrapeJobs)) return null;

  const eventDate = new Date(`${String(gorunningEvent.date).slice(0, 10)}T12:00:00+09:00`);
  if (Number.isNaN(eventDate.getTime())) return null;

  const candidates = scrapeJobs.filter((job) => {
    if (!job?.eventDate) return false;
    const jobYmd = String(job.eventDate).slice(0, 10);
    const jobDate = new Date(`${jobYmd}T12:00:00+09:00`);
    if (Number.isNaN(jobDate.getTime())) return false;
    const diffDays = Math.abs((eventDate - jobDate) / (1000 * 60 * 60 * 24));
    return diffDays <= 2;
  });

  if (candidates.length === 0) return null;

  const scored = candidates.map((job) => ({
    job,
    similarity: calculateNameSimilarity(job.eventName || "", gorunningEvent.name || ""),
  }));

  const qualified = scored.filter((s) => s.similarity > 0.7);
  if (qualified.length === 0) return null;

  qualified.sort((a, b) => b.similarity - a.similarity);
  return {
    job: qualified[0].job,
    similarity: qualified[0].similarity,
  };
}

/**
 * 고러닝 이벤트와 discovered-events.json 매칭
 * @param {Object} gorunningEvent - 고러닝 대회 { name, date, ... }
 * @param {Array} discoveredEvents - discovered-events-YYYY.json의 events 배열
 * @returns {Object|null} - 매칭된 event 또는 null
 */
function matchGorunningToDiscovered(gorunningEvent, discoveredEvents) {
  if (!gorunningEvent?.date || !Array.isArray(discoveredEvents)) return null;

  const eventDate = new Date(`${String(gorunningEvent.date).slice(0, 10)}T12:00:00+09:00`);
  if (Number.isNaN(eventDate.getTime())) return null;

  // Step 1: 날짜 필터 (±2일)
  const candidates = discoveredEvents.filter((ev) => {
    if (!ev?.date) return false;
    const evYmd = String(ev.date).slice(0, 10);
    const evDate = new Date(`${evYmd}T12:00:00+09:00`);
    if (Number.isNaN(evDate.getTime())) return false;
    const diffDays = Math.abs((eventDate - evDate) / (1000 * 60 * 60 * 24));
    return diffDays <= 2;
  });

  if (candidates.length === 0) return null;

  // Step 2: 이름 유사도
  const scored = candidates.map((ev) => ({
    event: ev,
    similarity: calculateNameSimilarity(ev.name || "", gorunningEvent.name || ""),
  }));

  // Step 3: 임계치 (>0.7)
  const qualified = scored.filter((s) => s.similarity > 0.7);
  if (qualified.length === 0) return null;

  // Step 4: 최고 점수
  qualified.sort((a, b) => b.similarity - a.similarity);
  return {
    event: qualified[0].event,
    similarity: qualified[0].similarity,
  };
}

/**
 * 고러닝 향후 약 2개월 대회 목록 (KST 기준 이번 달·다음 달 월간 페이지)
 * @returns {Promise<Array<{ id: string, name: string, date: string, location: string, distance: string[], url: string }>>}
 */
async function crawlGorunningEvents() {
  const rows = await discoverGoRunningThisAndNextMonth();
  const sorted = [...rows].sort((x, y) => {
    const da = String(x.date || "");
    const db = String(y.date || "");
    if (da !== db) return da.localeCompare(db);
    return String(x.name || "").localeCompare(String(y.name || ""));
  });

  return sorted.map((row, i) => ({
    id: `gorunning_${row.date}_${i}`,
    name: row.name,
    date: row.date,
    location: "",
    distance: [],
    url: row.gorunningUrl || "",
  }));
}

// ─── 러닝위키 예정 대회 크롤 ──────────────────────────────────────

/**
 * 러닝위키 월별 일정 (https://runningwikii.com/entry/2026-marathon-running-schedule/)
 * 탭 구조: 1월~12월, 각 탭 내 테이블 파싱
 */
async function crawlRunningwikiiEvents() {
  const url = `${RUNNINGWIKII_ORIGIN}/entry/2026-marathon-running-schedule/`;
  const res = await fetch(url, {
    headers: { ...browserHeaders("gorunning"), Accept: "text/html,*/*" },
  });
  if (!res.ok) {
    console.warn(`[crawlRunningwikiiEvents] HTTP ${res.status}`);
    return [];
  }
  const html = await res.text();
  const $ = cheerioLoad(html);
  const out = [];

  // 테이블 파싱: | 대회일 | 대회명 | 지역 | 접수 |
  $("table tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 2) return;
    
    const dateText = $(cells[0]).text().trim(); // "4월 19일 (일)"
    const nameCell = $(cells[1]);
    const a = nameCell.find("a").first();
    const name = a.text().trim().replace(/NEW$/, "").trim();
    const href = a.attr("href") || "";
    
    if (!name || !dateText) return;
    
    // 날짜 파싱: "4월 19일" → "2026-04-19"
    const m = dateText.match(/(\d+)월\s*(\d+)일/);
    if (!m) return;
    const month = m[1].padStart(2, "0");
    const day = m[2].padStart(2, "0");
    const date = `2026-${month}-${day}`;
    
    out.push({
      name,
      date,
      runningwikiiUrl: href.startsWith("http") ? href : `${RUNNINGWIKII_ORIGIN}${href}`,
    });
  });

  return out;
}

/**
 * 고러닝 + 러닝위키 통합 크롤: 중복 제거 (날짜+이름 기준)
 */
async function crawlAllUpcomingEvents() {
  const [gorunning, runningwikii] = await Promise.all([
    crawlGorunningEvents().catch(err => { console.warn(`[crawlAll] gorunning: ${err.message}`); return []; }),
    crawlRunningwikiiEvents().catch(err => { console.warn(`[crawlAll] runningwikii: ${err.message}`); return []; }),
  ]);

  const combined = [];
  const seen = new Set();

  for (const e of gorunning) {
    const key = `${e.date}_${e.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push({ ...e, source: "gorunning" });
    }
  }

  for (const e of runningwikii) {
    const key = `${e.date}_${e.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push({
        id: `runningwikii_${e.date}_${combined.length}`,
        name: e.name,
        date: e.date,
        location: "",
        distance: [],
        url: e.runningwikiiUrl || "",
        source: "runningwikii",
      });
    }
  }

  // 날짜순 정렬
  combined.sort((a, b) => {
    const da = String(a.date || "");
    const db = String(b.date || "");
    if (da !== db) return da.localeCompare(db);
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return combined;
}

module.exports = {
  normDist, normalizeRaceDistance, normTime, timeToSeconds, inferGender,
  searchMember, getEventInfo,
  buildPBMap, isPB,
  discoverAllEvents, discoverMarazone, discoverMyResult, discoverSPCT, discoverSmartChip,
  discoverGoRunningMonthly, discoverGoRunningThisAndNextMonth, discoverGoRunningYear, enrichMissingDatesFromGoRunning,
  kstTodayYmd, kstAddDays,
  filterEventsWeeklyScrapeWindow, sortWeeklyScrapeQueue, takeWeeklyScrapeSlice,
  WEEKLY_LOOKBACK_DAYS, WEEKLY_LOOKAHEAD_DAYS, WEEKLY_MAX_JOBS_PER_RUN,
  scrapeEvent, getSmartChipSession,
  sleep, DELAY_MS, SMARTCHIP_DELAY_MS,
  crawlGorunningEvents,
  crawlRunningwikiiEvents,
  crawlAllUpcomingEvents,
  matchGorunningToJob,
  matchGorunningToDiscovered,
  calculateNameSimilarity,
};
