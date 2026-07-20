"use strict";

const { addDaysIso, getAttendance, getSlotKey, resolveSlotDate } = require("./chunbaek-stats");

const EXCEPTION_REASON_MAX = 200;
const EXCEPTION_MAX_SPAN_DAYS = 14;
const EXCEPTION_LOOKBACK_DAYS = 7; // today 포함 7일 → today-6

function parseIsoDate(s) {
  const v = String(s || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function calendarDayDiff(startDate, endDate) {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000);
}

function validateExceptionRequestInput(opts) {
  const reason = String(opts.reason || "").trim();
  const startDate = parseIsoDate(opts.startDate);
  const endDate = parseIsoDate(opts.endDate);
  const todayKst = parseIsoDate(opts.todayKst);
  const seasonEndDate = parseIsoDate(opts.seasonEndDate);
  if (!reason || reason.length > EXCEPTION_REASON_MAX) {
    return { ok: false, error: "reason required (1-200 chars)" };
  }
  if (!startDate || !endDate || startDate > endDate) {
    return { ok: false, error: "invalid date range" };
  }
  if (!todayKst) return { ok: false, error: "invalid today" };
  const minStart = addDaysIso(todayKst, -(EXCEPTION_LOOKBACK_DAYS - 1));
  if (startDate < minStart) {
    return { ok: false, error: "startDate outside 7-day lookback" };
  }
  if (calendarDayDiff(startDate, endDate) > EXCEPTION_MAX_SPAN_DAYS) {
    return { ok: false, error: "max span is 14 days" };
  }
  if (seasonEndDate && endDate > seasonEndDate) {
    return { ok: false, error: "endDate after season end" };
  }
  return { ok: true, startDate, endDate, reason };
}

function slotDateResolved(slot, config, slots) {
  return resolveSlotDate(slot, config, slots, "");
}

function trainingSlotsInDateRange({ slots, config, startDate, endDate }) {
  return (slots || [])
    .filter((slot) => !slot.isProgramOff)
    .filter((slot) => {
      const d = slotDateResolved(slot, config, slots);
      return d && d >= startDate && d <= endDate;
    })
    .sort((a, b) => {
      const da = slotDateResolved(a, config, slots);
      const db = slotDateResolved(b, config, slots);
      return da.localeCompare(db) || (a.dayIndex ?? 0) - (b.dayIndex ?? 0);
    });
}

function previewExceptionApplication({ slots, attendanceMap, config, startDate, endDate }) {
  const applicableSlotIds = [];
  const skippedSlotIds = [];
  for (const slot of trainingSlotsInDateRange({ slots, config, startDate, endDate })) {
    const att = getAttendance(attendanceMap, slot);
    if (att?.attended) {
      skippedSlotIds.push(slot.dayIndex ?? Number(slot.id));
      continue;
    }
    if (att?.exception) continue;
    applicableSlotIds.push(slot.dayIndex ?? Number(slot.id));
  }
  return { applicableSlotIds, skippedSlotIds };
}

function slotsEligibleForSelfClear({ slots, attendanceMap, config, todayKst }) {
  return (slots || [])
    .filter((slot) => !slot.isProgramOff)
    .filter((slot) => {
      const d = slotDateResolved(slot, config, slots);
      return d && d >= todayKst;
    })
    .filter((slot) => {
      const att = getAttendance(attendanceMap, slot);
      return !!att?.exception;
    });
}

function formatRequestExceptionNote(reason) {
  return `[상신] ${String(reason).trim()}`.slice(0, 200);
}

function buildSlotExceptionPatch({ memberId, slot, exception, exceptionNote, updatedBy }) {
  const slotId = slot.dayIndex ?? Number(slot.id);
  const patch = {
    memberId,
    slotId,
    exception: !!exception,
    exceptionNote: exception ? String(exceptionNote || "").slice(0, 200) : "",
    updatedBy,
  };
  if (exception) patch.attended = false;
  return patch;
}

module.exports = {
  EXCEPTION_REASON_MAX,
  EXCEPTION_MAX_SPAN_DAYS,
  EXCEPTION_LOOKBACK_DAYS,
  validateExceptionRequestInput,
  trainingSlotsInDateRange,
  previewExceptionApplication,
  slotsEligibleForSelfClear,
  formatRequestExceptionNote,
  buildSlotExceptionPatch,
  getSlotKey,
};
