/**
 * Attendance Web App (ENUM in/out, KST, robust against Date cells)
 *
 * Sheet columns (Form response sheet):
 * A: timestamp (DateTime)          -> Date object (usually)
 * B: nickname                      -> string
 * C: teamLabel                     -> string (e.g., "1팀", "S팀")
 * D: meetingTypeLabel              -> string (e.g., "토요일", "기타")
 * E: meetingDate                   -> Date object OR legacy string like "2026. 1. 3"
 *
 * API
 * - POST /exec
 *   nickname: string
 *   team: enum code (T1..T5, S)
 *   meetingType: enum code (ETC, TUE, THU, SAT)
 *   meetingDate: YYYY/MM/DD
 *
 * - GET /exec?action=status&date=YYYY/MM/DD
 *   - date omitted -> today in KST
 *   - reads existing sheet rows whose E column matches the requested date
 *     (supports E as Date or string; supports "YYYY/MM/DD" or "YYYY. M. D")
 */

const TARGET_SHEET_NAME = '설문지 응답 시트2';
const DEFAULT_TZ = 'Asia/Seoul';
const STATUS_CACHE_TTL_SECONDS = 15;
const STATUS_CACHE_PREFIX = 'status:';

// ENUM maps (API codes -> sheet labels)
const TEAM_LABEL = {
  T1: '1팀',
  T2: '2팀',
  T3: '3팀',
  T4: '4팀',
  T5: '5팀',
  S:  'S팀',
};

const MEETING_TYPE_LABEL = {
  ETC: '기타',
  TUE: '화요일',
  THU: '목요일',
  SAT: '토요일',
};

/** -------------------- Entry points -------------------- */

function doPost(e) {
  try {
    const payload = parsePayload_(e);

    const nicknameRaw = str_(payload.nickname).trim();
    const teamCode = str_(payload.team).trim().toUpperCase();
    const typeCode = str_(payload.meetingType).trim().toUpperCase();
    const meetingDateKey = str_(payload.meetingDate).trim(); // must be YYYY/MM/DD

    if (!nicknameRaw) return json_({ ok: false, error: 'nickname is required' });
    if (!teamCode) return json_({ ok: false, error: 'team is required' });
    if (!typeCode) return json_({ ok: false, error: 'meetingType is required' });
    if (!meetingDateKey) return json_({ ok: false, error: 'meetingDate is required' });

    if (!isValidDateKey_(meetingDateKey)) {
      return json_({ ok: false, error: `invalid meetingDate (YYYY/MM/DD): ${meetingDateKey}` });
    }

    const teamLabel = TEAM_LABEL[teamCode];
    if (!teamLabel) return json_({ ok: false, error: `invalid team enum: ${teamCode}` });

    const meetingTypeLabel = MEETING_TYPE_LABEL[typeCode];
    if (!meetingTypeLabel) return json_({ ok: false, error: `invalid meetingType enum: ${typeCode}` });

    const tz = getTz_();
    const now = new Date();

    // Allow safe test writes while keeping uniqueness
    const nicknameStored = (nicknameRaw.toUpperCase() === 'TEST')
      ? makeTestNickname_(now, tz)
      : nicknameRaw;

    const sheet = getTargetSheet_();
    sheet.appendRow([now, nicknameStored, teamLabel, meetingTypeLabel, meetingDateKey]);

    const status = getStatusForDate_(meetingDateKey, tz);
    setCachedStatus_(meetingDateKey, status);

    return json_({
      ok: true,
      written: {
        nicknameStored,
        team: teamCode,
        teamLabel,
        meetingType: typeCode,
        meetingTypeLabel,
        meetingDate: meetingDateKey,
        timeText: formatKstKoreanAmPm_(now, tz),
      },
      status,
    });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

function doGet(e) {
  try {
    const action = str_(e?.parameter?.action || 'status').trim();
    if (action !== 'status') return json_({ ok: false, error: `unknown action: ${action}` });

    const tz = getTz_();
    const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy/MM/dd');

    const dateParam = str_(e?.parameter?.date).trim();
    const dateKey = dateParam ? dateParam : todayKey;

    if (!isValidDateKey_(dateKey)) {
      return json_({ ok: false, error: `invalid date (YYYY/MM/DD): ${dateKey}` });
    }

    const cached = getCachedStatus_(dateKey);
    if (cached) return json_({ ok: true, ...cached });

    const status = getStatusForDate_(dateKey, tz);
    setCachedStatus_(dateKey, status);
    return json_({ ok: true, ...status });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

/** -------------------- Helpers -------------------- */

function getTz_() {
  return Session.getScriptTimeZone() || DEFAULT_TZ;
}

function getTargetSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) throw new Error(`sheet not found: ${TARGET_SHEET_NAME}`);
  return sheet;
}

function str_(v) {
  return (v === null || v === undefined) ? '' : String(v);
}

function getStatusCacheKey_(dateKey) {
  return `${STATUS_CACHE_PREFIX}${dateKey}`;
}

function getCachedStatus_(dateKey) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(getStatusCacheKey_(dateKey));
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch (e) {
    return null;
  }
}

function setCachedStatus_(dateKey, status) {
  const cache = CacheService.getScriptCache();
  cache.put(getStatusCacheKey_(dateKey), JSON.stringify(status), STATUS_CACHE_TTL_SECONDS);
}

function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    const ct = (e.postData.type || '').toLowerCase();
    if (ct.includes('application/json')) return JSON.parse(e.postData.contents);
  }
  if (e && e.parameter) return e.parameter;
  return {};
}

