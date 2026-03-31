/**
 * event_logs 기간별 퍼널 비교 (프로덕션 또는 에뮬).
 * member-stats API와 동일하게 UA 기준으로 단계 도달 수를 센다.
 * 보조: data.member가 있는 이벤트는 member 키로도 집계(search_start→complete/save %).
 *
 * 사용 (루트에서):
 *   node scripts/analyze-funnel-windows.js
 *   node scripts/analyze-funnel-windows.js --emulator
 *   node scripts/analyze-funnel-windows.js --a 2026-03-23 2026-03-25 --b 2026-03-25 2026-03-30
 *
 * 기본: A = 런칭~3/30 00:00 UTC, B = 3/30~4/1 (프로덕션에 3/30 이후 로그가 없으면 B=0)
 *
 * firebase-admin: `functions/node_modules` (createRequire)
 */
const { createRequire } = require("module");
const path = require("path");
const reqFn = createRequire(path.join(__dirname, "..", "functions", "package.json"));
const { initializeApp } = reqFn("firebase-admin/app");
const { getFirestore } = reqFn("firebase-admin/firestore");

const FUNNEL = ["page_load", "select_member", "search_start", "search_complete", "search_save"];
const EXIT_EVENTS = ["search_cancel", "search_no_result", "search_error", "search_timeout"];

function parseArgs() {
  const a = { start: "2026-03-23T00:00:00.000Z", end: "2026-03-30T00:00:00.000Z" };
  const b = { start: "2026-03-30T00:00:00.000Z", end: "2026-04-01T00:00:00.000Z" };
  const argv = process.argv.slice(2);
  const emu = argv.includes("--emulator");
  let i = argv.indexOf("--a");
  if (i >= 0 && argv[i + 2]) {
    a.start = `${argv[i + 1]}T00:00:00.000Z`;
    a.end = `${argv[i + 2]}T00:00:00.000Z`;
  }
  i = argv.indexOf("--b");
  if (i >= 0 && argv[i + 2]) {
    b.start = `${argv[i + 1]}T00:00:00.000Z`;
    b.end = `${argv[i + 2]}T00:00:00.000Z`;
  }
  return { a, b, emulator: emu };
}

function inRange(ts, start, end) {
  if (!ts || typeof ts !== "string") return false;
  return ts >= start && ts < end;
}

function aggregate(rows, start, end) {
  const uaStages = {};
  const memberStages = {};
  const exits = Object.fromEntries(EXIT_EVENTS.map((e) => [e, new Set()]));

  for (const d of rows) {
    const ts = d.timestamp || "";
    if (!inRange(ts, start, end)) continue;
    const evt = d.event || d.type || "";
    const ua = d.ua || "";
    const member = (d.data && d.data.member) || "";

    if (EXIT_EVENTS.includes(evt) && ua) {
      exits[evt].add(ua);
      continue;
    }
    if (!FUNNEL.includes(evt)) continue;
    if (ua) {
      if (!uaStages[ua]) uaStages[ua] = new Set();
      uaStages[ua].add(evt);
    }
    if (member) {
      if (!memberStages[member]) memberStages[member] = new Set();
      memberStages[member].add(evt);
    }
  }

  const funnelUa = {};
  FUNNEL.forEach((stage) => {
    funnelUa[stage] = Object.values(uaStages).filter((s) => s.has(stage)).length;
  });

  const funnelMember = {};
  FUNNEL.forEach((stage) => {
    funnelMember[stage] = Object.values(memberStages).filter((s) => s.has(stage)).length;
  });

  const exitUa = {};
  EXIT_EVENTS.forEach((e) => {
    exitUa[e] = exits[e].size;
  });

  return { funnelUa, funnelMember, exitUa, rawUa: Object.keys(uaStages).length };
}

function pct(n, d) {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

async function loadLogs(db, from, to) {
  const snap = await db.collection("event_logs")
    .where("timestamp", ">=", from)
    .where("timestamp", "<", to)
    .get();
  const rows = [];
  snap.forEach((doc) => rows.push(doc.data()));
  return rows;
}

async function main() {
  const { a, b, emulator } = parseArgs();
  if (emulator) {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    delete process.env.FIRESTORE_EMULATOR_HOST;
  }

  initializeApp({ projectId: "dmc-attendance" });
  const db = getFirestore();

  const from = a.start < b.start ? a.start : b.start;
  const to = a.end > b.end ? a.end : b.end;

  console.log(`[funnel] 대상: ${emulator ? "에뮬" : "프로덕션"}`);
  console.log(`[funnel] 로드: ${from} .. ${to} (한 번 쿼리 후 메모리에서 A/B 분할)\n`);

  const rows = await loadLogs(db, from, to);
  const aggA = aggregate(rows, a.start, a.end);
  const aggB = aggregate(rows, b.start, b.end);

  const print = (label, agg) => {
    const f = agg.funnelUa;
    const base = f.page_load || 1;
    console.log(`━━ ${label} ━━`);
    console.log(`  UA 수(방문 기준): ${agg.rawUa} (page_load 이벤트가 있는 UA: ${f.page_load})`);
    FUNNEL.forEach((stage) => {
      const n = f[stage] || 0;
      console.log(`  ${stage}: ${n} (${pct(n, base)} of page_load UA)`);
    });
    console.log("  이탈/부정 이벤트 (UA 기준 건수):");
    EXIT_EVENTS.forEach((e) => console.log(`    ${e}: ${agg.exitUa[e] || 0}`));
    const m = agg.funnelMember;
    console.log("  회원 식별자 기준 (data.member 있는 이벤트만, 실명 기준 고유 인원):");
    FUNNEL.forEach((stage) => {
      console.log(`    ${stage}: ${m[stage] || 0}`);
    });
    const ms = m.search_start || 0;
    const msDen = ms || 1;
    console.log(`    search_start(${ms}) 대비 search_complete: ${pct(m.search_complete || 0, msDen)}, save: ${pct(m.search_save || 0, msDen)}`);
    console.log("");
  };

  print(`기간 A  ${a.start.slice(0, 10)} .. ${a.end.slice(0, 10)} (end exclusive)`, aggA);
  print(`기간 B  ${b.start.slice(0, 10)} .. ${b.end.slice(0, 10)} (end exclusive)`, aggB);

  const rate = (agg) => {
    const m = agg.funnelMember;
    const s = m.search_start || 0;
    return {
      start: s,
      completePct: s ? Math.round(((m.search_complete || 0) / s) * 100) : null,
      savePct: s ? Math.round(((m.search_save || 0) / s) * 100) : null,
    };
  };
  const rA = rate(aggA);
  const rB = rate(aggB);
  console.log("━━ 요약 (회원 키 기준 search_start → complete / save) ━━");
  console.log(`  A: search_start ${rA.start}명 → complete ${rA.completePct ?? "—"}%, save ${rA.savePct ?? "—"}%`);
  console.log(`  B: search_start ${rB.start}명 → complete ${rB.completePct ?? "—"}%, save ${rB.savePct ?? "—"}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
