/**
 * 춘백 시즌3 출석 집계 — PRD §9.7
 */
const MS_PER_DAY = 86400000;

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

/** 베타 기간(본시즌 시작 전)에는 0주차만, 이후에는 본시즌 슬롯만 집계 */
function statsSlotsForToday(slots, today) {
  const seasonStart = seasonBounds(seasonSlotsOnly(slots)).startDate;
  if (seasonStart && today < seasonStart) {
    return slots.filter(isBetaSlot);
  }
  return seasonSlotsOnly(slots);
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
    const dates = betaSlots.map((s) => s.date).sort();
    return { startDate: dates[0], endDate: dates[dates.length - 1] };
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

function findTodaySlot(slots, today) {
  return slots.find((s) => s.date === today) || null;
}

function findWeekForDate(slots, today) {
  const slot = findTodaySlot(slots, today);
  if (slot) return slot.week;
  let week = 1;
  for (const s of slots) {
    if (s.date <= today) week = s.week;
  }
  return week;
}

function defaultWeekForAdmin(config, slots, today) {
  if (isDateInBetaWeek(config, slots, today)) return BETA_WEEK;
  const seasonStart = seasonBounds(seasonSlotsOnly(slots)).startDate;
  if (seasonStart && today < seasonStart) {
    const bounds = betaWeekBounds(config, slots);
    if (bounds) return BETA_WEEK;
  }
  return findWeekForDate(slots, today);
}

function computeWeekStats(slots, attendanceMap, week, today, weeklyTargetConfig) {
  let weekAttendCount = 0;
  let countableSlotsInWeek = 0;

  for (const slot of slots) {
    if (slot.week !== week) continue;
    if (slot.isProgramOff) continue;
    const att = getAttendance(attendanceMap, slot);
    if (att?.exception) continue;
    countableSlotsInWeek += 1;
    if (slot.date <= today && att?.attended) weekAttendCount += 1;
  }

  const weekTarget = Math.min(weeklyTargetConfig, countableSlotsInWeek);
  const weekTargetMet = weekTarget > 0 && weekAttendCount >= weekTarget;
  return { weekAttendCount, weekTarget, weekTargetMet, countableSlotsInWeek };
}

function computeMemberStats({ slots, attendanceMap, config, today, now = Date.now() }) {
  const todayDate = today || todayKstDate(now);
  const weeklyTargetConfig = config?.weeklyTarget ?? 3;
  const statsSlots = statsSlotsForToday(slots, todayDate);
  const currentWeek = findWeekForDate(slots, todayDate);
  const inBetaWeek = currentWeek === BETA_WEEK && isDateInBetaWeek(config, slots, todayDate);

  let seasonDayIndex = 0;
  for (const slot of statsSlots) {
    if (slot.date <= todayDate) {
      const di = displayDayIndex(slot);
      if (di > seasonDayIndex) seasonDayIndex = di;
    }
  }

  let seasonAttendCount = 0;
  let seasonDenom = 0;
  for (const slot of statsSlots) {
    if (slot.date > todayDate) continue;
    if (slot.isProgramOff) continue;
    const att = getAttendance(attendanceMap, slot);
    if (att?.exception) continue;
    seasonDenom += 1;
    if (att?.attended) seasonAttendCount += 1;
  }

  const seasonAttendRate = seasonDenom > 0
    ? Math.round((seasonAttendCount / seasonDenom) * 100)
    : 0;

  const weekStats = computeWeekStats(
    slots,
    attendanceMap,
    currentWeek,
    todayDate,
    weeklyTargetConfig,
  );

  return {
    seasonDayIndex,
    seasonAttendCount,
    seasonAttendRate,
    weekAttendCount: weekStats.weekAttendCount,
    weekTarget: weekStats.weekTarget,
    weekTargetMet: weekStats.weekTargetMet,
    inBetaWeek,
    currentWeek,
  };
}

function computeWeekStatsFull(slots, attendanceMap, week, weeklyTargetConfig) {
  let attendCount = 0;
  let countable = 0;
  for (const slot of slots) {
    if (slot.week !== week) continue;
    if (slot.isProgramOff) continue;
    const att = getAttendance(attendanceMap, slot);
    if (att?.exception) continue;
    countable += 1;
    if (att?.attended) attendCount += 1;
  }
  const target = Math.min(weeklyTargetConfig, countable);
  return { attendCount, target };
}

function formatIsoRange(startDate, endDate) {
  const fmt = (iso) => {
    const [, m, d] = iso.split("-").map(Number);
    return `${m}/${d}`;
  };
  return `${fmt(startDate)} ~ ${fmt(endDate)}`;
}

function slotStatus(slot, attendanceMap, today) {
  if (slot.isProgramOff) return "off";
  const att = getAttendance(attendanceMap, slot);
  if (att?.exception) return "exception";
  if (att?.attended) return "attend";
  if (slot.date === today) return "today";
  if (slot.date < today) return "miss";
  return "future";
}

function weekDots(slots, attendanceMap, week, today) {
  const training = slots
    .filter((s) => s.week === week && !s.isProgramOff)
    .sort((a, b) => a.dayIndex - b.dayIndex);
  return training.map((slot) => {
    const status = slotStatus(slot, attendanceMap, today);
    if (status === "attend" || status === "exception") return "●";
    if (status === "today" || status === "miss") return "○";
    return "·";
  }).join("");
}

function weekLabel(week) {
  return week === BETA_WEEK ? "0주차" : `${week}주차`;
}

function buildTimelineWeeks(slots, attendanceMap, config, today) {
  const weeklyTargetConfig = config?.weeklyTarget ?? 3;
  const weekMap = new Map();
  for (const slot of slots) {
    if (!weekMap.has(slot.week)) weekMap.set(slot.week, []);
    weekMap.get(slot.week).push(slot);
  }

  const seasonStart = seasonBounds(seasonSlotsOnly(slots)).startDate;
  const showBetaInTimeline = !!(seasonStart && today < seasonStart);
  const currentWeek = findWeekForDate(slots, today);

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
      const { attendCount, target } = computeWeekStatsFull(
        slots,
        attendanceMap,
        week,
        weeklyTargetConfig,
      );
      return {
        week,
        weekLabel: weekLabel(week),
        range: formatIsoRange(dates[0], dates[dates.length - 1]),
        attendSummary: `${attendCount}/${target}회`,
        dots: weekDots(slots, attendanceMap, week, today),
        collapsed: week < currentWeek,
        slots: weekSlots.map((slot) => {
          const att = getAttendance(attendanceMap, slot);
          const status = slotStatus(slot, attendanceMap, today);
          return {
            slotId: slot.dayIndex ?? Number(slot.id),
            dayIndex: slot.dayIndex,
            displayDayIndex: displayDayIndex(slot),
            date: slot.date,
            title: slot.isProgramOff ? "(휴무)" : (slotTrainingTitle(slot) || "—"),
            content: slot.isProgramOff ? "" : slotTrainingContent(slot),
            status,
            photo: !!(att?.photoUrl),
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

function slotPayloadFromSlot(slot, attendanceMap) {
  const att = getAttendance(attendanceMap, slot);
  return {
    slotId: slot.dayIndex ?? Number(slot.id),
    dayIndex: slot.dayIndex,
    displayDayIndex: displayDayIndex(slot),
    date: slot.date,
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
  const seasonOnly = seasonSlotsOnly(slots);
  const bounds = seasonBounds(seasonOnly.length ? seasonOnly : slots);
  const { startDate, endDate } = bounds;
  const betaBounds = betaWeekBounds(config, slots);
  const meta = {
    ...seasonMeta(bounds),
    betaWeekStartDate: betaBounds?.startDate || null,
    betaWeekEndDate: betaBounds?.endDate || null,
  };

  const todaySlot = findTodaySlot(slots, today);
  if (todaySlot && isBetaSlot(todaySlot)) {
    return {
      slot: slotPayloadFromSlot(todaySlot, attendanceMap),
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
    return { slot: null, beforeSeason: true, afterSeason: false, betaWeek: false, ...meta };
  }
  if (today > endDate) {
    return { slot: null, beforeSeason: false, afterSeason: true, betaWeek: false, ...meta };
  }

  if (!todaySlot) {
    return { slot: null, beforeSeason: false, afterSeason: false, betaWeek: false, ...meta };
  }

  return {
    slot: slotPayloadFromSlot(todaySlot, attendanceMap),
    beforeSeason: false,
    afterSeason: false,
    betaWeek: false,
    ...meta,
  };
}

module.exports = {
  BETA_WEEK,
  BETA_DAY_INDEX_BASE,
  BETA_DAY_COUNT,
  todayKstDate,
  addDaysIso,
  isBetaSlot,
  isSeasonSlot,
  seasonSlotsOnly,
  displayDayIndex,
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
  buildTimelineWeeks,
  formatGoalTime,
  rateBar,
  todaySlotPayload,
  getSlotKey,
  getAttendance,
  slotStatus,
  slotTrainingTitle,
  slotTrainingContent,
  findWeekForDate,
  formatIsoRange,
  weekLabel,
};
