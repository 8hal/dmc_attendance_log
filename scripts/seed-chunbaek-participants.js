#!/usr/bin/env node
/**
 * 춘백 S3 참가자 participant 시드
 *
 * 입력 JSON 형식 (둘 중 하나):
 *   { "memberIds": ["docId1", "docId2", ...] }
 *   { "members": [{ "memberId": "...", "nickname": "..." }, ...] }
 *
 * 사용법:
 *   node scripts/seed-chunbaek-participants.js --input=scripts/data/chunbaek-s3-participants.json --dry-run
 *   node scripts/seed-chunbaek-participants.js --input=scripts/data/chunbaek-s3-participants.json
 *
 * 명단 작성 보조:
 *   node scripts/plan-chunbaek-participants.js --names=실명1,실명2 --baseline=scripts/data/members-firestore-snapshot.json
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

const dryRun = process.argv.includes("--dry-run");
const useEmulator = process.argv.includes("--emulator");

function getArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const inputPath = path.resolve(getArg("input", path.join(__dirname, "data", "chunbaek-s3-participants.json")));

if (useEmulator) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  }
} else if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn("[seed-chunbaek-participants] FIRESTORE_EMULATOR_HOST 제거 → 프로덕션 대상");
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

function loadMemberIds(data) {
  if (Array.isArray(data.memberIds)) return data.memberIds.map(String);
  if (Array.isArray(data.members)) {
    return data.members.map((m) => String(m.memberId || m.id || "").trim()).filter(Boolean);
  }
  return [];
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

(async () => {
  if (!fs.existsSync(inputPath)) {
    console.error(`입력 파일 없음: ${inputPath}`);
    console.error("템플릿: scripts/data/chunbaek-s3-participants.template.json");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const memberIds = [...new Set(loadMemberIds(data))];
  if (!memberIds.length) {
    console.error("memberIds가 비어 있습니다.");
    process.exit(1);
  }

  const target = useEmulator ? "에뮬레이터" : "프로덕션";
  const mode = dryRun ? "DRY RUN" : "실행";
  console.log(`[seed-chunbaek-participants] ${mode} · ${target}`);
  console.log(`  입력: ${inputPath}`);
  console.log(`  대상: ${memberIds.length}명\n`);

  const ok = [];
  const errors = [];

  for (const memberId of memberIds) {
    const ref = db.collection("members").doc(memberId);
    const snap = await ref.get();
    if (!snap.exists) {
      errors.push({ memberId, error: "members 문서 없음" });
      continue;
    }
    const d = snap.data();
    if (d.hidden) {
      errors.push({ memberId, error: "hidden 회원" });
      continue;
    }
    const s3 = d.chunbaekS3 || {};
    ok.push({
      memberId,
      nickname: d.nickname || "",
      realName: d.realName || "",
      wasParticipant: !!s3.participant,
      profileComplete: !!s3.profileComplete,
    });
  }

  ok.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
  errors.forEach((e) => console.log(`  ✗ ${e.memberId}: ${e.error}`));
  ok.forEach((m) => {
    const flag = m.wasParticipant ? "(이미 participant)" : "(신규)";
    console.log(`  ✓ ${m.nickname} / ${m.realName} ${flag}`);
  });

  console.log(`\n요약: 적용 가능 ${ok.length}명, 오류 ${errors.length}명`);

  if (errors.length) {
    console.error("\n오류가 있어 중단합니다. 명단을 수정하세요.");
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] 변경 없음. 실행:");
    console.log(`  node scripts/seed-chunbaek-participants.js --input=${inputPath}`);
    process.exit(0);
  }

  const batchSize = 400;
  for (let i = 0; i < ok.length; i += batchSize) {
    const batch = db.batch();
    ok.slice(i, i + batchSize).forEach((m) => {
      const update = {
        "chunbaekS3.participant": true,
        "chunbaekS3.updatedAt": FieldValue.serverTimestamp(),
      };
      if (!m.wasParticipant && !m.profileComplete) {
        update["chunbaekS3.profileComplete"] = false;
      }
      batch.update(db.collection("members").doc(m.memberId), update);
    });
    await batch.commit();
  }

  console.log(`\n✅ participant 시드 완료: ${ok.length}명`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
