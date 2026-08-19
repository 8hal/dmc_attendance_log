#!/usr/bin/env node
/**
 * 2026 버스 명단 + 2025 SPCT 샌드박스 에뮬 시드
 *
 * - 참가자 = 버스 명단 (배번 비움 → 수동 입력 후 스크랩)
 * - groupSource = 2025 철원 SPCT (2026 기록 사이트 미확정, 기술 검증만)
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-cheorwon-tech-check.js
 *
 * 접속:
 *   http://127.0.0.1:5000/event-admin.html?eventId=evt_cheorwon_tech
 *   http://127.0.0.1:5000/event-home.html?eventId=evt_cheorwon_tech
 *   http://127.0.0.1:5000/boarding.html?eventId=evt_cheorwon_tech
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

const EVENT_ID = "evt_cheorwon_tech";
const BUS_CSV = path.join(__dirname, "fixtures", "cheorwon-2026-bus.csv");

function parseCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const headers = lines[0].split(",").map((h) => h.trim());
  const alias = {
    닉네임: "nickname",
    이름: "realName",
    "버스 탑승 여부": "rideTypeLabel",
    중식: "_lunch",
    비고: "note",
  };
  const fields = headers.map((h) => alias[h] || null);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const row = { nickname: "", realName: "", rideTypeLabel: "", note: null };
    fields.forEach((key, idx) => {
      if (!key || key === "_lunch") return;
      row[key] = (cols[idx] || "").trim();
    });
    if (row.nickname) rows.push(row);
  }
  return rows;
}

(async () => {
  const importRows = parseCsv(fs.readFileSync(BUS_CSV, "utf8"));
  const members = importRows.map((r, idx) => ({
    id: `cheorwon_tech_${idx + 1}`,
    nickname: r.nickname,
    realName: r.realName,
    hidden: false,
    gender: "",
    team: "DMC",
  }));
  const memberIdByNickname = new Map(members.map((m) => [m.nickname, m.id]));

  const batch = db.batch();
  for (const m of members) {
    batch.set(db.collection("members").doc(m.id), m, { merge: true });
  }

  const { roster, report } = mergeRosterImport([], importRows, {
    memberIdByNickname,
  });
  const busBoarding = {
    ...emptyBusBoarding(),
    enabled: true,
    roster,
    importMeta: {
      importedAt: new Date().toISOString(),
      rowCount: roster.length,
      sourceLabel: "cheorwon-2026-bus.csv",
    },
  };

  const participants = importRows.map((r) => ({
    memberId: memberIdByNickname.get(r.nickname) || null,
    nickname: r.nickname,
    realName: r.realName,
    bib: "",
    distance: "",
  }));

  batch.set(db.collection("race_events").doc(EVENT_ID), {
    isGroupEvent: true,
    eventName: "철원 기술검증 (버스=2026명단 / 기록=2025 SPCT)",
    eventDate: "2025-09-21",
    location: "철원",
    participants,
    groupSource: { source: "spct", sourceId: "2025092102" },
    busBoarding,
    groupScrapeJobId: null,
    groupScrapeStatus: null,
  });

  await batch.commit();
  console.log("[seed-cheorwon-tech] ok", {
    eventId: EVENT_ID,
    members: members.length,
    busRoster: roster.length,
    importReport: report,
    participants: participants.length,
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
