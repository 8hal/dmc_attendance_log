/**
 * 춘백 시즌3 API handlers — /api/chunbaek
 */
const { FieldValue } = require("firebase-admin/firestore");
const { issueSession, resolveMemberFromToken } = require("./chunbaek-auth");
const {
  loadSeasonConfig,
  loadAllSlots,
  loadMemberAttendance,
  computeMemberStats,
  buildTimelineWeeks,
  todaySlotPayload,
  todayKstDate,
  isMemberEditLocked,
  formatGoalTime,
  rateBar,
  getSlotKey,
} = require("./chunbaek-stats");

const GOAL_MIN_SEC = 7200;
const GOAL_MAX_SEC = 25200;

function emptyStats() {
  return {
    seasonAttendCount: 0,
    seasonAttendRate: 0,
    seasonDayIndex: 0,
    weekAttendCount: 0,
    weekTarget: 3,
    weekTargetMet: false,
  };
}

function parseOptionalSeconds(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

async function requireMember(req, res, db) {
  const auth = await resolveMemberFromToken(db, req);
  if (auth.error) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return null;
  }
  return auth;
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
  return list;
}

async function loadMemberStatsContext(db, memberId) {
  const [config, slots, attendanceMap] = await Promise.all([
    loadSeasonConfig(db),
    loadAllSlots(db),
    loadMemberAttendance(db, memberId),
  ]);
  const today = todayKstDate();
  const stats = slots.length
    ? computeMemberStats({ slots, attendanceMap, config, today })
    : emptyStats();
  return { config, slots, attendanceMap, today, stats };
}

function memberProfilePayload(memberId, data, s3, stats) {
  return {
    ok: true,
    memberId,
    nickname: data.nickname || "",
    goalMarathonNetTime: s3.goalMarathonNetTime ?? null,
    existingPbNetTime: s3.existingPbNetTime ?? null,
    resolutionText: s3.resolutionText ?? null,
    profileComplete: !!s3.profileComplete,
    stats: stats || emptyStats(),
  };
}

function findSlotById(slots, slotId) {
  const idStr = String(slotId);
  return slots.find((s) => getSlotKey(s) === idStr || String(s.id) === idStr) || null;
}

async function handleMembersRoster(req, res, db) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  const snap = await db.collection("members").get();
  const roster = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.hidden) return;
    const s3 = d.chunbaekS3 || {};
    if (!s3.participant) return;
    roster.push({
      memberId: doc.id,
      nickname: d.nickname || "",
      profileComplete: !!s3.profileComplete,
    });
  });
  roster.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
  return res.json({ ok: true, members: roster });
}

async function handleCreateProfile(req, res, db) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  const body = req.body || {};
  const memberId = String(body.memberId || "").trim();
  const goalMarathonNetTime = Number(body.goalMarathonNetTime);
  const existingPbNetTime = parseOptionalSeconds(body.existingPbNetTime);
  const resolutionText = String(body.resolutionText || "").trim().slice(0, 200) || null;

  if (!memberId) {
    return res.status(400).json({ ok: false, error: "memberId required" });
  }
  if (!Number.isFinite(goalMarathonNetTime)
    || goalMarathonNetTime < GOAL_MIN_SEC
    || goalMarathonNetTime > GOAL_MAX_SEC) {
    return res.status(400).json({
      ok: false,
      error: `goalMarathonNetTime must be ${GOAL_MIN_SEC}~${GOAL_MAX_SEC} seconds`,
    });
  }

  const member = await loadParticipantMember(db, memberId);
  if (!member) {
    return res.status(404).json({ ok: false, error: "participant not found" });
  }

  const { ref, data, s3 } = member;
  if (s3.profileComplete) {
    return res.status(409).json({ ok: false, error: "profile already complete" });
  }

  const update = {
    "chunbaekS3.goalMarathonNetTime": goalMarathonNetTime,
    "chunbaekS3.profileComplete": true,
    "chunbaekS3.resolutionText": resolutionText,
  };
  if (existingPbNetTime !== null) {
    update["chunbaekS3.existingPbNetTime"] = existingPbNetTime;
  }

  await ref.update(update);
  const session = await issueSession(db, memberId);

  return res.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    memberId,
    nickname: data.nickname || "",
    profileComplete: true,
  });
}

async function handleLinkDevice(req, res, db) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  const body = req.body || {};
  const memberId = String(body.memberId || "").trim();
  if (!memberId) {
    return res.status(400).json({ ok: false, error: "memberId required" });
  }

  const member = await loadParticipantMember(db, memberId);
  if (!member) {
    return res.status(404).json({ ok: false, error: "participant not found" });
  }
  if (!member.s3.profileComplete) {
    return res.status(400).json({ ok: false, error: "profile not complete" });
  }

  const session = await issueSession(db, memberId);
  return res.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    memberId,
    nickname: member.data.nickname || "",
    profileComplete: true,
  });
}

