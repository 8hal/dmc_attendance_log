#!/usr/bin/env node
/**
 * Firestore 에뮬레이터에서 6/30 명단 sync 적용 + 검증
 * emulators:exec 안에서 seed 직후 실행
 */
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const assert = require("node:assert/strict");

const functionsDir = path.join(__dirname, "..", "functions");
const reqFn = createRequire(path.join(functionsDir, "package.json"));
const { initializeApp } = reqFn("firebase-admin/app");
const { getFirestore } = reqFn("firebase-admin/firestore");
const { applyMemberLeave, isAlreadyAnonymized } = require(path.join(functionsDir, "lib", "member-leave"));
const {
  buildExpelledMap,
  computeSyncPlan,
} = require("./lib/member-sync-plan");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST 없음");
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const roster = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "members-2026-06-30-cleaned.json"), "utf8")
);
const expelled = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "members-2026-06-30-expelled.json"), "utf8")
);

async function loadMembers() {
  const snap = await db.collection("members").get();
  const list = [];
  snap.forEach((doc) => {
    const data = doc.data();
    list.push({
      id: doc.id,
      realName: data.realName,
      nickname: data.nickname,
      hidden: data.hidden || false,
      _raw: data,
    });
  });
  return list;
}

async function applyPlan(plan) {
  for (const m of plan.toAdd) {
    await db.collection("members").doc().set({
      realName: m.realName,
      nickname: m.nickname,
      hidden: false,
      gender: "",
      team: "",
      createdAt: new Date().toISOString(),
    });
  }
  for (const m of plan.toUpdateNickname) {
    await db.collection("members").doc(m.id).update({
      nickname: m.newNickname,
      updatedAt: new Date().toISOString(),
    });
  }
  for (const m of plan.toUnhide) {
    await db.collection("members").doc(m.id).update({
      hidden: false,
      updatedAt: new Date().toISOString(),
    });
  }
  for (const m of plan.toLeave) {
    await applyMemberLeave(db, {
      memberId: m.id,
      leaveReason: m.leaveReason,
      leftAt: m.leftAt,
      dryRun: false,
    });
  }
}

async function verify() {
  const snap = await db.collection("members").get();
  let active = 0;
  let leeDoc = null;
  snap.forEach((doc) => {
    const d = doc.data();
    if (d._archivedRealName === "이경주") leeDoc = { id: doc.id, ...d };
    if (!d.hidden && !isAlreadyAnonymized(d)) active++;
  });

  assert.equal(active, 176, `활성 회원 176명 기대, 실제 ${active}`);

  assert.ok(leeDoc, "이경주 익명화 문서 없음");
  assert.equal(leeDoc.leaveReason, "expelled");
  assert.ok(leeDoc.realName.startsWith("탈퇴회원_"));
  assert.equal(leeDoc._archivedNickname, "초이스");

  const att = await db.collection("attendance").where("memberId", "==", leeDoc.id).get();
  assert.ok(att.size >= 1, "attendance 익명화 누락");
  att.forEach((doc) => {
    assert.ok(doc.data().nickname.startsWith("탈퇴_"));
  });

  const races = await db
    .collection("race_results")
    .where("memberRealName", "==", leeDoc.realName)
    .get();
  assert.ok(races.size >= 1, "race_results 익명 실명으로 갱신 누락");

  const oldRaces = await db.collection("race_results").where("memberRealName", "==", "이경주").get();
  assert.equal(oldRaces.size, 0, "이경주 실명 race_results 잔존");

  console.log("✅ 검증 통과: 활성 176명, 이경주 제명·익명화, attendance/race_results 연동");
}

(async () => {
  const expelledMap = buildExpelledMap(expelled);
  const before = await loadMembers();
  const plan = computeSyncPlan(roster, before, expelledMap, "2026-06-30");

  assert.equal(plan.toAdd.length, 17);
  assert.equal(plan.toUpdateNickname.length, 2);
  assert.equal(plan.toLeave.length, 1);

  console.log("[emulator] plan OK — applying...");
  await applyPlan(plan);
  await verify();
  process.exit(0);
})().catch((e) => {
  console.error("❌", e.message || e);
  process.exit(1);
});
