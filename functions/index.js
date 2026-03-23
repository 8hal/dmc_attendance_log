/**
 * DMC Attendance Log - Firebase Cloud Functions
 * 
 * API:
 * - POST /attendance - 출석 등록
 * - GET /attendance?action=status&date=YYYY/MM/DD - 날짜별 출석 현황
 * - GET /attendance?action=history&nickname=xxx&month=YYYY-MM - 월간 출석 기록
 * - GET /attendance?action=nicknames&limit=500 - 닉네임 목록 조회 (자동완성용)
 */

const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const scraper = require("./lib/scraper");
const { google } = require("googleapis");

// 초기화
initializeApp();
const db = getFirestore();

// 비용 제어: 최대 인스턴스 수 제한
setGlobalOptions({ maxInstances: 10, region: "asia-northeast3" });

// ==================== 상수 ====================

const COLLECTION = "attendance";
const DEFAULT_TZ = "Asia/Seoul";

// Google Sheets 설정
const SPREADSHEET_ID = "1sn6sLKyBn5HjNIyZfn6P-foF9maoqp5vp04_j43zDYY";
const SHEET_NAME = "설문지 응답 시트2"; // 시트 이름

const TEAM_LABEL = {
  T1: "1팀",
  T2: "2팀",
  T3: "3팀",
  T4: "4팀",
  T5: "5팀",
  S: "S팀",
};

const MEETING_TYPE_LABEL = {
  ETC: "기타",
  TUE: "화요일",
  THU: "목요일",
  SAT: "토요일",
};

// ==================== Google Sheets 헬퍼 ====================

let sheetsClient = null;

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  
  const authClient = await auth.getClient();
  sheetsClient = google.sheets({ version: "v4", auth: authClient });
  return sheetsClient;
}

/**
 * Google Sheets에 출석 데이터 추가 (비동기, 실패해도 에러 무시)
 */
