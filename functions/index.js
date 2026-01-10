/**
 * DMC Attendance Log - Firebase Cloud Functions
 * 
 * API:
 * - POST /attendance - 출석 등록
 * - GET /attendance?action=status&date=YYYY/MM/DD - 날짜별 출석 현황
 * - GET /attendance?action=history&nickname=xxx&month=YYYY-MM - 월간 출석 기록
 */

const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// 초기화
initializeApp();
const db = getFirestore();

// 비용 제어: 최대 인스턴스 수 제한
setGlobalOptions({ maxInstances: 10, region: "asia-northeast3" });

// ==================== 상수 ====================

const COLLECTION = "attendance";
const DEFAULT_TZ = "Asia/Seoul";

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
        timeText: formatKstKoreanAmPm(now),
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
 * GET 요청 핸들러
 */
async function handleGet(req, res) {
  const startMs = Date.now();

  try {
    const action = str(req.query.action || "status").trim();

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
