/**
 * 2026-06-30 정회원 명단(176명) Firestore 동기화
 *
 * - 신규 추가 / 닉네임 변경 / 복귀(unhide)
 * - 명단 제외 회원: 퇴회 처리(익명화) — _docs/superpowers/policies/member-leave-anonymization-policy.md
 *
 * 사용법:
 *   node scripts/sync-members-2026-06-30.js --dry-run
 *   node scripts/sync-members-2026-06-30.js
 *
 * Firestore 없이 diff만 (3/31 명단을 DB 대용):
 *   node scripts/sync-members-2026-06-30.js --dry-run --offline-baseline=scripts/data/members-2026-03-31-cleaned.json
 *
 * 옵션:
 *   --roster=path.json
 *   --expelled=path.json
 *   --left-at=YYYY-MM-DD
 *   --offline-baseline=path.json  Firestore 대신 JSON으로 비교 (인증 불필요)
 *   --credentials=path.json       서비스 계정 키 (GOOGLE_APPLICATION_CREDENTIALS 대체)
 *
 * 프로덕션 인증 (Node 스크립트 — Firebase MCP와 별개):
 *   functions/service-account.json  또는  --credentials=경로
 *   또는  export GOOGLE_APPLICATION_CREDENTIALS=경로/to/key.json
 */

const fs = require("fs");
const path = require("path");

const functionsDir = path.join(__dirname, "..", "functions");
const { applyMemberLeave, isAlreadyAnonymized, anonymizedLabels } = require(
  path.join(functionsDir, "lib", "member-leave")
);

const dryRun = process.argv.includes("--dry-run");
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
const offlineBaselinePath = getArg("offline-baseline", "");
const defaultLeftAt = getArg("left-at", "2026-06-30");

