/**
 * 춘백 시즌3 운영진 API — admin-api.md SSOT
 */
const { FieldValue } = require("firebase-admin/firestore");
const {
  loadSeasonConfig,
  loadAllSlots,
  loadMemberAttendance,
  computeWeekStats,
  todayKstDate,
  defaultWeekForAdmin,
  formatIsoRange,
  getSlotKey,
  getAttendance,
  slotStatus,
  slotTrainingTitle,
  slotTrainingContent,
  seasonBounds,
  seasonSlotsOnly,
  betaWeekBounds,
  betaDayIndexForDate,
  BETA_WEEK,
  normalizePhotoUrls,
} = require("./chunbaek-stats");
const {
  previewExceptionApplication,
  formatRequestExceptionNote,
  buildSlotExceptionPatch,
  trainingSlotsInDateRange,
} = require("./chunbaek-exception-requests");

const MS_PER_DAY = 86400000;
const TITLE_MAX = 80;
const CONTENT_MAX = 500;
const EXCEPTION_NOTE_MAX = 200;
const NOTE_MAX = 500;
const PHOTO_URL_MAX = 2000;
const ADMIN_EXCEPTION_REQUEST_LIMIT_DEFAULT = 50;
const ADMIN_EXCEPTION_REQUEST_LIMIT_MAX = 50;
const ADMIN_EXCEPTION_REQUEST_STATUSES = new Set(["pending", "approved", "rejected"]);

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._seconds != null) {
    return new Date(value._seconds * 1000).toISOString();
  }
  return null;
}

function requireAdmin(req) {
  const adminPw = req.method === "GET"
    ? req.query.adminPw
    : (req.body || {}).adminPw;
  if (!adminPw) {
    return { ok: false, status: 401, error: "adminPw required" };
  }
  const ownerPw = process.env.DMC_OWNER_PW;
  const expected = process.env.DMC_ADMIN_PW || "dmc2008";
  if (ownerPw && adminPw === ownerPw) return { ok: true, role: "owner" };
  if (adminPw === expected) return { ok: true, role: "operator" };
  return { ok: false, status: 401, error: "invalid password" };
}

function adminGate(req, res) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return null;
  }
  return auth;
}

function parseWeekParam(value, defaultWeek) {
  if (value === undefined || value === null || value === "") {
    return defaultWeek;
  }
  const week = Number(value);
  if (!Number.isFinite(week) || week < 0) return null;
  return Math.floor(week);
}

function parseAdminExceptionRequestLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return ADMIN_EXCEPTION_REQUEST_LIMIT_DEFAULT;
  return Math.min(
    ADMIN_EXCEPTION_REQUEST_LIMIT_MAX,
    Math.max(1, parsed),
  );
}

function parseAdminExceptionRequestStatusFilter(value) {
  if (value === undefined || value === null) {
    return { ok: true, status: "pending" };
  }
  const status = String(value).trim().toLowerCase();
  if (!status) {
    return { ok: true, status: "pending" };
  }
  if (!ADMIN_EXCEPTION_REQUEST_STATUSES.has(status)) {
    return { ok: false, error: "invalid status" };
  }
  return { ok: true, status };
}

function createHttpError(status, error) {
  const err = new Error(error);
  err.status = status;
  err.publicMessage = error;
  return err;
}

function weekDatesFromStart(startDate, weekNum) {
  const [y, m, d] = startDate.split("-").map(Number);
  const startMs = Date.UTC(y, m - 1, d) + (weekNum - 1) * 7 * MS_PER_DAY;
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const dt = new Date(startMs + i * MS_PER_DAY);
    dates.push(dt.toISOString().slice(0, 10));
  }
  return dates;
}

function findSlotById(slots, slotId) {
  const idStr = String(slotId);
  return slots.find((s) => getSlotKey(s) === idStr || String(s.id) === idStr) || null;
}

