#!/usr/bin/env node
/**
 * 버스 탑승 QA 전용 에뮬레이터 시드
 *
 * 용도: scripts/qa-bus-boarding.sh 실행 전 에뮬레이터에 테스트 데이터 준비
 * 사용: FIRESTORE_EMULATOR_HOST 필수 (firebase emulators:exec / 로컬 에뮬)
 *
 * 생성 데이터:
 *  - members: 라우펜더만, 테스터 (최소 2명)
 *  - race_events/evt_bus_qa: 단체 대회 (participants 최소, busBoarding 없음)
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
const { getFirestore, FieldValue } = requireFromFunctions("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST 없음. firebase emulators:exec 내에서만 실행하세요.");
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const EVENT_ID = "evt_bus_qa";

(async () => {
  console.log("[seed-bus-boarding] 시드 시작...");

  const members = [
    {
      id: "bus_qa_member_laufen",
      nickname: "라우펜더만",
      realName: "이원기",
      gender: "M",
      hidden: false,
      team: "DMC",
    },
    {
      id: "bus_qa_member_tester",
      nickname: "테스터",
      realName: "김테스터",
      gender: "F",
      hidden: false,
      team: "DMC",
    },
  ];

  for (const m of members) {
    const { id, ...data } = m;
    await db.collection("members").doc(id).set(data, { merge: true });
    console.log(`  [members/${id}] OK`);
  }

  const participants = members.map((m) => ({
    memberId: m.id,
    realName: m.realName,
    nickname: m.nickname,
  }));

  // busBoarding 없이 시드 — QA가 settings enable부터 검증
  // 재실행 시 이전 QA busBoarding 제거
  await db.collection("race_events").doc(EVENT_ID).set(
    {
      eventName: "2026 QA 버스탑승 단체대회",
      eventDate: "2026-08-02",
      isGroupEvent: true,
      participants,
      createdAt: new Date().toISOString(),
      busBoarding: FieldValue.delete(),
    },
    { merge: true }
  );

  console.log(`  [race_events/${EVENT_ID}] OK (isGroupEvent, no busBoarding)`);
  console.log("[seed-bus-boarding] 완료 ✅");
  process.exit(0);
})().catch((e) => {
  console.error("[seed-bus-boarding] 오류:", e);
  process.exit(1);
});
