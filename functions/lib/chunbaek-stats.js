/**
 * 춘백 시즌3 출석 집계 — PRD §9.7
 */
const MS_PER_DAY = 86400000;

const PHOTO_MAX_PER_SLOT = 5;

function canonicalChunbaekPhotoUrl(url) {
  const text = typeof url === "string" ? url.trim() : "";
  if (!text) return "";
  return text.replace(/dmc-attendance\.appspot\.com/g, "dmc-attendance.firebasestorage.app");
}

function normalizePhotoUrls(att) {
  if (!att) return [];
  const raw = Array.isArray(att.photoUrls)
    ? att.photoUrls
    : (att.photoUrl ? [att.photoUrl] : []);
  return raw
    .map((u) => canonicalChunbaekPhotoUrl(typeof u === "string" ? u : ""))
    .filter(Boolean)
    .slice(0, PHOTO_MAX_PER_SLOT);
}

const BETA_WEEK = 0;
const BETA_DAY_INDEX_BASE = 901;
const BETA_DAY_COUNT = 7;

function todayKstDate(now = Date.now()) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}

function addDaysIso(isoDate, offset) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + offset * MS_PER_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}

function isBetaSlot(slot) {
  return slot?.week === BETA_WEEK;
}

function isSeasonSlot(slot) {
  return !isBetaSlot(slot);
}

function seasonSlotsOnly(slots) {
  return slots.filter(isSeasonSlot);
}

function displayDayIndex(slot) {
  if (isBetaSlot(slot)) return slot.dayIndex - BETA_DAY_INDEX_BASE + 1;
  return slot.dayIndex;
}

/**
 * 팀 프로필 피드 정렬 — displayDayIndex(베타1·시즌1 충돌)가 아니라 날짜 내림차순.
 * @param {Array<{ date?: string, slotId?: number }>} entries
 */
function sortTeamMemberAttendanceEntries(entries) {
  return [...(Array.isArray(entries) ? entries : [])].sort((a, b) => {
    const da = String((a && a.date) || "");
    const db = String((b && b.date) || "");
    if (db !== da) return db.localeCompare(da);
    return (Number(b && b.slotId) || 0) - (Number(a && a.slotId) || 0);
  });
}

/**
 * @param {{ displayDayIndex?: number, slotId?: number, week?: number }} entry
 * @returns {string}
 */
function formatTeamFeedDayLabel(entry) {
  const n = entry && (entry.displayDayIndex ?? entry.slotId);
  const week = entry && entry.week;
  const slotId = Number(entry && entry.slotId);
  const isBeta =
    week === BETA_WEEK ||
    (Number.isFinite(slotId) &&
      slotId >= BETA_DAY_INDEX_BASE &&
      slotId < BETA_DAY_INDEX_BASE + BETA_DAY_COUNT);
  if (isBeta) return `베타 ${n}일차`;
  return `${n}일차`;
}

/** 베타 기간(본시즌 시작 전)에는 0주차만, 이후에는 본시즌 슬롯만 집계 */
function statsSlotsForToday(slots, today, config) {
  const seasonStart = effectiveSeasonStart(config, slots);
  const seasonEnd = effectiveSeasonEnd(config, slots);
  if (seasonStart && today < seasonStart) {
    return slots.filter(isBetaSlot);
  }
  return seasonSlotsOnly(slots).filter((s) => {
    const date = s.date || "";
    if (date && date < S3_PROGRAM_START_DATE) return false;
    return !seasonEnd || !date || date <= seasonEnd;
  });
}

function betaWeekBoundsFromConfig(config = {}) {
  if (config.betaWeekStartDate && config.betaWeekEndDate) {
    return {
      startDate: config.betaWeekStartDate,
      endDate: config.betaWeekEndDate,
    };
  }
  if (config.startDate) {
    return {
      startDate: addDaysIso(config.startDate, -7),
      endDate: addDaysIso(config.startDate, -1),
    };
  }
  return null;
}

function betaWeekBounds(config, slots) {
  const betaSlots = slots.filter(isBetaSlot);
  if (betaSlots.length) {
    const dates = betaSlots
      .map((s) => normalizeSlotDate(s.date))
      .filter(Boolean)
      .sort();
    if (dates.length) {
      return { startDate: dates[0], endDate: dates[dates.length - 1] };
    }
  }
  return betaWeekBoundsFromConfig(config);
}

