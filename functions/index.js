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
const {
  allocateCanonicalEventId,
  normalizeEventDateForId,
} = require("./lib/canonicalEventId");
const { normalizeRaceDistance } = require("./lib/raceDistance");
const { google } = require("googleapis");

// 초기화
initializeApp();
const db = getFirestore();

/**
 * 이메일 발송 헬퍼
 */
async function sendEmail({ to, subject, html }) {
  const nodemailer = require("nodemailer");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"DMC Ops" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

/** confirm 시 race_results.netTime: net → finishTime → gun (DNF 플레이스홀더 제외) */
function effectiveNetTimeForConfirm(r) {
  const net = String(r.netTime || "").trim();
  if (net && net !== "--:--:--" && net !== "-") return net;
  const fin = String(r.finishTime || "").trim();
  if (fin && fin !== "-") return fin;
  const gun = String(r.gunTime || "").trim();
  if (gun && gun !== "-") return gun;
  return "";
}

/** scrape_jobs.results 정렬 (scrapeEvent 반환과 동일 기준) */
function sortScrapeJobResults(rows) {
  const dOrder = { full: 0, half: 1, "10K": 2, "30K": 3, "32K": 4, "5K": 5, "3K": 6, "20K": 7 };
  return [...(rows || [])].sort((a, b) => {
    const da = dOrder[a.distance] ?? 9;
    const db2 = dOrder[b.distance] ?? 9;
    if (da !== db2) return da - db2;
    return scraper.timeToSeconds(a.netTime) - scraper.timeToSeconds(b.netTime);
  });
}

/** race_events → 역색인 (source_sourceId → canonicalEventId) + 카드 메타 */
async function buildRaceEventIndexes() {
  const snap = await db.collection("race_events").get();
  const eventMeta = {};
  const sourceKeyToEventId = {};
  snap.forEach((doc) => {
    const d = doc.data();
    eventMeta[doc.id] = {
      primaryName: d.primaryName || "",
      eventDate: d.eventDate || "",
    };
    const mappings = Array.isArray(d.sourceMappings) ? d.sourceMappings : [];
    for (const m of mappings) {
      const src = m.source != null ? String(m.source) : "";
      const sid = m.sourceId != null ? String(m.sourceId) : "";
      const sk = `${src}_${sid}`;
      sourceKeyToEventId[sk] = doc.id;
    }
  });
  return { eventMeta, sourceKeyToEventId };
}

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
 * 주간 자동 **대회 발견만** (토/일 15:00 KST)
 * 전 회원 스크랩은 하지 않음 — report에서 운영자가 대회 선택 후 수집.
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
    const runAt = new Date().toISOString();
    console.log(`[weeklyDiscoverAndScrape] ${year}년 대회 발견만 (회원 수집 없음)`);

    const events = await scraper.discoverAllEvents(year);
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const { filtered: recentEvents, todayKst, startKst, endKst } = scraper.filterEventsWeeklyScrapeWindow(events, year, now);
    console.log(`[weeklyDiscoverAndScrape] KST 윈도 ${startKst}~${endKst} 이벤트: ${recentEvents.length}개`);

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
    const prioritized = scraper.sortWeeklyScrapeQueue(newEvents, todayKst, startKst, endKst);
    const previewTop = scraper.takeWeeklyScrapeSlice(prioritized);
    console.log(`[weeklyDiscoverAndScrape] 신규 후보 ${newEvents.length}개 (우선순위 상위 ${previewTop.length}건은 로그에 샘플)`);

    const candidatesSample = prioritized.slice(0, 40).map((e) => ({
      source: e.source,
      sourceId: e.sourceId,
      name: e.name,
      date: e.date || null,
    }));

    // 신규 후보 상위 N건에 scrape_jobs 플레이스홀더만 생성 (회원 수집 없음, race_results 미터치).
    // Report discover 병합 시 alreadyScraped → 검토 탭·순서 반영. 기존 문서는 덮어쓰지 않음.
    let placeholdersCreated = 0;
    try {
      const slice = scraper.takeWeeklyScrapeSlice(prioritized);
      const phBatch = db.batch();
      let phOps = 0;
      for (const e of slice) {
        if (!e.source || e.sourceId == null || e.sourceId === "") continue;
        const jobId = `${e.source}_${e.sourceId}`;
        const ref = db.collection("scrape_jobs").doc(jobId);
        const snap = await ref.get();
        if (snap.exists) continue;
        phBatch.set(ref, {
          source: e.source,
          sourceId: String(e.sourceId),
          eventName: e.name || String(e.sourceId),
          eventDate: e.date || "",
          status: "queued",
          progress: { searched: 0, total: 0, found: 0 },
          results: [],
          createdAt: runAt,
        });
        phOps++;
        placeholdersCreated++;
      }
      if (phOps > 0) await phBatch.commit();
    } catch (err) {
      console.error(`[weeklyDiscoverAndScrape] placeholder scrape_jobs: ${err.message}`);
    }

    await db.collection("ops_meta").doc("last_weekly_discover").set({
      runAt,
      year,
      todayKst,
      windowStartKst: startKst,
      windowEndKst: endKst,
      recentEventCount: recentEvents.length,
      newEventCount: newEvents.length,
      placeholdersCreated,
      candidatesSample,
    }, { merge: true });

    await db.collection("event_logs").add({
      type: "weekly_discover",
      severity: "info",
      message: `주간 대회 발견: 신규 후보 ${newEvents.length}건, 큐 등록 ${placeholdersCreated}건 (KST ${startKst}~${endKst}). 회원 수집은 report에서 실행.`,
      runAt,
      year,
      todayKst,
      windowStartKst: startKst,
      windowEndKst: endKst,
      recentEventCount: recentEvents.length,
      newEventCount: newEvents.length,
      placeholdersCreated,
      candidatesSample,
      timestamp: FieldValue.serverTimestamp(),
    });
  }
);

/**
 * 그룹 대회 당일 자동 스크랩 (매일 15:00 KST)
 * isGroupEvent + eventDate(오늘 KST)인 race_events에 대해 triggerGroupScrape 호출.
 */
exports.groupEventAutoScrape = onSchedule(
  { schedule: "0 15 * * *", timeZone: "Asia/Seoul", region: "asia-northeast3" },
  async () => {
    const todayKst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    console.log(`[groupEventAutoScrape] 오늘 KST: ${todayKst}`);

    const snap = await db.collection("race_events")
      .where("isGroupEvent", "==", true)
      .where("eventDate", "==", todayKst)
      .get();

    for (const doc of snap.docs) {
      const event = doc.data();
      if (!event.groupSource) {
        console.log(`[groupEventAutoScrape] 소스 미입력 건너뜀: ${doc.id}`);
        continue;
      }
      if (event.groupScrapeStatus === "done" || event.groupScrapeStatus === "running") {
        console.log(`[groupEventAutoScrape] 이미 스크랩됨 건너뜀: ${doc.id}`);
        continue;
      }
      if (!event.participants || event.participants.length === 0) {
        console.log(`[groupEventAutoScrape] 참가자 없음 건너뜀: ${doc.id}`);
        continue;
      }

      console.log(`[groupEventAutoScrape] 스크랩 시작: ${doc.id}`);
      await db.collection("race_events").doc(doc.id).update({
        groupScrapeStatus: "running",
        groupScrapeTriggeredAt: new Date().toISOString(),
      });

      triggerGroupScrape({
        canonicalEventId: doc.id,
        source: event.groupSource.source,
        sourceId: event.groupSource.sourceId,
        memberRealNames: event.participants.map((p) => p.realName),
        event,
        db,
        scraper,
      }).catch((err) => console.error(`[groupEventAutoScrape] 오류 ${doc.id}:`, err));
    }
    console.log(`[groupEventAutoScrape] 완료. 처리 대상: ${snap.docs.length}개 검사`);
  }
);

/**
 * 스크래핑 헬스체크 — 매시간 실행
 * - stuck job (running 상태 1시간 이상) 감지
 * - SmartChip 세션 실패 의심 (searched > 0, found = 0) 감지
 * - 주간 발견 스케줄 미실행 감지 (월요일: ops_meta.last_weekly_discover)
 */
