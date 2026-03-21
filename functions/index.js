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
      existingKeys.add(`${d.source}:${d.sourceId}`);
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

    for (const event of newEvents.slice(0, 3)) {
      console.log(`[scrape] ${event.source}:${event.sourceId} (${event.name})`);

      const jobRef = db.collection("scrape_jobs").doc();
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
exports.race = onRequest({ cors: true, timeoutSeconds: 300, memory: "512MiB", region: "asia-northeast3" }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).send("");

  try {
    const action = req.query.action || (req.method === "POST" ? "scrape" : "events");

    if (action === "confirmed-races") {
      const year = req.query.year || "2026";
      const snap = await db.collection("scrape_jobs")
        .where("status", "==", "confirmed")
        .orderBy("confirmedAt", "desc")
        .get();

      const races = [];
      for (const doc of snap.docs) {
        const job = doc.data();
        if (job.eventDate && !job.eventDate.startsWith(year)) continue;
        const resultsSnap = await db.collection("race_results")
          .where("jobId", "==", doc.id)
          .where("status", "==", "confirmed")
          .get();

        const results = [];
        resultsSnap.forEach((rDoc) => {
          const r = rDoc.data();
          results.push({
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

        races.push({
          id: doc.id,
          name: job.eventName,
          date: job.eventDate,
          source: job.source,
          results,
        });
      }

      return res.json({ ok: true, races });
    }

    if (action === "events") {
      const snap = await db.collection("scrape_jobs")
        .orderBy("createdAt", "desc")
        .limit(20)
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
                status: d.status, foundCount: d.results?.length || 0, createdAt: d.createdAt, confirmedAt: d.confirmedAt || null,
              };
            })
          );
        } else {
          jobs.push({
            jobId: doc.id, source: d.source, sourceId: d.sourceId,
            eventName: d.eventName, eventDate: d.eventDate,
            status: d.status, foundCount: d.results?.length || 0, createdAt: d.createdAt, confirmedAt: d.confirmedAt || null,
          });
        }
      });

      const fixed = await Promise.all(fixPromises);
      jobs.push(...fixed);
      jobs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

      return res.json({ ok: true, jobs });
    }

    if (action === "discover") {
      const year = new Date().getFullYear();
      const allEvents = await scraper.discoverAllEvents(year);

      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const todayStr = now.toISOString().slice(0, 10);

      const twoWeeksAgoStr = twoWeeksAgo.toISOString().slice(0, 10);
      const recent = allEvents.filter((e) => {
        // 날짜가 있으면 최근 2주 이내인지 확인
        if (e.date) return e.date >= twoWeeksAgoStr && e.date <= todayStr;
        // 날짜가 null인 경우(SmartChip 슬라이더 이벤트): 이벤트 ID 앞 4자리가 올해이면 포함
        // (main.html 슬라이더는 현재 진행 중이거나 방금 끝난 대회만 표시하므로 안전함)
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

      // 날짜가 여전히 없는 SmartChip 이벤트는 getEventInfo로 보완
      const enriched = await Promise.all(baseEvents.map(async (e) => {
        if (e.source === "smartchip" && !e.date) {
          try {
            const info = await scraper.getEventInfo(e.source, e.sourceId);
            return { ...e, name: info.title || e.name, date: info.date || null };
          } catch { /* ignore */ }
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

      return res.json({ ok: true, ...doc.data(), jobId: doc.id });
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

    if (action === "confirm" && req.method === "POST") {
      const { jobId, eventName, eventDate, source, sourceId, results } = req.body || {};
      if (!jobId || !results || !Array.isArray(results)) {
        return res.status(400).json({ ok: false, error: "jobId and results[] required" });
      }

      const batch = db.batch();
      const now = new Date().toISOString();

      for (const r of results) {
        const docId = `${jobId}_${r.memberRealName}_${r.distance}`;
        const ref = db.collection("race_results").doc(docId);
        batch.set(ref, {
          jobId,
          eventName: eventName || "",
          eventDate: eventDate || "",
          source: source || "",
          sourceId: sourceId || "",
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
        });
      }

      const jobRef = db.collection("scrape_jobs").doc(jobId);
      batch.update(jobRef, { status: "confirmed", confirmedAt: now });

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
      const jobRef = db.collection("scrape_jobs").doc();
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

      // replaceJobId가 있으면 기존 문서 덮어쓰기, 없으면 새 문서 생성
      const jobRef = replaceJobId
        ? db.collection("scrape_jobs").doc(replaceJobId)
        : db.collection("scrape_jobs").doc();

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
