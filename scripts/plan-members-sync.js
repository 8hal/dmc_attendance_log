#!/usr/bin/env node
/**
 * 정회원 명단 동기화 계획 생성 (Firestore 인증 불필요)
 *
 * Firebase MCP로 적용할 때 사용:
 *   1) MCP로 members 전체 export → scripts/data/members-firestore-snapshot.json
 *   2) node scripts/plan-members-sync.js --baseline=scripts/data/members-firestore-snapshot.json
 *   3) Cursor Agent + Firebase MCP로 --plan-out JSON의 operations 실행
 *
 * 사용법:
 *   node scripts/plan-members-sync.js
 *   node scripts/plan-members-sync.js --baseline=scripts/data/members-2026-03-31-cleaned.json
 *   node scripts/plan-members-sync.js --plan-out=scripts/data/sync-plan-2026-06-30.json
 */

const fs = require("fs");
const path = require("path");
const {
  buildExpelledMap,
  computeSyncPlan,
  firestoreListFromBaseline,
  firestoreListFromMcpExport,
  planToOperations,
} = require("./lib/member-sync-plan");
const { anonymizedLabels } = require(path.join(__dirname, "../functions/lib/member-leave"));

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const rosterPath = path.resolve(
  getArg("roster", path.join(__dirname, "data", "members-2026-06-30-cleaned.json"))
);
const expelledPath = path.resolve(
  getArg("expelled", path.join(__dirname, "data", "members-2026-06-30-expelled.json"))
);
const baselinePath = path.resolve(
  getArg(
    "baseline",
    path.join(__dirname, "data", "members-2026-03-31-cleaned.json")
  )
);
const planOut = getArg("plan-out", "");
const defaultLeftAt = getArg("left-at", "2026-06-30");

function loadJson(p, label) {
  if (!fs.existsSync(p)) {
    console.error(`${label} 없음: ${p}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadBaseline(raw) {
  if (Array.isArray(raw) && raw[0]?.nickname !== undefined) {
    return firestoreListFromBaseline(raw);
  }
  if (Array.isArray(raw) && (raw[0]?.id || raw[0]?.docId)) {
    return firestoreListFromMcpExport(raw);
  }
  if (raw.members && Array.isArray(raw.members)) {
    return firestoreListFromMcpExport(raw.members);
  }
  throw new Error("baseline 형식을 알 수 없습니다 (cleaned JSON 또는 MCP export)");
}

const roster = loadJson(rosterPath, "명단");
const baselineRaw = loadJson(baselinePath, "baseline");
const expelledList = fs.existsSync(expelledPath) ? loadJson(expelledPath, "제명") : [];
const firestoreList = loadBaseline(baselineRaw);
const expelledMap = buildExpelledMap(expelledList);
const plan = computeSyncPlan(roster, firestoreList, expelledMap, defaultLeftAt);
const mcpPlan = planToOperations(plan);

console.log(`\n[PLAN] 정회원 명단 동기화`);
console.log(`명단: ${roster.length}명 ← ${rosterPath}`);
console.log(`baseline: ${firestoreList.length}명 ← ${baselinePath}`);
console.log(`\n=== 변경 ===`);
console.log(`신규 ${plan.toAdd.length} | 닉변경 ${plan.toUpdateNickname.length} | 복귀 ${plan.toUnhide.length} | 퇴회 ${plan.toLeave.length}`);
if (plan.warnings.length) {
  console.log(`⚠️ 경고 ${plan.warnings.length}:`, plan.warnings.join("; "));
}

if (planOut) {
  const outPath = path.resolve(planOut);
  fs.writeFileSync(outPath, JSON.stringify(mcpPlan, null, 2), "utf8");
  console.log(`\n💾 MCP 적용용 plan 저장: ${outPath}`);
  console.log(`   operations ${mcpPlan.operations.length}건`);
}

console.log(`\n다음: Cursor에서 Firebase MCP로 sync-plan operations 적용`);
console.log(`      스킬: .cursor/skills/members-sync-via-mcp/SKILL.md`);

if (plan.toLeave.length) {
  console.log(`\n퇴회 익명화 미리보기:`);
  plan.toLeave.forEach((m) => {
    const l = anonymizedLabels(m.id);
    console.log(`  ${m.realName} (${m.nickname}) → ${l.nickname}`);
  });
}
