#!/usr/bin/env node
/**
 * 춘백 시즌3 에뮬레이터 시드 — participants, season_config, slots
 */
const fs = require("fs");
const path = require("path");

const functionsDir = path.join(__dirname, "..", "functions");
const nm = path.join(functionsDir, "node_modules");
if (!fs.existsSync(nm)) {
  console.error("functions/node_modules 없음. cd functions && npm ci");
  process.exit(1);
}
const { createRequire } = require("module");
const requireFromFunctions = createRequire(path.join(nm, "_"));

const { initializeApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore } = requireFromFunctions("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST 없음. emulators:exec 안에서만 실행하세요.");
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const SLOTS = [
  { dayIndex: 1, date: "2026-04-01", week: 1, trainingLabel: "5km 이지런", isProgramOff: false },
  { dayIndex: 2, date: "2026-04-02", week: 1, trainingLabel: "인터벌", isProgramOff: false },
  { dayIndex: 3, date: "2026-04-03", week: 1, trainingLabel: "휴무", isProgramOff: true },
  { dayIndex: 4, date: "2026-04-04", week: 1, trainingLabel: "장거리", isProgramOff: false },
  { dayIndex: 5, date: "2026-04-05", week: 1, trainingLabel: "이지런", isProgramOff: false },
  { dayIndex: 6, date: "2026-04-06", week: 1, trainingLabel: "동마클 토요일", isProgramOff: false },
  { dayIndex: 7, date: "2026-04-07", week: 2, trainingLabel: "인터벌", isProgramOff: false },
];

(async () => {
  await db.collection("members").doc("chunbaek_seed_a").set({
    nickname: "테스트A",
    realName: "ChunbaekSeedA",
    hidden: false,
    chunbaekS3: {
      participant: true,
      profileComplete: true,
      goalMarathonNetTime: 16200,
      existingPbNetTime: 17520,
      resolutionText: "에뮬 시드 A",
    },
  }, { merge: true });

  await db.collection("members").doc("chunbaek_seed_b").set({
    nickname: "테스트B",
    realName: "ChunbaekSeedB",
    hidden: false,
    chunbaekS3: {
      participant: true,
      profileComplete: false,
    },
  }, { merge: true });

  await db.collection("chunbaek_season_config").doc("chunbaek-s3").set({
    seasonId: "chunbaek-s3",
    title: "춘백 시즌3",
    startDate: "2026-04-01",
    endDate: "2026-07-09",
    weeklyTarget: 3,
    photoRequired: false,
  }, { merge: true });

  for (const slot of SLOTS) {
    await db.collection("chunbaek_slots").doc(String(slot.dayIndex)).set(slot, { merge: true });
  }

  console.log("[seed-emulator-chunbaek] members 2, slots 7, season_config OK");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