async function handleMyProfile(req, res, db) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  const auth = await requireMember(req, res, db);
  if (!auth) return undefined;

  const member = await loadParticipantMember(db, auth.memberId);
  if (!member) {
    return res.status(404).json({ ok: false, error: "participant not found" });
  }

  const { stats } = await loadMemberStatsContext(db, auth.memberId);
  return res.json(memberProfilePayload(
    auth.memberId,
    member.data,
    member.s3,
    stats,
  ));
}

async function handleTodaySlot(req, res, db) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  const auth = await requireMember(req, res, db);
  if (!auth) return undefined;

  const [slots, attendanceMap] = await Promise.all([
    loadAllSlots(db),
    loadMemberAttendance(db, auth.memberId),
  ]);
  const today = todayKstDate();
  const payload = todaySlotPayload(slots, attendanceMap, today);
  return res.json({ ok: true, ...payload });
}

async function handleSaveAttendance(req, res, db) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  const auth = await requireMember(req, res, db);
  if (!auth) return undefined;

  const body = req.body || {};
  const slotId = body.slotId;
  const attended = !!body.attended;
  const note = String(body.note || "").slice(0, 500);
  const photoUrl = String(body.photoUrl || "").slice(0, 2000);

  if (slotId === undefined || slotId === null || slotId === "") {
    return res.status(400).json({ ok: false, error: "slotId required" });
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
  if (isMemberEditLocked(slot.date)) {
    return res.status(403).json({ ok: false, error: "week deadline passed" });
  }
  if (config.photoRequired && attended && !photoUrl) {
    return res.status(400).json({ ok: false, error: "photoUrl required" });
  }

  const docId = `${auth.memberId}_${getSlotKey(slot)}`;
  await db.collection("chunbaek_attendance").doc(docId).set({
    memberId: auth.memberId,
    slotId: slot.dayIndex ?? Number(slot.id),
    attended,
    exception: false,
    note,
    photoUrl,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "member",
  }, { merge: true });

  const { stats } = await loadMemberStatsContext(db, auth.memberId);
  return res.json({
    ok: true,
    slotId: slot.dayIndex ?? Number(slot.id),
    attended,
    stats,
  });
}

async function handleMyTimeline(req, res, db) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  const auth = await requireMember(req, res, db);
  if (!auth) return undefined;

  const [config, slots, attendanceMap] = await Promise.all([
    loadSeasonConfig(db),
    loadAllSlots(db),
    loadMemberAttendance(db, auth.memberId),
  ]);
  const today = todayKstDate();
  const weeks = buildTimelineWeeks(slots, attendanceMap, config, today);
  return res.json({ ok: true, weeks });
}

async function handleTeamSummary(req, res, db) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  const auth = await requireMember(req, res, db);
  if (!auth) return undefined;

  const [config, slots, participants] = await Promise.all([
    loadSeasonConfig(db),
    loadAllSlots(db),
    loadAllParticipants(db),
  ]);
  const today = todayKstDate();

  const members = [];
  let rateSum = 0;
  let weekMetCount = 0;

  for (const p of participants) {
    const attendanceMap = await loadMemberAttendance(db, p.memberId);
    const stats = slots.length
      ? computeMemberStats({ slots, attendanceMap, config, today })
      : emptyStats();
    rateSum += stats.seasonAttendRate;
    if (stats.weekTargetMet) weekMetCount += 1;
    members.push({
      memberId: p.memberId,
      nickname: p.data.nickname || "",
      goal: formatGoalTime(p.s3.goalMarathonNetTime),
      goalMarathonNetTime: p.s3.goalMarathonNetTime ?? null,
      bar: rateBar(stats.seasonAttendRate),
      week: `${stats.weekAttendCount}/${stats.weekTarget}`,
      met: stats.weekTargetMet,
      seasonAttendRate: stats.seasonAttendRate,
    });
  }

  members.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
  const participantCount = members.length;
  const seasonRate = participantCount > 0
    ? Math.round(rateSum / participantCount)
    : 0;

  return res.json({
    ok: true,
    seasonRate,
    weekMetCount,
    participantCount,
    members,
  });
}

async function handleChunbaekRequest(req, res, { db, action }) {
  if (action === "ping") {
    return res.json({ ok: true, service: "chunbaek" });
  }
  if (action === "members-roster") {
    return handleMembersRoster(req, res, db);
  }
  if (action === "create-profile") {
    return handleCreateProfile(req, res, db);
  }
  if (action === "link-device") {
    return handleLinkDevice(req, res, db);
  }
  if (action === "my-profile") {
    return handleMyProfile(req, res, db);
  }
  if (action === "today-slot") {
    return handleTodaySlot(req, res, db);
  }
  if (action === "save-attendance") {
    return handleSaveAttendance(req, res, db);
  }
  if (action === "my-timeline") {
    return handleMyTimeline(req, res, db);
  }
  if (action === "team-summary") {
    return handleTeamSummary(req, res, db);
  }
  return res.status(400).json({ ok: false, error: `unknown action: ${action}` });
}

module.exports = { handleChunbaekRequest };
