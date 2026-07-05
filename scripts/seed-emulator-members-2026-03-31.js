#!/usr/bin/env node
/**
 * Firestore 에뮬레이터: 2026-03-31 cleaned 명단 → members 시드
 * emulators:exec 안에서만 실행 (FIRESTORE_EMULATOR_HOST 필수)
 */
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const functionsDir = path.join(__dirname, "..", "functions");
const nm = path.join(functionsDir, "node_modules");
if (!fs.existsSync(nm)) {
  console.error("functions/node_modules 없음. cd functions && npm ci");
  process.exit(1);
}
const reqFn = createRequire(path.join(functionsDir, "package.json"));
const { initializeApp } = reqFn("firebase-admin/app");
const { getFirestore } = reqFn("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST 없음 — emulators:exec 안에서만 실행");
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const cleanedPath = path.join(__dirname, "data", "members-2026-03-31-cleaned.json");
const members = JSON.parse(fs.readFileSync(cleanedPath, "utf8"));

(async () => {
  let batch = db.batch();
  let n = 0;
  const idMap = [];

  for (const m of members) {
    const docId = `mem_${String(m["순번"]).padStart(3, "0")}`;
    idMap.push({ docId, ...m });
    batch.set(db.collection("members").doc(docId), {
      realName: m.realName,
      nickname: m.nickname,
      hidden: false,
      gender: "",
      team: "",
    });
    n++;
    if (n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (n % 400 !== 0) await batch.commit();

  // 이경주(초이스) — 퇴회 연동 테스트용 출석·기록 1건씩
  const lee = idMap.find((x) => x.realName === "이경주");
  if (lee) {
    await db.collection("attendance").add({
      memberId: lee.docId,
      nickname: lee.nickname,
      nicknameKey: lee.nickname.toLowerCase(),
      meetingDateKey: "2026/06/01",
      monthKey: "2026/06",
    });
    await db.collection("race_results").add({
      memberRealName: lee.realName,
      memberNickName: lee.nickname,
      status: "confirmed",
      source: "manual",
    });
    console.log(`[seed] 이경주 연관 데이터: attendance 1, race_results 1 (memberId=${lee.docId})`);
  }

  console.log(`[seed-emulator-members-2026-03-31] members ${members.length}명 OK`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