async function loadAllParticipants(db) {
  const snap = await db.collection("members").get();
  const list = [];
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.hidden) return;
    const s3 = data.chunbaekS3 || {};
    if (!s3.participant) return;
    list.push({ memberId: doc.id, data, s3 });
  });
  list.sort((a, b) => (a.data.nickname || "").localeCompare(b.data.nickname || "", "ko"));
  return list;
}

async function loadParticipantMember(db, memberId) {
  const ref = db.collection("members").doc(memberId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (data.hidden) return null;
  const s3 = data.chunbaekS3 || {};
  if (!s3.participant) return null;
  return { ref, snap, data, s3 };
}

async function loadAttendanceBySlot(db) {
  const snap = await db.collection("chunbaek_attendance").get();
  const bySlot = {};
  snap.forEach((doc) => {
    const d = doc.data();
    const key = String(d.slotId);
    bySlot[key] = true;
  });
  return bySlot;
}

function weekSlotsFromData(slots, week) {
  return slots
    .filter((s) => s.week === week)
    .sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0));
}

function weekTrainingDayCount(weekSlots) {
  return weekSlots.filter((s) => !s.isProgramOff).length;
}

function weekFilledCount(weekSlots) {
  return weekSlots.filter((s) => {
    if (s.isProgramOff) return true;
    return !!slotTrainingTitle(s).trim();
  }).length;
}

function buildEmptyWeekRows(config, week, slots = []) {
  if (week === BETA_WEEK) {
    const bounds = betaWeekBounds(config, slots);
    if (!bounds) return [];
    const dates = weekDatesFromStart(bounds.startDate, 1);
    return dates.map((date, idx) => ({
      slotId: null,
      dayIndex: 901 + idx,
      date,
      week: BETA_WEEK,
      trainingTitle: "",
      trainingContent: "",
      isProgramOff: false,
      hasAttendance: false,
    }));
  }
  const startDate = config?.startDate;
  if (!startDate) return [];
  const dates = weekDatesFromStart(startDate, week);
  return dates.map((date) => ({
    slotId: null,
    dayIndex: null,
    date,
    week,
    trainingTitle: "",
    trainingContent: "",
    isProgramOff: false,
    hasAttendance: false,
  }));
}

function parseCsvRows(csv) {
  const lines = String(csv || "").trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",");
    const row = {};
    header.forEach((key, idx) => {
      row[key] = (cols[idx] || "").trim();
    });
    rows.push({
      dayIndex: Number(row.dayIndex),
      date: row.date,
      week: Number(row.week),
      trainingTitle: row.trainingTitle || "",
      trainingContent: row.trainingContent || "",
      isProgramOff: row.isProgramOff === "true" || row.isProgramOff === true,
    });
  }
  return rows;
}

