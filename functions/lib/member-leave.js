/**
 * 회원 퇴회(탈퇴·제명) 처리 — 닉·실명 익명화 + 연관 컬렉션 갱신
 *
 * 정책: _docs/superpowers/policies/member-leave-anonymization-policy.md
 */

const BATCH_LIMIT = 450;

function isAlreadyAnonymized(data) {
  if (!data) return false;
  if (data._archivedRealName || data._archivedNickname) return true;
  const real = String(data.realName || "");
  return real.startsWith("탈퇴회원_");
}

function anonymizedLabels(memberId) {
  const short = String(memberId).slice(0, 8);
  const nickname = `탈퇴_${short}`;
  return {
    nickname,
    realName: `탈퇴회원_${short}`,
    nicknameKey: nickname.toLowerCase(),
  };
}

async function collectAttendanceDocs(db, memberId, memberData) {
  const docIds = new Map();
  const addSnap = (snap) => {
    snap.forEach((doc) => {
      if (!docIds.has(doc.id)) docIds.set(doc.id, doc);
    });
  };

  const byMemberId = await db.collection("attendance").where("memberId", "==", memberId).get();
  addSnap(byMemberId);

  const nick = String(memberData.nickname || "").trim();
  if (nick) {
    const byNickKey = await db
      .collection("attendance")
      .where("nicknameKey", "==", nick.toLowerCase())
      .get();
    addSnap(byNickKey);
  }

  return [...docIds.values()];
}

async function collectRaceResultDocs(db, archivedRealName) {
  const real = String(archivedRealName || "").trim();
  if (!real) return [];
  const snap = await db.collection("race_results").where("memberRealName", "==", real).get();
  return snap.docs;
}

async function commitBatches(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    ops.slice(i, i + BATCH_LIMIT).forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
  }
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} options
 * @param {string} options.memberId
 * @param {object} [options.memberData] - 생략 시 Firestore에서 조회
 * @param {string} [options.leaveReason] - withdrawn | expelled
 * @param {string} [options.leftAt] - YYYY-MM-DD
 * @param {boolean} [options.dryRun]
 */
async function applyMemberLeave(db, options) {
  const {
    memberId,
    memberData: memberDataIn,
    leaveReason = "withdrawn",
    leftAt,
    dryRun = false,
  } = options;

  const memberRef = db.collection("members").doc(memberId);
  const memberSnap = memberDataIn ? null : await memberRef.get();
  if (!memberDataIn && !memberSnap.exists) {
    throw new Error(`member not found: ${memberId}`);
  }

  const data = memberDataIn || memberSnap.data();
  if (isAlreadyAnonymized(data)) {
    return {
      skipped: true,
      reason: "already_anonymized",
      memberId,
    };
  }

  const archivedNickname = String(data.nickname || "").trim();
  const archivedRealName = String(data.realName || "").trim();
  if (!archivedNickname || !archivedRealName) {
    throw new Error(`member ${memberId}: nickname/realName required for leave`);
  }

  const labels = anonymizedLabels(memberId);
  const now = new Date().toISOString();
  const leftAtValue = leftAt || now.slice(0, 10);

  const memberUpdate = {
    hidden: true,
    nickname: labels.nickname,
    realName: labels.realName,
    _archivedNickname: archivedNickname,
    _archivedRealName: archivedRealName,
    leaveReason,
    leftAt: leftAtValue,
    anonymizedAt: now,
    updatedAt: now,
  };

  const attendanceDocs = await collectAttendanceDocs(db, memberId, data);
  const raceDocs = await collectRaceResultDocs(db, archivedRealName);

  const preview = {
    memberId,
    leaveReason,
    leftAt: leftAtValue,
    before: { nickname: archivedNickname, realName: archivedRealName },
    after: { nickname: labels.nickname, realName: labels.realName },
    attendanceCount: attendanceDocs.length,
    raceResultsCount: raceDocs.length,
  };

  if (dryRun) {
    return { dryRun: true, preview };
  }

  await memberRef.update(memberUpdate);

  const attendanceOps = attendanceDocs.map((doc) => ({
    ref: doc.ref,
    data: {
      nickname: labels.nickname,
      nicknameKey: labels.nicknameKey,
    },
  }));
  if (attendanceOps.length) await commitBatches(db, attendanceOps);

  const raceOps = raceDocs.map((doc) => ({
    ref: doc.ref,
    data: {
      memberRealName: labels.realName,
      memberNickName: labels.nickname,
    },
  }));
  if (raceOps.length) await commitBatches(db, raceOps);

  return { ok: true, preview };
}

module.exports = {
  anonymizedLabels,
  isAlreadyAnonymized,
  applyMemberLeave,
  collectAttendanceDocs,
  collectRaceResultDocs,
};
