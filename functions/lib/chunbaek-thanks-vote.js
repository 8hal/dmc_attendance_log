/**
 * 춘백 쫑파티 "당신 때문에 고마웠다" 투표.
 * 문서 ID는 투표자 memberId — 1인 1표, 재투표는 덮어쓰기.
 * 회원 응답에는 본인 투표 여부와 후보 명단만 둔다.
 */
const { resolveMemberFromToken } = require("./chunbaek-auth");

const THANKS_REASON_MAX = 80;
const THANKS_COLLECTION = "chunbaek_thanks_votes";
const THANKS_SEASON_ID = "chunbaek-s3";

function normalizeReason(value) {
  return String(value ?? "").trim();
}

function validateThanksVote({ voterMemberId, nomineeMemberId, reason, participants }) {
  const voterId = String(voterMemberId ?? "").trim();
  const nomineeId = String(nomineeMemberId ?? "").trim();
  const people = participants || [];
  const nominee = people.find((person) => person.memberId === nomineeId);
  if (!nomineeId || !nominee) {
    return { ok: false, status: 400, error: "춘백 참가자를 선택해 주세요" };
  }
  if (nomineeId === voterId) {
    return { ok: false, status: 400, error: "자기 자신에게는 투표할 수 없습니다" };
  }
  const text = normalizeReason(reason);
  if (text.length > THANKS_REASON_MAX) {
    return {
      ok: false,
      status: 400,
      error: `이유는 ${THANKS_REASON_MAX}자 이내로 적어 주세요`,
    };
  }
  return {
    ok: true,
    nominee: { memberId: nominee.memberId, nickname: nominee.nickname || "" },
    reason: text,
  };
}

function memberVoteResponse({ voted, candidates }) {
  return {
    ok: true,
    voted: !!voted,
    candidates: (candidates || []).map((row) => ({
      memberId: String(row.memberId),
      nickname: String(row.nickname || ""),
    })),
  };
}

function tallyThanksVotes(ballots) {
  const byNominee = new Map();
  for (const ballot of ballots || []) {
    const memberId = ballot.nomineeMemberId;
    if (!memberId) continue;
    if (!byNominee.has(memberId)) {
      byNominee.set(memberId, {
        memberId,
        nickname: ballot.nomineeNickname || "",
        votes: 0,
        reasons: [],
      });
    }
    const row = byNominee.get(memberId);
    if (ballot.nomineeNickname) row.nickname = ballot.nomineeNickname;
    row.votes += 1;
    row.reasons.push({
      voterMemberId: ballot.voterMemberId,
      voterNickname: ballot.voterNickname || "",
      reason: ballot.reason || "",
    });
  }
  const tally = [...byNominee.values()];
  for (const row of tally) {
    row.reasons.sort((a, b) => a.voterNickname.localeCompare(b.voterNickname, "ko"));
  }
  tally.sort((a, b) => b.votes - a.votes || a.nickname.localeCompare(b.nickname, "ko"));
  return tally;
}

async function loadThanksParticipants(db) {
  const snap = await db.collection("members").get();
  const list = [];
  snap.forEach((doc) => {
    const data = doc.data() || {};
    if (data.hidden) return;
    const s3 = data.chunbaekS3 || {};
    if (!s3.participant) return;
    list.push({ memberId: doc.id, nickname: data.nickname || "" });
  });
  list.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
  return list;
}

function presentBallot(raw, participants) {
  const byId = new Map(participants.map((person) => [person.memberId, person]));
  const voter = byId.get(raw.voterMemberId);
  const nominee = byId.get(raw.nomineeMemberId);
  return {
    voterMemberId: raw.voterMemberId,
    voterNickname: (voter && voter.nickname) || raw.voterNickname || "",
    nomineeMemberId: raw.nomineeMemberId,
    nomineeNickname: (nominee && nominee.nickname) || raw.nomineeNickname || "",
    reason: raw.reason || "",
    updatedAt: raw.updatedAt || null,
  };
}

async function loadThanksBallots(db, participants) {
  const snap = await db.collection(THANKS_COLLECTION).get();
  const ballots = [];
  snap.forEach((doc) => {
    const data = doc.data() || {};
    if (data.seasonId && data.seasonId !== THANKS_SEASON_ID) return;
    if (!data.nomineeMemberId) return;
    ballots.push(presentBallot(data, participants));
  });
  ballots.sort((a, b) => (
    a.nomineeNickname.localeCompare(b.nomineeNickname, "ko")
    || a.voterNickname.localeCompare(b.voterNickname, "ko")
  ));
  return ballots;
}

async function handleThanksVote(req, res, db) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "GET or POST only" });
  }
  const auth = await resolveMemberFromToken(db, req);
  if (auth.error) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  const participants = await loadThanksParticipants(db);
  const voter = participants.find((person) => person.memberId === auth.memberId);
  if (!voter) {
    return res.status(404).json({ ok: false, error: "participant not found" });
  }
  const candidates = participants.filter((person) => person.memberId !== voter.memberId);

  if (req.method === "GET") {
    const snap = await db.collection(THANKS_COLLECTION).doc(voter.memberId).get();
    const data = snap.exists ? (snap.data() || {}) : null;
    const voted = !!(data && data.nomineeMemberId);
    return res.json(memberVoteResponse({ voted, candidates }));
  }

  const body = req.body || {};
  const result = validateThanksVote({
    voterMemberId: voter.memberId,
    nomineeMemberId: body.nomineeMemberId,
    reason: body.reason,
    participants,
  });
  if (!result.ok) {
    return res.status(result.status).json({ ok: false, error: result.error });
  }

  const ref = db.collection(THANKS_COLLECTION).doc(voter.memberId);
  const prevSnap = await ref.get();
  const prev = prevSnap.exists ? (prevSnap.data() || {}) : null;
  const now = new Date().toISOString();
  await ref.set({
    seasonId: THANKS_SEASON_ID,
    voterMemberId: voter.memberId,
    voterNickname: voter.nickname,
    nomineeMemberId: result.nominee.memberId,
    nomineeNickname: result.nominee.nickname,
    reason: result.reason,
    createdAt: (prev && prev.createdAt) || now,
    updatedAt: now,
  });
  return res.json({ ok: true, voted: true });
}

async function handleAdminThanksVotes(req, res, db) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  const { requireAdmin } = require("./chunbaek-admin");
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  const participants = await loadThanksParticipants(db);
  const ballots = await loadThanksBallots(db, participants);
  return res.json({
    ok: true,
    ballotCount: ballots.length,
    tally: tallyThanksVotes(ballots),
    ballots,
  });
}

module.exports = {
  THANKS_REASON_MAX,
  THANKS_COLLECTION,
  THANKS_SEASON_ID,
  validateThanksVote,
  memberVoteResponse,
  tallyThanksVotes,
  handleThanksVote,
  handleAdminThanksVotes,
};