function validateImportRow(row, seenDayIndex) {
  const dayIndex = Number(row.dayIndex);
  if (!Number.isFinite(dayIndex) || dayIndex < 1 || dayIndex > 100) {
    return "dayIndex must be 1~100";
  }
  if (seenDayIndex.has(dayIndex)) return "duplicate dayIndex in import";
  seenDayIndex.add(dayIndex);
  if (!row.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return "invalid date";
  const week = Number(row.week);
  if (!Number.isFinite(week) || week < 0) return "invalid week";
  if (typeof row.isProgramOff !== "boolean") return "isProgramOff required";
  const title = String(row.trainingTitle || "").slice(0, TITLE_MAX);
  const content = String(row.trainingContent || "").slice(0, CONTENT_MAX);
  if (!row.isProgramOff && !title.trim()) return "trainingTitle required";
  return null;
}

function computeImportWarnings(slots) {
  const byWeek = new Map();
  for (const slot of slots) {
    if (!byWeek.has(slot.week)) byWeek.set(slot.week, []);
    byWeek.get(slot.week).push(slot);
  }
  const warnings = [];
  for (const [week, weekSlots] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) {
    const trainingDayCount = weekTrainingDayCount(weekSlots);
    if (trainingDayCount < 3) {
      warnings.push({
        week,
        trainingDayCount,
        message: `훈련일 ${trainingDayCount}일 — 주 3회 목표 불가 (자동 cap=min(3,${trainingDayCount}))`,
      });
    }
  }
  return warnings;
}

async function handleVerifyAdmin(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  const { pw } = req.body || {};
  const ownerPw = process.env.DMC_OWNER_PW;
  const expected = process.env.DMC_ADMIN_PW || "dmc2008";
  if (ownerPw && pw === ownerPw) {
    return res.json({ ok: true, role: "owner" });
  }
  if (pw === expected) {
    return res.json({ ok: true, role: "operator" });
  }
  return res.status(401).json({ ok: false, error: "invalid password" });
}

async function handleAdminGrid(req, res, db) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  if (!adminGate(req, res)) return undefined;

  const [config, slots, participants] = await Promise.all([
    loadSeasonConfig(db),
    loadAllSlots(db),
    loadAllParticipants(db),
  ]);
  const today = todayKstDate();
  const defaultWeek = defaultWeekForAdmin(config, slots, today);
  const week = parseWeekParam(req.query.week, defaultWeek);
  if (week === null) {
    return res.status(400).json({ ok: false, error: "invalid week" });
  }

  let weekSlotList = weekSlotsFromData(slots, week);
  if (!weekSlotList.length && (config.startDate || week === BETA_WEEK)) {
    if (week === BETA_WEEK) {
      weekSlotList = buildEmptyWeekRows(config, week, slots).map((row) => ({
        ...row,
        _placeholder: true,
      }));
    } else {
      const dates = weekDatesFromStart(config.startDate, week);
      weekSlotList = dates.map((date, idx) => ({
        id: null,
        dayIndex: null,
        date,
        week,
        trainingTitle: "",
        isProgramOff: false,
        _placeholder: true,
        _idx: idx,
      }));
    }
  }

  const dates = weekSlotList.map((s) => s.date);
  const range = dates.length ? formatIsoRange(dates[0], dates[dates.length - 1]) : "";
  const trainingDayCount = weekTrainingDayCount(weekSlotList);
  const weeklyTarget = config?.weeklyTarget ?? 3;

  const gridSlots = weekSlotList.map((slot) => ({
    slotId: slot.dayIndex ?? (slot._placeholder ? null : Number(slot.id)),
    dayIndex: slot.dayIndex ?? null,
    date: slot.date,
    trainingTitle: slot.isProgramOff ? "휴무" : (slotTrainingTitle(slot) || ""),
    isProgramOff: !!slot.isProgramOff,
  }));

  let seasonDayIndex = 0;
  for (const slot of seasonSlotsOnly(slots)) {
    if (slot.date <= today && (slot.dayIndex ?? 0) > seasonDayIndex) {
      seasonDayIndex = slot.dayIndex ?? 0;
    }
  }

  const members = [];
  let underTargetCount = 0;

  for (const p of participants) {
    const attendanceMap = await loadMemberAttendance(db, p.memberId);
    const weekStats = computeWeekStats(
      slots,
      attendanceMap,
      week,
      today,
      weeklyTarget,
    );

    const profileComplete = !!p.s3.profileComplete;
    if (profileComplete && !weekStats.weekTargetMet) underTargetCount += 1;

    const cells = weekSlotList.map((slot) => {
      if (slot.isProgramOff) {
        return {
          slotId: slot.dayIndex ?? null,
          status: "off",
          attended: false,
          exception: false,
          exceptionNote: "",
          photoUrl: "",
          note: "",
          updatedBy: null,
        };
      }
      const att = getAttendance(attendanceMap, slot);
      const status = slotStatus(slot, attendanceMap, today);
      const photoUrls = normalizePhotoUrls(att);
      return {
        slotId: slot.dayIndex ?? Number(slot.id),
        status,
        attended: !!(att?.attended),
        exception: !!(att?.exception),
        exceptionNote: att?.exceptionNote || "",
        photoUrls,
        photoUrl: photoUrls[0] || "",
        note: att?.note || "",
        updatedBy: att?.updatedBy || null,
      };
    });

    members.push({
      memberId: p.memberId,
      nickname: p.data.nickname || "",
      profileComplete,
      weekAttendCount: weekStats.weekAttendCount,
      weekTarget: weekStats.weekTarget,
      weekTargetMet: weekStats.weekTargetMet,
      cells,
    });
  }

  return res.json({
    ok: true,
    week,
    range,
    seasonDayIndex,
    participantCount: participants.length,
    weekSummary: {
      trainingDayCount,
      weeklyTarget,
      underTargetCount,
    },
    slots: gridSlots,
    members,
  });
}