async function appendToSheets(data) {
  try {
    const sheets = await getSheetsClient();
    
    // 기존 시트 스키마: timestamp, nickname, teamLabel, meetingTypeLabel, meetingDate
    const row = [
      data.timestamp,           // A: timestamp
      data.nickname,            // B: nickname
      data.teamLabel,           // C: teamLabel
      data.meetingTypeLabel,    // D: meetingTypeLabel
      data.meetingDate,         // E: meetingDate
    ];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:E`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [row],
      },
    });
    
    console.log(`[Sheets] Appended: ${data.nickname}`);
  } catch (err) {
    // Sheets 백업 실패해도 API 응답에는 영향 없음
    console.error("[Sheets Error]", err.message || err);
  }
}

// ==================== 헬퍼 함수 ====================

function str(v) {
  return v === null || v === undefined ? "" : String(v);
}

function isValidDateKey(s) {
  return /^\d{4}\/\d{2}\/\d{2}$/.test(s);
}

function isValidMonthKey(s) {
  return /^\d{4}-\d{2}$/.test(s);
}

function dateKeyToMonthKey(dateKey) {
  if (!isValidDateKey(dateKey)) return "";
  const parts = dateKey.split("/");
  return `${parts[0]}-${parts[1]}`;
}

function labelToCode(mapObj, label) {
  for (const code in mapObj) {
    if (mapObj[code] === label) return code;
  }
  return "";
}

function kstNow() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: DEFAULT_TZ })
  );
}

function formatKstKoreanAmPm(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  
  const options = {
    timeZone: DEFAULT_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  };
  
  const formatted = new Intl.DateTimeFormat("ko-KR", options).format(date);
  return formatted;
}

/**
 * Sheets용 timestamp 형식 (날짜 끝 마침표 제거)
 * "2026. 1. 11. 오후 7:10:35" → "2026. 1. 11 오후 7:10:35"
 */
function formatTimestampForSheets(date) {
  const formatted = formatKstKoreanAmPm(date);
  // 날짜 끝의 ". 오후" 또는 ". 오전"을 " 오후" 또는 " 오전"으로 변경
  return formatted.replace(/\. (오전|오후)/, " $1");
}

function kstTodayKey() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now).replace(/-/g, "/");
}

function makeTestNickname() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const vals = {};
  parts.forEach((p) => (vals[p.type] = p.value));
  return `TEST_${vals.year}${vals.month}${vals.day}_${vals.hour}${vals.minute}${vals.second}`;
}

function countPossibleMeetingsForMonth(monthKey) {
  if (!isValidMonthKey(monthKey)) return 0;
  const [yStr, mStr] = monthKey.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 0;
  const daysInMonth = new Date(y, m, 0).getDate();
  let cnt = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const weekday = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
    if ([2, 4, 6].includes(weekday)) cnt++; // 화, 목, 토
  }
  return cnt;
}

/**
 * YYYY/MM/DD → "YYYY. M. D" 형식 변환
 * 예: "2026/01/10" → "2026. 1. 10"
 */
function formatDateKeyForSheets(dateKey) {
  if (!isValidDateKey(dateKey)) return dateKey;
  const [year, month, day] = dateKey.split("/");
  return `${year}. ${parseInt(month, 10)}. ${parseInt(day, 10)}`;
}

// ==================== API 핸들러 ====================

/**
 * 출석 등록 (POST)
 */
async function handlePost(req, res) {
  const startMs = Date.now();
  
  try {
    // 파라미터 파싱 (form-urlencoded 또는 JSON)
    let body = req.body || {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        // URL encoded form data는 이미 파싱됨
      }
    }

    const nicknameRaw = str(body.nickname).trim();
    const teamCode = str(body.team).trim().toUpperCase();
    const typeCode = str(body.meetingType).trim().toUpperCase();
    const meetingDateKey = str(body.meetingDate).trim();

    // 유효성 검사
    if (!nicknameRaw) {
      return res.status(400).json({ ok: false, error: "nickname is required" });
    }
    if (!teamCode) {
      return res.status(400).json({ ok: false, error: "team is required" });
    }
    if (!typeCode) {
      return res.status(400).json({ ok: false, error: "meetingType is required" });
    }
    if (!meetingDateKey || !isValidDateKey(meetingDateKey)) {
      return res.status(400).json({ ok: false, error: `invalid meetingDate (YYYY/MM/DD): ${meetingDateKey}` });
    }

    const teamLabel = TEAM_LABEL[teamCode];
    if (!teamLabel) {
      return res.status(400).json({ ok: false, error: `invalid team enum: ${teamCode}` });
    }

    const meetingTypeLabel = MEETING_TYPE_LABEL[typeCode];
    if (!meetingTypeLabel) {
      return res.status(400).json({ ok: false, error: `invalid meetingType enum: ${typeCode}` });
    }

    const now = new Date();
    const monthKey = dateKeyToMonthKey(meetingDateKey);
    const timeText = formatKstKoreanAmPm(now);

    // TEST 닉네임 처리
    const nicknameStored =
      nicknameRaw.toUpperCase() === "TEST" ? makeTestNickname() : nicknameRaw;

    // Firestore에 저장
    const docRef = await db.collection(COLLECTION).add({
      nickname: nicknameStored,
      nicknameKey: nicknameStored.toLowerCase(),
      team: teamCode,
      teamLabel,
      meetingType: typeCode,
      meetingTypeLabel,
      meetingDateKey,
      monthKey,
      timestamp: FieldValue.serverTimestamp(),
      ts: now.getTime(),
    });

    // Google Sheets에 백업 (비동기, fire-and-forget)
    appendToSheets({
      timestamp: formatTimestampForSheets(now), // "2026. 1. 11 오후 7:10:35" 형식
      nickname: nicknameStored,
      teamLabel,
      meetingTypeLabel,
      meetingDate: formatDateKeyForSheets(meetingDateKey), // "2026. 1. 10" 형식
    }).catch(() => {}); // 에러 무시

    // 해당 날짜 출석 현황 조회
    const status = await getStatusForDate(meetingDateKey);

    const durationMs = Date.now() - startMs;
    console.log(`[POST] ${nicknameStored} - ${meetingDateKey} - ${durationMs}ms`);

    return res.json({
      ok: true,
      written: {
        nicknameStored,
        team: teamCode,
        teamLabel,
        meetingType: typeCode,
        meetingTypeLabel,
        meetingDate: meetingDateKey,
        timeText,
      },
      status,
    });
  } catch (err) {
    console.error("[POST Error]", err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}

/**
 * 날짜별 출석 현황 조회
 */
async function getStatusForDate(dateKey) {
  const snapshot = await db
    .collection(COLLECTION)
    .where("meetingDateKey", "==", dateKey)
    .orderBy("ts", "desc")
    .get();

  const items = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      nickname: data.nickname,
      team: data.team || null,
      teamLabel: data.teamLabel,
      meetingType: data.meetingType || null,
      meetingTypeLabel: data.meetingTypeLabel,
      meetingDate: data.meetingDateKey,
      timeText: data.ts ? formatKstKoreanAmPm(new Date(data.ts)) : "",
    };
  });

  return {
    date: dateKey,
    count: items.length,
    items,
  };
}

/**
 * 닉네임별 월간 출석 기록 조회
 */
async function getHistoryForNicknameMonth(nickname, monthKey) {
  const nickKey = nickname.trim().toLowerCase();

  const snapshot = await db
    .collection(COLLECTION)
    .where("nicknameKey", "==", nickKey)
    .where("monthKey", "==", monthKey)
    .orderBy("ts", "desc")
    .get();

  const items = [];
  const summaryByType = {};

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const meetingTypeLabel = data.meetingTypeLabel || "";

    items.push({
      nickname: data.nickname,
      team: data.team || null,
      teamLabel: data.teamLabel,
      meetingType: data.meetingType || null,
      meetingTypeLabel,
      meetingDate: data.meetingDateKey,
      timeText: data.ts ? formatKstKoreanAmPm(new Date(data.ts)) : "",
    });

    const typeKey = meetingTypeLabel || "미지정";
    summaryByType[typeKey] = (summaryByType[typeKey] || 0) + 1;
  });

  const possible = countPossibleMeetingsForMonth(monthKey);
  const rate = possible > 0 ? Math.min(100, Math.round((items.length / possible) * 100)) : 0;

  return {
    nickname,
    month: monthKey,
    count: items.length,
    items,
    summaryByType,
    totalPossible: possible,
    attendanceRate: rate,
  };
}

/**
 * 닉네임 목록 조회 (자동완성용)
 * TEST로 시작하는 닉네임 제외, 가나다순 정렬
 */
async function getNicknames(limit = 500) {
  // 최근 출석 기록에서 닉네임 추출 (최대 limit * 3개 문서 조회 후 중복 제거)
  const snapshot = await db
    .collection(COLLECTION)
    .orderBy("ts", "desc")
    .limit(limit * 3)
    .get();

  const nickSet = new Set();
  snapshot.docs.forEach((doc) => {
    const nickname = doc.data().nickname;
    // TEST로 시작하는 닉네임 제외
    if (nickname && !nickname.toUpperCase().startsWith("TEST")) {
      nickSet.add(nickname);
    }
  });

  // 가나다순 정렬 후 limit 적용
  const sorted = [...nickSet].sort((a, b) => a.localeCompare(b, "ko")).slice(0, limit);

  return {
    nicknames: sorted,
    count: sorted.length,
  };
}

/**
 * GET 요청 핸들러
 */
async function handleGet(req, res) {
  const startMs = Date.now();

  try {
    const action = str(req.query.action || "status").trim();

    if (action === "nicknames") {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 1000);
      const result = await getNicknames(limit);
      const durationMs = Date.now() - startMs;
      console.log(`[GET nicknames] ${result.count} items - ${durationMs}ms`);
      return res.json({ ok: true, ...result });
    }

    if (action === "status") {
      const dateKey = str(req.query.date).trim() || kstTodayKey();

      if (!isValidDateKey(dateKey)) {
        return res.status(400).json({ ok: false, error: `invalid date (YYYY/MM/DD): ${dateKey}` });
      }

      const status = await getStatusForDate(dateKey);
      const durationMs = Date.now() - startMs;
      console.log(`[GET status] ${dateKey} - ${status.count} items - ${durationMs}ms`);

      return res.json({ ok: true, ...status });
    }

    if (action === "history") {
      const nickname = str(req.query.nickname).trim();
      const monthKey = str(req.query.month).trim() || 
        new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ, year: "numeric", month: "2-digit" })
          .format(new Date())
          .replace("/", "-");

      if (!nickname) {
        return res.status(400).json({ ok: false, error: "nickname is required" });
      }
      if (!isValidMonthKey(monthKey)) {
        return res.status(400).json({ ok: false, error: `invalid month (YYYY-MM): ${monthKey}` });
      }

      const history = await getHistoryForNicknameMonth(nickname, monthKey);
      const durationMs = Date.now() - startMs;
      console.log(`[GET history] ${nickname} - ${monthKey} - ${history.count} items - ${durationMs}ms`);

      return res.json({ ok: true, ...history });
    }

    return res.status(400).json({ ok: false, error: `unknown action: ${action}` });
  } catch (err) {
    console.error("[GET Error]", err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}

// ==================== HTTP 엔드포인트 ====================

// ==================== Race: 스케줄 + API ====================

/**
 * 주간 자동 이벤트 발견 + 스크래핑 (토/일 15:00 KST)
 * 최근 2주 내 이벤트를 발견하고, 아직 스크래핑하지 않은 이벤트에 대해 전 회원 검색
 */
exports.weeklyDiscoverAndScrape = onSchedule(
  {
    schedule: "0 15 * * 6,0",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 540,
    memory: "512MiB",
    region: "asia-northeast3",
  },
  async () => {
    const year = new Date().getFullYear();
    console.log(`[weeklyDiscoverAndScrape] ${year}년 이벤트 발견 시작`);

    const events = await scraper.discoverAllEvents(year);
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const todayStr = now.toISOString().slice(0, 10);

    const twoWeeksAgoStr = twoWeeksAgo.toISOString().slice(0, 10);
    const recentEvents = events.filter((e) => {
      if (e.date) return e.date >= twoWeeksAgoStr && e.date <= todayStr;
      // 날짜 null인 SmartChip 슬라이더 이벤트: 올해 ID면 포함
      if (e.sourceId && String(e.sourceId).startsWith(String(year))) return true;
      return false;
    });

    console.log(`[weeklyDiscoverAndScrape] 최근 2주 이벤트: ${recentEvents.length}개`);

    const existingSnap = await db.collection("scrape_jobs")
      .where("createdAt", ">=", twoWeeksAgo.toISOString())
      .get();
    const existingKeys = new Set();
    existingSnap.forEach((doc) => {
      const d = doc.data();
      const foundCount = (d.results || []).length;
      if (foundCount > 0) existingKeys.add(`${d.source}:${d.sourceId}`);
    });

    const newEvents = recentEvents.filter((e) => !existingKeys.has(`${e.source}:${e.sourceId}`));
    console.log(`[weeklyDiscoverAndScrape] 신규 이벤트: ${newEvents.length}개`);

    if (newEvents.length === 0) return;

    const membersSnap = await db.collection("members").where("hidden", "==", false).get();
    const members = [];
    membersSnap.forEach((doc) => {
      const d = doc.data();
      members.push({ realName: d.realName, nickname: d.nickname, gender: d.gender || "" });
    });
    console.log(`[weeklyDiscoverAndScrape] 회원: ${members.length}명`);

    const confirmedSnap = await db.collection("race_results").where("status", "==", "confirmed").get();
    const confirmedResults = [];
    confirmedSnap.forEach((doc) => confirmedResults.push(doc.data()));
    const pbMap = scraper.buildPBMap(confirmedResults);

    for (const event of newEvents.slice(0, 5)) {
      console.log(`[scrape] ${event.source}:${event.sourceId} (${event.name})`);

      const jobRef = db.collection("scrape_jobs").doc(`${event.source}_${event.sourceId}`);
      await jobRef.set({
        source: event.source,
        sourceId: event.sourceId,
        eventName: event.name,
        eventDate: event.date,
        status: "running",
        progress: { searched: 0, total: members.length, found: 0 },
        results: [],
        createdAt: new Date().toISOString(),
      });

      try {
        const result = await scraper.scrapeEvent({
          source: event.source,
          sourceId: event.sourceId,
          members,
          pbMap,
          onProgress: async (p) => {
            await jobRef.update({ progress: p });
          },
        });

        await jobRef.update({
          status: "complete",
          eventName: result.eventName || event.name,
          eventDate: result.eventDate || event.date,
          results: result.results,
          progress: { searched: members.length, total: members.length, found: result.results.length },
          completedAt: new Date().toISOString(),
        });

        console.log(`[scrape] 완료: ${result.results.length}건 (${result.eventName})`);
      } catch (err) {
        console.error(`[scrape] 오류: ${err.message}`);
        await jobRef.update({ status: "error", error: err.message });
      }
    }
  }
);

/**
 * Race API - 대회 결과 조회 및 수동 스크래핑
 */
exports.race = onRequest({ cors: true, timeoutSeconds: 540, memory: "512MiB", region: "asia-northeast3" }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).send("");

  try {
    const action = req.query.action || (req.method === "POST" ? "scrape" : "events");

    if (action === "confirmed-races") {
      const year = req.query.year || null;
      const snap = await db.collection("race_results")
        .where("status", "==", "confirmed")
        .get();

      const groupMap = {};
      snap.forEach((rDoc) => {
        const r = rDoc.data();
        if (year && r.eventDate && !r.eventDate.startsWith(year)) return;
        const key = `${r.source || "unknown"}_${r.sourceId || "unknown"}`;
        if (!groupMap[key]) {
          groupMap[key] = {
            id: key,
            name: r.eventName || "",
            date: r.eventDate || "",
            source: r.source || "",
            sourceId: r.sourceId || "",
            results: [],
          };
        }
        groupMap[key].results.push({
          docId: rDoc.id,
          realName: r.memberRealName,
          nickname: r.memberNickname,
          bib: r.bib || "",
          distance: r.distance,
          netTime: r.netTime,
          gunTime: r.gunTime || "",
          overallRank: r.overallRank || null,
          gender: r.gender || "",
          isPB: r.pbConfirmed || false,
          note: r.note || "",
        });
      });

      const races = Object.values(groupMap);
      return res.json({ ok: true, races });
    }

    if (action === "events") {
      const snap = await db.collection("scrape_jobs")
        .orderBy("createdAt", "desc")
        .get();

      const jobs = [];
      const fixPromises = [];

      snap.forEach((doc) => {
        const d = doc.data();
        const badName = !d.eventName || d.eventName === d.sourceId || /^\d{12,}$/.test(d.eventName);
        const badDate = !d.eventDate;
        const needsFix = badName || badDate;

        if (needsFix) {
          fixPromises.push(
            scraper.getEventInfo(d.source, d.sourceId).then((info) => {
              const patch = {};
              if (info.title && info.title !== d.sourceId) patch.eventName = info.title;
              if (info.date && !d.eventDate) patch.eventDate = info.date;
              if (Object.keys(patch).length > 0) {
                doc.ref.update(patch).catch(() => {});
              }
              return {
                jobId: doc.id, source: d.source, sourceId: d.sourceId,
                eventName: patch.eventName || d.eventName,
                eventDate: patch.eventDate || d.eventDate,
                status: d.status,
                foundCount: d.status === "confirmed"
                  ? (d.confirmedCount ?? 0)
                  : (d.results?.length ?? 0),
                createdAt: d.createdAt, confirmedAt: d.confirmedAt || null,
              };
            })
          );
        } else {
          jobs.push({
            jobId: doc.id, source: d.source, sourceId: d.sourceId,
            eventName: d.eventName, eventDate: d.eventDate,
            status: d.status,
            foundCount: d.status === "confirmed"
              ? (d.confirmedCount ?? 0)
              : (d.results?.length ?? 0),
            createdAt: d.createdAt, confirmedAt: d.confirmedAt || null,
          });
        }
      });

      const fixed = await Promise.all(fixPromises);
      jobs.push(...fixed);

      // source+sourceId 기준 중복 제거 (confirmed > complete > running, foundCount 높은 것 우선)
      const statusPriority = { confirmed: 0, complete: 1, running: 2 };
      const jobMap = new Map();
      for (const j of jobs) {
        const key = `${j.source}_${j.sourceId}`;
        const existing = jobMap.get(key);
        if (!existing) { jobMap.set(key, j); continue; }
        const ePri = statusPriority[existing.status] ?? 9;
        const jPri = statusPriority[j.status] ?? 9;
        if (jPri < ePri || (jPri === ePri && (j.foundCount || 0) > (existing.foundCount || 0))) {
          jobMap.set(key, j);
        }
      }
      const deduped = [...jobMap.values()];
      deduped.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

      return res.json({ ok: true, jobs: deduped });
    }

    if (action === "discover") {
      const year = new Date().getFullYear();
      const allEvents = await scraper.discoverAllEvents(year);

      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const todayStr = now.toISOString().slice(0, 10);

      const twoWeeksAgoStr = twoWeeksAgo.toISOString().slice(0, 10);
      const recent = allEvents.filter((e) => {
        // 미래 대회(예정)도 포함
        if (e.date) return e.date >= twoWeeksAgoStr;
        if (e.sourceId && String(e.sourceId).startsWith(String(year))) return true;
        return false;
      });

      const existingSnap = await db.collection("scrape_jobs").get();
      const existingMap = new Map();
      existingSnap.forEach((doc) => {
        const d = doc.data();
        existingMap.set(`${d.source}:${d.sourceId}`, { jobId: doc.id, eventDate: d.eventDate, eventName: d.eventName, status: d.status });
      });

      const baseEvents = recent.map((e) => {
        const key = `${e.source}:${e.sourceId}`;
        const existing = existingMap.get(key);
        if (!existing) return { ...e, alreadyScraped: false };
        // 이미 스크래핑된 경우: Firestore에 저장된 날짜/이름/상태 우선 사용
        return {
          ...e,
          name: existing.eventName || e.name,
          date: existing.eventDate || e.date,
          alreadyScraped: true,
          jobId: existing.jobId,
          jobStatus: existing.status,
        };
      });

      // 웹 검색 기반 날짜 힌트 (SmartChip에서 날짜 미제공 시 fallback)
      const DATE_HINTS = {
        "202650000017": "2026-03-21", // 저스트 RUN10 청주
        "202650000023": "2026-03-21", // 남해트레일레이스
        "202650000024": "2026-03-21", // 지리산 봄꽃레이스
        "202650000025": "2026-03-21", // 제6회 버킷런
        "202650000028": "2026-03-22", // YTN 히드 앤 런
        "202650000026": "2026-03-22", // 인천국제하프마라톤
        "202650000022": "2026-02-21", // 릴레이마라톤
        "202650000021": "2026-03-14", // 창녕부곡온천마라톤
      };

      // 날짜가 여전히 없는 SmartChip 이벤트는 getEventInfo로 보완, 없으면 힌트 사용
      const enriched = await Promise.all(baseEvents.map(async (e) => {
        if (e.source === "smartchip" && !e.date) {
          try {
            const info = await scraper.getEventInfo(e.source, e.sourceId);
            if (info.date) return { ...e, name: info.title || e.name, date: info.date };
          } catch { /* ignore */ }
          const hint = DATE_HINTS[String(e.sourceId)];
          if (hint) return { ...e, date: hint };
        }
        return e;
      }));

      // 날짜 내림차순 재정렬 (날짜 없는 항목은 맨 아래)
      enriched.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      return res.json({ ok: true, events: enriched });
    }

    if (action === "job") {
      const jobId = req.query.jobId;
      if (!jobId) return res.status(400).json({ ok: false, error: "jobId required" });

      const doc = await db.collection("scrape_jobs").doc(jobId).get();
      if (!doc.exists) return res.status(404).json({ ok: false, error: "job not found" });

      const data = doc.data();

      // confirmed job은 race_results(실제 저장된 기록)를 소스로 사용
      if (data.status === "confirmed") {
        const raceSnap = await db.collection("race_results")
          .where("eventName", "==", data.eventName)
          .where("eventDate", "==", data.eventDate || "")
          .get();
        if (!raceSnap.empty) {
          const confirmed = [];
          raceSnap.forEach((d) => confirmed.push(d.data()));
          data.results = confirmed;
        }
      }

      return res.json({ ok: true, ...data, jobId: doc.id });
    }

    if (action === "members") {
      const snap = await db.collection("members").where("hidden", "==", false).get();
      const members = [];
      snap.forEach((doc) => {
        const d = doc.data();
        members.push({ id: doc.id, realName: d.realName, nickname: d.nickname, gender: d.gender || "", team: d.team || "" });
      });
      members.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
      return res.json({ ok: true, members });
    }

    // ─── 회원 관리 API ─────────────────────────────────
    if (action === "add-member" && req.method === "POST") {
      const { nickname, realName, gender } = req.body || {};
      if (!nickname || !realName) {
        return res.status(400).json({ ok: false, error: "nickname and realName required" });
      }
      const dup = await db.collection("members").where("nickname", "==", nickname).get();
      if (!dup.empty) {
        return res.status(409).json({ ok: false, error: `닉네임 '${nickname}' 이미 존재합니다` });
      }
      const ref = db.collection("members").doc();
      await ref.set({ nickname, realName, gender: gender || "", hidden: false, team: "" });
      return res.json({ ok: true, id: ref.id, nickname, realName });
    }

    if (action === "update-member" && req.method === "POST") {
      const { id, nickname, realName, gender, hidden } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: "id required" });
      const ref = db.collection("members").doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ ok: false, error: "member not found" });
      const updates = {};
      if (nickname !== undefined) updates.nickname = nickname;
      if (realName !== undefined) updates.realName = realName;
      if (gender !== undefined) updates.gender = gender;
      if (hidden !== undefined) updates.hidden = !!hidden;
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ ok: false, error: "nothing to update" });
      }
      await ref.update(updates);

      // gender 변경 시 기존 race_results 동기화
      if (updates.gender !== undefined) {
        const currentRealName = doc.data().realName;
        const resultsSnap = await db.collection("race_results")
          .where("memberRealName", "==", currentRealName)
          .get();
        if (!resultsSnap.empty) {
          const batch = db.batch();
          resultsSnap.docs.forEach(d => batch.update(d.ref, { gender: updates.gender }));
          await batch.commit();
          console.log(`[update-member] gender sync: ${resultsSnap.size}건 updated for ${currentRealName}`);
        }
      }

      return res.json({ ok: true, id, ...updates });
    }

    if (action === "hide-member" && req.method === "POST") {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: "id required" });
      const ref = db.collection("members").doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ ok: false, error: "member not found" });
      await ref.update({ hidden: true });
      return res.json({ ok: true, id });
    }

    if (action === "all-members") {
      const snap = await db.collection("members").get();
      const members = [];
      snap.forEach((doc) => {
        const d = doc.data();
        members.push({ id: doc.id, realName: d.realName, nickname: d.nickname, gender: d.gender || "", team: d.team || "", hidden: d.hidden || false });
      });
      members.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
      return res.json({ ok: true, members });
    }

    // ─── 연도 전체 대회 목록 ──────────────────────────────
    if (action === "discover-all") {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const allEvents = await scraper.discoverAllEvents(year);

      const existingSnap = await db.collection("scrape_jobs").get();
      const existingMap = new Map();
      existingSnap.forEach((doc) => {
        const d = doc.data();
        existingMap.set(`${d.source}:${d.sourceId}`, { jobId: doc.id, status: d.status, eventName: d.eventName, eventDate: d.eventDate });
      });

      // DATE_HINTS (discover 액션과 동일)
      const DATE_HINTS = {
        "202650000017": "2026-03-21",
        "202650000023": "2026-03-21",
        "202650000024": "2026-03-21",
        "202650000025": "2026-03-21",
        "202650000028": "2026-03-22",
        "202650000026": "2026-03-22",
        "202650000022": "2026-02-21",
        "202650000021": "2026-03-14",
      };

      const enriched = await Promise.all(allEvents.map(async (e) => {
        if (e.source === "smartchip" && !e.date) {
          try {
            const info = await scraper.getEventInfo(e.source, e.sourceId);
            if (info.date) { e = { ...e, name: info.title || e.name, date: info.date }; }
          } catch { /* ignore */ }
          if (!e.date) {
            const hint = DATE_HINTS[String(e.sourceId)];
            if (hint) e = { ...e, date: hint };
          }
        }

        const key = `${e.source}:${e.sourceId}`;
        const existing = existingMap.get(key);
        return {
          ...e,
          alreadyInSystem: !!existing,
          jobStatus: existing?.status || null,
          jobId: existing?.jobId || null,
        };
      }));

      enriched.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      return res.json({ ok: true, events: enriched, total: enriched.length });
    }

    // ─── 회원별 역방향 검색 (1명 × N대회) ─────────────────
    if (action === "search-member-events" && req.method === "POST") {
      const { realName, nickname, gender, events, filterGender, filterDistance } = req.body || {};
      if (!realName || !events || !Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ ok: false, error: "realName and events[] required" });
      }

      const jobRef = db.collection("member_search_jobs").doc();
      const now = new Date().toISOString();
      await jobRef.set({
        realName,
        nickname: nickname || "",
        status: "running",
        progress: { searched: 0, total: events.length, currentEvent: "" },
        results: [],
        createdAt: now,
      });
      const jobId = jobRef.id;

      // 응답을 먼저 반환 (프론트가 jobId로 폴링)
      res.json({ ok: true, jobId });

      // 사이트별 병렬 검색 (같은 사이트 내에서는 순차 + 딜레이)
      try {
        const allResults = [];
        let searched = 0;

        // 사이트별로 이벤트 그룹핑
        const bySource = {};
        for (const ev of events) {
          const src = ev.source || "unknown";
          if (!bySource[src]) bySource[src] = [];
          bySource[src].push(ev);
        }

        const updateProgress = async (currentEvent) => {
          await jobRef.update({
            progress: { searched, total: events.length, currentEvent },
            results: allResults,
          });
        };

        const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
        const cacheCol = db.collection("search_cache");

        const applyFilters = (entry) => {
          if (!entry || !entry.records) return entry;
          let records = entry.records;
          if (filterGender) records = records.filter((r) => !r.gender || r.gender === filterGender || scraper.inferGender(r.name) === filterGender);
          if (filterDistance && Array.isArray(filterDistance) && filterDistance.length > 0) records = records.filter((r) => filterDistance.includes(r.distance));
          else if (filterDistance && typeof filterDistance === "string") records = records.filter((r) => r.distance === filterDistance);
          if (records.length === 0) return null;
          return { ...entry, records };
        };

        const searchSource = async (sourceEvents) => {
          for (const ev of sourceEvents) {
            try {
              const cacheKey = `${ev.source}_${ev.sourceId}_${realName}`.substring(0, 1500);
              const cached = await cacheCol.doc(cacheKey).get();

              if (cached.exists) {
                const cd = cached.data();
                const age = Date.now() - (cd.cachedAt?.toMillis?.() || 0);
                if (age < CACHE_TTL_MS) {
                  const filtered = cd.found ? applyFilters(cd.result) : null;
                  if (filtered) allResults.push(filtered);
                  searched++;
                  await updateProgress(ev.eventName || ev.sourceId);
                  continue;
                }
              }

              await scraper.sleep(scraper.DELAY_MS);
              const found = await scraper.searchMember(ev.source, ev.sourceId, realName);

              const resultEntry = (found && found.length > 0) ? {
                eventName: ev.eventName || ev.sourceId,
                eventDate: ev.eventDate || "",
                source: ev.source,
                sourceId: ev.sourceId,
                records: found.map((r) => ({
                  ...r,
                  memberRealName: realName,
                  memberNickname: nickname || "",
                  memberGender: gender || "",
                })),
              } : null;

              const filtered = applyFilters(resultEntry);
              if (filtered) allResults.push(filtered);

              cacheCol.doc(cacheKey).set({
                realName,
                source: ev.source,
                sourceId: ev.sourceId,
                found: !!resultEntry,
                result: resultEntry || null,
                cachedAt: FieldValue.serverTimestamp(),
              }).catch(() => {});

              searched++;
              await updateProgress(ev.eventName || ev.sourceId);
            } catch (err) {
              searched++;
              console.error(`[search-member] ${ev.sourceId}: ${err.message}`);
              await updateProgress(ev.eventName || ev.sourceId).catch(() => {});
            }
          }
        };

        // 사이트별 병렬 실행
        await Promise.all(Object.values(bySource).map(searchSource));

        await jobRef.update({ status: "complete", completedAt: new Date().toISOString(), results: allResults });
      } catch (err) {
        console.error(`[search-member] fatal: ${err.message}`);
        await jobRef.update({ status: "failed", error: err.message, completedAt: new Date().toISOString() }).catch(() => {});
      }
      return;
    }

    // ─── 회원 검색 job 조회 ──────────────────────────────
    if (action === "member-search-job") {
      const jobId = req.query.jobId;
      if (!jobId) return res.status(400).json({ ok: false, error: "jobId required" });
      const doc = await db.collection("member_search_jobs").doc(jobId).get();
      if (!doc.exists) return res.status(404).json({ ok: false, error: "job not found" });
      return res.json({ ok: true, ...doc.data(), jobId: doc.id });
    }

    if (action === "confirm" && req.method === "POST") {
      const { jobId, eventName, eventDate, source, sourceId, results, confirmSource } = req.body || {};
      if (!jobId || !results || !Array.isArray(results)) {
        return res.status(400).json({ ok: false, error: "jobId and results[] required" });
      }

      const batch = db.batch();
      const now = new Date().toISOString();

      const canonicalJobId = (source && sourceId && source !== "manual")
        ? `${source}_${sourceId}`
        : jobId;

      for (const r of results) {
        const resolvedDate = eventDate || r.eventDate || "";
        const safeDate = resolvedDate.replace(/[^0-9\-]/g, "");
        const safeName = (r.memberRealName || "").replace(/[^a-zA-Z0-9가-힣]/g, "_");
        const safeDist = (r.distance || "").replace(/[^a-zA-Z0-9]/g, "_");
        const docId = `${safeName}_${safeDist}_${safeDate}`;
        const ref = db.collection("race_results").doc(docId);
        batch.set(ref, {
          jobId: canonicalJobId,
          eventName: eventName || "",
          eventDate: resolvedDate,
          source: source || r.source || "",
          sourceId: sourceId || r.sourceId || "",
          memberRealName: r.memberRealName,
          memberNickname: r.memberNickname,
          distance: r.distance,
          netTime: r.netTime,
          gunTime: r.gunTime || "",
          bib: r.bib || "",
          overallRank: r.overallRank || null,
          gender: r.gender || "",
          pbConfirmed: r.pbConfirmed || false,
          isGuest: r.isGuest || false,
          note: r.note || "",
          status: "confirmed",
          confirmedAt: now,
          confirmSource: confirmSource || "event",
        });
      }

      const jobRef = db.collection("scrape_jobs").doc(canonicalJobId);
      const jobDoc = await jobRef.get();

      if (jobDoc.exists) {
        const existingCount = jobDoc.data().confirmedCount || 0;
        batch.update(jobRef, {
          confirmedAt: now,
          confirmedCount: existingCount + results.length,
          eventName: eventName || jobDoc.data().eventName || "",
          eventDate: eventDate || jobDoc.data().eventDate || "",
          source: source || jobDoc.data().source || "",
          sourceId: sourceId || jobDoc.data().sourceId || "",
        });
      } else {
        batch.set(jobRef, {
          status: "confirmed",
          confirmedAt: now,
          confirmedCount: results.length,
          results,
          eventName: eventName || "",
          eventDate: eventDate || "",
          source: source || "",
          sourceId: sourceId || "",
          createdAt: now,
        });
      }

      if (canonicalJobId !== jobId) {
        batch.delete(db.collection("scrape_jobs").doc(jobId));
      }

      await batch.commit();
      return res.json({ ok: true, savedCount: results.length });
    }

    if (action === "create-job" && req.method === "POST") {
      const { eventName, eventDate, location } = req.body || {};
      if (!eventName) {
        return res.status(400).json({ ok: false, error: "eventName required" });
      }

      const now = new Date().toISOString();
      const sourceId = `manual_${Date.now()}`;
      const jobRef = db.collection("scrape_jobs").doc(`manual_${sourceId}`);
      await jobRef.set({
        source: "manual",
        sourceId,
        eventName,
        eventDate: eventDate || "",
        location: location || "",
        status: "complete",
        progress: { searched: 0, total: 0, found: 0 },
        results: [],
        createdAt: now,
      });

      return res.json({ ok: true, jobId: jobRef.id, eventName, eventDate: eventDate || "" });
    }

    if (action === "delete-record" && req.method === "POST") {
      const { docId, requesterName } = req.body || {};
      if (!docId || !requesterName) {
        return res.status(400).json({ ok: false, error: "docId and requesterName required" });
      }

      const ref = db.collection("race_results").doc(docId);
      const doc = await ref.get();
      if (!doc.exists) {
        return res.status(404).json({ ok: false, error: "record not found" });
      }

      const data = doc.data();
      if (data.memberRealName !== requesterName) {
        return res.status(403).json({ ok: false, error: "본인 기록만 삭제할 수 있습니다." });
      }

      await ref.delete();

      if (data.jobId) {
        const jobRef = db.collection("scrape_jobs").doc(data.jobId);
        const jobDoc = await jobRef.get();
        if (jobDoc.exists) {
          const jd = jobDoc.data();
          const newCount = Math.max(0, (jd.confirmedCount || 0) - 1);
          await jobRef.update({ confirmedCount: newCount });
        }
      }

      return res.json({ ok: true, deletedDocId: docId });
    }

    if (action === "scrape" && req.method === "POST") {
      const { source, sourceId, eventName, eventDate, replaceJobId } = req.body || {};
      if (!source || !sourceId) {
        return res.status(400).json({ ok: false, error: "source and sourceId required" });
      }

      const membersSnap = await db.collection("members").where("hidden", "==", false).get();
      const members = [];
      membersSnap.forEach((doc) => {
        const d = doc.data();
        members.push({ realName: d.realName, nickname: d.nickname, gender: d.gender || "" });
      });

      const confirmedSnap = await db.collection("race_results").where("status", "==", "confirmed").get();
      const confirmedResults = [];
      confirmedSnap.forEach((doc) => confirmedResults.push(doc.data()));
      const pbMap = scraper.buildPBMap(confirmedResults);

      const canonicalId = `${source}_${sourceId}`;
      const jobRef = db.collection("scrape_jobs").doc(replaceJobId || canonicalId);

      const now = new Date().toISOString();
      const jobData = {
        source, sourceId,
        eventName: eventName || sourceId,
        eventDate: eventDate || "",
        status: "running",
        progress: { searched: 0, total: members.length, found: 0 },
        results: [],
        createdAt: now,
        ...(replaceJobId ? { rescrapedAt: now } : {}),
      };
      await jobRef.set(jobData);

      const jobId = jobRef.id;

      // 비동기로 스크래핑 (응답은 바로 반환하지 않고 완료까지 대기)
      const result = await scraper.scrapeEvent({
        source, sourceId, members, pbMap,
        onProgress: async (p) => {
          await jobRef.update({ progress: p });
        },
      });

      await jobRef.update({
        status: "complete",
        eventName: result.eventName || eventName || sourceId,
        eventDate: result.eventDate || eventDate || "",
        results: result.results,
        progress: { searched: members.length, total: members.length, found: result.results.length },
        completedAt: new Date().toISOString(),
      });

      return res.json({
        ok: true,
        jobId,
        eventName: result.eventName,
        eventDate: result.eventDate,
        foundCount: result.results.length,
      });
    }

    if (action === "verify-admin" && req.method === "POST") {
      const { pw } = req.body || {};
      const adminPw = process.env.DMC_ADMIN_PW || "dmc2008";
      if (pw === adminPw) {
        return res.json({ ok: true });
      }
      return res.status(401).json({ ok: false, error: "invalid password" });
    }

    if (action === "event-logs") {
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);
      const snap = await db.collection("event_logs")
        .orderBy("timestamp", "desc")
        .limit(limit)
        .get();
      const logs = [];
      snap.forEach((doc) => logs.push({ id: doc.id, ...doc.data() }));
      return res.json({ ok: true, logs });
    }

    if (action === "data-integrity") {
      const jobsSnap = await db.collection("scrape_jobs").get();
      const rrSnap = await db.collection("race_results").where("status", "==", "confirmed").get();
      const rrByJob = {};
      rrSnap.forEach((doc) => {
        const jid = doc.data().jobId || "none";
        rrByJob[jid] = (rrByJob[jid] || 0) + 1;
      });
      const issues = [];
      jobsSnap.forEach((doc) => {
        const d = doc.data();
        const actual = rrByJob[doc.id] || 0;
        const claimed = d.confirmedCount || 0;
        if (claimed !== actual && d.status === "confirmed") {
          issues.push({ jobId: doc.id, eventName: d.eventName || "", claimed, actual });
        }
      });
      return res.json({ ok: true, totalJobs: jobsSnap.size, totalResults: rrSnap.size, issues });
    }

    if (action === "log" && req.method === "POST") {
      const { event, data } = req.body || {};
      if (!event) return res.status(400).json({ ok: false, error: "event required" });

      await db.collection("event_logs").add({
        event,
        data: data || {},
        timestamp: new Date().toISOString(),
        ua: req.headers["user-agent"] || "",
      });

      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: `unknown action: ${action}` });
  } catch (err) {
    console.error("[race error]", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== Attendance ====================

exports.attendance = onRequest({ cors: true }, async (req, res) => {
  // CORS 헤더 설정
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method === "POST") {
    return handlePost(req, res);
  }

  if (req.method === "GET") {
    return handleGet(req, res);
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
});
