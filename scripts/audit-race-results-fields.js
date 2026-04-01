#!/usr/bin/env node
/**
 * race_results confirmed 행 필드 무결성 진단
 * — 필수 필드 누락, 허용 값 위반, 고아 jobId, canonicalEventId 백필률 등
 *
 * 사용:
 *   node scripts/audit-race-results-fields.js              # 프로덕션
 *   node scripts/audit-race-results-fields.js --emulator
 *   node scripts/audit-race-results-fields.js --verbose    # 이슈 행 상세 출력
 */
const fs = require("fs");
const path = require("path");
const functionsDir = path.join(__dirname, "..", "functions");
require("module").globalPaths.unshift(path.join(functionsDir, "node_modules"));

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const APPLY = false; // 이 스크립트는 읽기 전용
const useEmulator = process.argv.includes("--emulator");
const verbose = process.argv.includes("--verbose");

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
} else if (process.env.FIRESTORE_EMULATOR_HOST) {
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

// ── 규칙 정의 ────────────────────────────────────────────────────────────────

const VALID_SOURCES = new Set(["smartchip", "myresult", "spct", "marazone", "manual"]);
const VALID_STATUSES = new Set(["confirmed", "auto", "ambiguous"]);
const VALID_CONFIRM_SOURCES = new Set(["personal", "event", "suggestion", "other"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;

function isEmpty(v) {
  return v === undefined || v === null || String(v).trim() === "";
}

// ── 체크 목록 (함수명 → 설명) ────────────────────────────────────────────────
const CHECKS = [
  {
    id: "missing_eventName",
    desc: "eventName 누락",
    fn: (d) => isEmpty(d.eventName),
  },
  {
    id: "missing_eventDate",
    desc: "eventDate 누락",
    fn: (d) => isEmpty(d.eventDate),
  },
  {
    id: "bad_eventDate_format",
    desc: "eventDate 형식 불량 (YYYY-MM-DD 아님)",
    fn: (d) => !isEmpty(d.eventDate) && !DATE_RE.test(String(d.eventDate).trim()),
  },
  {
    id: "missing_memberRealName",
    desc: "memberRealName 누락",
    fn: (d) => isEmpty(d.memberRealName),
  },
  {
    id: "missing_distance",
    desc: "distance 누락",
    fn: (d) => isEmpty(d.distance),
  },
  {
    id: "missing_source",
    desc: "source 누락",
    fn: (d) => isEmpty(d.source),
  },
  {
    id: "invalid_source",
    desc: "source가 허용 5종 밖",
    fn: (d) => !isEmpty(d.source) && !VALID_SOURCES.has(d.source),
  },
  {
    id: "missing_sourceId",
    desc: "sourceId 누락",
    fn: (d) => isEmpty(d.sourceId),
  },
  {
    id: "missing_jobId",
    desc: "jobId 누락",
    fn: (d) => isEmpty(d.jobId),
  },
  {
    id: "no_time",
    desc: "시간 3종(netTime/gunTime/finishTime) 모두 빈 값",
    fn: (d) => isEmpty(d.netTime) && isEmpty(d.gunTime) && isEmpty(d.finishTime),
  },
  {
    id: "invalid_confirmSource",
    desc: "confirmSource가 허용 값 밖",
    fn: (d) => !isEmpty(d.confirmSource) && !VALID_CONFIRM_SOURCES.has(d.confirmSource),
  },
  {
    id: "missing_confirmedAt",
    desc: "confirmedAt 누락",
    fn: (d) => isEmpty(d.confirmedAt),
  },
];

async function main() {
  console.log(`[audit] 대상: ${useEmulator ? "에뮬" : "프로덕션"}\n`);

  // 1. race_results confirmed 전수 로딩
  const rrSnap = await db.collection("race_results").where("status", "==", "confirmed").get();
  const total = rrSnap.size;
  console.log(`확정 행(confirmed): ${total}건\n`);

  // 2. scrape_jobs id 집합 (고아 jobId 판정용)
  const jobsSnap = await db.collection("scrape_jobs").get();
  const jobIdSet = new Set();
  jobsSnap.forEach((d) => jobIdSet.add(d.id));

  // 3. members realName 집합 (고스트 회원 판정용)
  const membersSnap = await db.collection("members").get();
  const memberNameSet = new Set();
  membersSnap.forEach((d) => {
    const m = d.data();
    if (m.realName) memberNameSet.add(m.realName);
  });

  // ── 집계 ────────────────────────────────────────────────────────────────
  const results = {};
  CHECKS.forEach((c) => { results[c.id] = []; });

  const orphanJobId = [];       // jobId가 scrape_jobs에 없는 행
  const ghostMember = [];       // memberRealName이 members에 없는 행
  let withCanonical = 0;
  const sourceCount = {};
  const distanceCount = {};
  const confirmSourceCount = {};

  rrSnap.forEach((doc) => {
    const d = doc.data();
    const id = doc.id;

    CHECKS.forEach((c) => {
      if (c.fn(d)) results[c.id].push({ id, data: d });
    });

    // 고아 jobId
    if (!isEmpty(d.jobId) && !jobIdSet.has(d.jobId)) {
      orphanJobId.push({ id, jobId: d.jobId, eventName: d.eventName, memberRealName: d.memberRealName });
    }

    // 고스트 회원
    if (!isEmpty(d.memberRealName) && !memberNameSet.has(d.memberRealName)) {
      ghostMember.push({ id, memberRealName: d.memberRealName, eventName: d.eventName });
    }

    if (!isEmpty(d.canonicalEventId)) withCanonical++;

    const src = d.source || "(없음)";
    sourceCount[src] = (sourceCount[src] || 0) + 1;

    const dist = d.distance || "(없음)";
    distanceCount[dist] = (distanceCount[dist] || 0) + 1;

    const cs = d.confirmSource || "(없음)";
    confirmSourceCount[cs] = (confirmSourceCount[cs] || 0) + 1;
  });

  // ── 출력 ────────────────────────────────────────────────────────────────
  console.log("━━ 필수 필드 / 허용 값 검사 ━━");
  let anyIssue = false;
  CHECKS.forEach((c) => {
    const n = results[c.id].length;
    if (n > 0) {
      anyIssue = true;
      console.log(`  ❌ [${c.id}] ${c.desc}: ${n}건`);
      if (verbose) {
        results[c.id].slice(0, 5).forEach((r) =>
          console.log(`       docId=${r.id} | ${r.data.memberRealName || "?"} | ${r.data.eventName || "?"} | eventDate=${r.data.eventDate || "?"} | source=${r.data.source || "?"}`));
      }
    } else {
      console.log(`  ✅ [${c.id}] ${c.desc}: 0건`);
    }
  });
  if (!anyIssue) console.log("  ✅ 모든 기본 체크 통과");

  console.log("");
  console.log("━━ 참조 무결성 ━━");
  console.log(`  고아 jobId (scrape_jobs에 없음): ${orphanJobId.length}건`);
  if (verbose && orphanJobId.length > 0) {
    orphanJobId.slice(0, 10).forEach((r) =>
      console.log(`    docId=${r.id} | jobId=${r.jobId} | ${r.memberRealName} | ${r.eventName}`));
  }
  console.log(`  고스트 회원 (members에 없는 realName): ${ghostMember.length}건`);
  if (verbose && ghostMember.length > 0) {
    ghostMember.slice(0, 10).forEach((r) =>
      console.log(`    docId=${r.id} | realName=${r.memberRealName} | ${r.eventName}`));
  }

  console.log("");
  console.log("━━ canonicalEventId 백필률 ━━");
  console.log(`  있음: ${withCanonical}건 / ${total}건 (${Math.round(withCanonical / total * 100)}%)`);
  console.log(`  없음: ${total - withCanonical}건`);

  console.log("");
  console.log("━━ source 분포 ━━");
  Object.entries(sourceCount).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}건 (${Math.round(v / total * 100)}%)`));

  console.log("");
  console.log("━━ distance 분포 (상위 15) ━━");
  Object.entries(distanceCount).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([k, v]) => console.log(`  ${k}: ${v}건`));

  console.log("");
  console.log("━━ confirmSource 분포 ━━");
  Object.entries(confirmSourceCount).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}건 (${Math.round(v / total * 100)}%)`));

  // ── JSON 저장 ────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const outPath = path.join(__dirname, "..", "_docs", "log", `${today}-race-results-audit.json`);
  const out = {
    capturedAt: new Date().toISOString(),
    environment: useEmulator ? "emulator" : "production",
    total,
    checks: Object.fromEntries(CHECKS.map((c) => [c.id, results[c.id].length])),
    orphanJobId: orphanJobId.length,
    ghostMember: ghostMember.length,
    canonicalEventIdFilled: withCanonical,
    canonicalEventIdMissing: total - withCanonical,
    sourceCount,
    distanceCount,
    confirmSourceCount,
    orphanJobIdSamples: orphanJobId.slice(0, 20),
    ghostMemberSamples: ghostMember.slice(0, 20),
    issueDetails: Object.fromEntries(
      CHECKS.filter((c) => results[c.id].length > 0).map((c) => [
        c.id,
        results[c.id].slice(0, 20).map((r) => ({
          docId: r.id,
          memberRealName: r.data.memberRealName,
          eventName: r.data.eventName,
          eventDate: r.data.eventDate,
          source: r.data.source,
          distance: r.data.distance,
          jobId: r.data.jobId,
        })),
      ])
    ),
  };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n결과 저장: ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
