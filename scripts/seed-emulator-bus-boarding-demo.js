#!/usr/bin/env node
/**
 * 수동 확인용 버스 탑승 데모 시드
 *
 * - members + 단체 대회(evt_bus_qa) + busBoarding enabled + CSV 명단 반영
 * - 테스트 CSV: scripts/fixtures/bus-boarding-sample.csv
 *
 * 사용:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-bus-boarding-demo.js
 *
 * 접속:
 *   http://127.0.0.1:5000/boarding-admin.html?eventId=evt_bus_qa  (pw: dmc2008)
 *   http://127.0.0.1:5000/boarding.html?eventId=evt_bus_qa
 *   http://127.0.0.1:5000/group-detail.html?eventId=evt_bus_qa
 *   http://127.0.0.1:5000/my-bib.html?eventId=evt_bus_qa
 *
 * 주의: 자동화 QA(`qa-bus-boarding.sh`)는 이 스크립트 대신
 *       `seed-emulator-bus-boarding.js`(busBoarding 없음)를 사용한다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const functionsDir = path.join(root, "functions");
const nm = path.join(functionsDir, "node_modules");
if (!fs.existsSync(nm)) {
  console.error("functions/node_modules 없음. cd functions && npm ci");
  process.exit(1);
}
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST 없음. 예: 127.0.0.1:8080");
  process.exit(1);
}

const { createRequire } = require("module");
const requireFromFunctions = createRequire(path.join(nm, "_"));
const { initializeApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore } = requireFromFunctions("firebase-admin/firestore");
const {
  emptyBusBoarding,
  mergeRosterImport,
} = require(path.join(functionsDir, "lib", "bus-boarding.js"));

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const EVENT_ID = "evt_bus_qa";
const CSV_PATH = path.join(__dirname, "fixtures", "bus-boarding-sample.csv");

function parseCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const alias = {
    닉네임: "nickname",
    nickname: "nickname",
    이름: "realName",
    실명: "realName",
    name: "realName",
    realName: "realName",
    "버스 탑승 여부": "rideTypeLabel",
    탑승: "rideTypeLabel",
    rideType: "rideTypeLabel",
    비고: "note",
    note: "note",
  };
  const fields = headers.map((h) => alias[h] || null);
  const hasNoteColumn = fields.includes("note");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const row = {};
    fields.forEach((key, idx) => {
      if (!key || key === "note") return;
      if (key === "rideTypeLabel") row.rideTypeLabel = (cols[idx] || "").trim();
      else row[key] = (cols[idx] || "").trim();
    });
    if (hasNoteColumn) {
      const noteIdx = fields.indexOf("note");
      const val = (cols[noteIdx] || "").trim();
      row.note = val === "" ? null : val;
    }
    if (row.nickname) rows.push(row);
  }
  return { headers, rows };
}

(async () => {
  console.log("[seed-bus-boarding-demo] 시작...");

  const members = [
    { id: "bus_qa_member_laufen", nickname: "라우펜더만", realName: "이원기", gender: "M", hidden: false, team: "DMC" },
    { id: "bus_qa_member_tester", nickname: "테스터", realName: "김테스터", gender: "F", hidden: false, team: "DMC" },
    { id: "qa_member_ok", nickname: "박정확", realName: "박정확", gender: "M", hidden: false, team: "DMC" },
    { id: "qa_member_missing", nickname: "김없음", realName: "김없음", gender: "F", hidden: false, team: "DMC" },
    { id: "qa_member_ambiguous", nickname: "이동명인", realName: "이동명인", gender: "M", hidden: false, team: "DMC" },
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

  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const { rows } = parseCsv(csvText);
  const memberIdByNickname = new Map(members.map((m) => [m.nickname, m.id]));
  const { roster, report } = mergeRosterImport([], rows, { memberIdByNickname });

  const busBoarding = emptyBusBoarding({ legs: ["outbound", "return"] });
  busBoarding.enabled = true;
  busBoarding.roster = roster;
  busBoarding.importMeta = {
    importedAt: new Date().toISOString(),
    rowCount: rows.length,
    sourceLabel: "bus-boarding-sample.csv",
  };

  await db.collection("race_events").doc(EVENT_ID).set(
    {
      eventName: "2026 철원 DMZ 마라톤 (에뮬 데모)",
      eventDate: "2026-09-05",
      isGroupEvent: true,
      participants,
      createdAt: new Date().toISOString(),
      busBoarding,
    },
    { merge: true }
  );

  console.log(`  [race_events/${EVENT_ID}] OK (bus enabled, roster=${roster.length})`);
  console.log(`  import report: added=${report.added} excluded=${report.excluded} errors=${report.errors.length}`);
  report.errors.forEach((e) => console.log(`    - error: ${JSON.stringify(e)}`));
  console.log("");
  console.log("CSV:", CSV_PATH);
  console.log("URL:");
  console.log(`  총무  http://127.0.0.1:5000/boarding-admin.html?eventId=${EVENT_ID}  (pw: dmc2008)`);
  console.log(`  참가자 http://127.0.0.1:5000/boarding.html?eventId=${EVENT_ID}`);
  console.log(`  허브  http://127.0.0.1:5000/group-detail.html?eventId=${EVENT_ID}`);
  console.log(`  배번  http://127.0.0.1:5000/my-bib.html?eventId=${EVENT_ID}`);
  console.log("[seed-bus-boarding-demo] 완료 ✅");
  process.exit(0);
})().catch((e) => {
  console.error("[seed-bus-boarding-demo] 오류:", e);
  process.exit(1);
});
