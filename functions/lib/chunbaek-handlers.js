/**
 * 춘백 시즌3 API handlers — /api/chunbaek
 */
const { FieldValue } = require("firebase-admin/firestore");
const { issueSession, resolveMemberFromToken } = require("./chunbaek-auth");

const GOAL_MIN_SEC = 7200;   // 2:00:00
const GOAL_MAX_SEC = 25200;  // 7:00:00

function emptyStats() {
  return {
    seasonAttendCount: 0,
    seasonAttendRate: 0,
    seasonDayIndex: 0,
    weekAttendCount: 0,
    weekTarget: 3,
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

  return res.json(memberProfilePayload(
    auth.memberId,
    member.data,
    { ...member.s3, profileComplete: member.s3.profileComplete },
    emptyStats(),
  ));
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
  return res.status(400).json({ ok: false, error: `unknown action: ${action}` });
}

module.exports = { handleChunbaekRequest };
