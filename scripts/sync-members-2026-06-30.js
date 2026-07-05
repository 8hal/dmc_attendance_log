/**
 * 2026-06-30 정회원 명단(176명) Firestore 동기화
 *
 * - 신규 추가 / 닉네임 변경 / 복귀(unhide)
 * - 명단 제외 회원: 퇴회 처리(익명화) — _docs/superpowers/policies/member-leave-anonymization-policy.md
 *
 * 전제:
 *   scripts/data/members-2026-06-30-cleaned.json  (preprocess-members-excel.py)
 *   scripts/data/members-2026-06-30-expelled.json (제명 leaveReason, 선택)
 *
 * 사용법:
 *   node scripts/sync-members-2026-06-30.js --dry-run
 *   node scripts/sync-members-2026-06-30.js
 *
 * 옵션:
 *   --roster=path.json   명단 JSON (기본: members-2026-06-30-cleaned.json)
 *   --expelled=path.json 제명 목록 (기본: members-2026-06-30-expelled.json)
 *   --left-at=YYYY-MM-DD 퇴회일 (기본: 2026-06-30)
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const { applyMemberLeave, isAlreadyAnonymized } = require("../functions/lib/member-leave");

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
const defaultLeftAt = getArg("left-at", "2026-06-30");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

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

async function syncMembers() {
  const roster = loadJson(rosterPath, "명단 JSON");
  const expelledList = fs.existsSync(expelledPath) ? loadJson(expelledPath, "제명 JSON") : [];
  const expelledMap = buildExpelledMap(expelledList);

  console.log(`\n[${dryRun ? "DRY RUN" : "실행"}] 2026-06-30 정회원 명단 동기화`);
  console.log(`명단: ${roster.length}명 ← ${rosterPath}`);
  if (expelledMap.size) console.log(`제명 목록: ${expelledMap.size}명 ← ${expelledPath}`);
  console.log(`퇴회일 기본값: ${defaultLeftAt}\n`);

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

  console.log(`Firestore members: ${firestoreList.length}건 (hidden 포함)\n`);

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
      leftAt: expelled?.leftAt || defaultLeftAt,
      note: expelled?.note || "",
    });
  }

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

  if (dryRun) {
    console.log("\n--- 퇴회 상세(dry-run) ---");
    for (const m of toLeave) {
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

  for (const m of toAdd) {
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

  for (const m of toUpdateNickname) {
    await db.collection("members").doc(m.id).update({
      nickname: m.newNickname,
      updatedAt: new Date().toISOString(),
    });
    console.log(`✏️  닉 변경: ${m.realName} "${m.oldNickname}" → "${m.newNickname}"`);
  }

  for (const m of toUnhide) {
    await db.collection("members").doc(m.id).update({
      hidden: false,
      updatedAt: new Date().toISOString(),
    });
    console.log(`🔄 복귀: ${m.nickname} (${m.realName})`);
  }

  for (const m of toLeave) {
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
  console.error("❌ 오류:", err);
  process.exit(1);
});