function isDateInBetaWeek(config, slots, today) {
  const bounds = betaWeekBounds(config, slots);
  if (!bounds) return false;
  return today >= bounds.startDate && today <= bounds.endDate;
}

function betaDayIndexForDate(config, slots, date) {
  const bounds = betaWeekBounds(config, slots);
  if (!bounds || date < bounds.startDate || date > bounds.endDate) return null;
  const [sy, sm, sd] = bounds.startDate.split("-").map(Number);
  const [dy, dm, dd] = date.split("-").map(Number);
  const offset = Math.round(
    (Date.UTC(dy, dm - 1, dd) - Date.UTC(sy, sm - 1, sd)) / MS_PER_DAY,
  );
  if (offset < 0 || offset >= BETA_DAY_COUNT) return null;
  return BETA_DAY_INDEX_BASE + offset;
}

function weekSundayDeadlineKst(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utcMs = Date.UTC(y, m - 1, d);
  const kst = new Date(utcMs + 9 * 3600000);
  const dow = kst.getUTCDay();
  const daysToSun = (7 - dow) % 7;
  const sun = new Date(kst);
  sun.setUTCDate(sun.getUTCDate() + daysToSun);
  sun.setUTCHours(23, 59, 59, 999);
  return new Date(sun.getTime() - 9 * 3600000);
}

function isMemberEditLocked(slotDate, now = Date.now()) {
  return now > weekSundayDeadlineKst(slotDate).getTime();
}

function slotTrainingTitle(slot) {
  return slot.trainingTitle || slot.trainingLabel || "";
}

function slotTrainingContent(slot) {
  return slot.trainingContent || "";
}

