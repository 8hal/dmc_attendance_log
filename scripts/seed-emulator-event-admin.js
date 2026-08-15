#!/usr/bin/env node
/**
 * event-admin / self-confirm / bib-scrape QA 전용 에뮬레이터 시드
 *
 * 용도: scripts/qa-event-admin.sh 실행 전 에뮬레이터에 테스트 데이터 준비
 * 사용: FIRESTORE_EMULATOR_HOST 필수 (firebase emulators:exec / 로컬 에뮬)
 *
 * Stable IDs (QA가 하드코딩):
 *  - race_events/evt_event_admin_qa       — 배번 有/無 + bus + scrape job
 *  - race_events/evt_event_admin_qa_nobib — 전원 무배번 (scrape 거부 검증)
 *  - scrape_jobs/ea_scrape_job_001
 *
 * 생성 데이터:
 *  - members: 배번있음 / 배번없음 / 배번둘
 *  - participants: bib 있는 2명 + bib 없는 1명
 *  - busBoarding.enabled + roster
 *  - groupSource: smartchip
 *  - scrape_jobs results: bib 4821·4822 (self-confirm / my-pending-result용)
 */
"use strict";

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
  console.error("FIRESTORE_EMULATOR_HOST 없음. firebase emulators:exec 내에서만 실행하세요.");
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const EVENT_ID = "evt_event_admin_qa";
const EVENT_ID_NOBIB = "evt_event_admin_qa_nobib";
const JOB_ID = "ea_scrape_job_001";
const EVENT_DATE = "2026-08-15";
const EVENT_NAME = "2026 QA event-admin 철원베타";

(async () => {
  console.log("[seed-event-admin] 시드 시작...");

  const members = [
    {
      id: "ea_qa_member_with_bib",
      nickname: "배번있음",
      realName: "김배번",
      gender: "M",
      hidden: false,
      team: "DMC",
    },
    {
      id: "ea_qa_member_no_bib",
      nickname: "배번없음",
      realName: "이무번",
      gender: "F",
      hidden: false,
      team: "DMC",
    },
    {
      id: "ea_qa_member_with_bib2",
      nickname: "배번둘",
      realName: "박배번",
      gender: "M",
      hidden: false,
      team: "DMC",
    },
  ];

  for (const m of members) {
    const { id, ...data } = m;
    await db.collection("members").doc(id).set(data, { merge: true });
    console.log(`  [members/${id}] OK`);
  }

  const participants = [
    {
      memberId: "ea_qa_member_with_bib",
      realName: "김배번",
      nickname: "배번있음",
      bib: "4821",
      distance: "Half",
    },
    {
      memberId: "ea_qa_member_no_bib",
      realName: "이무번",
      nickname: "배번없음",
      // bib 없음 — scrape 대상 제외
      distance: "Half",
    },
    {
      memberId: "ea_qa_member_with_bib2",
      realName: "박배번",
      nickname: "배번둘",
      bib: "4822",
      distance: "Half",
    },
  ];

  const busBoarding = {
    enabled: true,
    legs: ["outbound", "return"],
    importMeta: {
      importedAt: new Date().toISOString(),
      rowCount: 2,
      sourceLabel: "ea-qa-seed",
    },
    roster: [
      {
        rosterId: "r_ea_qa_with_bib",
        nickname: "배번있음",
        realName: "김배번",
        memberId: "ea_qa_member_with_bib",
        isGuest: false,
        rideType: "roundtrip",
        note: "시드왕복",
        legs: {
          outbound: { required: true, boarded: false, boardedAt: null, boardedBy: null },
          return: { required: true, boarded: false, boardedAt: null, boardedBy: null },
        },
      },
      {
        rosterId: "r_ea_qa_no_bib",
        nickname: "배번없음",
        realName: "이무번",
        memberId: "ea_qa_member_no_bib",
        isGuest: false,
        rideType: "outbound_only",
        note: null,
        legs: {
          outbound: { required: true, boarded: false, boardedAt: null, boardedBy: null },
          return: { required: false, boarded: false, boardedAt: null, boardedBy: null },
        },
      },
    ],
  };

  await db.collection("race_events").doc(EVENT_ID).set(
    {
      eventName: EVENT_NAME,
      primaryName: EVENT_NAME,
      eventDate: EVENT_DATE,
      isGroupEvent: true,
      participants,
      groupSource: { source: "smartchip", sourceId: "2026ea001" },
      groupScrapeStatus: "done",
      groupScrapeJobId: JOB_ID,
      groupScrapeTriggeredAt: new Date().toISOString(),
      busBoarding,
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log(`  [race_events/${EVENT_ID}] OK (bib 2 / no-bib 1, bus, smartchip)`);

  // 전원 무배번 — scrape → 400 "배번 등록 참가자 없음"
  await db.collection("race_events").doc(EVENT_ID_NOBIB).set(
    {
      eventName: "2026 QA event-admin 무배번만",
      primaryName: "2026 QA event-admin 무배번만",
      eventDate: EVENT_DATE,
      isGroupEvent: true,
      participants: [
        {
          memberId: "ea_qa_member_no_bib",
          realName: "이무번",
          nickname: "배번없음",
          distance: "Half",
        },
      ],
      groupSource: { source: "smartchip", sourceId: "2026ea_nobib" },
      groupScrapeStatus: "pending",
      groupScrapeJobId: null,
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log(`  [race_events/${EVENT_ID_NOBIB}] OK (no bib participants)`);

  await db.collection("scrape_jobs").doc(JOB_ID).set(
    {
      source: "smartchip",
      sourceId: "2026ea001",
      eventName: EVENT_NAME,
      eventDate: EVENT_DATE,
      status: "done",
      createdAt: new Date().toISOString(),
      results: [
        {
          memberRealName: "김배번",
          memberNickname: "배번있음",
          finishTime: "1:42:18",
          netTime: "1:42:18",
          gunTime: "1:42:50",
          distance: "Half",
          bib: "4821",
          overallRank: 42,
          gender: "M",
          status: "auto",
          source: "smartchip",
          sourceId: "2026ea001",
        },
        {
          memberRealName: "박배번",
          memberNickname: "배번둘",
          finishTime: "1:55:01",
          netTime: "1:55:01",
          gunTime: "1:55:30",
          distance: "Half",
          bib: "4822",
          overallRank: 88,
          gender: "M",
          status: "auto",
          source: "smartchip",
          sourceId: "2026ea001",
        },
      ],
    },
    { merge: true }
  );
  console.log(`  [scrape_jobs/${JOB_ID}] OK`);

  // 재실행 시 self-confirm 잔여 결과 제거 (QA가 1건 생성 검증)
  const oldSnap = await db
    .collection("race_results")
    .where("canonicalEventId", "==", EVENT_ID)
    .get();
  for (const doc of oldSnap.docs) {
    await doc.ref.delete();
  }
  if (oldSnap.size > 0) {
    console.log(`  [race_results] cleared ${oldSnap.size} for ${EVENT_ID}`);
  }

  console.log("[seed-event-admin] 완료 ✅");
  console.log(`  EVENT_ID=${EVENT_ID}`);
  console.log(`  EVENT_ID_NOBIB=${EVENT_ID_NOBIB}`);
  console.log(`  JOB_ID=${JOB_ID}`);
  process.exit(0);
})().catch((e) => {
  console.error("[seed-event-admin] 오류:", e);
  process.exit(1);
});
