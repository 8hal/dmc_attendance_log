/**
 * 정회원 명단 동기화 — diff 계획 (Firestore 접속 불필요)
 * 정책: _docs/superpowers/policies/member-leave-anonymization-policy.md
 */

const path = require("path");
const { isAlreadyAnonymized, anonymizedLabels } = require(
  path.join(__dirname, "../../functions/lib/member-leave")
);

function buildExpelledMap(expelledList) {
  const map = new Map();
  (expelledList || []).forEach((row) => {
    const key = String(row.realName || "").trim();
    if (key) map.set(key, row);
  });
  return map;
}

function findActiveByNickReal(firestoreList, nickname, realName) {
  return firestoreList.filter(
    (fm) =>
      !fm.hidden &&
      !isAlreadyAnonymized(fm._raw) &&
      fm.realName === realName &&
      fm.nickname === nickname
  );
}

function findActiveByReal(firestoreList, realName) {
  return firestoreList.filter(
    (fm) => !fm.hidden && !isAlreadyAnonymized(fm._raw) && fm.realName === realName
  );
}

function findHiddenRestorable(firestoreList, nickname, realName) {
  return firestoreList.filter(
    (fm) =>
      fm.hidden &&
      !isAlreadyAnonymized(fm._raw) &&
      fm.realName === realName &&
      fm.nickname === nickname
  );
}

function firestoreListFromBaseline(baseline) {
  return baseline.map((m, i) => {
    const id = m.id || `baseline_${String(i + 1).padStart(3, "0")}`;
    const nickname = m.nickname;
    const realName = m.realName;
    return {
      id,
      realName,
      nickname,
      hidden: m.hidden || false,
      _raw: { nickname, realName, hidden: m.hidden || false },
    };
  });
}

function firestoreListFromMcpExport(docs) {
  return (docs || []).map((row) => {
    const id = row.id || row.docId;
    const data = row.data || row;
    return {
      id,
      realName: data.realName,
      nickname: data.nickname,
      hidden: data.hidden || false,
      _raw: data,
    };
  });
}

function computeSyncPlan(roster, firestoreList, expelledMap, defaultLeftAtValue) {
  const matched = new Set();
  const toAdd = [];
  const toUnhide = [];
  const toUpdateNickname = [];
  const warnings = [];

  roster.forEach((m) => {
    const { nickname, realName } = m;

    const exactActive = findActiveByNickReal(firestoreList, nickname, realName);
    if (exactActive.length === 1) {
      matched.add(exactActive[0].id);
      return;
    }
    if (exactActive.length > 1) {
      warnings.push(`중복 active (닉+실명): ${nickname} (${realName})`);
      return;
    }

    const byReal = findActiveByReal(firestoreList, realName);
    if (byReal.length === 1 && byReal[0].nickname !== nickname) {
      matched.add(byReal[0].id);
      toUpdateNickname.push({
        id: byReal[0].id,
        realName,
        oldNickname: byReal[0].nickname,
        newNickname: nickname,
      });
      return;
    }
    if (byReal.length > 1) {
      warnings.push(`닉 변경 불가(동명이인 ${byReal.length}명): ${realName} → "${nickname}"`);
      return;
    }

    const hiddenRestore = findHiddenRestorable(firestoreList, nickname, realName);
    if (hiddenRestore.length === 1) {
      matched.add(hiddenRestore[0].id);
      toUnhide.push({ id: hiddenRestore[0].id, nickname, realName });
      return;
    }

    toAdd.push(m);
  });

  const toLeave = [];
  for (const fm of firestoreList) {
    if (fm.hidden || isAlreadyAnonymized(fm._raw)) continue;
    if (matched.has(fm.id)) continue;
    const expelled = expelledMap.get(fm.realName);
    toLeave.push({
      id: fm.id,
      nickname: fm.nickname,
      realName: fm.realName,
      leaveReason: expelled?.leaveReason || "withdrawn",
      leftAt: expelled?.leftAt || defaultLeftAtValue,
      note: expelled?.note || "",
    });
  }

  return { matched, toAdd, toUnhide, toUpdateNickname, toLeave, warnings };
}

/** MCP / hide-member API 적용용 작업 목록 */
function planToOperations(plan, { projectId = "dmc-attendance" } = {}) {
  const ops = [];
  const now = new Date().toISOString();

  for (const m of plan.toAdd) {
    ops.push({
      type: "add_member",
      collection: "members",
      data: {
        realName: m.realName,
        nickname: m.nickname,
        hidden: false,
        gender: "",
        team: "",
        createdAt: now,
      },
    });
  }

  for (const m of plan.toUpdateNickname) {
    ops.push({
      type: "update_member",
      collection: "members",
      docId: m.id,
      match: { realName: m.realName },
      data: { nickname: m.newNickname, updatedAt: now },
      note: `${m.oldNickname} → ${m.newNickname}`,
    });
  }

  for (const m of plan.toUnhide) {
    ops.push({
      type: "update_member",
      collection: "members",
      docId: m.id,
      data: { hidden: false, updatedAt: now },
    });
  }

  for (const m of plan.toLeave) {
    const labels = anonymizedLabels(m.id);
    ops.push({
      type: "member_leave",
      collection: "members",
      docId: m.id,
      leaveReason: m.leaveReason,
      leftAt: m.leftAt,
      before: { nickname: m.nickname, realName: m.realName },
      memberUpdate: {
        hidden: true,
        nickname: labels.nickname,
        realName: labels.realName,
        _archivedNickname: m.nickname,
        _archivedRealName: m.realName,
        leaveReason: m.leaveReason,
        leftAt: m.leftAt,
        anonymizedAt: now,
        updatedAt: now,
      },
      relatedUpdates: [
        {
          collection: "attendance",
          query: { memberId: m.id },
          fields: { nickname: labels.nickname, nicknameKey: labels.nicknameKey },
        },
        {
          collection: "attendance",
          query: { nicknameKey: m.nickname.toLowerCase() },
          fields: { nickname: labels.nickname, nicknameKey: labels.nicknameKey },
        },
        {
          collection: "race_results",
          query: { memberRealName: m.realName },
          fields: { memberRealName: labels.realName, memberNickName: labels.nickname },
        },
      ],
      note: m.note || "",
    });
  }

  return {
    projectId,
    generatedAt: now,
    summary: {
      add: plan.toAdd.length,
      updateNickname: plan.toUpdateNickname.length,
      unhide: plan.toUnhide.length,
      leave: plan.toLeave.length,
      warnings: plan.warnings.length,
    },
    warnings: plan.warnings,
    operations: ops,
  };
}

module.exports = {
  buildExpelledMap,
  firestoreListFromBaseline,
  firestoreListFromMcpExport,
  computeSyncPlan,
  planToOperations,
};