/** Firestore Timestamp·문자열 혼재 시 ISO YYYY-MM-DD 로 통일 */
function normalizeSlotDate(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString().slice(0, 10);
  }
  if (typeof value === "object" && value._seconds != null) {
    return new Date(value._seconds * 1000).toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function getSlotKey(slot) {
  return String(slot.dayIndex ?? slot.id);
}

function getAttendance(attendanceMap, slot) {
  const key = getSlotKey(slot);
  return attendanceMap[key] || attendanceMap[slot.id] || null;
}

async function loadSeasonConfig(db) {
  const snap = await db.collection("chunbaek_season_config").doc("chunbaek-s3").get();
  return snap.exists ? snap.data() : { weeklyTarget: 3, photoRequired: false };
}

async function loadAllSlots(db) {
  const snap = await db.collection("chunbaek_slots").orderBy("dayIndex").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadMemberAttendance(db, memberId) {
  const snap = await db.collection("chunbaek_attendance").where("memberId", "==", memberId).get();
  const map = {};
  snap.forEach((doc) => {
    const data = doc.data();
    map[String(data.slotId)] = data;
  });
  return map;
}

function deriveSeasonDate(config, dayIndex) {
  const start = config?.startDate;
  const di = Number(dayIndex);
  if (!start || !Number.isFinite(di) || di < 1 || di > 100) return null;
  return addDaysIso(start, di - 1);
}

function deriveSeasonWeek(dayIndex) {
  const di = Number(dayIndex);
  if (!Number.isFinite(di) || di < 1) return null;
  return Math.ceil(di / 7);
}

function effectiveSeasonStart(config, slots = []) {
  if (config?.startDate) return config.startDate;
  return seasonBounds(seasonSlotsOnly(slots)).startDate;
}

const S3_PROGRAM_START_DATE = "2026-07-26";
const S3_ATTENDANCE_END_DATE = "2026-10-24";
/** 시즌 마감 주간 미달의 첫 월요일. 이 날짜보다 앞에서 끝나는 주(7/20~7/26, 운영 0주차)는 합계에서 뺀다. */
const S3_SEASON_CLOSE_WEEK_START_DATE = "2026-07-27";

function diffDaysIso(startIso, endIso) {
  const [sy, sm, sd] = String(startIso).split("-").map(Number);
  const [ey, em, ed] = String(endIso).split("-").map(Number);
  if (![sy, sm, sd, ey, em, ed].every(Number.isFinite)) return 0;
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / MS_PER_DAY);
}

/** 공식 시즌 경과 일차. 시작 전 0, 출석 마감일 이후에는 마감일 기준. */
function programDayIndex(today, start = S3_PROGRAM_START_DATE, end = S3_ATTENDANCE_END_DATE) {
  if (!today || !start || today < start) return 0;
  const capped = end && today > end ? end : today;
  return diffDaysIso(start, capped) + 1;
}

function slotsWithDerivedSchedule(slots, config = {}) {
  return (slots || []).map((slot) => {
    const di = Number(slot?.dayIndex ?? slot?.id);
    const beta = isBetaSlot(slot)
      || (Number.isFinite(di)
        && di >= BETA_DAY_INDEX_BASE
        && di < BETA_DAY_INDEX_BASE + BETA_DAY_COUNT);
    const date = deriveSlotDate(
      beta ? { ...slot, week: BETA_WEEK } : slot,
      config,
      slots,
    );
    let week = slot.week;
    if (beta) week = BETA_WEEK;
    else if (Number.isFinite(di) && di >= 1 && di <= 100) {
      const derivedWeek = deriveSeasonWeek(di);
      if (derivedWeek) week = derivedWeek;
    }
    return {
      ...slot,
      date: date || normalizeSlotDate(slot.date) || "",
      week,
    };
  });
}

function isBeforeProgramStart(slot) {
  if (!slot || isBetaSlot(slot)) return false;
  return !!(slot.date && slot.date < S3_PROGRAM_START_DATE);
}

function isAfterAttendanceWindow(slot, seasonEnd) {
  if (!slot || isBetaSlot(slot)) return false;
  return !!(seasonEnd && slot.date && slot.date > seasonEnd);
}

function effectiveSeasonEnd(config, slots = []) {
  let end = config?.endDate || null;
  if (!end) {
    const start = effectiveSeasonStart(config, slots);
    if (start) end = addDaysIso(start, 96);
    else end = seasonBounds(seasonSlotsOnly(slots)).endDate;
  }
  if (end && end > S3_ATTENDANCE_END_DATE) return S3_ATTENDANCE_END_DATE;
  return end;
}

function isAttendanceClosed({ slotDate, today, config, slots } = {}) {
  const end = effectiveSeasonEnd(config, slots);
  if (!end) return false;
  if (today && today > end) return true;
  if (slotDate && slotDate > end) return true;
  return false;
}

function deriveSlotDate(slot, config = {}, slots = []) {
  const di = Number(slot?.dayIndex ?? slot?.id);
  if (isBetaSlot(slot) && Number.isFinite(di) && di >= BETA_DAY_INDEX_BASE) {
    const bounds = betaWeekBounds(config, slots);
    if (bounds) {
      const offset = di - BETA_DAY_INDEX_BASE;
      if (offset >= 0 && offset < BETA_DAY_COUNT) {
        return addDaysIso(bounds.startDate, offset);
      }
    }
  }
  if (Number.isFinite(di) && di >= 1 && di <= 100) {
    const derived = deriveSeasonDate(config, di);
    if (derived) return derived;
  }
  return normalizeSlotDate(slot?.date) || "";
}

function resolveSlotDate(slot, config = {}, slots = [], today = "") {
  const derived = deriveSlotDate(slot, config, slots);
  if (derived) return derived;
  if (today && isDateInBetaWeek(config, slots, today)) return today;
  return "";
}

function findTodaySlot(slots, today, config = {}) {
  const start = effectiveSeasonStart(config, slots);
  if (start && today >= start) {
    const [sy, sm, sd] = start.split("-").map(Number);
    const [ty, tm, td] = today.split("-").map(Number);
    const offset = Math.round(
      (Date.UTC(ty, tm - 1, td) - Date.UTC(sy, sm - 1, sd)) / MS_PER_DAY,
    );
    if (offset >= 0 && offset < 100) {
      const di = offset + 1;
      const hit = slots.find((s) => Number(s.dayIndex ?? s.id) === di);
      if (hit) return hit;
    }
  }
  const betaIdx = betaDayIndexForDate(config, slots, today);
  if (betaIdx != null) {
    return slots.find((s) => Number(s.dayIndex ?? s.id) === betaIdx) || null;
  }
  return slots.find((s) => normalizeSlotDate(s.date) === today) || null;
}

function findWeekForDate(slots, today, config = {}) {
  const slot = findTodaySlot(slots, today, config);
  if (slot && (!isBetaSlot(slot) || isDateInBetaWeek(config, slots, today))) {
    return slot.week;
  }

  // 오늘 슬롯이 없을 때: 시작일부터의 경과. 100일을 넘기면 마지막 시즌 주차.
  // 베타 슬롯(dayIndex 901+)이 뒤에 있으면 date <= today 인 마지막 값이 0주차가 되어
  // 마감 이후 타임라인이 통째로 비었다.
  const start = effectiveSeasonStart(config, slots);
  if (start && today >= start) {
    const [sy, sm, sd] = start.split("-").map(Number);
    const [ty, tm, td] = today.split("-").map(Number);
    const offset = Math.round(
      (Date.UTC(ty, tm - 1, td) - Date.UTC(sy, sm - 1, sd)) / MS_PER_DAY,
    );
    if (offset >= 0 && offset < 100) {
      return Math.ceil((offset + 1) / 7);
    }
    if (offset >= 100) {
      return Math.ceil(100 / 7);
    }
  }

  let week = 1;
  for (const s of slots) {
    if (isBetaSlot(s)) continue;
    const date = normalizeSlotDate(s.date);
    if (date && date <= today && Number(s.week) > week) week = Number(s.week);
  }
  return week;
}

function defaultWeekForAdmin(config, slots, today) {
  if (isDateInBetaWeek(config, slots, today)) return BETA_WEEK;
  const seasonStart = effectiveSeasonStart(config, slots);
  if (seasonStart && today < seasonStart) {
    const bounds = betaWeekBounds(config, slots);
    if (bounds) return BETA_WEEK;
  }
  return findWeekForDate(slots, today, config);
}

function computeWeekScoreHint({ weekScore, weekTarget, weekTargetMet, futureExceptionCount }) {
  if (weekTargetMet || !(weekTarget > 0)) return null;
  const futureExc = Number(futureExceptionCount) || 0;
  const projected = Number(weekScore) + futureExc * 0.5;
  if (projected >= weekTarget && futureExc > 0) {
    return "예외 반영 시 달성 예정";
  }
  const need = Math.ceil(weekTarget - projected - 1e-9);
  if (need > 0) return `출석 ${need}회 더 필요`;
  return null;
}

function isOutsideOfficialAttendance(slot, seasonEnd, programStart) {
  if (!slot || isBetaSlot(slot) || slot.isProgramOff) return false;
  if (programStart && slot.date && slot.date < programStart) return true;
  if (seasonEnd && slot.date && slot.date > seasonEnd) return true;
  return false;
}

function computeWeekStats(slots, attendanceMap, week, today, weeklyTargetConfig, seasonEnd = "", programStart = "") {
  let weekAttendCount = 0;
  let weekExceptionCount = 0;
  let futureExceptionCount = 0;
  let trainingCount = 0;
  let totalWeekTrainingCount = 0;

  for (const slot of slots) {
    if (slot.week !== week) continue;
    if (slot.isProgramOff) continue;
    if (isOutsideOfficialAttendance(slot, seasonEnd, programStart)) continue;
    totalWeekTrainingCount += 1;
    const att = getAttendance(attendanceMap, slot);
    if (slot.date > today) {
      if (att?.exception) futureExceptionCount += 1;
      continue;
    }
    trainingCount += 1;
    if (att?.exception) {
      weekExceptionCount += 1;
      continue;
    }
    if (att?.attended) weekAttendCount += 1;
  }

  const weekScore = weekAttendCount + weekExceptionCount * 0.5;
  // maxScore는 이번 주 전체 훈련 가능 날 수 기준으로 계산 (주 초반 cap 오류 방지)
  const maxScore = totalWeekTrainingCount - weekExceptionCount * 0.5;
  const weekTarget = Math.min(weeklyTargetConfig, maxScore);
  const weekTargetMet = weekTarget > 0 && weekScore >= weekTarget;
  const weekHint = computeWeekScoreHint({
    weekScore,
    weekTarget,
    weekTargetMet,
    futureExceptionCount,
  });
  return {
    weekAttendCount,
    weekExceptionCount,
    futureExceptionCount,
    weekScore,
    weekTarget,
    weekTargetMet,
    weekHint,
    countableSlotsInWeek: trainingCount - weekExceptionCount,
  };
}

/** 7/20~7/26 훈련표 1주차만 주간 집계에서 뺀다. 2주차(7/27~)와 다른 날짜는 그대로다. */
function isSeasonCloseScoredWeek(slots) {
  const dates = (slots || [])
    .map((slot) => String(slot && slot.date || "").slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  if (!dates.length) return true;
  const start = dates[0];
  const end = dates[dates.length - 1];
  return !(start >= "2026-07-20" && end < S3_SEASON_CLOSE_WEEK_START_DATE);
}

function weekDateSpan(slots, weekNum) {
  let startDate = "";
  let endDate = "";
  for (const slot of slots) {
    if (slot.week !== weekNum || slot.isProgramOff || !slot.date) continue;
    if (!startDate || slot.date < startDate) startDate = slot.date;
    if (!endDate || slot.date > endDate) endDate = slot.date;
  }
  return { startDate, endDate };
}

function computeMemberStats({
  slots,
  attendanceMap,
  config,
  today,
  now = Date.now(),
  omitWeeksEndingBefore,
} = {}) {
  const todayDate = today || todayKstDate(now);
  const weeklyTargetConfig = config?.weeklyTarget ?? 3;
  const normalized = slotsWithDerivedSchedule(slots, config);
  const seasonEnd = effectiveSeasonEnd(config, normalized);
  const statsSlots = statsSlotsForToday(normalized, todayDate, config);
  const currentWeek = findWeekForDate(normalized, todayDate, config);
  const inBetaWeek = currentWeek === BETA_WEEK && isDateInBetaWeek(config, normalized, todayDate);
  const seasonDayIndex = programDayIndex(todayDate, S3_PROGRAM_START_DATE, seasonEnd);

  let seasonAttendCount = 0;
  let seasonDenom = 0;
  let seasonTrainingDays = 0;
  let seasonExceptionCount = 0;
  for (const slot of statsSlots) {
    if (slot.date > todayDate) continue;
    if (slot.isProgramOff) continue;
    seasonTrainingDays += 1;
    const att = getAttendance(attendanceMap, slot);
    if (att?.exception) {
      seasonExceptionCount += 1;
      continue;
    }
    seasonDenom += 1;
    if (att?.attended) seasonAttendCount += 1;
  }

  const seasonAttendRate = seasonDenom > 0
    ? Math.round((seasonAttendCount / seasonDenom) * 100)
    : 0;

  const weekMap = new Map();
  for (const slot of statsSlots) {
    if (isBetaSlot(slot)) continue;
    if (slot.date > todayDate) continue;
    if (!weekMap.has(slot.week)) weekMap.set(slot.week, []);
    weekMap.get(slot.week).push(slot);
  }
  const activeWeekNums = [...weekMap.keys()].sort((a, b) => a - b);
  const seasonWeekSummaries = activeWeekNums.flatMap((weekNum) => {
    const span = weekDateSpan(normalized, weekNum);
    if (omitWeeksEndingBefore && span.endDate && span.endDate < omitWeeksEndingBefore) return [];
    const ws = computeWeekStatsFull(
      normalized,
      attendanceMap,
      weekNum,
      weeklyTargetConfig,
      todayDate,
      seasonEnd,
      S3_PROGRAM_START_DATE,
    );
    const met = ws.target > 0 && ws.weekScore >= ws.target;
    return [{
      week: weekNum,
      startDate: span.startDate || null,
      endDate: span.endDate || null,
      attendCount: ws.attendCount,
      exceptionCount: ws.exceptionCount,
      weekScore: ws.weekScore,
      target: ws.target,
      met,
    }];
  });
  const seasonWeeksCount = seasonWeekSummaries.length;
  const seasonWeeksMetCount = seasonWeekSummaries.filter((w) => w.met).length;

  const weekStats = computeWeekStats(
    normalized,
    attendanceMap,
    currentWeek,
    todayDate,
    weeklyTargetConfig,
    seasonEnd,
    S3_PROGRAM_START_DATE,
  );

  return {
    seasonDayIndex,
    seasonAttendCount,
    seasonAttendRate,
    seasonTrainingDays,
    seasonExceptionCount,
    seasonDenom,
    seasonWeeksCount,
    seasonWeeksMetCount,
    seasonWeekSummaries,
    weekAttendCount: weekStats.weekAttendCount,
    weekExceptionCount: weekStats.weekExceptionCount,
    futureExceptionCount: weekStats.futureExceptionCount,
    weekScore: weekStats.weekScore,
    weekTarget: weekStats.weekTarget,
    weekTargetMet: weekStats.weekTargetMet,
    weekHint: weekStats.weekHint,
    inBetaWeek,
    currentWeek,
    programStartDate: S3_PROGRAM_START_DATE,
    attendanceEndDate: seasonEnd || null,
    attendanceClosed: !!(seasonEnd && todayDate > seasonEnd),
  };
}

function computeWeekStatsFull(slots, attendanceMap, week, weeklyTargetConfig, today, seasonEnd = "", programStart = "") {
  let weekAttendCount = 0;
  let weekExceptionCount = 0;
  let trainingCount = 0;
  let totalWeekTrainingCount = 0;

  for (const slot of slots) {
    if (slot.week !== week) continue;
    if (slot.isProgramOff) continue;
    if (isOutsideOfficialAttendance(slot, seasonEnd, programStart)) continue;
    totalWeekTrainingCount += 1;
    if (today && slot.date > today) continue;
    trainingCount += 1;
    const att = getAttendance(attendanceMap, slot);
    if (att?.exception) {
      weekExceptionCount += 1;
      continue;
    }
    if (att?.attended) weekAttendCount += 1;
  }

  const weekScore = weekAttendCount + weekExceptionCount * 0.5;
  // maxScore는 이번 주 전체 훈련 가능 날 수 기준으로 계산 (주 초반 cap 오류 방지)
  const maxScore = totalWeekTrainingCount - weekExceptionCount * 0.5;
  const weekTarget = Math.min(weeklyTargetConfig, maxScore);
  return {
    attendCount: weekAttendCount,
    exceptionCount: weekExceptionCount,
    weekScore,
    target: weekTarget,
  };
}

function formatWeekScoreSummary({ weekScore, target }) {
  const scoreStr = Number(weekScore).toFixed(1);
  const targetStr = Number(target) === Math.floor(target)
    ? String(Math.floor(target))
    : Number(target).toFixed(1);
  return `${scoreStr} / ${targetStr}점`;
}

function formatIsoRange(startDate, endDate) {
  const fmt = (iso) => {
    const text = normalizeSlotDate(iso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "—";
    const [, m, d] = text.split("-").map(Number);
    return `${m}/${d}`;
  };
  return `${fmt(startDate)} ~ ${fmt(endDate)}`;
}

function slotStatus(slot, attendanceMap, today, seasonEnd = "") {
  if (slot.isProgramOff) return "off";
  if (isBeforeProgramStart(slot)) return "preseason";
  if (isAfterAttendanceWindow(slot, seasonEnd)) return "closed";
  const att = getAttendance(attendanceMap, slot);
  if (att?.exception) return "exception";
  if (att?.attended) return "attend";
  if (slot.date === today) return "today";
  if (slot.date < today) return "miss";
  return "future";
}

function weekDots(slots, attendanceMap, week, today, seasonEnd = "", programStart = "") {
  const training = slots
    .filter((s) => s.week === week && !s.isProgramOff)
    .filter((s) => !isOutsideOfficialAttendance(s, seasonEnd, programStart))
    .sort((a, b) => a.dayIndex - b.dayIndex);
  return training.map((slot) => {
    const status = slotStatus(slot, attendanceMap, today);
    if (status === "exception") return "◉";
    if (status === "attend") return "●";
    if (status === "today" || status === "miss") return "○";
    return "·";
  }).join("");
}

function weekLabel(week) {
  return week === BETA_WEEK ? "0주차" : `${week}주차`;
}

function buildTimelineWeeks(slots, attendanceMap, config, today) {
  const normalized = slotsWithDerivedSchedule(slots, config);
  const weeklyTargetConfig = config?.weeklyTarget ?? 3;
  const seasonEnd = effectiveSeasonEnd(config, normalized) || "";
  const weekMap = new Map();
  for (const slot of normalized) {
    if (!weekMap.has(slot.week)) weekMap.set(slot.week, []);
    weekMap.get(slot.week).push(slot);
  }

  const seasonStart = effectiveSeasonStart(config, normalized);
  const showBetaInTimeline = !!(seasonStart && today < seasonStart);
  const currentWeek = findWeekForDate(normalized, today, config);

  const weeks = [...weekMap.entries()]
    .filter(([week]) => {
      if (week === BETA_WEEK) return showBetaInTimeline;
      if (showBetaInTimeline) return false;
      return week > 0 && week <= currentWeek;
    })
    .sort((a, b) => b[0] - a[0])
    .map(([week, weekSlots]) => {
      weekSlots.sort((a, b) => a.dayIndex - b.dayIndex);
      const dates = weekSlots.map((s) => s.date);
      const countable = weekSlots.filter((s) => !s.isProgramOff
        && !isOutsideOfficialAttendance(s, seasonEnd, S3_PROGRAM_START_DATE));
      const { attendCount, exceptionCount, weekScore, target } = computeWeekStatsFull(
        normalized,
        attendanceMap,
        week,
        weeklyTargetConfig,
        today,
        seasonEnd,
        S3_PROGRAM_START_DATE,
      );
      return {
        week,
        weekLabel: weekLabel(week),
        range: formatIsoRange(dates[0], dates[dates.length - 1]),
        attendSummary: countable.length
          ? formatWeekScoreSummary({ attendCount, exceptionCount, weekScore, target })
          : "집계 제외",
        attendCount,
        exceptionCount,
        weekScore,
        target,
        dots: weekDots(normalized, attendanceMap, week, today, seasonEnd, S3_PROGRAM_START_DATE),
        collapsed: week < currentWeek,
        slots: weekSlots.map((slot) => {
          const att = getAttendance(attendanceMap, slot);
          const status = slotStatus(slot, attendanceMap, today, seasonEnd);
          const editLocked = isMemberEditLocked(slot.date);
          const exception = !!att?.exception;
          const canEdit = !slot.isProgramOff
            && !exception
            && !editLocked
            && status !== "preseason"
            && status !== "closed"
            && slot.date <= today;
          return {
            slotId: slot.dayIndex ?? Number(slot.id),
            dayIndex: slot.dayIndex,
            displayDayIndex: displayDayIndex(slot),
            date: slot.date,
            title: slot.isProgramOff ? "(휴무)" : (slotTrainingTitle(slot) || "—"),
            content: slot.isProgramOff ? "" : slotTrainingContent(slot),
            status,
            attended: !!att?.attended,
            exception,
            editLocked,
            canEdit,
            photo: normalizePhotoUrls(att).length > 0,
            photoUrls: normalizePhotoUrls(att),
            photoUrl: normalizePhotoUrls(att)[0] || "",
            note: att?.note || "",
            isBeta: isBetaSlot(slot),
          };
        }),
      };
    });

  return weeks;
}

function formatGoalTime(seconds) {
  if (!seconds && seconds !== 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function rateBar(rate) {
  const filled = Math.min(3, Math.round((rate / 100) * 3));
  return `${"█".repeat(filled)}${"░".repeat(3 - filled)}`;
}

/** 팀 탭 이번 주 진행 — PRD §7.3 (최대 3칸, 출석 횟수 기준) */
function weekBar(scoreOrCount, target = 3) {
  const slots = Math.max(1, Math.ceil(Number(target) || 3));
  const filled = Math.min(slots, Math.max(0, Math.floor(Number(scoreOrCount) || 0)));
  return `${"█".repeat(filled)}${"░".repeat(slots - filled)}`;
}

function seasonBounds(slots) {
  const season = seasonSlotsOnly(slots);
  if (!season.length) return { startDate: null, endDate: null };
  const sorted = [...season].sort((a, b) => a.dayIndex - b.dayIndex);
  return {
    startDate: sorted[0].date,
    endDate: sorted[sorted.length - 1].date,
  };
}

function seasonMeta(bounds) {
  return {
    startDate: bounds.startDate,
    endDate: bounds.endDate,
  };
}

function slotPayloadFromSlot(slot, attendanceMap, config = {}, slots = [], today = "") {
  const att = getAttendance(attendanceMap, slot);
  const dayIndex = slot.dayIndex ?? Number(slot.id);
  const date = resolveSlotDate(slot, config, slots, today);
  return {
    slotId: dayIndex,
    dayIndex,
    displayDayIndex: displayDayIndex({ ...slot, dayIndex }),
    date,
    week: slot.week,
    trainingTitle: slotTrainingTitle(slot),
    trainingContent: slotTrainingContent(slot),
    isProgramOff: !!slot.isProgramOff,
    attended: !!(att?.attended),
    exception: !!(att?.exception),
    isBeta: isBetaSlot(slot),
  };
}

function todaySlotPayload(slots, attendanceMap, today, config = {}) {
  const startDate = effectiveSeasonStart(config, slots);
  const endDate = effectiveSeasonEnd(config, slots);
  const betaBounds = betaWeekBounds(config, slots);
  const meta = {
    startDate,
    endDate,
    betaWeekStartDate: betaBounds?.startDate || null,
    betaWeekEndDate: betaBounds?.endDate || null,
    photoRequired: !!config.photoRequired,
  };

  const todaySlot = findTodaySlot(slots, today, config);
  if (todaySlot && isBetaSlot(todaySlot)) {
    return {
      slot: slotPayloadFromSlot(todaySlot, attendanceMap, config, slots, today),
      beforeSeason: false,
      afterSeason: false,
      betaWeek: true,
      ...meta,
    };
  }

  if (!startDate) {
    return { slot: null, beforeSeason: false, afterSeason: false, noSlots: true, betaWeek: false, ...meta };
  }
  if (today < startDate) {
    if (isDateInBetaWeek(config, slots, today)) {
      return {
        slot: null,
        beforeSeason: false,
        afterSeason: false,
        betaWeek: true,
        betaNoSlotToday: true,
        ...meta,
      };
    }
    return { slot: null, beforeSeason: true, afterSeason: false, betaWeek: false, ...meta };
  }
  if (today > endDate) {
    return { slot: null, beforeSeason: false, afterSeason: true, betaWeek: false, ...meta };
  }

  if (!todaySlot) {
    return { slot: null, beforeSeason: false, afterSeason: false, betaWeek: false, ...meta };
  }

  return {
    slot: slotPayloadFromSlot(todaySlot, attendanceMap, config, slots, today),
    beforeSeason: false,
    afterSeason: false,
    betaWeek: false,
    ...meta,
  };
}

/** 팀 탭 목록 정렬 — PRD §7.3: 순위·경쟁 없음. 나 찾기 편의만 우선 */
function sortTeamMembers(members, viewerMemberId = null) {
  return [...members].sort((a, b) => {
    if (viewerMemberId) {
      if (a.memberId === viewerMemberId) return -1;
      if (b.memberId === viewerMemberId) return 1;
    }
    return (a.nickname || "").localeCompare(b.nickname || "", "ko");
  });
}

module.exports = {
  PHOTO_MAX_PER_SLOT,
  normalizePhotoUrls,
  BETA_WEEK,
  BETA_DAY_INDEX_BASE,
  BETA_DAY_COUNT,
  todayKstDate,
  addDaysIso,
  isBetaSlot,
  isSeasonSlot,
  seasonSlotsOnly,
  seasonBounds,
  displayDayIndex,
  sortTeamMemberAttendanceEntries,
  formatTeamFeedDayLabel,
  statsSlotsForToday,
  betaWeekBounds,
  betaWeekBoundsFromConfig,
  isDateInBetaWeek,
  betaDayIndexForDate,
  defaultWeekForAdmin,
  weekSundayDeadlineKst,
  isMemberEditLocked,
  loadSeasonConfig,
  loadAllSlots,
  loadMemberAttendance,
  findTodaySlot,
  computeMemberStats,
  computeWeekStats,
  computeWeekStatsFull,
  computeWeekScoreHint,
  formatWeekScoreSummary,
  buildTimelineWeeks,
  formatGoalTime,
  rateBar,
  weekBar,
  weekDots,
  sortTeamMembers,
  todaySlotPayload,
  getSlotKey,
  getAttendance,
  deriveSeasonDate,
  deriveSeasonWeek,
  S3_PROGRAM_START_DATE,
  S3_ATTENDANCE_END_DATE,
  S3_SEASON_CLOSE_WEEK_START_DATE,
  isSeasonCloseScoredWeek,
  programDayIndex,
  slotsWithDerivedSchedule,
  canonicalChunbaekPhotoUrl,
  effectiveSeasonStart,
  effectiveSeasonEnd,
  isAttendanceClosed,
  deriveSlotDate,
  resolveSlotDate,
  slotStatus,
  slotTrainingTitle,
  slotTrainingContent,
  findWeekForDate,
  formatIsoRange,
  weekLabel,
};