async function handleAdminSetAttendance(req, res, db) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  if (!adminGate(req, res)) return undefined;

  const body = req.body || {};
  const memberId = String(body.memberId || "").trim();
  const slotId = body.slotId;
  const exception = !!body.exception;
  let attended = !!body.attended;
  const exceptionNote = String(body.exceptionNote || "").slice(0, EXCEPTION_NOTE_MAX);
  const note = String(body.note || "").slice(0, NOTE_MAX);
  const photoUrl = String(body.photoUrl || "").slice(0, PHOTO_URL_MAX);

  if (!memberId) {
    return res.status(400).json({ ok: false, error: "memberId required" });
  }
  if (slotId === undefined || slotId === null || slotId === "") {
    return res.status(400).json({ ok: false, error: "slotId required" });
  }

  const member = await loadParticipantMember(db, memberId);
  if (!member) {
    return res.status(404).json({ ok: false, error: "participant not found" });
  }

  const [config, slots] = await Promise.all([
    loadSeasonConfig(db),
    loadAllSlots(db),
  ]);
  const slot = findSlotById(slots, slotId);
  if (!slot) {
    return res.status(404).json({ ok: false, error: "slot not found" });
  }
  if (slot.isProgramOff) {
    return res.status(400).json({ ok: false, error: "program off day" });
  }

  if (exception) attended = false;

  const resolvedSlotId = slot.dayIndex ?? Number(slot.id);
  const docId = `${memberId}_${getSlotKey(slot)}`;
  await db.collection("chunbaek_attendance").doc(docId).set({
    memberId,
    slotId: resolvedSlotId,
    attended,
    exception,
    exceptionNote: exception ? exceptionNote : "",
    note,
    photoUrl,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "admin",
  }, { merge: true });

  const attendanceMap = await loadMemberAttendance(db, memberId);
  const today = todayKstDate();
  const weekStats = computeWeekStats(
    slots,
    attendanceMap,
    slot.week,
    today,
    config?.weeklyTarget ?? 3,
  );

  return res.json({
    ok: true,
    memberId,
    slotId: resolvedSlotId,
    attended,
    exception,
    weekAttendCount: weekStats.weekAttendCount,
    weekTarget: weekStats.weekTarget,
    weekTargetMet: weekStats.weekTargetMet,
  });
}

