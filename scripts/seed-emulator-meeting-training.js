#!/usr/bin/env node
/**
 * Firestore 에뮬: 정모 훈련 공지 더미 (meeting_training)
 * FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-meeting-training.js
 */
const path = require("path");
const { createRequire } = require("module");

const functionsDir = path.join(__dirname, "..", "functions");
const reqFn = createRequire(path.join(functionsDir, "package.json"));
const { initializeApp } = reqFn("firebase-admin/app");
const { getFirestore } = reqFn("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST 없음 — 에뮬레이터에서만 실행");
  process.exit(1);
}

try {
  initializeApp({ projectId: "dmc-attendance" });
} catch (_) {}
const db = getFirestore();

const ROWS = [
  {
    dash: "2026-07-14",
    key: "2026/07/14",
    type: "TUE",
    time: "19:30",
    place: "동탄 예당공원",
    trainBefore: "조깅 10분, 체조 및 스트레칭",
    trainMain: "▶업힐 훈련 20회전\n예당공원 內 회전구간 달리기",
    trainAfter: "Cooldown 마무리 체조 및 스트레칭",
    supporters: "옥/루이",
    note: "에뮬 더미 · 화요",
  },
  {
    dash: "2026-07-16",
    key: "2026/07/16",
    type: "THU",
    time: "19:30",
    place: "여울공원 운동장(트랙)",
    trainBefore: "체조 및 스트레칭, 조깅 운동장7바퀴",
    trainMain: "300/100 인터벌 10개 & 보강훈련",
    trainAfter: "Cooldown 조깅 10분, 마무리 체조 및 스트레칭",
    supporters: "바우돌리노/보스톤",
    note: "에뮬 더미 · 목요",
  },
  {
    dash: "2026-07-18",
    key: "2026/07/18",
    type: "SAT",
    time: "06:00",
    place: "동탄여울공원",
    trainBefore: "스트레칭, 트랙 3바퀵",
    trainMain: "여울공원-동탄ic 4회전 약 25km",
    trainAfter: "스트레칭",
    supporters: "삼둥/쌩메",
    note: "에뮬 더미 · 토요",
  },
  {
    dash: "2026-07-21",
    key: "2026/07/21",
    type: "TUE",
    time: "19:30",
    place: "동탄 예당공원",
    trainBefore: "조깅 10분",
    trainMain: "템포런 8km",
    trainAfter: "스트레칭",
    supporters: "옥/루이",
    note: "에뮬 더미 · 다음 화요",
  },
];

(async () => {
  for (const r of ROWS) {
    await db
      .collection("meeting_training")
      .doc(r.dash + "_" + r.type)
      .set(
        {
          meetingDateKey: r.key,
          meetingType: r.type,
          time: r.time,
          place: r.place,
          trainBefore: r.trainBefore,
          trainMain: r.trainMain,
          trainAfter: r.trainAfter,
          supporters: r.supporters,
          note: r.note,
        },
        { merge: true }
      );
  }
  console.log("[seed-emulator-meeting-training]", ROWS.length, "docs OK");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