function resolveServiceAccountPath() {
  const explicit = getArg("credentials", "");
  if (explicit) {
    const p = path.resolve(explicit);
    if (!fs.existsSync(p)) {
      console.error(`--credentials 파일 없음: ${p}`);
      process.exit(1);
    }
    return p;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const p = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (fs.existsSync(p)) return p;
  }
  const candidates = [
    path.join(functionsDir, "service-account.json"),
    path.join(__dirname, "service-account.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function printAuthHelp() {
  console.error("\n❌ Firestore 인증 키가 없습니다.");
  console.error("\nFirebase MCP(초록)는 Cursor AI용이고, 이 Node 스크립트는 별도 키가 필요합니다.");
  console.error("\n【가장 쉬운 방법】");
  console.error("  1) Firebase Console → dmc-attendance → ⚙️ 프로젝트 설정 → 서비스 계정");
  console.error("  2) 「새 비공개 키 생성」→ JSON 다운로드");
  console.error("  3) 아래 중 하나:");
  console.error("     cp ~/Downloads/키파일.json functions/service-account.json");
  console.error("     node scripts/sync-members-2026-06-30.js --dry-run --credentials=~/Downloads/키파일.json");
  console.error("\n【인증 없이】");
  console.error("  단위 테스트: npm run test:members-sync");
  console.error("  plan 생성:   node scripts/plan-members-sync.js");
  console.error("  에뮬 통합:   bash scripts/test-members-sync-emulator.sh");
  console.error("  offline diff: node scripts/sync-members-2026-06-30.js --dry-run --offline-baseline=scripts/data/members-2026-03-31-cleaned.json");
  console.error("\n【프로덕션】");
  console.error("  MCP: .cursor/skills/members-sync-via-mcp/SKILL.md");
  console.error("  또는 functions/service-account.json / --credentials=");
}

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} 없음: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildExpelledMap(expelledList) {
  const map = new Map();
  (expelledList || []).forEach((row) => {
    const key = String(row.realName || "").trim();
    if (key) map.set(key, row);
  });
  return map;
}

function findActiveByNickReal(firestoreList, nickname, realName) {
  return firestoreList.filter(
    (fm) =>
      !fm.hidden &&
      !isAlreadyAnonymized(fm._raw) &&
      fm.realName === realName &&
      fm.nickname === nickname
  );
}

function findActiveByReal(firestoreList, realName) {
  return firestoreList.filter(
    (fm) => !fm.hidden && !isAlreadyAnonymized(fm._raw) && fm.realName === realName
  );
}

function findHiddenRestorable(firestoreList, nickname, realName) {
  return firestoreList.filter(
    (fm) =>
      fm.hidden &&
      !isAlreadyAnonymized(fm._raw) &&
      fm.realName === realName &&
      fm.nickname === nickname
  );
}

function firestoreListFromBaseline(baseline) {
  return baseline.map((m, i) => {
    const id = m.id || `baseline_${String(i + 1).padStart(3, "0")}`;
    const nickname = m.nickname;
    const realName = m.realName;
    return {
      id,
      realName,
      nickname,
      hidden: m.hidden || false,
      _raw: { nickname, realName, hidden: m.hidden || false },
    };
  });
}

function computeSyncPlan(roster, firestoreList, expelledMap, defaultLeftAtValue) {
  const matched = new Set();
  const toAdd = [];
  const toUnhide = [];
  const toUpdateNickname = [];
  const warnings = [];

  roster.forEach((m) => {
    const { nickname, realName } = m;

    const exactActive = findActiveByNickReal(firestoreList, nickname, realName);
    if (exactActive.length === 1) {
      matched.add(exactActive[0].id);
      return;
    }
    if (exactActive.length > 1) {
      warnings.push(`중복 active (닉+실명): ${nickname} (${realName})`);
      return;
    }

    const byReal = findActiveByReal(firestoreList, realName);
    if (byReal.length === 1 && byReal[0].nickname !== nickname) {
      matched.add(byReal[0].id);
      toUpdateNickname.push({
        id: byReal[0].id,
        realName,
        oldNickname: byReal[0].nickname,
        newNickname: nickname,
      });
      return;
    }
    if (byReal.length > 1) {
      warnings.push(`닉 변경 불가(동명이인 ${byReal.length}명): ${realName} → "${nickname}"`);
      return;
    }

    const hiddenRestore = findHiddenRestorable(firestoreList, nickname, realName);
    if (hiddenRestore.length === 1) {
      matched.add(hiddenRestore[0].id);
      toUnhide.push({ id: hiddenRestore[0].id, nickname, realName });
      return;
    }

    toAdd.push(m);
  });

  const toLeave = [];
  for (const fm of firestoreList) {
    if (fm.hidden || isAlreadyAnonymized(fm._raw)) continue;
    if (matched.has(fm.id)) continue;
    const expelled = expelledMap.get(fm.realName);
    toLeave.push({
      id: fm.id,
      nickname: fm.nickname,
      realName: fm.realName,
      leaveReason: expelled?.leaveReason || "withdrawn",
      leftAt: expelled?.leftAt || defaultLeftAtValue,
      note: expelled?.note || "",
    });
  }

  return { matched, toAdd, toUnhide, toUpdateNickname, toLeave, warnings };
}

function printPlan(plan, modeLabel) {
  const { matched, toAdd, toUnhide, toUpdateNickname, toLeave, warnings } = plan;

  console.log(`\n[${modeLabel}] 2026-06-30 정회원 명단 동기화`);
  console.log(`명단: (로드됨)`);
  console.log(`퇴회일 기본값: ${defaultLeftAt}\n`);

  console.log("=== 변경 사항 ===\n");
  console.log(`✅ 신규: ${toAdd.length}명`);
  console.log(`✏️  닉 변경: ${toUpdateNickname.length}명`);
  console.log(`🔄 복귀: ${toUnhide.length}명`);
  console.log(`🚪 퇴회(익명화): ${toLeave.length}명`);
  console.log(`➖ 유지: ${matched.size - toUpdateNickname.length - toUnhide.length}명\n`);

  if (toAdd.length) {
    console.log("=== 신규 회원 ===");
    toAdd.forEach((m, i) => console.log(`${i + 1}. ${m.nickname} (${m.realName})`));
  }
  if (toUpdateNickname.length) {
    console.log("\n=== 닉네임 변경 ===");
    toUpdateNickname.forEach((m, i) =>
      console.log(`${i + 1}. ${m.realName}: "${m.oldNickname}" → "${m.newNickname}"`)
    );
  }
  if (toUnhide.length) {
    console.log("\n=== 복귀 ===");
    toUnhide.forEach((m, i) => console.log(`${i + 1}. ${m.nickname} (${m.realName})`));
  }
  if (toLeave.length) {
    console.log("\n=== 퇴회(익명화) ===");
    toLeave.forEach((m, i) => {
      const tag = m.leaveReason === "expelled" ? " [제명]" : "";
      console.log(`${i + 1}. ${m.nickname} (${m.realName})${tag}`);
      if (m.note) console.log(`    ${m.note}`);
    });
  }
  if (warnings.length) {
    console.log("\n=== ⚠️ 경고 ===");
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
}

async function initFirestoreDb() {
  const functionsNodeModules = path.join(functionsDir, "node_modules");
  if (!fs.existsSync(functionsNodeModules)) {
    console.error("functions/node_modules 가 없습니다. cd functions && npm ci");
    process.exit(1);
  }

  const { createRequire } = require("module");
  const reqFn = createRequire(path.join(functionsDir, "package.json"));
  const { initializeApp, cert } = reqFn("firebase-admin/app");
  const { getFirestore } = reqFn("firebase-admin/firestore");

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: "dmc-attendance" });
    console.log(`인증: Firestore 에뮬레이터 (${process.env.FIRESTORE_EMULATOR_HOST})`);
    return getFirestore();
  }

  const serviceAccountPath = resolveServiceAccountPath();
  if (!serviceAccountPath) {
    printAuthHelp();
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  initializeApp({ credential: cert(serviceAccount), projectId: "dmc-attendance" });
  console.log(`인증: ${serviceAccountPath}`);
  return getFirestore();
}

