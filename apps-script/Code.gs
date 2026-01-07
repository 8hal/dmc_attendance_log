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
const STATUS_CACHE_TTL_SECONDS = 60;
const STATUS_CACHE_PREFIX = 'status:';
const HISTORY_CACHE_TTL_SECONDS = 60;
const HISTORY_CACHE_PREFIX = 'history:';

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
  const startMs = Date.now();
  let meetingDateKey = '';
  let teamCode = '';
  let typeCode = '';
  let statusCount = null;
  let ok = false;
  let errorMsg = '';
  const debugFlag = str_(e?.parameter?.debug || e?.parameter?.DEBUG || '').trim() === '1';
  const metrics = { startMs };
  try {
    const payload = parsePayload_(e);

    const nicknameRaw = str_(payload.nickname).trim();
    teamCode = str_(payload.team).trim().toUpperCase();
    typeCode = str_(payload.meetingType).trim().toUpperCase();
    meetingDateKey = str_(payload.meetingDate).trim(); // must be YYYY/MM/DD

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
    metrics.afterValidationMs = Date.now();

    const meetingDateObj = dateKeyToDate_(meetingDateKey);
    if (!meetingDateObj) {
      return json_({ ok: false, error: `invalid meetingDate (YYYY/MM/DD): ${meetingDateKey}` });
    }

    // Allow safe test writes while keeping uniqueness
    const nicknameStored = (nicknameRaw.toUpperCase() === 'TEST')
      ? makeTestNickname_(now, tz)
      : nicknameRaw;

    const sheet = getTargetSheet_();
    metrics.sheetMs = Date.now();
    // Store meetingDate as Date object to match Google Forms responses.
    sheet.appendRow([now, nicknameStored, teamLabel, meetingTypeLabel, meetingDateObj]);
    metrics.afterAppendMs = Date.now();

    const status = getStatusForDate_(meetingDateKey, tz, debugFlag);
    setCachedStatus_(meetingDateKey, status);
    statusCount = status?.count ?? null;

    ok = true;
    metrics.totalMs = Date.now() - startMs;
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
      ...(debugFlag ? { debug: buildMetricsDebug_(metrics) } : {}),
    });
  } catch (err) {
    errorMsg = String(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: String(err && err.stack ? err.stack : err) });
  } finally {
    const durationMs = Date.now() - startMs;
    const logPayload = {
      durationMs,
      ok,
      meetingDateKey,
      teamCode,
      meetingType: typeCode,
      statusCount,
      nicknameLen: str_(e?.parameter?.nickname || e?.postData?.contents || '').length,
      errorMsg,
    };
    Logger.log('[doPost latency] %s', JSON.stringify(logPayload));
  }
}