async function handleAdminWeekSlots(req, res, db) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  if (!adminGate(req, res)) return undefined;

  const [config, slots] = await Promise.all([
    loadSeasonConfig(db),
    loadAllSlots(db),
  ]);
  const today = todayKstDate();
  const defaultWeek = defaultWeekForAdmin(config, slots, today);
  const week = parseWeekParam(req.query.week, defaultWeek);
  if (week === null) {
    return res.status(400).json({ ok: false, error: "invalid week" });
  }

  const attendanceBySlot = await loadAttendanceBySlot(db);
  let weekSlotList = weekSlotsFromData(slots, week);

  if (!weekSlotList.length) {
    const emptyRows = buildEmptyWeekRows(config, week, slots);
    const trainingDayCount = emptyRows.filter((r) => !r.isProgramOff).length;
    const dates = emptyRows.map((r) => r.date);
    return res.json({
      ok: true,
      week,
      range: dates.length ? formatIsoRange(dates[0], dates[dates.length - 1]) : "",
      summary: {
        slotCount: emptyRows.length,
        filledCount: 0,
        trainingDayCount,
        weeklyTarget: config?.weeklyTarget ?? 3,
        warning: trainingDayCount < 3
          ? `훈련일 ${trainingDayCount}일 — 주 3회 목표 불가 (자동 cap=min(3,${trainingDayCount}))`
          : null,
      },
      slots: emptyRows,
    });
  }

  const dates = weekSlotList.map((s) => s.date);
  const trainingDayCount = weekTrainingDayCount(weekSlotList);
  const filledCount = weekFilledCount(weekSlotList);
  const weeklyTarget = config?.weeklyTarget ?? 3;

  const slotRows = weekSlotList.map((slot) => {
    const key = getSlotKey(slot);
    return {
      slotId: slot.dayIndex ?? Number(slot.id),
      dayIndex: slot.dayIndex ?? null,
      date: slot.date,
      week: slot.week,
      trainingTitle: slotTrainingTitle(slot),
      trainingContent: slotTrainingContent(slot),
      isProgramOff: !!slot.isProgramOff,
      hasAttendance: !!attendanceBySlot[key] || !!attendanceBySlot[slot.id],
    };
  });

  return res.json({
    ok: true,
    week,
    range: formatIsoRange(dates[0], dates[dates.length - 1]),
    summary: {
      slotCount: slotRows.length,
      filledCount,
      trainingDayCount,
      weeklyTarget,
      warning: trainingDayCount < 3
        ? `훈련일 ${trainingDayCount}일 — 주 3회 목표 불가 (자동 cap=min(3,${trainingDayCount}))`
        : null,
    },
    slots: slotRows,
  });
}

async function handleAdminSaveWeekSlots(req, res, db) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  if (!adminGate(req, res)) return undefined;

  const body = req.body || {};
  const week = parseWeekParam(body.week, null);
  const rows = Array.isArray(body.rows) ? body.rows : null;

  if (week === null) {
    return res.status(400).json({ ok: false, error: "week required" });
  }
  if (!rows || !rows.length) {
    return res.status(400).json({ ok: false, error: "rows required" });
  }

  const [config, slots, attendanceBySlot] = await Promise.all([
    loadSeasonConfig(db),
    loadAllSlots(db),
    loadAttendanceBySlot(db),
  ]);

  let maxDayIndex = 0;
  for (const s of slots) {
    const di = s.dayIndex ?? Number(s.id);
    if (Number.isFinite(di) && di > maxDayIndex) maxDayIndex = di;
  }

  const batch = db.batch();
  let saved = 0;

  for (const row of rows) {
    if (row.week !== undefined && Number(row.week) !== week) {
      return res.status(400).json({ ok: false, error: "row week mismatch" });
    }
    const date = String(row.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: "invalid date" });
    }
    const isProgramOff = !!row.isProgramOff;
    const trainingTitle = String(row.trainingTitle || "").slice(0, TITLE_MAX).trim();
    const trainingContent = String(row.trainingContent || "").slice(0, CONTENT_MAX);

    if (!isProgramOff && !trainingTitle) {
      return res.status(400).json({ ok: false, error: "trainingTitle required" });
    }

    let dayIndex = row.dayIndex;
    if (week === BETA_WEEK) {
      dayIndex = betaDayIndexForDate(config, slots, date);
      if (!dayIndex) {
        return res.status(400).json({ ok: false, error: "invalid date for week 0" });
      }
    } else if (dayIndex === undefined || dayIndex === null || dayIndex === "") {
      maxDayIndex += 1;
      dayIndex = maxDayIndex;
    } else {
      dayIndex = Number(dayIndex);
      if (!Number.isFinite(dayIndex) || dayIndex < 1 || dayIndex > 100) {
        return res.status(400).json({ ok: false, error: "invalid dayIndex" });
      }
    }

    const existing = slots.find((s) => (s.dayIndex ?? Number(s.id)) === dayIndex);
    if (isProgramOff) {
      const key = String(dayIndex);
      if (attendanceBySlot[key] && existing && !existing.isProgramOff) {
        return res.status(409).json({ ok: false, error: "attendance exists" });
      }
    }

    const docRef = db.collection("chunbaek_slots").doc(String(dayIndex));
    batch.set(docRef, {
      dayIndex,
      date,
      week,
      trainingTitle: isProgramOff ? (trainingTitle || "휴무") : trainingTitle,
      trainingContent: isProgramOff ? "" : trainingContent,
      isProgramOff,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    saved += 1;
  }

  await batch.commit();

  const updatedSlots = await loadAllSlots(db);
  const weekSlots = weekSlotsFromData(updatedSlots, week);
  const trainingDayCount = weekTrainingDayCount(weekSlots);
  const warnings = week === BETA_WEEK || trainingDayCount < 3
    ? (week === BETA_WEEK
      ? ["0주차(베타) — 본시즌 시작 전 체험 주차 (1주차 전 DB 초기화 예정)"]
      : [`훈련일 ${trainingDayCount}일 — 주 3회 목표 불가 (자동 cap=min(3,${trainingDayCount}))`])
    : [];

  return res.json({
    ok: true,
    week,
    saved,
    trainingDayCount,
    warnings,
  });
}

