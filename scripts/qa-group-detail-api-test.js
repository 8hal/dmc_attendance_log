#!/usr/bin/env node
/**
 * TC-003 / TC-004 — group-events detail & bulk-confirm (Firestore 에뮬 + Functions 에뮬)
 * TC-004: bulk-confirm 9케이스 (TC-004-6 재확정·docId/배번 포함)
 * 실행: firebase emulators:exec --only functions,firestore --project dmc-attendance "node scripts/qa-group-detail-api-test.js"
 */
const fs = require("fs");
const path = require("path");
const http = require("http");

const functionsDir = path.join(__dirname, "..", "functions");
const requireFromFunctions = require("module").createRequire(
  path.join(functionsDir, "node_modules", "firebase-functions", "package.json")
);

const { initializeApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore } = requireFromFunctions("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST 필요 (emulators:exec 안에서 실행)");
  process.exit(1);
}

const API = "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race";

function httpJson(method, url, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch (e) {
          return reject(new Error("Invalid JSON: " + data.slice(0, 200)));
        }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (bodyObj) req.write(JSON.stringify(bodyObj));
    req.end();
  });
}

let pass = 0;
let fail = 0;

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  ✅ " + name);
  } else {
    fail++;
    console.log("  ❌ " + name + (detail ? " — " + detail : ""));
  }
}