function doGet(e) {
  const startMs = Date.now();
  let dateKey = '';
  let ok = false;
  let statusCount = null;
  let errorMsg = '';
  const debugFlag = str_(e?.parameter?.debug || e?.parameter?.DEBUG || '').trim() === '1';
  const metrics = { startMs };
  try {
    const action = str_(e?.parameter?.action || 'status').trim();
    if (action !== 'status' && action !== 'history') {
      return json_({ ok: false, error: `unknown action: ${action}` });
    }

    const tz = getTz_();
    const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy/MM/dd');

    if (action === 'status') {
      const dateParam = str_(e?.parameter?.date).trim();
      dateKey = dateParam ? dateParam : todayKey;

      if (!isValidDateKey_(dateKey)) {
        return json_({ ok: false, error: `invalid date (YYYY/MM/DD): ${dateKey}` });
      }

      const cacheStart = Date.now();
      const cached = getCachedStatus_(dateKey);
      metrics.cacheMs = Date.now() - cacheStart;
      if (cached) {
        const totalMs = Date.now() - startMs;
        return json_({
          ok: true,
          ...cached,
          ...(debugFlag ? { debug: buildMetricsDebug_({ startMs, totalMs, cacheMs: metrics.cacheMs, cached: true }) } : {}),
        });
      }

      const status = getStatusForDate_(dateKey, tz, debugFlag);
      setCachedStatus_(dateKey, status);
      statusCount = status?.count ?? null;
      ok = true;
      metrics.totalMs = Date.now() - startMs;
      return json_({ ok: true, ...status, ...(debugFlag ? { debug: buildMetricsDebug_(metrics) } : {}) });
    }

    // action === 'history'
    const nickname = str_(e?.parameter?.nickname).trim();
    const monthParam = str_(e?.parameter?.month).trim(); // YYYY-MM
    const monthKey = monthParam || Utilities.formatDate(new Date(), tz, 'yyyy-MM');
    if (!nickname) return json_({ ok: false, error: 'nickname is required' });
    if (!isValidMonthKey_(monthKey)) {
      return json_({ ok: false, error: `invalid month (YYYY-MM): ${monthKey}` });
    }

    const histCacheStart = Date.now();
    const cachedHistory = getCachedHistory_(nickname, monthKey);
    metrics.cacheMs = Date.now() - histCacheStart;
    if (cachedHistory) {
      const totalMs = Date.now() - startMs;
      return json_({
        ok: true,
        ...cachedHistory,
        ...(debugFlag ? { debug: buildMetricsDebug_({ startMs, totalMs, cacheMs: metrics.cacheMs, cached: true }) } : {}),
      });
    }

    const history = getHistoryForNicknameMonth_(nickname, monthKey, tz, debugFlag);
    setCachedHistory_(nickname, monthKey, history);
    ok = true;
    metrics.totalMs = Date.now() - startMs;
    return json_({ ok: true, ...history, ...(debugFlag ? { debug: buildMetricsDebug_(metrics) } : {}) });
  } catch (err) {
    errorMsg = String(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: String(err && err.stack ? err.stack : err) });
  } finally {
    const durationMs = Date.now() - startMs;
    const logPayload = {
      durationMs,
      ok,
      dateKey,
      statusCount,
      cachedHit: Boolean(getCachedStatus_(dateKey)),
      errorMsg,
    };
    Logger.log('[doGet latency] %s', JSON.stringify(logPayload));
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

function getHistoryCacheKey_(nickname, monthKey) {
  return `${HISTORY_CACHE_PREFIX}${nickname}::${monthKey}`;
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

function getCachedHistory_(nickname, monthKey) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(getHistoryCacheKey_(nickname, monthKey));
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch (e) {
    return null;
  }
}

function setCachedHistory_(nickname, monthKey, history) {
  const cache = CacheService.getScriptCache();
  cache.put(getHistoryCacheKey_(nickname, monthKey), JSON.stringify(history), HISTORY_CACHE_TTL_SECONDS);
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

function isValidMonthKey_(s) {
  return /^\d{4}-\d{2}$/.test(s);
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

function dateKeyToDate_(dateKey) {
  if (!isValidDateKey_(dateKey)) return null;
  const parts = dateKey.split('/');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
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

function getStatusForDate_(dateKey, tz, debugRequested) {
  const t0 = Date.now();
  const sheet = getTargetSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return attachDebugIfNeeded_({ date: dateKey, count: 0, items: [], __debugRequested: debugRequested }, t0, lastRow);

  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const tRange = Date.now();

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
  const tLoop = Date.now();
  items.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  const out = items.map(({ ts, ...rest }) => rest);
  const tSort = Date.now();

  return attachDebugIfNeeded_({ date: dateKey, count: out.length, items: out, __debugRequested: debugRequested }, t0, lastRow, {
    rangeMs: tRange - t0,
    loopMs: tLoop - tRange,
    sortMs: tSort - tLoop,
  });
}

function getHistoryForNicknameMonth_(nickname, monthKey, tz, debugRequested) {
  const t0 = Date.now();
  const sheet = getTargetSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    const possible = countPossibleMeetingsForMonth_(monthKey);
    return attachDebugIfNeeded_({ nickname, month: monthKey, count: 0, items: [], summary: {}, totalPossible: possible, attendanceRate: 0, __debugRequested: debugRequested }, t0, lastRow);
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const tRange = Date.now();

  const monthParts = monthKey.split('-');
  const targetYear = Number(monthParts[0]);
  const targetMonth = Number(monthParts[1]); // 1-12
  const nickKey = nickname.trim().toLowerCase();
  const items = [];
  const summaryByType = {};

  for (const row of values) {
    // A: timestamp
    const tsCell = row[0];
    const tsDate = (tsCell instanceof Date) ? tsCell : null;

    // B: nickname
    const rowNick = str_(row[1]).trim();
    if (!rowNick) continue;
    if (rowNick.toLowerCase() !== nickKey) continue;

    const teamLabel = str_(row[2]).trim();
    const meetingTypeLabel = str_(row[3]).trim();
    const eCell = row[4];
    const rowDateKey = normalizeMeetingDateKey_(eCell, tz);
    if (!rowDateKey) continue;
    const rowDateObj = dateKeyToDate_(rowDateKey);
    if (!rowDateObj) continue;
    const rowYear = rowDateObj.getFullYear();
    const rowMonth = rowDateObj.getMonth() + 1;
    if (rowYear !== targetYear || rowMonth !== targetMonth) continue;

    const teamCode = labelToCode_(TEAM_LABEL, teamLabel) || null;
    const typeCode = labelToCode_(MEETING_TYPE_LABEL, meetingTypeLabel) || null;

    items.push({
      nickname: rowNick,
      team: teamCode,
      teamLabel,
      meetingType: typeCode,
      meetingTypeLabel,
      meetingDate: rowDateKey,
      timeText: tsDate ? formatKstKoreanAmPm_(tsDate, tz) : str_(tsCell).trim(),
      ts: tsDate ? tsDate.getTime() : null,
    });

    const typeKey = meetingTypeLabel || typeCode || '미지정';
    summaryByType[typeKey] = (summaryByType[typeKey] || 0) + 1;
  }

  const tLoop = Date.now();
  items.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  const out = items.map(({ ts, ...rest }) => rest);
  const tSort = Date.now();
  const possible = countPossibleMeetingsForMonth_(monthKey);
  const rate = possible > 0 ? Math.min(100, Math.round((out.length / possible) * 100)) : 0;

  return attachDebugIfNeeded_({
    nickname,
    month: monthKey,
    count: out.length,
    items: out,
    summaryByType,
    totalPossible: possible,
    attendanceRate: rate,
    __debugRequested: debugRequested,
  }, t0, lastRow, {
    rangeMs: tRange - t0,
    loopMs: tLoop - tRange,
    sortMs: tSort - tLoop,
  });
}

function countPossibleMeetingsForMonth_(monthKey) {
  if (!isValidMonthKey_(monthKey)) return 0;
  const [yStr, mStr] = monthKey.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 0;
  const daysInMonth = new Date(y, m, 0).getDate();
  let cnt = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const weekday = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
    if ([2, 4, 6].includes(weekday)) cnt++;
  }
  return cnt;
}

function attachDebugIfNeeded_(statusObj, startMs, lastRow, extra) {
  // Only attached if caller sets a debug flag; otherwise statusObj is returned as-is.
  if (!statusObj || typeof statusObj !== 'object') return statusObj;
  const debugRequested = Boolean(statusObj.__debugRequested);
  if (!debugRequested) {
    const { __debugRequested, ...rest } = statusObj;
    return rest;
  }
  const now = Date.now();
  return {
    ...statusObj,
    debug: buildMetricsDebug_({
      startMs,
      totalMs: now - startMs,
      rowsScanned: lastRow >= 2 ? lastRow - 1 : 0,
      ...(extra || {}),
    }),
    __debugRequested: undefined,
  };
}

function buildMetricsDebug_(metrics) {
  const out = {};
  const m = metrics || {};
  if (m.totalMs !== undefined) out.totalMs = m.totalMs;
  if (m.cacheMs !== undefined) out.cacheMs = m.cacheMs;
  if (m.cached !== undefined) out.cached = m.cached;
  if (m.rangeMs !== undefined) out.rangeMs = m.rangeMs;
  if (m.loopMs !== undefined) out.loopMs = m.loopMs;
  if (m.sortMs !== undefined) out.sortMs = m.sortMs;
  if (m.rowsScanned !== undefined) out.rowsScanned = m.rowsScanned;
  if (m.afterValidationMs !== undefined && m.startMs !== undefined) out.validateMs = m.afterValidationMs - m.startMs;
  if (m.sheetMs !== undefined && m.afterValidationMs !== undefined) out.sheetLookupMs = m.sheetMs - m.afterValidationMs;
  if (m.afterAppendMs !== undefined && m.sheetMs !== undefined) out.appendMs = m.afterAppendMs - m.sheetMs;
  return out;
}
