/**
 * 춘백 시즌3 출석 집계 — PRD §9.7
 */
const MS_PER_DAY = 86400000;

function todayKstDate(now = Date.now()) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
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

  let seasonDayIndex = 0;
  for (const slot of slots) {
    if (slot.date <= todayDate && slot.dayIndex > seasonDayIndex) {
      seasonDayIndex = slot.dayIndex;
    }
  }

  let seasonAttendCount = 0;
  let seasonDenom = 0;
  for (const slot of slots) {
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

  const currentWeek = findWeekForDate(slots, todayDate);
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

function buildTimelineWeeks(slots, attendanceMap, config, today) {
  const weeklyTargetConfig = config?.weeklyTarget ?? 3;
  const weekMap = new Map();
  for (const slot of slots) {
    if (!weekMap.has(slot.week)) weekMap.set(slot.week, []);
    weekMap.get(slot.week).push(slot);
  }

  const currentWeek = findWeekForDate(slots, today);
  const weeks = [...weekMap.entries()]
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
            date: slot.date,
            title: slot.isProgramOff ? "(휴무)" : (slotTrainingTitle(slot) || "—"),
            content: slot.isProgramOff ? "" : slotTrainingContent(slot),
            status,
            photo: !!(att?.photoUrl),
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
  if (!slots.length) return { startDate: null, endDate: null };
  const sorted = [...slots].sort((a, b) => a.dayIndex - b.dayIndex);
  return {
    startDate: sorted[0].date,
    endDate: sorted[sorted.length - 1].date,
  };
}

function todaySlotPayload(slots, attendanceMap, today) {
  const { startDate, endDate } = seasonBounds(slots);
  if (!startDate) {
    return { slot: null, beforeSeason: false, afterSeason: false, noSlots: true };
  }
  if (today < startDate) {
    return { slot: null, beforeSeason: true, afterSeason: false };
  }
  if (today > endDate) {
    return { slot: null, beforeSeason: false, afterSeason: true };
  }

  const slot = findTodaySlot(slots, today);
  if (!slot) {
    return { slot: null, beforeSeason: false, afterSeason: false };
  }

  const att = getAttendance(attendanceMap, slot);
  return {
    slot: {
      slotId: slot.dayIndex ?? Number(slot.id),
      dayIndex: slot.dayIndex,
      date: slot.date,
      week: slot.week,
      trainingTitle: slotTrainingTitle(slot),
      trainingContent: slotTrainingContent(slot),
      isProgramOff: !!slot.isProgramOff,
      attended: !!(att?.attended),
      exception: !!(att?.exception),
    },
    beforeSeason: false,
    afterSeason: false,
  };
}

module.exports = {
  todayKstDate,
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
};