exports.scrapeHealthCheck = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 60,
    memory: "256MiB",
    region: "asia-northeast3",
  },
  async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const alerts = [];

    // 1. stuck job 감지: running 상태로 1시간 이상 멈춘 잡
    const stuckSnap = await db.collection("scrape_jobs")
      .where("status", "==", "running")
      .where("createdAt", "<=", oneHourAgo)
      .get();
    stuckSnap.forEach((doc) => {
      const d = doc.data();
      alerts.push({
        type: "scrape_alert",
        severity: "error",
        code: "stuck_job",
        message: `스크래핑 잡이 1시간 이상 멈춤: ${d.eventName || doc.id}`,
        jobId: doc.id,
        eventName: d.eventName || "",
        progress: d.progress || {},
      });
    });

    // 2. 전체 소스 결과 0건 감지: 최근 3일 내 complete 잡 중 searched > 10 이지만 found = 0
    // SmartChip: 세션 문제 / MyResult·SPCT·Marazone: API 변경 또는 접근 불가 가능성
    const sourceLabels = {
      smartchip: "SmartChip (세션 문제 의심)",
      myresult: "MyResult (API 변경 또는 접근 불가 의심)",
      spct: "SPCT (API 변경 또는 접근 불가 의심)",
      marazone: "Marazone (API 변경 또는 접근 불가 의심)",
    };
    const recentSnap = await db.collection("scrape_jobs")
      .where("status", "==", "complete")
      .where("completedAt", ">=", threeDaysAgo)
      .get();
    recentSnap.forEach((doc) => {
      const d = doc.data();
      const searched = d.progress?.searched || 0;
      const found = d.progress?.found || (d.results || []).length;
      if (searched > 10 && found === 0) {
        const label = sourceLabels[d.source] || `${d.source} (접근 불가 의심)`;
        alerts.push({
          type: "scrape_alert",
          severity: "warning",
          code: "zero_results",
          source: d.source || "",
          message: `${label}: ${d.eventName || doc.id} — ${searched}명 검색했으나 결과 0건`,
          jobId: doc.id,
          eventName: d.eventName || "",
        });
      }
    });

    // 3. 주간 **발견** 스케줄 미실행: 월요일 9시 — ops_meta.last_weekly_discover.runAt
    const isMonday = now.getDay() === 1;
    const isCheckHour = now.getHours() === 9;
    if (isMonday && isCheckHour) {
      const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      const metaSnap = await db.collection("ops_meta").doc("last_weekly_discover").get();
      const runAt = metaSnap.exists ? metaSnap.data()?.runAt : null;
      const ok = runAt && new Date(runAt).getTime() >= sevenDaysAgoMs;
      if (!ok) {
        alerts.push({
          type: "scrape_alert",
          severity: "warning",
          code: "weekly_discover_missing",
          message: "지난 7일 동안 주간 대회 발견(weeklyDiscoverAndScrape) 기록이 없습니다. 스케줄·로그를 확인하세요.",
        });
      }
    }

    if (alerts.length === 0) {
      console.log("[scrapeHealthCheck] 이상 없음");
      return;
    }

    // 알림을 event_logs에 기록
    const batch = db.batch();
    for (const alert of alerts) {
      const ref = db.collection("event_logs").doc();
      batch.set(ref, {
        ...alert,
        timestamp: FieldValue.serverTimestamp(),
        checkedAt: now.toISOString(),
      });
    }
    await batch.commit();
    console.log(`[scrapeHealthCheck] 알림 ${alerts.length}건 기록`);
  }
);

/**
 * 주말 대회 스크래핑 준비 상태 체크 (스케줄 + testWeekendCheck 공통)
 */
async function runWeekendScrapeReadinessCheck() {
  const now = new Date();
  console.log(`[weekendScrapeReadinessCheck] ${now.toISOString()}`);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentJobsSnap = await db.collection("scrape_jobs").where("createdAt", ">=", sevenDaysAgo).get();

  let totalJobs = 0;
  let successJobs = 0;
  const bySource = {
    smartchip: { total: 0, success: 0 },
    myresult: { total: 0, success: 0 },
    spct: { total: 0, success: 0 },
    marazone: { total: 0, success: 0 },
  };

  recentJobsSnap.forEach((doc) => {
    const d = doc.data();
    const status = d.status;
    const source = d.source;

    if (status === "queued") return;

    totalJobs++;
    if (status === "complete" || status === "confirmed") successJobs++;

    if (bySource[source]) {
      bySource[source].total++;
      if (status === "complete" || status === "confirmed") bySource[source].success++;
    }
  });

  for (const src of Object.keys(bySource)) {
    const s = bySource[src];
    s.rate = s.total > 0 ? Math.round((s.success / s.total) * 100) : 0;
  }

  const overallSuccessRate = totalJobs > 0 ? Math.round((successJobs / totalJobs) * 100) : 0;

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const staleSnap = await db
    .collection("scrape_jobs")
    .where("status", "==", "complete")
    .where("completedAt", "<=", threeDaysAgo)
    .get();
  const staleCount = staleSnap.size;

  const year = new Date().getFullYear();
  const events = await scraper.discoverAllEvents(year);
  const { filtered: recentEvents } = scraper.filterEventsWeeklyScrapeWindow(events, year, now);

  const upcomingWeekend = recentEvents
    .filter((e) => {
      if (!e.date) return false;
      const eventDate = new Date(e.date);
      const dayOfWeek = eventDate.getDay();
      return (dayOfWeek === 0 || dayOfWeek === 6) && eventDate >= now;
    })
    .slice(0, 5);

  let overallStatus = "info";
  const issues = [];

  for (const e of upcomingWeekend) {
    const src = e.source;
    if (bySource[src] && bySource[src].rate < 80) {
      overallStatus = "error";
      issues.push(`🔴 ${src} success rate ${bySource[src].rate}% (임계치: 80%)`);
    } else if (bySource[src] && bySource[src].rate < 90) {
      if (overallStatus === "info") overallStatus = "warning";
      issues.push(`⚠️ ${src} success rate ${bySource[src].rate}% (임계치: 90%)`);
    }
  }

  if (staleCount >= 5) {
    if (overallStatus !== "error") overallStatus = "warning";
    issues.push(`⚠️ Stale jobs ${staleCount}건 (임계치: 5건)`);
  }

  const statusEmoji = { info: "✅", warning: "⚠️", error: "🔴" };
  const statusText = { info: "정상", warning: "주의", error: "긴급" };

  const subject = `[DMC Ops] 주말 대회 준비 체크 - ${statusEmoji[overallStatus]} ${statusText[overallStatus]}`;

  const html = `
<h2>🏃 주말 대회 스크래핑 준비 상태</h2>

<div style="background: #f0f0f0; padding: 15px; border-radius: 8px;">
  <h3>체크 시각: ${now.toISOString().slice(0, 16).replace("T", " ")}</h3>
  <p><strong>주말 예정 대회:</strong> ${upcomingWeekend.length}개</p>
</div>

<h3>📊 스크래핑 건강도 (최근 7일)</h3>
<table border="1" cellpadding="5" style="border-collapse: collapse;">
  <tr><th>소스</th><th>Success Rate</th><th>상태</th></tr>
  ${Object.entries(bySource)
    .map(([src, s]) => {
      const cellStatus = s.rate >= 90 ? "✅ 정상" : s.rate >= 80 ? "⚠️ 주의" : "🔴 긴급";
      return `<tr><td>${src}</td><td>${s.rate}% (${s.success}/${s.total})</td><td>${cellStatus}</td></tr>`;
    })
    .join("")}
</table>

<h3>${issues.length > 0 ? "⚠️ 발견된 이슈" : "✅ 이슈 없음"}</h3>
${issues.length > 0 ? `<ul>${issues.map((i) => `<li>${i}</li>`).join("")}</ul>` : "<p>모든 메트릭이 정상입니다.</p>"}

<h3>🔗 액션</h3>
<ul>
  <li>ops.html 확인: <a href="https://dmc-attendance.web.app/ops.html">바로가기</a></li>
  <li>report.html에서 stale jobs 확정: <a href="https://dmc-attendance.web.app/report.html">바로가기</a></li>
</ul>

<hr/>
<p style="color: #999; font-size: 12px;">
  이 알림은 매주 목/금 18:00에 자동 발송됩니다.<br/>
  문제가 있으면 ops.html에서 상세 내역을 확인하세요.
</p>
`;

  const healthSummary = { overall: { rate: overallSuccessRate }, bySource };
  const upcomingPayload = upcomingWeekend.map((e) => ({
    date: e.date,
    name: e.name,
    source: e.source,
  }));

  let emailSent = false;

  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) throw new Error("ADMIN_EMAIL not set");

    await sendEmail({
      to: adminEmail,
      subject,
      html,
    });

    await db.collection("event_logs").add({
      type: "weekend_check",
      severity: overallStatus,
      message: `주말 준비 체크 완료: ${upcomingWeekend.length}개 대회, ${overallSuccessRate}% 건강도`,
      checkedAt: now.toISOString(),
      upcomingWeekend: upcomingPayload,
      healthSummary,
      emailSent: true,
      timestamp: FieldValue.serverTimestamp(),
    });

    await db.collection("ops_meta").doc("last_weekend_check").set(
      {
        checkedAt: now.toISOString(),
        upcomingWeekend,
        healthSummary,
        emailSent: true,
        emailRecipient: adminEmail,
      },
      { merge: true },
    );

    emailSent = true;
    console.log(`[weekendScrapeReadinessCheck] 완료: ${upcomingWeekend.length}개 대회, ${issues.length}개 이슈`);
  } catch (emailError) {
    await db.collection("event_logs").add({
      type: "weekend_check",
      severity: "error",
      message: `주말 준비 체크 완료했으나 이메일 발송 실패: ${emailError.message}`,
      checkedAt: now.toISOString(),
      emailSent: false,
      emailError: emailError.message,
      timestamp: FieldValue.serverTimestamp(),
    });

    console.error("[weekendScrapeReadinessCheck] 이메일 실패:", emailError.message);
  }

  return {
    overallStatus,
    upcomingCount: upcomingWeekend.length,
    issuesCount: issues.length,
    emailSent,
    overallSuccessRate,
    staleCount,
  };
}