async function handleAdminImportSlots(req, res, db) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  if (!adminGate(req, res)) return undefined;

  const body = req.body || {};
  const mode = body.mode === "merge" ? "merge" : "replace";
  let rows = Array.isArray(body.rows) ? body.rows : null;
  if (!rows && body.csv) rows = parseCsvRows(body.csv);
  if (!rows || !rows.length) {
    return res.status(400).json({ ok: false, error: "rows or csv required" });
  }

  const seenDayIndex = new Set();
  const normalized = [];
  for (const row of rows) {
    const err = validateImportRow(row, seenDayIndex);
    if (err) return res.status(400).json({ ok: false, error: err });
    normalized.push({
      dayIndex: Number(row.dayIndex),
      date: row.date,
      week: Number(row.week),
      trainingTitle: String(row.trainingTitle || "").slice(0, TITLE_MAX),
      trainingContent: String(row.trainingContent || "").slice(0, CONTENT_MAX),
      isProgramOff: !!row.isProgramOff,
    });
  }

  const attendanceSnap = await db.collection("chunbaek_attendance").limit(1).get();
  const attendanceExists = !attendanceSnap.empty;
  const warnings = [];

  if (mode === "replace") {
    if (attendanceExists) {
      warnings.push({ attendanceExists: true, message: "attendance exists — slots not deleted" });
    } else {
      const existing = await db.collection("chunbaek_slots").get();
      const delBatch = db.batch();
      existing.forEach((doc) => delBatch.delete(doc.ref));
      await delBatch.commit();
    }
  }

  const batch = db.batch();
  for (const row of normalized) {
    const docRef = db.collection("chunbaek_slots").doc(String(row.dayIndex));
    batch.set(docRef, {
      dayIndex: row.dayIndex,
      date: row.date,
      week: row.week,
      trainingTitle: row.isProgramOff ? (row.trainingTitle || "휴무") : row.trainingTitle,
      trainingContent: row.isProgramOff ? "" : row.trainingContent,
      isProgramOff: row.isProgramOff,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();

  const bounds = seasonBounds(normalized);
  const weekWarnings = computeImportWarnings(normalized);

  return res.json({
    ok: true,
    imported: normalized.length,
    mode,
    dateRange: bounds,
    warnings: [...warnings, ...weekWarnings],
  });
}

async function handleAdminSetParticipant(req, res, db) {
  if (!adminGate(req, res)) return;
  const body = req.body || {};
  const memberId = String(body.memberId || "").trim();
  const participant = body.participant;

  if (!memberId) {
    return res.status(400).json({ ok: false, error: "memberId required" });
  }
  if (typeof participant !== "boolean") {
    return res.status(400).json({ ok: false, error: "participant (boolean) required" });
  }

  const ref = db.collection("members").doc(memberId);
  const snap = await ref.get();
  if (!snap.exists) {
    return res.status(404).json({ ok: false, error: "member not found" });
  }
  const d = snap.data();
  if (d.hidden) {
    return res.status(400).json({ ok: false, error: "hidden member" });
  }

  const was = !!(d.chunbaekS3 || {}).participant;
  const update = {
    "chunbaekS3.participant": participant,
    "chunbaekS3.updatedAt": FieldValue.serverTimestamp(),
  };
  if (participant && !was && !(d.chunbaekS3 || {}).profileComplete) {
    update["chunbaekS3.profileComplete"] = false;
  }
  await ref.update(update);

  return res.json({
    ok: true,
    memberId,
    nickname: d.nickname,
    realName: d.realName,
    participant,
    was,
  });
}

async function handleAdminListExceptionRequests(req, res, db) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  if (!adminGate(req, res)) return undefined;

  const statusFilter = parseAdminExceptionRequestStatusFilter(req.query.status);
  if (!statusFilter.ok) {
    return res.status(400).json({ ok: false, error: statusFilter.error });
  }
  const limit = parseAdminExceptionRequestLimit(req.query.limit);

  // status equality only — avoids composite index (type+status+createdAt).
  // Filter type + sort/limit in memory; pending queue volume is small.
  const [config, slots, snap] = await Promise.all([
    loadSeasonConfig(db),
    loadAllSlots(db),
    db.collection("chunbaek_exception_requests")
      .where("status", "==", statusFilter.status)
      .get(),
  ]);

  const docs = snap.docs
    .filter((doc) => {
      const data = doc.data() || {};
      return (data.type || "") === "exception";
    })
    .sort((a, b) => {
      const createdMs = (doc) => {
        const v = (doc.data() || {}).createdAt;
        if (!v) return 0;
        if (typeof v.toMillis === "function") return v.toMillis();
        if (typeof v.toDate === "function") return v.toDate().getTime();
        const parsed = Date.parse(String(v));
        return Number.isFinite(parsed) ? parsed : 0;
      };
      return createdMs(b) - createdMs(a);
    })
    .slice(0, limit);
  const memberIds = [...new Set(
    docs
      .map((doc) => String((doc.data() || {}).memberId || "").trim())
      .filter(Boolean),
  )];
  const attendanceByMemberId = new Map();
  await Promise.all(memberIds.map(async (memberId) => {
    attendanceByMemberId.set(memberId, await loadMemberAttendance(db, memberId));
  }));

  const requests = docs.map((doc) => {
    const data = doc.data() || {};
    const memberId = String(data.memberId || "").trim();
    const preview = previewExceptionApplication({
      slots,
      attendanceMap: attendanceByMemberId.get(memberId) || {},
      config,
      startDate: data.startDate,
      endDate: data.endDate,
    });
    return {
      requestId: doc.id,
      ...data,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
      reviewedAt: timestampToIso(data.reviewedAt),
      preview,
    };
  });

  return res.json({ ok: true, requests });
}

async function handleAdminReviewExceptionRequest(req, res, db) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  if (!adminGate(req, res)) return undefined;

  const body = req.body || {};
  const requestId = String(body.requestId || "").trim();
  const decision = String(body.decision || "").trim().toLowerCase();
  const reviewNote = String(body.reviewNote || "").slice(0, NOTE_MAX);

  if (!requestId) {
    return res.status(400).json({ ok: false, error: "requestId required" });
  }
  if (decision !== "approve" && decision !== "reject") {
    return res.status(400).json({ ok: false, error: "invalid decision" });
  }

  const ref = db.collection("chunbaek_exception_requests").doc(requestId);
  const [slots, config] = decision === "approve"
    ? await Promise.all([
      loadAllSlots(db),
      loadSeasonConfig(db),
    ])
    : [null, null];

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw createHttpError(404, "request not found");
      }

      const request = snap.data() || {};
      if (request.type !== "exception") {
        throw createHttpError(400, "invalid request type");
      }
      if (request.status !== "pending") {
        throw createHttpError(400, "already reviewed");
      }
      const memberId = String(request.memberId || "").trim();
      const lockRef = memberId
        ? db.collection("chunbaek_exception_locks").doc(memberId)
        : null;

      if (decision === "reject") {
        tx.update(ref, {
          status: "rejected",
          reviewedBy: "admin",
          reviewedAt: FieldValue.serverTimestamp(),
          reviewNote,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (lockRef) {
          tx.set(lockRef, {
            pendingRequestId: null,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        return { requestId, status: "rejected" };
      }

      const appliedSlotIds = [];
      const skippedSlotIds = [];
      const exceptionNote = formatRequestExceptionNote(request.reason);
      const targetSlots = trainingSlotsInDateRange({
        slots,
        config,
        startDate: request.startDate,
        endDate: request.endDate,
      });

      // Firestore transactions: all reads before all writes.
      const attendanceReads = [];
      for (const slot of targetSlots) {
        const slotId = slot.dayIndex ?? Number(slot.id);
        const attRef = db.collection("chunbaek_attendance").doc(`${request.memberId}_${getSlotKey(slot)}`);
        const attSnap = await tx.get(attRef);
        attendanceReads.push({
          slot,
          slotId,
          attRef,
          attendance: attSnap.exists ? (attSnap.data() || {}) : null,
        });
      }

      for (const row of attendanceReads) {
        if (row.attendance?.attended) {
          skippedSlotIds.push(row.slotId);
          continue;
        }
        if (row.attendance?.exception) continue;

        const patch = buildSlotExceptionPatch({
          memberId: request.memberId,
          slot: row.slot,
          exception: true,
          exceptionNote,
          updatedBy: "admin",
        });
        tx.set(row.attRef, {
          ...patch,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        appliedSlotIds.push(row.slotId);
      }

      tx.update(ref, {
        status: "approved",
        appliedSlotIds,
        skippedSlotIds,
        reviewedBy: "admin",
        reviewedAt: FieldValue.serverTimestamp(),
        reviewNote,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (lockRef) {
        tx.set(lockRef, {
          pendingRequestId: null,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      return {
        requestId,
        status: "approved",
        appliedSlotIds,
        skippedSlotIds,
      };
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    if (err && Number.isInteger(err.status) && err.publicMessage) {
      return res.status(err.status).json({ ok: false, error: err.publicMessage });
    }
    throw err;
  }
}

const ADMIN_ACTIONS = new Set([
  "verify-admin",
  "admin-grid",
  "admin-set-attendance",
  "admin-week-slots",
  "admin-save-week-slots",
  "admin-import-slots",
  "admin-set-participant",
  "admin-list-exception-requests",
  "admin-review-exception-request",
]);

async function handleAdminRequest(req, res, db, action) {
  if (!ADMIN_ACTIONS.has(action)) return false;
  if (action === "verify-admin") {
    await handleVerifyAdmin(req, res);
    return true;
  }
  if (action === "admin-grid") {
    await handleAdminGrid(req, res, db);
    return true;
  }
  if (action === "admin-set-attendance") {
    await handleAdminSetAttendance(req, res, db);
    return true;
  }
  if (action === "admin-week-slots") {
    await handleAdminWeekSlots(req, res, db);
    return true;
  }
  if (action === "admin-save-week-slots") {
    await handleAdminSaveWeekSlots(req, res, db);
    return true;
  }
  if (action === "admin-import-slots") {
    await handleAdminImportSlots(req, res, db);
    return true;
  }
  if (action === "admin-set-participant") {
    await handleAdminSetParticipant(req, res, db);
    return true;
  }
  if (action === "admin-list-exception-requests") {
    await handleAdminListExceptionRequests(req, res, db);
    return true;
  }
  if (action === "admin-review-exception-request") {
    await handleAdminReviewExceptionRequest(req, res, db);
    return true;
  }
  return false;
}

module.exports = {
  requireAdmin,
  handleAdminRequest,
  handleVerifyAdmin,
  handleAdminGrid,
  handleAdminSetAttendance,
  handleAdminWeekSlots,
  handleAdminSaveWeekSlots,
  handleAdminImportSlots,
  handleAdminSetParticipant,
  handleAdminListExceptionRequests,
  handleAdminReviewExceptionRequest,
};
