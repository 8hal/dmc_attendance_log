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
  { dayIndex: 1, date: "2026-04-01", week: 1, trainingTitle: "5km 이지런", trainingContent: "", isProgramOff: false },
  { dayIndex: 2, date: "2026-04-02", week: 1, trainingTitle: "인터벌", trainingContent: "5×1km", isProgramOff: false },
  { dayIndex: 3, date: "2026-04-03", week: 1, trainingTitle: "휴무", trainingContent: "", isProgramOff: true },
  { dayIndex: 4, date: "2026-04-04", week: 1, trainingTitle: "장거리", trainingContent: "", isProgramOff: false },
  { dayIndex: 5, date: "2026-04-05", week: 1, trainingTitle: "이지런", trainingContent: "", isProgramOff: false },
  { dayIndex: 6, date: "2026-04-06", week: 1, trainingTitle: "동마클 토요일", trainingContent: "", isProgramOff: false },
  { dayIndex: 7, date: "2026-04-07", week: 2, trainingTitle: "인터벌", trainingContent: "", isProgramOff: false },
];

const BETA_DAY_INDEX_BASE = 901;
const SEASON_START = "2026-07-20";
const DEFAULT_BETA_START = "2026-07-13";
const DEFAULT_BETA_END = "2026-07-19";

function todayKstDate() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function addDaysIso(isoDate, offset) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + offset * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function buildBetaSlots(today) {
  if (today >= SEASON_START) {
    const beta = [
      { dayIndex: 901, date: "2026-07-13", week: 0, trainingTitle: "베타 D1", trainingContent: "", isProgramOff: false },
      { dayIndex: 902, date: "2026-07-14", week: 0, trainingTitle: "베타 D2", trainingContent: "", isProgramOff: false },
    ];
    return { beta, betaWeekStartDate: DEFAULT_BETA_START, betaWeekEndDate: DEFAULT_BETA_END };
  }

  const betaWeekStartDate = today < DEFAULT_BETA_START ? today : DEFAULT_BETA_START;
  const beta = [];
  for (let d = betaWeekStartDate, i = 0; d <= DEFAULT_BETA_END && i < 7; d = addDaysIso(d, 1), i += 1) {
    beta.push({
      dayIndex: BETA_DAY_INDEX_BASE + i,
      date: d,
      week: 0,
      trainingTitle: `베타 D${i + 1}`,
      trainingContent: "",
      isProgramOff: false,
    });
  }
  return { beta, betaWeekStartDate, betaWeekEndDate: DEFAULT_BETA_END };
}

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
      goalBodyWeightKg: 68,
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

  const today = todayKstDate();
  const { beta: BETA, betaWeekStartDate, betaWeekEndDate } = buildBetaSlots(today);

  await db.collection("chunbaek_season_config").doc("chunbaek-s3").set({
    seasonId: "chunbaek-s3",
    title: "춘백 시즌3",
    startDate: SEASON_START,
    endDate: "2026-10-27",
    betaWeekStartDate,
    betaWeekEndDate,
    weeklyTarget: 3,
    photoRequired: false,
  }, { merge: true });

  for (const slot of [...SLOTS, ...BETA]) {
    await db.collection("chunbaek_slots").doc(String(slot.dayIndex)).set(slot, { merge: true });
  }

  console.log(`[seed-emulator-chunbaek] members 2, slots ${SLOTS.length + BETA.length} (beta ${betaWeekStartDate}~, today=${today}), season_config OK`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
