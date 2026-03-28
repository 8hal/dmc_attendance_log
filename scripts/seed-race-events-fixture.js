#!/usr/bin/env node
/**
 * race_events 병합 스모크용 픽스처 (에뮬레이터 전용).
 *
 * 사용:
 *   export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 *   node scripts/seed-race-events-fixture.js --dry-run
 *   node scripts/seed-race-events-fixture.js
 *
 * 동일 canonicalEventId로 smartchip / manual 두 키를 매핑하고,
 * race_results 2행을 넣어 confirmed-races에서 카드 1개로 묶이는지 확인할 수 있다.
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const DRY_RUN = process.argv.includes("--dry-run");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "FIRESTORE_EMULATOR_HOST 가 없습니다. 프로덕션 오염 방지를 위해 에뮬레이터에서만 실행합니다."
  );
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const FIXTURE_TAG = "fixture_race_events_smoke";
const CANONICAL_ID = "evt_2026-03-15_fixture-merge";
const SMART_KEY = { source: "smartchip", sourceId: "fixture_smart_001" };
const MANUAL_KEY = { source: "manual", sourceId: "fixture_manual_001" };

(async () => {
  const now = new Date().toISOString();

  const eventPayload = {
    primaryName: "픽스처 병합 대회",
    eventDate: "2026-03-15",
    sourceMappings: [
      { source: SMART_KEY.source, sourceId: SMART_KEY.sourceId },
      { source: MANUAL_KEY.source, sourceId: MANUAL_KEY.sourceId },
    ],
    createdAt: now,
    _fixtureTag: FIXTURE_TAG,
  };

  const r1 = {
    jobId: `${SMART_KEY.source}_${SMART_KEY.sourceId}`,
    eventName: "픽스처 스마트칩명",
    eventDate: "2026-03-15",
    source: SMART_KEY.source,
    sourceId: SMART_KEY.sourceId,
    memberRealName: "FixtureRunner",
    memberNickname: "픽스러너",
    distance: "full",
    netTime: "03:30:00",
    gunTime: "",
    bib: "1",
    overallRank: null,
    gender: "M",
    pbConfirmed: false,
    isGuest: false,
    note: "",
    status: "confirmed",
    confirmedAt: now,
    confirmSource: FIXTURE_TAG,
  };

  const r2 = {
    jobId: `${MANUAL_KEY.source}_${MANUAL_KEY.sourceId}`,
    eventName: "픽스처 수동명",
    eventDate: "2026-03-15",
    source: MANUAL_KEY.source,
    sourceId: MANUAL_KEY.sourceId,
    memberRealName: "FixtureRunner2",
    memberNickname: "픽스러너2",
    distance: "half",
    netTime: "01:45:00",
    gunTime: "",
    bib: "2",
    overallRank: null,
    gender: "F",
    pbConfirmed: false,
    isGuest: false,
    note: "",
    status: "confirmed",
    confirmedAt: now,
    confirmSource: FIXTURE_TAG,
    _fixtureTag: FIXTURE_TAG,
  };

  const safe = (name, dist, date) =>
    `${name.replace(/[^a-zA-Z0-9가-힣]/g, "_")}_${dist.replace(/[^a-zA-Z0-9]/g, "_")}_${date.replace(/[^0-9\-]/g, "")}`;

  const id1 = safe(r1.memberRealName, r1.distance, r1.eventDate);
  const id2 = safe(r2.memberRealName, r2.distance, r2.eventDate);

  console.log("race_events:", CANONICAL_ID, DRY_RUN ? "(dry-run)" : "");
  console.log("race_results:", id1, id2, DRY_RUN ? "(dry-run)" : "");

  if (DRY_RUN) {
    console.log("\nDRY RUN — 쓰기 생략.");
    process.exit(0);
  }

  const batch = db.batch();
  batch.set(db.collection("race_events").doc(CANONICAL_ID), eventPayload);
  batch.set(db.collection("race_results").doc(id1), r1);
  batch.set(db.collection("race_results").doc(id2), r2);
  await batch.commit();
  console.log("\n✅ 시드 완료. race?action=confirmed-races 로 카드 1개·참가 2명 확인.");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
