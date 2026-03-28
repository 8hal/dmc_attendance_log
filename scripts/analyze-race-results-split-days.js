#!/usr/bin/env node
/**
 * race_results 백업에서 같은 날짜에 서로 다른 source_sourceId(job 키)가 2개 이상인 날짜를 나열.
 * race_events 백필 후보(팀 검토용) 파악에 사용.
 *
 *   node scripts/analyze-race-results-split-days.js [race_results.json]
 *   node scripts/analyze-race-results-split-days.js backup/2026-03-28/race_results.json --json-out scripts/data/race-events-split-days.json
 *
 * sourceId는 빈 문자열도 그대로 씀(백필 스크립트는 빈 sourceId 거부 → migrate-manual-empty-sourceid.js 참고).
 */

const fs = require("fs");
const path = require("path");

function sourceKey(source, sourceId) {
  const s = source != null ? String(source) : "unknown";
  const id = sourceId != null ? String(sourceId) : "unknown";
  return `${s}_${id}`;
}

function findLatestBackup(root) {
  const backupDir = path.join(root, "backup");
  if (!fs.existsSync(backupDir)) return null;
  const days = fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const day of days) {
    const p = path.join(backupDir, day, "race_results.json");
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const args = process.argv.slice(2);
const jsonOutIdx = args.indexOf("--json-out");
let jsonOut =
  jsonOutIdx >= 0 && args[jsonOutIdx + 1] ? path.resolve(args[jsonOutIdx + 1]) : null;
const posArgs = args.filter((a, i) => a !== "--json-out" && (jsonOutIdx < 0 || i !== jsonOutIdx + 1));

const repoRoot = path.resolve(__dirname, "..");
let input = posArgs[0] ? path.resolve(posArgs[0]) : findLatestBackup(repoRoot);

if (!input || !fs.existsSync(input)) {
  console.error("사용법: node scripts/analyze-race-results-split-days.js [race_results.json] [--json-out path]");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(input, "utf8"));
/** @type {Record<string, Record<string, { count: number; names: Set<string>; sampleJobId: string }>>} */
const byDate = {};

for (const r of Object.values(data)) {
  if (r.status !== "confirmed") continue;
  const d = (r.eventDate || "").slice(0, 10);
  if (!d) continue;
  const k = sourceKey(r.source, r.sourceId);
  if (!byDate[d]) byDate[d] = {};
  if (!byDate[d][k]) {
    byDate[d][k] = { count: 0, names: new Set(), sampleJobId: r.jobId || "" };
  }
  byDate[d][k].count++;
  if (r.eventName) byDate[d][k].names.add(r.eventName);
}

const multi = Object.entries(byDate)
  .filter(([, keys]) => Object.keys(keys).length >= 2)
  .sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length);

const report = {
  backupPath: input,
  generatedAt: new Date().toISOString(),
  datesWithMultipleSourceKeys: multi.length,
  dates: multi.map(([date, keys]) => ({
    eventDate: date,
    distinctSourceKeys: Object.keys(keys).length,
    keys: Object.entries(keys)
      .map(([sk, v]) => ({
        sourceKey: sk,
        rowCount: v.count,
        eventNames: [...v.names].sort(),
        sampleJobId: v.sampleJobId,
      }))
      .sort((a, b) => b.rowCount - a.rowCount),
  })),
};

console.log(`입력: ${input}`);
console.log(`confirmed 기준, 같은 날짜에 job 키 2개 이상인 날짜: ${multi.length}일\n`);

for (const { eventDate, distinctSourceKeys, keys } of report.dates.slice(0, 30)) {
  console.log(`${eventDate}  (키 ${distinctSourceKeys}개)`);
  for (const row of keys) {
    const names = row.eventNames.slice(0, 3).join(" | ");
    console.log(
      `  ${row.sourceKey}  rows=${row.rowCount}  names=${names}${row.eventNames.length > 3 ? " …" : ""}`
    );
  }
  console.log("");
}
if (report.dates.length > 30) {
  console.log(`… 외 ${report.dates.length - 30}일은 --json-out 로 전체 확인\n`);
}

if (jsonOut) {
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2), "utf8");
  console.log(`JSON 저장: ${jsonOut}`);
}