(async () => {
  initializeApp({ projectId: "dmc-attendance" });
  const db = getFirestore();

  const jobId = "qa_group_job_1";
  const evtOk = "qa_evt_ok";
  const evtAmb = "qa_evt_amb";
  const evtMiss = "qa_evt_miss";
  const evtConf = "qa_evt_conf";
  const evtBulk = "qa_evt_bulk";
  const evtPartial = "qa_evt_partial";
  const evtReconfirm = "qa_evt_reconfirm";

  // scrape job shared results structure
  const baseResults = [
    { memberRealName: "김매칭", netTime: "01:30:00", finishTime: "01:30:05" },
    { memberRealName: "이동명", netTime: "02:00:00", finishTime: "02:00:10" },
    { memberRealName: "이동명", netTime: "02:10:00", finishTime: "02:10:15" },
  ];

  await db.collection("scrape_jobs").doc(jobId).set({
    status: "complete",
    results: baseResults,
    eventName: "QA",
  });

  await db
    .collection("race_events")
    .doc(evtOk)
    .set({
      eventName: "QA OK",
      eventDate: "2026-04-20",
      isGroupEvent: true,
      participants: [{ realName: "김매칭", nickname: "kim" }],
      groupScrapeJobId: jobId,
      groupScrapeStatus: "done",
    });

  await db
    .collection("race_events")
    .doc(evtAmb)
    .set({
      eventName: "QA AMB",
      eventDate: "2026-04-20",
      isGroupEvent: true,
      participants: [{ realName: "이동명", nickname: "lee" }],
      groupScrapeJobId: jobId,
      groupScrapeStatus: "done",
    });

  await db
    .collection("race_events")
    .doc(evtMiss)
    .set({
      eventName: "QA MISS",
      eventDate: "2026-04-20",
      isGroupEvent: true,
      participants: [{ realName: "박없음", nickname: "park" }],
      groupScrapeJobId: jobId,
      groupScrapeStatus: "done",
    });

  const docIdConf = "김확정_10K_20260420".replace(/[^a-zA-Z0-9가-힣_]/g, "_");
  await db
    .collection("race_events")
    .doc(evtConf)
    .set({
      eventName: "QA CONF",
      eventDate: "2026-04-20",
      isGroupEvent: true,
      participants: [{ realName: "김확정", nickname: "kconf" }],
      groupScrapeJobId: jobId,
      groupScrapeStatus: "done",
    });
  await db
    .collection("race_results")
    .doc(docIdConf)
    .set({
      canonicalEventId: evtConf,
      memberRealName: "김확정",
      status: "confirmed",
      eventName: "QA CONF",
      eventDate: "2026-04-20",
    });

  // bulk-confirm test event
  await db
    .collection("race_events")
    .doc(evtBulk)
    .set({
      eventName: "QA BULK",
      eventDate: "2026-04-15",
      isGroupEvent: true,
      groupScrapeJobId: jobId,
      groupScrapeStatus: "done",
      participants: [],
    });

  await db
    .collection("race_events")
    .doc(evtPartial)
    .set({
      eventName: "QA PARTIAL",
      eventDate: "2026-04-18",
      isGroupEvent: true,
      groupScrapeJobId: jobId,
      groupScrapeStatus: "done",
      participants: [],
    });

  await db
    .collection("race_events")
    .doc(evtReconfirm)
    .set({
      eventName: "QA RECONFIRM",
      eventDate: "2026-04-19",
      isGroupEvent: true,
      groupScrapeJobId: jobId,
      groupScrapeStatus: "done",
      participants: [],
    });

  console.log("\n--- TC-003 GET detail ---\n");

  let r = await httpJson(
    "GET",
    `${API}?action=group-events&subAction=detail&eventId=${evtOk}`
  );
  ok(
    "TC-003-1: 정상 조회 ok/event/gap",
    r.status === 200 &&
      r.json.ok === true &&
      r.json.event &&
      r.json.event.id === evtOk &&
      Array.isArray(r.json.gap),
    JSON.stringify(r.json).slice(0, 120)
  );
  ok(
    "TC-003-1: confirmedCount 숫자",
    typeof r.json.confirmedCount === "number",
    String(r.json.confirmedCount)
  );

  r = await httpJson("GET", `${API}?action=group-events&subAction=detail`);
  ok(
    "TC-003-2: eventId 누락 400",
    r.status === 400 && r.json.ok === false && r.json.error === "eventId required"
  );

  r = await httpJson(
    "GET",
    `${API}?action=group-events&subAction=detail&eventId=invalid_no_such`
  );
  ok(
    "TC-003-3: 대회 없음 404",
    r.status === 404 && r.json.ok === false && r.json.error === "대회 없음"
  );

  r = await httpJson(
    "GET",
    `${API}?action=group-events&subAction=detail&eventId=${evtOk}`
  );
  const g0 = (r.json.gap || [])[0];
  ok(
    "TC-003-4: gap ok + result",
    g0 && g0.gapStatus === "ok" && g0.result && g0.result.memberRealName === "김매칭"
  );

  r = await httpJson(
    "GET",
    `${API}?action=group-events&subAction=detail&eventId=${evtAmb}`
  );
  const ga = (r.json.gap || [])[0];
  ok(
    "TC-003-5: ambiguous + candidates",
    ga &&
      ga.gapStatus === "ambiguous" &&
      Array.isArray(ga.candidates) &&
      ga.candidates.length === 2
  );

  r = await httpJson(
    "GET",
    `${API}?action=group-events&subAction=detail&eventId=${evtMiss}`
  );
  const gm = (r.json.gap || [])[0];
  ok("TC-003-6: missing", gm && gm.gapStatus === "missing");

  r = await httpJson(
    "GET",
    `${API}?action=group-events&subAction=detail&eventId=${evtConf}`
  );
  const gc = (r.json.gap || [])[0];
  ok("TC-003-7: confirmed", gc && gc.gapStatus === "confirmed");

  console.log("\n--- TC-004 POST bulk-confirm ---\n");

  const results85 = [];
  for (let i = 0; i < 85; i++) {
    results85.push({
      realName: `벌크${i}`,
      nickname: `n${i}`,
      distance: "10K",
      finishTime: "01:00:00",
      netTime: "01:00:00",
    });
  }

  r = await httpJson("POST", `${API}?action=group-events`, {
    subAction: "bulk-confirm",
    eventId: evtBulk,
    results: results85,
  });
  ok(
    "TC-004-1: 정상 저장 85",
    r.status === 200 && r.json.ok === true && r.json.saved === 85
  );

  r = await httpJson("POST", `${API}?action=group-events`, {
    subAction: "bulk-confirm",
    results: [{ realName: "x" }],
  });
  ok(
    "TC-004-2: eventId 누락 400",
    r.status === 400 && r.json.error === "eventId and results[] required"
  );

  r = await httpJson("POST", `${API}?action=group-events`, {
    subAction: "bulk-confirm",
    eventId: evtBulk,
    results: [],
  });
  ok(
    "TC-004-3: results 빈 배열 400",
    r.status === 400 && r.json.error === "eventId and results[] required"
  );

  r = await httpJson("POST", `${API}?action=group-events`, {
    subAction: "bulk-confirm",
    eventId: "nope_nope_nope",
    results: [{ realName: "a" }],
  });
  ok(
    "TC-004-4: 대회 없음 404",
    r.status === 404 && r.json.error === "대회 없음"
  );

  r = await httpJson("POST", `${API}?action=group-events`, {
    subAction: "bulk-confirm",
    eventId: evtBulk,
    results: results85,
  });
  ok(
    "TC-004-5: Idempotent 재호출 saved 85",
    r.status === 200 && r.json.ok === true && r.json.saved === 85
  );

  const firstReconfirm = [
    {
      realName: "이원기",
      nickname: "라우펜더만",
      distance: "HALF",
      finishTime: "1:45:23",
      bib: "",
    },
  ];
  r = await httpJson("POST", `${API}?action=group-events`, {
    subAction: "bulk-confirm",
    eventId: evtReconfirm,
    confirmSource: "test",
    results: firstReconfirm,
  });
  let rrSnap = await db
    .collection("race_results")
    .where("canonicalEventId", "==", evtReconfirm)
    .get();
  let forName = rrSnap.docs
    .map((d) => d.data())
    .filter((row) => row.memberRealName === "이원기");
  ok(
    "TC-004-6: 첫 확정 후 이원기 1건·배번 없음",
    r.status === 200 &&
      r.json.ok === true &&
      forName.length === 1 &&
      (forName[0].bib || "") === ""
  );

  const secondReconfirm = [{ ...firstReconfirm[0], bib: "12345" }];
  r = await httpJson("POST", `${API}?action=group-events`, {
    subAction: "bulk-confirm",
    eventId: evtReconfirm,
    confirmSource: "test",
    results: secondReconfirm,
  });
  rrSnap = await db
    .collection("race_results")
    .where("canonicalEventId", "==", evtReconfirm)
    .get();
  forName = rrSnap.docs
    .map((d) => d.data())
    .filter((row) => row.memberRealName === "이원기");
  ok(
    "TC-004-6: 재확정 후 여전히 1건·최신 bib",
    r.status === 200 &&
      r.json.ok === true &&
      forName.length === 1 &&
      forName[0].bib === "12345"
  );

  const partial = [];
  for (let i = 0; i < 83; i++) {
    partial.push({
      realName: `부분${i}`,
      nickname: `p${i}`,
      distance: "10K",
      finishTime: "01:00:00",
      netTime: "01:00:00",
    });
  }
  partial.push({ nickname: "bad1" }, { nickname: "bad2" });
  r = await httpJson("POST", `${API}?action=group-events`, {
    subAction: "bulk-confirm",
    eventId: evtPartial,
    results: partial,
  });
  ok(
    "TC-004-7: 부분 실패 207 errors message",
    r.status === 207 &&
      r.json.ok === false &&
      r.json.saved === 83 &&
      Array.isArray(r.json.errors) &&
      r.json.errors.length === 2 &&
      (r.json.message || "") === "일부 실패"
  );

  const evtDns = "qa_evt_dns";
  await db.collection("race_events").doc(evtDns).set({
    eventName: "QA DNS",
    eventDate: "2026-04-15",
    isGroupEvent: true,
    groupScrapeJobId: jobId,
    groupScrapeStatus: "done",
    participants: [],
  });
  r = await httpJson("POST", `${API}?action=group-events`, {
    subAction: "bulk-confirm",
    eventId: evtDns,
    results: [
      {
        realName: "DNS유저",
        nickname: "d",
        distance: "10K",
        dnStatus: "DNS",
      },
    ],
  });
  const dnsQ = await db
    .collection("race_results")
    .where("canonicalEventId", "==", evtDns)
    .limit(5)
    .get();
  const dnsData = dnsQ.empty ? {} : dnsQ.docs[0].data();
  ok(
    "TC-004-8: DNS status + no finishTime",
    r.json.ok === true &&
      dnsData.status === "dns" &&
      dnsData.finishTime === undefined
  );

  const evtBib = "qa_evt_bib";
  await db.collection("race_events").doc(evtBib).set({
    eventName: "QA BIB",
    eventDate: "2026-04-16",
    isGroupEvent: true,
    groupScrapeJobId: jobId,
    groupScrapeStatus: "done",
    participants: [],
  });
  r = await httpJson("POST", `${API}?action=group-events`, {
    subAction: "bulk-confirm",
    eventId: evtBib,
    results: [
      {
        realName: "배번유저",
        nickname: "b",
        distance: "10K",
        finishTime: "01:02:00",
        bib: "12345",
      },
    ],
  });
  const bibQ = await db
    .collection("race_results")
    .where("canonicalEventId", "==", evtBib)
    .limit(5)
    .get();
  const bibRow = bibQ.empty ? {} : bibQ.docs[0].data();
  ok(
    "TC-004-9: bib 저장",
    r.json.ok === true && bibRow.bib === "12345"
  );

  console.log(`\nTC-003/004 요약: ${pass} 통과, ${fail} 실패\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