/**
 * 주말 대회 스크래핑 준비 상태 체크 (목/금 18:00 KST)
 */
exports.weekendScrapeReadinessCheck = onSchedule(
  {
    schedule: "0 18 * * 4,5",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 120,
    memory: "512MiB",
    region: "asia-northeast3",
  },
  async () => {
    try {
      await runWeekendScrapeReadinessCheck();
    } catch (err) {
      console.error("[weekendScrapeReadinessCheck] error:", err);
    }
  },
);

/** 로컬/수동 검증용 — 에뮬에서 curl로 트리거 */
exports.testWeekendCheck = onRequest(
  { cors: true, timeoutSeconds: 120, memory: "512MiB", region: "asia-northeast3" },
  async (req, res) => {
    try {
      const result = await runWeekendScrapeReadinessCheck();
      res.json({ ok: true, message: "테스트 완료, 이메일 확인", ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  },
);

/**
 * 단체 대회(group-events) 수동 스크랩: scrape_jobs 자동 ID + scrapeEvent (기존 scrape 액션과 동일 패턴)
 */
async function triggerGroupScrape({ canonicalEventId, source, sourceId, memberRealNames, event, db, scraper }) {
  const jobRef = db.collection("scrape_jobs").doc();
  const jobId = jobRef.id;
  const now = new Date().toISOString();
  try {
    const membersSnap = await db.collection("members").get();
    const allMembers = [];
    membersSnap.forEach((doc) => {
      const d = doc.data();
      if (d.hidden === true) return;
      allMembers.push({ realName: d.realName, nickname: d.nickname, gender: d.gender || "" });
    });
    const want = [...new Set(
      (memberRealNames || []).map((n) => String(n || "").trim()).filter(Boolean),
    )];
    if (want.length === 0) {
      throw new Error("memberRealNames: 한 명 이상 필요");
    }
    const byName = new Map(allMembers.map((m) => [m.realName, m]));
    const missingNames = want.filter((n) => !byName.has(n));
    if (missingNames.length > 0) {
      throw new Error(`등록·미숨김 회원에 없는 실명: ${missingNames.join(", ")}`);
    }
    const members = want.map((n) => byName.get(n));

    const confirmedSnap = await db.collection("race_results").where("status", "==", "confirmed").get();
    const confirmedResults = [];
    confirmedSnap.forEach((doc) => confirmedResults.push(doc.data()));
    const pbMap = scraper.buildPBMap(confirmedResults);

    await jobRef.set({
      source,
      sourceId,
      memberRealNames: want,
      eventName: (event && event.eventName) || sourceId,
      eventDate: (event && event.eventDate) || "",
      status: "running",
      progress: { searched: 0, total: members.length, found: 0 },
      results: [],
      createdAt: now,
    });

    const result = await scraper.scrapeEvent({
      source,
      sourceId,
      members,
      pbMap,
      skipCached: false,
      db,
      serverTimestamp: FieldValue.serverTimestamp(),
      onProgress: async (p) => {
        await jobRef.update({ progress: p });
      },
    });

    const finalStatus = result.jobStatus || "complete";
    await jobRef.update({
      status: finalStatus,
      eventName: result.eventName || (event && event.eventName) || sourceId,
      eventDate: result.eventDate || (event && event.eventDate) || "",
      results: sortScrapeJobResults(result.results),
      progress: {
        searched: members.length,
        total: members.length,
        found: (result.results && result.results.length) || 0,
        failCount: result.failCount || 0,
        failRate: result.failRate || 0,
      },
      completedAt: new Date().toISOString(),
    });

    await db.collection("race_events").doc(canonicalEventId).update({
      groupScrapeJobId: jobId,
      groupScrapeStatus: finalStatus === "partial_failure" ? "partial_failure" : "done",
    });
  } catch (err) {
    try {
      await db.collection("race_events").doc(canonicalEventId).update({
        groupScrapeStatus: "failed",
      });
    } catch (e) {
      console.error("[triggerGroupScrape] race_events failed update:", e);
    }
    try {
      const snap = await jobRef.get();
      if (snap.exists) {
        await jobRef.update({
          status: "failed",
          completedAt: new Date().toISOString(),
          error: err.message || String(err),
        });
      }
    } catch (e) {
      console.error("[triggerGroupScrape] job failed update:", e);
    }
    throw err;
  }
}

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
      const [snap, { eventMeta, sourceKeyToEventId }] = await Promise.all([
        db.collection("race_results").where("status", "==", "confirmed").get(),
        buildRaceEventIndexes(),
      ]);

      const groupMap = {};
      snap.forEach((rDoc) => {
        const r = rDoc.data();
        if (year && r.eventDate && !String(r.eventDate).startsWith(year)) return;

        const sourceKey = `${r.source || "unknown"}_${r.sourceId || "unknown"}`;
        let groupKey = r.canonicalEventId || null;
        if (!groupKey) groupKey = sourceKeyToEventId[sourceKey] || null;
        if (!groupKey) groupKey = sourceKey;

        if (!groupMap[groupKey]) {
          const meta = eventMeta[groupKey];
          groupMap[groupKey] = {
            id: groupKey,
            name: meta ? meta.primaryName : (r.eventName || ""),
            date: meta ? meta.eventDate : (r.eventDate || ""),
            source: r.source || "",
            sourceId: r.sourceId || "",
            results: [],
          };
        }
        groupMap[groupKey].results.push({
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
      const [snap, rrSnap] = await Promise.all([
        db.collection("scrape_jobs").orderBy("createdAt", "desc").get(),
        db.collection("race_results").where("status", "==", "confirmed").get(),
      ]);

      // SSOT(race_results) 기준 jobId별 확정 건수
      const rrCountByJob = {};
      rrSnap.forEach((doc) => {
        const jid = doc.data().jobId || "none";
        rrCountByJob[jid] = (rrCountByJob[jid] || 0) + 1;
      });

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
                  ? (rrCountByJob[doc.id] || 0)
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
              ? (rrCountByJob[doc.id] || 0)
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

      const { sourceKeyToEventId } = await buildRaceEventIndexes();
      const sk = `${data.source || "unknown"}_${data.sourceId || "unknown"}`;
      const canonicalEventId = sourceKeyToEventId[sk];

      return res.json({
        ok: true,
        ...data,
        jobId: doc.id,
        ...(canonicalEventId ? { canonicalEventId } : {}),
      });
    }

    if (action === "members") {
      // hidden 필드가 없는 레거시 문서는 미숨김으로 간주 (where("hidden","==",false)는 필드 누락 문서를 제외함)
      const snap = await db.collection("members").get();
      const members = [];
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.hidden === true) return;
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

    // ─── 프로액티브 제안: 최근 대회 미확정 기록 ─────────────
    if (action === "suggestions") {
      const memberName = req.query.member;
      if (!memberName) return res.status(400).json({ ok: false, error: "member query required" });

      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const cacheSnap = await db.collection("search_cache")
        .where("realName", "==", memberName)
        .where("found", "==", true)
        .get();

      const confirmedSnap = await db.collection("race_results")
        .where("status", "==", "confirmed")
        .where("memberRealName", "==", memberName)
        .get();
      const confirmedKeys = new Set();
      confirmedSnap.forEach((doc) => {
        const r = doc.data();
        confirmedKeys.add(`${r.source}_${r.sourceId}`);
      });

      const memberSnap = await db.collection("members")
        .where("realName", "==", memberName)
        .limit(1)
        .get();
      const memberGender = memberSnap.empty ? null : memberSnap.docs[0].data().gender;

      const pbSnap = await db.collection("race_results")
        .where("status", "==", "confirmed")
        .where("memberRealName", "==", memberName)
        .get();
      const pbMap = {};
      pbSnap.forEach((doc) => {
        const r = doc.data();
        const distN = normalizeRaceDistance(r.distance);
        const secs = scraper.timeToSeconds(r.netTime);
        const km = { full: 42.195, half: 21.0975, "10K": 10, "30K": 30, "32K": 32, "5K": 5, "3K": 3, "20K": 20 }[distN];
        if (!secs || secs === Infinity || !km) return;
        const pace = secs / km;
        if (!pbMap[distN] || pace < pbMap[distN]) pbMap[distN] = pace;
      });

      const DIST_KM = { full: 42.195, half: 21.0975, "10K": 10, "30K": 30, "32K": 32, "5K": 5, "3K": 3, "20K": 20 };
      const predictedPaces = {};
      for (const [dist, pace] of Object.entries(pbMap)) {
        const knownSecs = pace * DIST_KM[dist];
        for (const [td, tk] of Object.entries(DIST_KM)) {
          const predSecs = knownSecs * Math.pow(tk / DIST_KM[dist], 1.06);
          const predPace = predSecs / tk;
          if (!predictedPaces[td] || predPace < predictedPaces[td]) predictedPaces[td] = predPace;
        }
      }

      const byEvent = {};
      cacheSnap.forEach((doc) => {
        const d = doc.data();
        const eventDate = d.result?.eventDate || "";
        if (eventDate && eventDate < twoWeeksAgo) return;
        if (confirmedKeys.has(`${d.source}_${d.sourceId}`)) return;

        const eventKey = `${d.source}_${d.sourceId}`;
        if (!byEvent[eventKey]) {
          byEvent[eventKey] = {
            eventName: d.result?.eventName || d.sourceId,
            eventDate,
            source: d.source,
            sourceId: d.sourceId,
            candidates: [],
          };
        }

        for (const r of (d.result?.records || [])) {
          // 성별 불일치는 완전 제외
          if (memberGender && r.gender && r.gender !== memberGender) continue;

          const distN = normalizeRaceDistance(r.distance);
          const secs = scraper.timeToSeconds(r.netTime);
          const km = DIST_KM[distN];
          const pace = (secs && secs !== Infinity && km) ? secs / km : null;
          const predicted = predictedPaces[distN];

          let dimout = false;
          if (predicted && pace) {
            const delta = Math.abs(pace - predicted) / predicted;
            const thresh = (distN === "5K") ? Infinity : (distN === "10K") ? 1.0 : 0.5;
            if (delta > thresh) dimout = true;
          }

          byEvent[eventKey].candidates.push({
            distance: distN,
            netTime: r.netTime,
            pace: pace ? `${Math.floor(pace / 60)}:${String(Math.round(pace % 60)).padStart(2, "0")}` : null,
            gender: r.gender || null,
            bib: r.bib || null,
            dimout,
          });
        }
      });

      const suggestions = Object.values(byEvent)
        .filter((e) => e.candidates.length > 0)
        .sort((a, b) => (b.eventDate || "").localeCompare(a.eventDate || ""));

      return res.json({ ok: true, suggestions, memberGender, hasPB: Object.keys(pbMap).length > 0 });
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
      const {
        jobId, eventName, eventDate, source, sourceId, results, confirmSource, canonicalEventId,
      } = req.body || {};
      if (!jobId || !results || !Array.isArray(results)) {
        return res.status(400).json({ ok: false, error: "jobId and results[] required" });
      }

      if (canonicalEventId) {
        const evDoc = await db.collection("race_events").doc(String(canonicalEventId)).get();
        if (!evDoc.exists) {
          return res.status(400).json({ ok: false, error: "invalid canonicalEventId" });
        }
      }

      const batch = db.batch();
      const now = new Date().toISOString();

      const canonicalJobId = (source && sourceId && source !== "manual")
        ? `${source}_${sourceId}`
        : jobId;

      // ✅ P0 수정 (2026-04-03): 재확정 시 기존 race_results 삭제
      // 기존: 새 results만 set() → 이전 기록이 남아 중복 발생
      // 수정: canonicalJobId 기준 기존 문서 전체 삭제 후 새 results 저장
      const oldResultsSnap = await db.collection("race_results")
        .where("jobId", "==", canonicalJobId)
        .get();

      oldResultsSnap.forEach(doc => {
        batch.delete(doc.ref);
      });

      for (const r of results) {
        const resolvedDate = eventDate || r.eventDate || "";
        const safeDate = resolvedDate.replace(/[^0-9\-]/g, "");
        const safeName = (r.memberRealName || "").replace(/[^a-zA-Z0-9가-힣]/g, "_");
        const distNorm = normalizeRaceDistance(r.distance);
        const safeDist = (distNorm || "").replace(/[^a-zA-Z0-9]/g, "_");
        const docId = `${safeName}_${safeDist}_${safeDate}`;
        const ref = db.collection("race_results").doc(docId);
        const netEff = effectiveNetTimeForConfirm(r);
        const finishTrim = String(r.finishTime || "").trim();
        const row = {
          jobId: canonicalJobId,
          eventName: eventName || "",
          eventDate: resolvedDate,
          source: source || r.source || "",
          sourceId: sourceId || r.sourceId || "",
          memberRealName: r.memberRealName,
          memberNickname: r.memberNickname,
          distance: distNorm,
          netTime: netEff,
          gunTime: r.gunTime || "",
          bib: r.bib || "",
          overallRank: r.overallRank || null,
          gender: r.gender || "",
          pbConfirmed: r.pbConfirmed || false,
          isGuest: r.isGuest || false,
          note: r.note || "",
          status: r.dnStatus || "confirmed",
          confirmedAt: now,
          confirmSource: confirmSource || "operator",
        };
        if (!r.dnStatus && finishTrim && finishTrim !== "-") row.finishTime = finishTrim;
        if (canonicalEventId) row.canonicalEventId = String(canonicalEventId);
        batch.set(ref, row);
      }

      const jobRef = db.collection("scrape_jobs").doc(canonicalJobId);
      const jobDoc = await jobRef.get();

      if (jobDoc.exists) {
        batch.update(jobRef, {
          status: "confirmed",
          confirmedAt: now,
          eventName: eventName || jobDoc.data().eventName || "",
          eventDate: eventDate || jobDoc.data().eventDate || "",
          source: source || jobDoc.data().source || "",
          sourceId: sourceId || jobDoc.data().sourceId || "",
        });
      } else {
        batch.set(jobRef, {
          status: "confirmed",
          confirmedAt: now,
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
      const normalizedDate = normalizeEventDateForId(eventDate || now.slice(0, 10));
      const canonicalEventId = await allocateCanonicalEventId(db, eventDate || now.slice(0, 10), eventName);
      const eventRef = db.collection("race_events").doc(canonicalEventId);

      const batch = db.batch();
      batch.set(eventRef, {
        primaryName: eventName,
        eventDate: normalizedDate,
        sourceMappings: [{ source: "manual", sourceId }],
        createdAt: now,
      });
      batch.set(jobRef, {
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
      await batch.commit();

      return res.json({
        ok: true,
        jobId: jobRef.id,
        eventName,
        eventDate: eventDate || "",
        canonicalEventId,
      });
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

      return res.json({ ok: true, deletedDocId: docId });
    }

    if (action === "scrape" && req.method === "POST") {
      const {
        source, sourceId, eventName, eventDate, replaceJobId, resume, memberRealNames,
      } = req.body || {};
      if (!source || !sourceId) {
        return res.status(400).json({ ok: false, error: "source and sourceId required" });
      }

      const membersSnap = await db.collection("members").get();
      const allMembers = [];
      membersSnap.forEach((doc) => {
        const d = doc.data();
        if (d.hidden === true) return;
        allMembers.push({ realName: d.realName, nickname: d.nickname, gender: d.gender || "" });
      });

      let members = allMembers;
      if (memberRealNames !== undefined && memberRealNames !== null) {
        if (!Array.isArray(memberRealNames)) {
          return res.status(400).json({ ok: false, error: "memberRealNames must be an array" });
        }
        const want = [...new Set(
          memberRealNames.map((n) => String(n || "").trim()).filter(Boolean),
        )];
        if (want.length === 0) {
          return res.status(400).json({ ok: false, error: "memberRealNames: 한 명 이상 선택하세요" });
        }
        const byName = new Map(allMembers.map((m) => [m.realName, m]));
        const missing = want.filter((n) => !byName.has(n));
        if (missing.length > 0) {
          return res.status(400).json({
            ok: false,
            error: `등록·미숨김 회원에 없는 실명: ${missing.join(", ")}`,
          });
        }
        members = want.map((n) => byName.get(n));
      }

      const confirmedSnap = await db.collection("race_results").where("status", "==", "confirmed").get();
      const confirmedResults = [];
      confirmedSnap.forEach((doc) => confirmedResults.push(doc.data()));
      const pbMap = scraper.buildPBMap(confirmedResults);

      const canonicalId = `${source}_${sourceId}`;
      const jobRef = db.collection("scrape_jobs").doc(replaceJobId || canonicalId);

      const partialRescrape = !!(replaceJobId
        && Array.isArray(memberRealNames)
        && memberRealNames.length > 0);
      let previousResults = [];
      if (partialRescrape) {
        const prev = await jobRef.get();
        if (prev.exists && Array.isArray(prev.data().results)) {
          previousResults = prev.data().results;
        }
      }

      const now = new Date().toISOString();

      // resume=true 이면 기존 job 이어받기, 아니면 새로 시작
      const isResume = !!resume;

      // confirmed 잡 덮어쓰기 방지 — replaceJobId나 resume 없이 confirmed 잡 재스크래핑 시 거부
      if (!isResume && !replaceJobId) {
        const existingDoc = await jobRef.get();
        if (existingDoc.exists && existingDoc.data().status === "confirmed") {
          return res.status(409).json({
            ok: false,
            error: "이미 확정된 대회입니다. 재수집하려면 replaceJobId를 명시하세요.",
            jobId: jobRef.id,
            status: "confirmed",
          });
        }
      }

      const jobData = {
        source, sourceId,
        eventName: eventName || sourceId,
        eventDate: eventDate || "",
        status: "running",
        progress: { searched: 0, total: members.length, found: 0 },
        results: [],
        ...(isResume ? { resumedAt: now } : { createdAt: now, results: [] }),
        ...(replaceJobId ? { rescrapedAt: now } : {}),
      };

      if (isResume) {
        await jobRef.update({ status: "running", resumedAt: now });
      } else {
        await jobRef.set(jobData);
      }

      const jobId = jobRef.id;

      // 비동기로 스크래핑 (응답은 바로 반환하지 않고 완료까지 대기)
      const result = await scraper.scrapeEvent({
        source, sourceId, members, pbMap,
        // resume 시 이미 캐시된 회원 건너뜀 → 중단된 지점부터 재개 효과
        skipCached: isResume,
        db,
        serverTimestamp: FieldValue.serverTimestamp(),
        onProgress: async (p) => {
          await jobRef.update({ progress: p });
        },
      });

      let mergedResults = result.results;
      if (partialRescrape) {
        const sel = new Set(
          memberRealNames.map((n) => String(n || "").trim()).filter(Boolean),
        );
        const kept = previousResults.filter((r) => r && !sel.has(r.memberRealName));
        mergedResults = sortScrapeJobResults([...kept, ...result.results]);
      }

      const finalStatus = result.jobStatus || "complete";
      await jobRef.update({
        status: finalStatus,
        eventName: result.eventName || eventName || sourceId,
        eventDate: result.eventDate || eventDate || "",
        results: mergedResults,
        progress: {
          searched: members.length,
          total: members.length,
          found: mergedResults.length,
          failCount: result.failCount || 0,
          failRate: result.failRate || 0,
        },
        completedAt: new Date().toISOString(),
      });

      // partial_failure 시 event_logs에 경고 기록
      if (finalStatus === "partial_failure") {
        await db.collection("event_logs").add({
          type: "scrape_alert",
          severity: "warning",
          code: "partial_failure",
          message: `스크래핑 실패율 ${result.failRate}% (${result.failCount}명 오류): ${result.eventName || sourceId}`,
          jobId,
          source,
          sourceId,
          timestamp: FieldValue.serverTimestamp(),
        });
      }

      return res.json({
        ok: true,
        jobId,
        eventName: result.eventName,
        eventDate: result.eventDate,
        foundCount: result.results.length,
        mergedResultCount: mergedResults.length,
        partialRescrape,
        failCount: result.failCount || 0,
        failRate: result.failRate || 0,
        status: finalStatus,
      });
    }

    if (action === "ping-smartchip") {
      const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
      const targets = [
        { label: "dongma.html", url: "https://smartchip.co.kr/dongma.html" },
        { label: "main.html (www, 스텁만 올 수 있음)", url: "https://www.smartchip.co.kr/main.html" },
        { label: "main.html (discover용: smartchip.co.kr + Referer)", url: "https://smartchip.co.kr/main.html", referer: "https://smartchip.co.kr/" },
        { label: "api", url: "https://smartchip.co.kr/return_data_livephoto.asp?usedata=202550000191&name=테스트&gubun=1" },
      ];
      const results = await Promise.all(targets.map(async ({ label, url, referer }) => {
        const start = Date.now();
        try {
          const resp = await fetch(url, {
            signal: AbortSignal.timeout(8000),
            headers: {
              "User-Agent": ua,
              Accept: "text/html,application/xhtml+xml,*/*",
              ...(referer ? { Referer: referer } : {}),
            },
          });
          const headers = Object.fromEntries(resp.headers.entries());
          const body = (await resp.text()).substring(0, 300);
          return { label, url, status: resp.status, durationMs: Date.now() - start, headers, body };
        } catch (e) {
          return { label, url, error: e.message, durationMs: Date.now() - start };
        }
      }));
      return res.json({
        ok: true,
        testedAt: new Date().toISOString(),
        results,
      });
    }

    if (action === "verify-admin" && req.method === "POST") {
      const { pw } = req.body || {};
      const ownerPw = process.env.DMC_OWNER_PW;
      const adminPw = process.env.DMC_ADMIN_PW || "dmc2008";
      if (ownerPw && pw === ownerPw) {
        return res.json({ ok: true, role: "owner" });
      }
      if (pw === adminPw) {
        return res.json({ ok: true, role: "operator" });
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

    if (action === "member-stats") {
      const LAUNCH_DATE = "2026-03-23";

      // 1. race_results: confirmed 기록 전수 분석
      const rrSnap = await db.collection("race_results").where("status", "==", "confirmed").get();
      const postLaunchMembers = new Set();
      const allConfirmedMembers = new Set();
      const confirmSourceCount = { personal: 0, operator: 0, other: 0 };

      rrSnap.forEach((doc) => {
        const d = doc.data();
        const member = d.memberRealName || "";
        const createTime = doc.createTime?.toDate?.()?.toISOString?.() || "";
        const src = d.confirmSource || "other";

        allConfirmedMembers.add(member);
        if (createTime >= LAUNCH_DATE) postLaunchMembers.add(member);

        if (src === "personal") confirmSourceCount.personal++;
        else if (src === "operator") confirmSourceCount.operator++;
        else confirmSourceCount.other++;
      });

      // 2. event_logs: UA 기준 퍼널 분석 (최근 30일)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const logsSnap = await db.collection("event_logs")
        .where("timestamp", ">=", thirtyDaysAgo)
        .get();

      const FUNNEL_STAGES = ["page_load", "select_member", "search_start", "search_complete", "search_save"];
      const uaStages = {};
      logsSnap.forEach((doc) => {
        const d = doc.data();
        const ua = d.ua || "";
        const evt = d.event || d.type || "";
        if (!ua || !FUNNEL_STAGES.includes(evt)) return;
        if (!uaStages[ua]) uaStages[ua] = new Set();
        uaStages[ua].add(evt);
      });

      const funnel = {};
      FUNNEL_STAGES.forEach((stage) => {
        funnel[stage] = Object.values(uaStages).filter((s) => s.has(stage)).length;
      });

      // 3. search_cache: 검색됐으나 결과 없는 회원 수
      const cacheSnap = await db.collection("search_cache").get();
      const cacheFound = new Set();
      const cacheNotFound = new Set();
      cacheSnap.forEach((doc) => {
        const d = doc.data();
        const member = d.realName || "";
        if (!member) return;
        if (d.found) cacheFound.add(member);
        else cacheNotFound.add(member);
      });
      const searchedNoResult = [...cacheNotFound].filter((m) => !cacheFound.has(m));

      return res.json({
        ok: true,
        totalMembers: 154,
        confirmedMembers: allConfirmedMembers.size,
        postLaunchMembers: postLaunchMembers.size,
        postLaunchRate: Math.round(postLaunchMembers.size / 154 * 100),
        totalConfirmedRecords: rrSnap.size,
        confirmSource: confirmSourceCount,
        funnel,
        searchCoverage: {
          searched: cacheFound.size + cacheNotFound.size,
          foundResult: cacheFound.size,
          noResult: searchedNoResult.length,
        },
      });
    }

    /**
     * Ops: 주간 자동 스크랩(weeklyDiscoverAndScrape)과 동일 조건의 큐 미리보기 + KST 기준 오늘 개최일 대회
     * discoverAllEvents 호출로 수 초 걸릴 수 있음.
     */
    if (action === "ops-scrape-preview") {
      const year = new Date().getFullYear();
      const events = await scraper.discoverAllEvents(year);
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const todayStr = now.toISOString().slice(0, 10);

      const { filtered: recentEvents, todayKst, startKst, endKst } = scraper.filterEventsWeeklyScrapeWindow(events, year, now);

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
      const prioritized = scraper.sortWeeklyScrapeQueue(newEvents, todayKst, startKst, endKst);
      const newKeySet = new Set(newEvents.map((e) => `${e.source}:${e.sourceId}`));

      const slim = (e) => ({
        source: e.source,
        sourceId: e.sourceId,
        name: e.name,
        date: e.date || null,
      });

      const racesHeldTodayKst = recentEvents
        .filter((e) => e.date === todayKst)
        .map((e) => ({
          ...slim(e),
          inNextQueue: newKeySet.has(`${e.source}:${e.sourceId}`),
        }));

      const maxJobs = scraper.WEEKLY_MAX_JOBS_PER_RUN;
      const nextBatch = prioritized.slice(0, maxJobs).map((e, i) => ({ ...slim(e), order: i + 1 }));
      const queueTail = prioritized.slice(maxJobs, maxJobs + 15).map(slim);

      return res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        todayKst,
        todayUtc: todayStr,
        windowStartKst: startKst,
        windowEndKst: endKst,
        weeklySchedule: `토·일 15:00 발견만(자동 회원수집 없음). 수동 수집 시 참고 순서 상위 ${maxJobs}건 · KST ${startKst}~${endKst}`,
        recentEventCount: recentEvents.length,
        newEventCount: newEvents.length,
        racesHeldTodayKst,
        nextBatch,
        queueTail,
      });
    }

    if (action === "data-integrity") {
      const [jobsSnap, rrSnap] = await Promise.all([
        db.collection("scrape_jobs").get(),
        db.collection("race_results").where("status", "==", "confirmed").get(),
      ]);
      const rrByJob = {};
      rrSnap.forEach((doc) => {
        const jid = doc.data().jobId || "none";
        rrByJob[jid] = (rrByJob[jid] || 0) + 1;
      });
      // confirmed 상태인데 실제 race_results가 0건인 phantom job만 이슈로 보고
      const issues = [];
      jobsSnap.forEach((doc) => {
        const d = doc.data();
        if (d.status === "confirmed" && (rrByJob[doc.id] || 0) === 0) {
          issues.push({ jobId: doc.id, eventName: d.eventName || "", actual: 0 });
        }
      });
      return res.json({ ok: true, totalJobs: jobsSnap.size, totalResults: rrSnap.size, issues });
    }

    if (action === "ops-scrape-health") {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // 최근 7일 jobs 조회
      const recentJobsSnap = await db
        .collection("scrape_jobs")
        .where("createdAt", ">=", sevenDaysAgo)
        .get();

      let totalJobs = 0;
      let successJobs = 0;
      let failedJobs = 0;
      const bySource = {
        smartchip: { total: 0, success: 0 },
        myresult: { total: 0, success: 0 },
        spct: { total: 0, success: 0 },
        marazone: { total: 0, success: 0 },
        manual: { total: 0, success: 0 },
      };

      recentJobsSnap.forEach((doc) => {
        const d = doc.data();
        const status = d.status;
        const source = d.source || "unknown";

        if (status === "queued") return; // 대기중은 제외

        totalJobs++;
        const isSuccess = status === "complete" || status === "confirmed";
        if (isSuccess) successJobs++;
        if (status === "failed") failedJobs++;

        if (bySource[source]) {
          bySource[source].total++;
          if (isSuccess) bySource[source].success++;
        }
      });

      const overallRate = totalJobs > 0 ? Math.round((successJobs / totalJobs) * 100) : 0;

      // bySource rate 계산
      for (const src in bySource) {
        if (src === "manual") continue;
        const s = bySource[src];
        s.rate = s.total > 0 ? Math.round((s.success / s.total) * 100) : 0;
      }

      // Stale jobs: status=complete + completedAt 3일 이상
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const staleSnap = await db
        .collection("scrape_jobs")
        .where("status", "==", "complete")
        .where("completedAt", "<=", threeDaysAgo)
        .get();

      const staleJobs = [];
      staleSnap.forEach((doc) => {
        const d = doc.data();
        if (d.completedAt) {
          staleJobs.push({ jobId: doc.id, eventName: d.eventName, completedAt: d.completedAt });
        }
      });

      // Stuck jobs: status=running + createdAt 1시간 이상
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const stuckSnap = await db
        .collection("scrape_jobs")
        .where("status", "==", "running")
        .where("createdAt", "<=", oneHourAgo)
        .get();

      const stuckJobs = [];
      stuckSnap.forEach((doc) => {
        const d = doc.data();
        stuckJobs.push({ jobId: doc.id, eventName: d.eventName, createdAt: d.createdAt });
      });

      // 주말 대회 (토/일 개최, 최근 2주 윈도우)
      const year = new Date().getFullYear();
      const events = await scraper.discoverAllEvents(year);
      const now = new Date();
      const { filtered: recentEvents } = scraper.filterEventsWeeklyScrapeWindow(events, year, now);

      const upcomingWeekend = recentEvents
        .filter((e) => {
          if (!e.date) return false;
          const eventDate = new Date(e.date);
          const dayOfWeek = eventDate.getDay();
          return (dayOfWeek === 0 || dayOfWeek === 6) && eventDate >= now; // 토/일, 미래
        })
        .slice(0, 10) // 최대 10개
        .map((e) => ({
          date: e.date,
          eventName: e.name,
          source: e.source,
        }));

      return res.json({
        ok: true,
        period: { start: sevenDaysAgo, end: new Date().toISOString() },
        overall: {
          total: totalJobs,
          success: successJobs,
          failed: failedJobs,
          stale: staleJobs.length,
          stuck: stuckJobs.length,
          rate: overallRate,
        },
        bySource,
        upcomingWeekend,
        lastCheck: new Date().toISOString(),
      });
    }

    if (action === "ops-gorunning-events") {
      // 캐시: ops_meta/last_gorunning_crawl, TTL 6시간 (아래 sixHoursAgo)
      const cacheDoc = await db.collection("ops_meta").doc("last_gorunning_crawl").get();
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

      let cachedData = null;
      if (cacheDoc.exists) {
        const d = cacheDoc.data();
        const crawledAt = new Date(d.crawledAt);
        if (crawledAt >= sixHoursAgo) {
          cachedData = d;
        }
      }

      if (cachedData) {
        return res.json({
          ok: true,
          events: cachedData.events || [],
          lastCrawled: cachedData.crawledAt,
          cached: true,
        });
      }

      try {
        const upcomingEvents = await scraper.crawlAllUpcomingEvents();

        // 1. scrape_jobs 매칭 (대회 후)
        const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const jobsSnap = await db.collection("scrape_jobs").where("createdAt", ">=", threeMonthsAgo).get();

        const scrapeJobs = [];
        jobsSnap.forEach((doc) => {
          const d = doc.data();
          scrapeJobs.push({
            jobId: doc.id,
            source: d.source,
            sourceId: d.sourceId,
            eventName: d.eventName,
            eventDate: d.eventDate,
          });
        });

        // 2. discovered-events.json 로드 (대회 전)
        const fs = require("fs");
        const path = require("path");
        const discoveredPath = path.join(__dirname, "data/discovered-events-2026.json");
        let discoveredEvents = [];
        try {
          const discoveredData = JSON.parse(fs.readFileSync(discoveredPath, "utf8"));
          discoveredEvents = discoveredData.events || [];
        } catch (err) {
          console.warn("[ops-gorunning-events] discovered-events 로드 실패:", err.message);
        }

        // 3. 2단계 매칭
        const enrichedEvents = upcomingEvents.map((e) => {
          // Step 1: scrape_jobs 매칭 (이미 스크랩됨)
          const jobMatch = scraper.matchGorunningToJob(e, scrapeJobs);
          if (jobMatch) {
            return {
              id: e.id,
              name: e.name,
              date: e.date,
              location: e.location,
              distance: e.distance,
              url: e.url,
              matchStatus: "scraped",
              matchedJob: {
                source: jobMatch.job.source,
                sourceId: jobMatch.job.sourceId,
                jobId: jobMatch.job.jobId,
                similarity: jobMatch.similarity,
              },
            };
          }

          // Step 2: discovered-events 매칭 (발견됨)
          const discoveredMatch = scraper.matchGorunningToDiscovered(e, discoveredEvents);
          if (discoveredMatch) {
            return {
              id: e.id,
              name: e.name,
              date: e.date,
              location: e.location,
              distance: e.distance,
              url: e.url,
              matchStatus: "discovered",
              matchedEvent: {
                source: discoveredMatch.event.source,
                sourceId: discoveredMatch.event.sourceId,
                eventName: discoveredMatch.event.name,
                eventDate: discoveredMatch.event.date,
                similarity: discoveredMatch.similarity,
              },
            };
          }

          // Step 3: 매칭 실패
          return {
            id: e.id,
            name: e.name,
            date: e.date,
            location: e.location,
            distance: e.distance,
            url: e.url,
            matchStatus: "not_matched",
            matchedJob: null,
          };
        });

        const crawledAt = new Date().toISOString();
        await db.collection("ops_meta").doc("last_gorunning_crawl").set({
          crawledAt,
          events: enrichedEvents,
          stats: {
            total: enrichedEvents.length,
            scraped: enrichedEvents.filter((ev) => ev.matchStatus === "scraped").length,
            discovered: enrichedEvents.filter((ev) => ev.matchStatus === "discovered").length,
            notMatched: enrichedEvents.filter((ev) => ev.matchStatus === "not_matched").length,
          },
        });

        return res.json({
          ok: true,
          events: enrichedEvents,
          lastCrawled: crawledAt,
          cached: false,
        });
      } catch (err) {
        console.error("[ops-gorunning-events] error:", err);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === "clear-gorunning-cache" && req.method === "POST") {
      // 고러닝 캐시 무효화 (테스트용)
      const { secret } = req.body || {};
      
      const expectedSecret = process.env.ADMIN_SECRET || "dmc-admin-2026";
      if (secret !== expectedSecret) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }

      await db.collection("ops_meta").doc("last_gorunning_crawl").delete();
      return res.json({ ok: true, message: "캐시 삭제됨. 다음 ops-gorunning-events 호출 시 재크롤링됩니다." });
    }

    if (action === "group-events" && req.method === "GET" && !req.query.subAction) {
      const groupSnap = await db.collection("race_events")
        .where("isGroupEvent", "==", true)
        .get();
      const groupEvents = [];
      groupSnap.forEach((doc) => groupEvents.push({ id: doc.id, ...doc.data() }));

      const cacheDoc = await db.collection("ops_meta").doc("last_gorunning_crawl").get();
      const gorunningEvents = cacheDoc.exists ? (cacheDoc.data().events || []) : [];

      const promotedGorunningIds = new Set(groupEvents.map((e) => e.gorunningId).filter(Boolean));
      const availableGorunning = gorunningEvents.filter((e) => !promotedGorunningIds.has(e.id));

      return res.json({ ok: true, groupEvents, availableGorunning });
    }

    if (action === "group-events" && req.method === "GET" && req.query.subAction === "gap") {
      const { canonicalEventId } = req.query;
      if (!canonicalEventId) {
        return res.status(400).json({ ok: false, error: "canonicalEventId required" });
      }

      const eventDoc = await db.collection("race_events").doc(canonicalEventId).get();
      if (!eventDoc.exists) return res.status(404).json({ ok: false, error: "대회 없음" });

      const eventRow = eventDoc.data();
      const participants = eventRow.participants || [];

      if (!eventRow.groupScrapeJobId) {
        return res.json({ ok: true, status: "not_scraped", participants, results: [] });
      }

      const jobDoc = await db.collection("scrape_jobs").doc(eventRow.groupScrapeJobId).get();
      const scrapeResults = jobDoc.exists ? (jobDoc.data().results || []) : [];

      const resultsByName = scrapeResults.reduce((acc, r) => {
        const key = r.memberRealName;
        (acc[key] = acc[key] || []).push(r);
        return acc;
      }, {});

      // race_results에서 이미 확정된 기록 조회 (canonicalEventId 기준)
      const confirmedSnap = await db.collection("race_results")
        .where("canonicalEventId", "==", canonicalEventId)
        .get();
      const confirmedByName = {};
      confirmedSnap.forEach((doc) => {
        const d = doc.data();
        confirmedByName[d.memberRealName] = d;
      });

      const gap = participants.map((p) => {
        // 이미 확정된 기록이 있으면 scrape 결과보다 우선
        const confirmed = confirmedByName[p.realName];
        if (confirmed) {
          return { ...p, gapStatus: "ok", confirmed: true, result: confirmed };
        }
        const matches = resultsByName[p.realName] || [];
        if (matches.length === 0) {
          return { ...p, gapStatus: "missing", result: null };
        }
        if (matches.length > 1 || matches[0].status === "ambiguous") {
          return { ...p, gapStatus: "ambiguous", candidates: matches.slice(0, 3) };
        }
        return { ...p, gapStatus: "ok", result: matches[0] };
      });

      return res.json({ ok: true, status: "scraped", gap });
    }

    if (action === "group-events" && req.method === "POST" && req.body && req.body.subAction === "promote") {
      const { gorunningId, eventName, eventDate } = req.body;
      if (!gorunningId || !eventName || !eventDate) {
        return res.status(400).json({ ok: false, error: "gorunningId, eventName, eventDate required" });
      }

      const canonicalEventId = await allocateCanonicalEventId(db, eventDate, eventName);
      const ref = db.collection("race_events").doc(canonicalEventId);

      await ref.set({
        eventName,
        eventDate,
        isGroupEvent: true,
        participants: [],
        groupSource: null,
        groupScrapeStatus: "pending",
        groupScrapeJobId: null,
        groupScrapeTriggeredAt: null,
        gorunningId,
        promotedAt: new Date().toISOString(),
      }, { merge: true });

      return res.json({ ok: true, canonicalEventId });
    }

    if (action === "group-events" && req.method === "POST" && req.body && req.body.subAction === "participants") {
      const { canonicalEventId, participants } = req.body;
      if (!canonicalEventId || !Array.isArray(participants)) {
        return res.status(400).json({ ok: false, error: "canonicalEventId and participants[] required" });
      }

      const memberIds = participants.map((p) => p.memberId);
      const memberDocs = await Promise.all(memberIds.map((id) => db.collection("members").doc(id).get()));
      const invalid = memberIds.filter((id, i) => !memberDocs[i].exists);
      if (invalid.length > 0) {
        return res.status(400).json({ ok: false, error: `유효하지 않은 memberId: ${invalid.join(", ")}` });
      }

      await db.collection("race_events").doc(canonicalEventId).update({ participants });
      return res.json({ ok: true });
    }

    if (action === "group-events" && req.method === "POST" && req.body && req.body.subAction === "source") {
      const { ownerPw, canonicalEventId, source, sourceId } = req.body;

      const expectedOwnerPw = process.env.DMC_OWNER_PW;
      if (!expectedOwnerPw || ownerPw !== expectedOwnerPw) {
        return res.status(403).json({ ok: false, error: "오너 권한 필요" });
      }
      if (!canonicalEventId || !source || !sourceId) {
        return res.status(400).json({ ok: false, error: "canonicalEventId, source, sourceId required" });
      }

      await db.collection("race_events").doc(canonicalEventId).update({
        groupSource: { source, sourceId },
      });
      return res.json({ ok: true });
    }

    if (action === "group-events" && req.method === "POST" && req.body && req.body.subAction === "scrape") {
      const { ownerPw, canonicalEventId } = req.body;

      const expectedOwnerPw = process.env.DMC_OWNER_PW;
      if (!expectedOwnerPw || ownerPw !== expectedOwnerPw) {
        return res.status(403).json({ ok: false, error: "오너 권한 필요" });
      }

      const eventDoc = await db.collection("race_events").doc(canonicalEventId).get();
      if (!eventDoc.exists) return res.status(404).json({ ok: false, error: "대회 없음" });

      const eventRow = eventDoc.data();
      if (!eventRow.groupSource) {
        return res.status(400).json({ ok: false, error: "기록 소스 미입력" });
      }
      if (!eventRow.participants || eventRow.participants.length === 0) {
        return res.status(400).json({ ok: false, error: "참가자 미등록" });
      }

      if (eventRow.groupScrapeStatus === "running") {
        return res.status(400).json({ ok: false, error: "이미 스크랩이 진행 중입니다" });
      }

      const { source: src, sourceId: sid } = eventRow.groupSource;
      const memberRealNames = eventRow.participants.map((p) => p.realName);

      await db.collection("race_events").doc(canonicalEventId).update({
        groupScrapeStatus: "running",
        groupScrapeTriggeredAt: new Date().toISOString(),
      });

      triggerGroupScrape({
        canonicalEventId,
        source: src,
        sourceId: sid,
        memberRealNames,
        event: eventRow,
        db,
        scraper,
      }).catch((err) => console.error("[group-events scrape]", err));

      return res.json({ ok: true, message: "스크랩 시작됨" });
    }

    if (action === "group-events" && req.method === "POST" && req.body && req.body.subAction === "confirm-one") {
      const { canonicalEventId, participant, confirmSource: cs } = req.body;
      if (!canonicalEventId || !participant || !participant.realName) {
        return res.status(400).json({ ok: false, error: "canonicalEventId and participant.realName required" });
      }

      const eventDoc = await db.collection("race_events").doc(canonicalEventId).get();
      if (!eventDoc.exists) return res.status(404).json({ ok: false, error: "대회 없음" });
      const ev = eventDoc.data();

      const now = new Date().toISOString();
      const resolvedDate = ev.eventDate || "";
      const safeDate = resolvedDate.replace(/[^0-9\-]/g, "");
      const safeName = (participant.realName || "").replace(/[^a-zA-Z0-9가-힣]/g, "_");
      const distNorm = normalizeRaceDistance(participant.distance);
      const safeDist = (distNorm || "").replace(/[^a-zA-Z0-9]/g, "_");
      const docId = `${safeName}_${safeDist}_${safeDate}`;
      const ref = db.collection("race_results").doc(docId);

      const finishTrim = String(participant.finishTime || "").trim();
      const netEff = effectiveNetTimeForConfirm(participant);

      const row = {
        jobId: ev.groupScrapeJobId || canonicalEventId,
        canonicalEventId,
        eventName: ev.eventName || "",
        eventDate: resolvedDate,
        source: ev.groupSource?.source || "manual",
        sourceId: ev.groupSource?.sourceId || "",
        memberRealName: participant.realName,
        memberNickname: participant.nickname || participant.realName,
        distance: distNorm,
        netTime: netEff,
        gunTime: participant.gunTime || "",
        bib: participant.bib || "",
        overallRank: participant.overallRank || null,
        gender: participant.gender || "",
        pbConfirmed: false,
        isGuest: false,
        note: participant.note || "",
        status: participant.dnStatus ? participant.dnStatus.toLowerCase() : "confirmed",
        confirmedAt: now,
        confirmSource: cs || "operator",
      };
      if (!participant.dnStatus && finishTrim && finishTrim !== "-") row.finishTime = finishTrim;

      await ref.set(row);
      return res.json({ ok: true, docId });
    }

    if (action === "group-events" && req.method === "POST" && req.body && req.body.subAction === "delete") {
      const { canonicalEventId } = req.body;
      if (!canonicalEventId) {
        return res.status(400).json({ ok: false, error: "canonicalEventId required" });
      }

      const eventDoc = await db.collection("race_events").doc(canonicalEventId).get();
      if (!eventDoc.exists) {
        return res.status(404).json({ ok: false, error: "대회를 찾을 수 없습니다" });
      }

      await db.collection("race_events").doc(canonicalEventId).delete();
      return res.json({ ok: true, message: "대회가 삭제되었습니다" });
    }

    if (action === "fix-phantom-jobs" && req.method === "POST") {
      // Phantom Jobs 일괄 다운그레이드 (confirmed → complete)
      const { jobIds, secret } = req.body || {};
      
      // 간단한 시크릿 체크 (옵션)
      const expectedSecret = process.env.ADMIN_SECRET || "dmc-admin-2026";
      if (secret !== expectedSecret) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }

      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return res.status(400).json({ ok: false, error: "jobIds required" });
      }

      const batch = db.batch();
      const updated = [];
      const notFound = [];
      const alreadyComplete = [];

      for (const jobId of jobIds) {
        const docRef = db.collection("scrape_jobs").doc(jobId);
        const doc = await docRef.get();

        if (!doc.exists) {
          notFound.push(jobId);
          continue;
        }

        const data = doc.data();
        if (data.status === "confirmed") {
          batch.update(docRef, {
            status: "complete",
            confirmedAt: FieldValue.delete(),
          });
          updated.push({ jobId, eventName: data.eventName });
        } else {
          alreadyComplete.push({ jobId, status: data.status });
        }
      }

      if (updated.length > 0) {
        await batch.commit();
      }

      return res.json({
        ok: true,
        updated: updated.length,
        notFound: notFound.length,
        alreadyComplete: alreadyComplete.length,
        details: { updated, notFound, alreadyComplete },
      });
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

/**
 * SmartChip 프록시 API (개발자 전용)
 * 로컬 IP가 SmartChip에 차단된 경우 Cloud Functions IP로 우회
 * GET /scrapeProxy?secret=XXX&source=smartchip&sourceId=202650000016&name=임기빈
 */
exports.scrapeProxy = onRequest(
  { cors: false, timeoutSeconds: 60, memory: "256MiB", region: "asia-northeast3", invoker: "public" },
  async (req, res) => {
    const secret = process.env.SCRAPE_PROXY_SECRET || "dmc-proxy-2026";
    if (req.query.secret !== secret) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const { source, sourceId, name } = req.query;
    if (!source || !sourceId || !name) {
      return res.status(400).json({ ok: false, error: "source, sourceId, name required" });
    }

    try {
      const scraper = require("./lib/scraper");
      let opts = {};
      if (source === "smartchip") {
        const session = await scraper.getSmartChipSession();
        opts = { session };
      }
      const results = await scraper.searchMember(source, sourceId, name, opts);
      return res.json({ ok: true, results: results || [] });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
);

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