function isValidDateKey_(s) {
  return /^\d{4}\/\d{2}\/\d{2}$/.test(s);
}

function makeTestNickname_(now, tz) {
  const stamp = Utilities.formatDate(now, tz, 'yyyyMMdd_HHmmss');
  return `TEST_${stamp}`;
}

function formatKstKoreanAmPm_(d, tz) {
  if (!(d instanceof Date)) return '';
  const yyyy = Utilities.formatDate(d, tz, 'yyyy');
  const m = String(Number(Utilities.formatDate(d, tz, 'M')));
  const dd = String(Number(Utilities.formatDate(d, tz, 'd')));

  const hh24 = Number(Utilities.formatDate(d, tz, 'H'));
  const mm = Utilities.formatDate(d, tz, 'mm');
  const ss = Utilities.formatDate(d, tz, 'ss');

  const ampm = hh24 < 12 ? '오전' : '오후';
  let hh12 = hh24 % 12;
  if (hh12 === 0) hh12 = 12;

  return `${yyyy}. ${m}. ${dd} ${ampm} ${hh12}:${mm}:${ss}`;
}

function labelToCode_(mapObj, label) {
  for (const code in mapObj) {
    if (mapObj[code] === label) return code;
  }
  return '';
}

/**
 * Normalize meetingDate cell (E column) into "YYYY/MM/DD" (KST).
 * Accepts:
 * - Date object (preferred)
 * - "YYYY/MM/DD"
 * - "YYYY. M. D" (spaces optional)
 */
function normalizeMeetingDateKey_(cell, tz) {
  if (cell instanceof Date) {
    return Utilities.formatDate(cell, tz, 'yyyy/MM/dd');
  }

  const s = str_(cell).trim();
  if (!s) return '';

  // Already API key format
  if (isValidDateKey_(s)) return s;

  // Dot format: "2026. 1. 3" or "2026.1.3"
  const m = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})$/);
  if (m) {
    const y = m[1];
    const mo = String(Number(m[2])).padStart(2, '0');
    const d = String(Number(m[3])).padStart(2, '0');
    return `${y}/${mo}/${d}`;
  }

  // Unknown format
  return '';
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getStatusForDate_(dateKey, tz) {
  const sheet = getTargetSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { date: dateKey, count: 0, items: [] };

  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

  const items = [];
  for (const row of values) {
    // A: timestamp
    const tsCell = row[0];
    const tsDate = (tsCell instanceof Date) ? tsCell : null;

    // B,C,D: strings
    const nickname = str_(row[1]).trim();
    const teamLabel = str_(row[2]).trim();
    const meetingTypeLabel = str_(row[3]).trim();

    // E: meetingDate (Date or string)
    const eCell = row[4];

    // Convert E -> normalized YYYY/MM/DD in KST, if possible
    const rowDateKey = normalizeMeetingDateKey_(eCell, tz);
    if (!rowDateKey) continue;

    // Filter by requested dateKey
    if (rowDateKey !== dateKey) continue;

    // Convert labels back to enum codes for API output
    const teamCode = labelToCode_(TEAM_LABEL, teamLabel) || null;
    const typeCode = labelToCode_(MEETING_TYPE_LABEL, meetingTypeLabel) || null;

    items.push({
      nickname,
      team: teamCode,
      teamLabel,
      meetingType: typeCode,
      meetingTypeLabel,
      meetingDate: dateKey, // output normalized
      timeText: tsDate ? formatKstKoreanAmPm_(tsDate, tz) : str_(tsCell).trim(),
      ts: tsDate ? tsDate.getTime() : null,
    });
  }

  // Recent first (if ts missing, treat as older)
  items.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  const out = items.map(({ ts, ...rest }) => rest);

  return { date: dateKey, count: out.length, items: out };
}
