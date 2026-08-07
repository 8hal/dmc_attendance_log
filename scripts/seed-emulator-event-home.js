#!/usr/bin/env node
/**
 * 회원용 event-home / event-list QA용 에뮬레이터 시드
 *
 * 생성: race_events/evt_event_home_seed (isGroupEvent, dayTimeline 샘플)
 *
 * 사용:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-event-home.js
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
  console.error("FIRESTORE_EMULATOR_HOST 없음 — 에뮬레이터에서만 실행");
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const EVENT_ID = "evt_event_home_seed";

function kstTodayYmd() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/** KST 달력 기준 today + days → YYYY-MM-DD */
function kstPlusDaysYmd(days) {
  const [y, m, d] = kstTodayYmd().split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

(async () => {
  const eventDate = kstPlusDaysYmd(7);
  const payload = {
    eventName: "에뮬 단체 대회 (event-home)",
    primaryName: "에뮬 단체 대회 (event-home)",
    eventDate,
    location: "동탄 종합운동장",
    isGroupEvent: true,
    dayTimeline: [
      { time: "05:30", label: "버스 출발 (동탄)" },
      { time: "07:00", label: "대회장 도착 · 짐 보관" },
      { time: "08:00", label: "풀 출발" },
      { time: "14:00", label: "버스 복귀 집결" },
    ],
    participants: [
      { memberId: "seed_eh_member_1", realName: "김시드", nickname: "시드원", bib: "" },
      { memberId: "seed_eh_member_2", realName: "이시드", nickname: "시드투", bib: "" },
      {
        memberId: "seed_eh_member_gesal",
        realName: "게살볶음밥",
        nickname: "게살볶음밥",
        distance: "half",
        bib: "",
      },
    ],
    groupScrapeStatus: "pending",
    createdAt: new Date().toISOString(),
  };

  await db.collection("race_events").doc(EVENT_ID).set(payload, { merge: true });

  console.log(`[seed-emulator-event-home] race_events/${EVENT_ID} OK`);
  console.log(`  eventId: ${EVENT_ID}`);
  console.log(`  eventDate (KST+7d): ${eventDate}`);
  console.log(`  event-home: http://localhost:5000/event-home.html?eventId=${EVENT_ID}`);
  console.log(`  event-list: http://localhost:5000/event-list.html`);
  process.exit(0);
})().catch((e) => {
  console.error("[seed-emulator-event-home] 오류:", e);
  process.exit(1);
});
