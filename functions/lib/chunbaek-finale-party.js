/**
 * 쫑파티 안내. 날짜 기본값은 2026-11-27.
 * 장소·시간·추가 안내는 운영진이 저장하기 전에는 빈 문자열이다.
 */
const { resolveMemberFromToken } = require("./chunbaek-auth");

const FINALE_PARTY_DATE = "2026-11-27";
const FINALE_PLACE_MAX = 80;
const FINALE_TIME_MAX = 40;
const FINALE_NOTE_MAX = 300;
const CONFIG_COLLECTION = "chunbaek_season_config";
const CONFIG_DOC_ID = "chunbaek-s3";

function partyFromConfig(data) {
  const party = (data && data.finaleParty) || {};
  const date = String(party.date || "");
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : FINALE_PARTY_DATE,
    place: String(party.place || ""),
    time: String(party.time || ""),
    note: String(party.note || ""),
  };
}

function publicParty(party) {
  return {
    ok: true,
    date: party.date,
    place: party.place,
    time: party.time,
    note: party.note,
  };
}

function validatePartyInput(body) {
  const source = body || {};
  const place = String(source.place ?? "");
  const time = String(source.time ?? "");
  const note = String(source.note ?? "");
  const date = String(source.date ?? "").trim();
  if (place.trim().length > FINALE_PLACE_MAX) {
    return { ok: false, status: 400, error: `장소는 ${FINALE_PLACE_MAX}자 이내로 적어 주세요` };
  }
  if (time.trim().length > FINALE_TIME_MAX) {
    return { ok: false, status: 400, error: `시간은 ${FINALE_TIME_MAX}자 이내로 적어 주세요` };
  }
  if (note.trim().length > FINALE_NOTE_MAX) {
    return { ok: false, status: 400, error: `안내는 ${FINALE_NOTE_MAX}자 이내로 적어 주세요` };
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, status: 400, error: "날짜는 YYYY-MM-DD로 적어 주세요" };
  }
  return {
    ok: true,
    party: {
      date: date || FINALE_PARTY_DATE,
      place: place.trim(),
      time: time.trim(),
      note: note.trim(),
    },
  };
}

async function readFinaleParty(db) {
  const snap = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).get();
  return partyFromConfig(snap.exists ? snap.data() : null);
}

async function saveFinaleParty(db, party) {
  const ref = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID);
  await ref.set({
    finaleParty: {
      ...party,
      updatedAt: new Date().toISOString(),
    },
  }, { merge: true });
  return party;
}

async function assertParticipant(db, memberId) {
  const snap = await db.collection("members").doc(memberId).get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  if (data.hidden) return false;
  return !!(data.chunbaekS3 && data.chunbaekS3.participant);
}

async function handleFinaleParty(req, res, db) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  const auth = await resolveMemberFromToken(db, req);
  if (auth.error) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  const allowed = await assertParticipant(db, auth.memberId);
  if (!allowed) {
    return res.status(404).json({ ok: false, error: "participant not found" });
  }
  const party = await readFinaleParty(db);
  return res.json(publicParty(party));
}

async function handleAdminSaveFinaleParty(req, res, db) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  const { requireAdmin } = require("./chunbaek-admin");
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  const parsed = validatePartyInput(req.body || {});
  if (!parsed.ok) {
    return res.status(parsed.status).json({ ok: false, error: parsed.error });
  }
  const party = await saveFinaleParty(db, parsed.party);
  return res.json(publicParty(party));
}

module.exports = {
  FINALE_PARTY_DATE,
  FINALE_PLACE_MAX,
  FINALE_TIME_MAX,
  FINALE_NOTE_MAX,
  partyFromConfig,
  publicParty,
  validatePartyInput,
  readFinaleParty,
  handleFinaleParty,
  handleAdminSaveFinaleParty,
};
