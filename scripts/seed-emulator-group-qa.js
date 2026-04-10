#!/usr/bin/env node
/**
 * 단체 대회 파이프라인 QA 전용 에뮬레이터 시드
 *
 * 용도: scripts/qa-group-events.sh 실행 전 에뮬레이터에 테스트 데이터 준비
 * 사용: firebase emulators:exec 환경에서만 실행 (FIRESTORE_EMULATOR_HOST 필수)
 *
 * 생성 데이터:
 *  - members: 5명 (ok / missing / ambiguous / dns / pre_deploy_seed)
 *  - ops_meta/last_gorunning_crawl: 고러닝 예정 이벤트 2건
 *  - race_events/evt_qa_done: 스크랩 완료 단체 대회 (갭 탐지용)
 *  - race_events/evt_qa_pending: 스크랩 전 단체 대회
 *  - scrape_jobs/qa_scrape_job_001: 스크랩 결과 (ok/ambiguous/missing 혼합)
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

(async () => {
  console.log("[seed-group-qa] 시드 시작...");

  // ── 1. members ──────────────────────────────────────────────────────────
  const members = [
    { id: "pre_deploy_seed_member", nickname: "프리배포시드", realName: "PreDeploySeed", gender: "M", hidden: false, team: "" },
    { id: "qa_member_ok",           nickname: "박정확",       realName: "박정확",       gender: "M", hidden: false, team: "DMC" },
    { id: "qa_member_missing",      nickname: "김없음",       realName: "김없음",       gender: "F", hidden: false, team: "DMC" },
    { id: "qa_member_ambiguous",    nickname: "이동명인",     realName: "이동명인",     gender: "M", hidden: false, team: "DMC" },
    { id: "qa_member_dns",          nickname: "최출발없음",   realName: "최출발없음",   gender: "F", hidden: false, team: "DMC" },
  ];
  for (const m of members) {
    const { id, ...data } = m;
    await db.collection("members").doc(id).set(data, { merge: true });
    console.log(`  [members/${id}] OK`);
  }

  // ── 2. ops_meta/last_gorunning_crawl ────────────────────────────────────
  await db.collection("ops_meta").doc("last_gorunning_crawl").set({
    crawledAt: new Date().toISOString(),
    events: [
      { id: "gr_qa_future_001", name: "2026 QA 미래마라톤", date: "2026-05-10" },
      { id: "gr_qa_future_002", name: "2026 QA 하프마라톤", date: "2026-06-01" },
    ],
  }, { merge: true });
  console.log("  [ops_meta/last_gorunning_crawl] OK");

  // ── 3. race_events/evt_qa_done — 스크랩 완료 대회 (갭 탐지 테스트용) ─────
  const participantsDone = [
    { memberId: "qa_member_ok",        realName: "박정확",     nickname: "박정확" },
    { memberId: "qa_member_missing",   realName: "김없음",     nickname: "김없음" },
    { memberId: "qa_member_ambiguous", realName: "이동명인",   nickname: "이동명인" },
    { memberId: "qa_member_dns",       realName: "최출발없음", nickname: "최출발없음" },
  ];
  await db.collection("race_events").doc("evt_qa_done").set({
    eventName: "2026 QA 단체 풀마라톤",
    eventDate: "2026-04-20",
    isGroupEvent: true,
    participants: participantsDone,
    groupSource: { source: "smartchip", sourceId: "2026qa001" },
    groupScrapeJobId: "qa_scrape_job_001",
    groupScrapeStatus: "done",
    createdAt: new Date().toISOString(),
  }, { merge: true });
  console.log("  [race_events/evt_qa_done] OK");

  // ── 4. race_events/evt_qa_pending — 스크랩 전 대회 ──────────────────────
  await db.collection("race_events").doc("evt_qa_pending").set({
    eventName: "2026 QA 하프 미스크랩",
    eventDate: "2026-04-27",
    isGroupEvent: true,
    participants: [
      { memberId: "qa_member_ok",      realName: "박정확",  nickname: "박정확" },
      { memberId: "qa_member_missing", realName: "김없음",  nickname: "김없음" },
    ],
    groupSource: { source: "myresult", sourceId: "2026qa002" },
    groupScrapeStatus: "pending",
    createdAt: new Date().toISOString(),
  }, { merge: true });
  console.log("  [race_events/evt_qa_pending] OK");

  // ── 5. scrape_jobs/qa_scrape_job_001 — 스크랩 결과 ──────────────────────
  // ok: 박정확 → 결과 1건
  // ambiguous: 이동명인 → 결과 2건 (동명이인)
  // missing: 김없음, 최출발없음 → 결과 없음
  await db.collection("scrape_jobs").doc("qa_scrape_job_001").set({
    source: "smartchip",
    sourceId: "2026qa001",
    eventName: "2026 QA 단체 풀마라톤",
    eventDate: "2026-04-20",
    status: "done",
    createdAt: new Date().toISOString(),
    results: [
      {
        memberRealName: "박정확",
        memberNickname: "박정확",
        finishTime: "3:45:22",
        netTime: "3:45:22",
        gunTime: "3:46:00",
        distance: "42.195",
        bib: "1001",
        overallRank: 150,
        gender: "M",
        status: "auto",
        source: "smartchip",
        sourceId: "2026qa001",
      },
      // 동명이인: 이동명인 2건
      {
        memberRealName: "이동명인",
        memberNickname: "이동명인",
        finishTime: "3:30:10",
        netTime: "3:30:10",
        gunTime: "3:31:00",
        distance: "42.195",
        bib: "2001",
        overallRank: 88,
        gender: "M",
        status: "ambiguous",
        source: "smartchip",
        sourceId: "2026qa001",
      },
      {
        memberRealName: "이동명인",
        memberNickname: "이동명인",
        finishTime: "3:31:45",
        netTime: "3:31:45",
        gunTime: "3:32:20",
        distance: "42.195",
        bib: "2002",
        overallRank: 92,
        gender: "M",
        status: "ambiguous",
        source: "smartchip",
        sourceId: "2026qa001",
      },
    ],
  }, { merge: true });
  console.log("  [scrape_jobs/qa_scrape_job_001] OK");

  console.log("[seed-group-qa] 완료 ✅");
  process.exit(0);
})().catch((e) => {
  console.error("[seed-group-qa] 오류:", e);
  process.exit(1);
});