async function loadFirestoreMembers(db) {
  const membersSnap = await db.collection("members").get();
  const firestoreList = [];
  membersSnap.forEach((doc) => {
    const data = doc.data();
    firestoreList.push({
      id: doc.id,
      realName: data.realName,
      nickname: data.nickname,
      hidden: data.hidden || false,
      _raw: data,
    });
  });
  return firestoreList;
}

async function syncMembers() {
  const roster = loadJson(rosterPath, "명단 JSON");
  const expelledList = fs.existsSync(expelledPath) ? loadJson(expelledPath, "제명 JSON") : [];
  const expelledMap = buildExpelledMap(expelledList);

  if (offlineBaselinePath) {
    const baseline = loadJson(path.resolve(offlineBaselinePath), "offline baseline");
    const firestoreList = firestoreListFromBaseline(baseline);
    const plan = computeSyncPlan(roster, firestoreList, expelledMap, defaultLeftAt);

    console.log(`\n[OFFLINE] baseline ${firestoreList.length}명 ← ${path.resolve(offlineBaselinePath)}`);
    console.log(`명단: ${roster.length}명 ← ${rosterPath}`);
    if (expelledMap.size) console.log(`제명 목록: ${expelledMap.size}명 ← ${expelledPath}`);

    printPlan(plan, dryRun ? "DRY RUN · OFFLINE" : "OFFLINE");

    if (dryRun && plan.toLeave.length) {
      console.log("\n--- 퇴회 익명화 미리보기 (offline — attendance/race_results 건수 미조회) ---");
      plan.toLeave.forEach((m) => {
        const labels = anonymizedLabels(m.id);
        console.log(`  ${m.realName} → 닉 ${labels.nickname}, 실명 ${labels.realName}`);
      });
    }

    console.log(
      "\n※ offline은 baseline JSON 대비 diff입니다. 프로덕션 건수는 service-account.json 준비 후 --dry-run 으로 확인하세요."
    );
    if (dryRun) {
      console.log("\n프로덕션 dry-run: node scripts/sync-members-2026-06-30.js --dry-run");
    }
    return;
  }

  const db = await initFirestoreDb();
  const firestoreList = await loadFirestoreMembers(db);
  const plan = computeSyncPlan(roster, firestoreList, expelledMap, defaultLeftAt);

  console.log(`\n[${dryRun ? "DRY RUN" : "실행"}] 2026-06-30 정회원 명단 동기화`);
  console.log(`명단: ${roster.length}명 ← ${rosterPath}`);
  if (expelledMap.size) console.log(`제명 목록: ${expelledMap.size}명 ← ${expelledPath}`);
  console.log(`Firestore members: ${firestoreList.length}건 (hidden 포함)\n`);

  printPlan(plan, dryRun ? "DRY RUN" : "실행");

  if (dryRun) {
    console.log("\n--- 퇴회 상세(dry-run) ---");
    for (const m of plan.toLeave) {
      const fm = firestoreList.find((f) => f.id === m.id);
      const result = await applyMemberLeave(db, {
        memberId: m.id,
        memberData: fm?._raw,
        leaveReason: m.leaveReason,
        leftAt: m.leftAt,
        dryRun: true,
      });
      if (result.preview) {
        console.log(
          `  ${m.realName}: attendance ${result.preview.attendanceCount}건, race_results ${result.preview.raceResultsCount}건 → ${result.preview.after.nickname}`
        );
      }
    }
    console.log("\n실행: node scripts/sync-members-2026-06-30.js");
    return;
  }

  console.log("\n=== 실행 ===\n");

  for (const m of plan.toAdd) {
    const ref = db.collection("members").doc();
    await ref.set({
      realName: m.realName,
      nickname: m.nickname,
      hidden: false,
      gender: "",
      team: "",
      createdAt: new Date().toISOString(),
    });
    console.log(`✅ 신규: ${m.nickname} (${m.realName})`);
  }

  for (const m of plan.toUpdateNickname) {
    await db.collection("members").doc(m.id).update({
      nickname: m.newNickname,
      updatedAt: new Date().toISOString(),
    });
    console.log(`✏️  닉 변경: ${m.realName} "${m.oldNickname}" → "${m.newNickname}"`);
  }

  for (const m of plan.toUnhide) {
    await db.collection("members").doc(m.id).update({
      hidden: false,
      updatedAt: new Date().toISOString(),
    });
    console.log(`🔄 복귀: ${m.nickname} (${m.realName})`);
  }

  for (const m of plan.toLeave) {
    const result = await applyMemberLeave(db, {
      memberId: m.id,
      leaveReason: m.leaveReason,
      leftAt: m.leftAt,
      dryRun: false,
    });
    const p = result.preview;
    console.log(
      `🚪 퇴회: ${p.before.nickname} (${p.before.realName}) → ${p.after.nickname} | attendance ${p.attendanceCount}건, race_results ${p.raceResultsCount}건`
    );
  }

  console.log("\n✅ 완료");
}

syncMembers().catch((err) => {
  console.error("❌ 오류:", err.message || err);
  if (String(err.message || "").includes("default credentials") || String(err.message || "").includes("Could not load")) {
    printAuthHelp();
  }
  process.exit(1);
});
