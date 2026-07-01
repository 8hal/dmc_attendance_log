/**
 * 정회원 닉네임 변경 (Firestore members 컬렉션)
 *
 * 사용법:
 *   node scripts/update-member-nickname.js --real-name 김재연 --from 아편 --to 501 --dry-run
 *   node scripts/update-member-nickname.js --real-name 김재연 --from 아편 --to 501
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const dryRun = process.argv.includes("--dry-run");

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const realName = getArg("--real-name");
const fromNickname = getArg("--from");
const toNickname = getArg("--to");

if (!realName || !fromNickname || !toNickname) {
  console.error("사용법: node scripts/update-member-nickname.js --real-name <실명> --from <기존닉> --to <새닉> [--dry-run]");
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

async function main() {
  console.log(`\n[${dryRun ? "DRY RUN" : "실행"}] 닉네임 변경`);
  console.log(`  실명: ${realName}`);
  console.log(`  변경: "${fromNickname}" → "${toNickname}"\n`);

  const dupSnap = await db.collection("members").where("nickname", "==", toNickname).get();
  if (!dupSnap.empty) {
    const dup = dupSnap.docs[0].data();
    if (dup.realName !== realName) {
      console.error(`❌ 닉네임 "${toNickname}" 이(가) 이미 다른 회원(${dup.realName})에게 사용 중입니다.`);
      process.exit(1);
    }
    console.log(`ℹ️  "${toNickname}" 닉네임이 이미 해당 회원에게 설정되어 있습니다.`);
  }

  const snap = await db.collection("members").where("realName", "==", realName).get();
  if (snap.empty) {
    console.error(`❌ 실명 "${realName}" 회원을 찾을 수 없습니다.`);
    process.exit(1);
  }

  const targets = [];
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.nickname === fromNickname || data.nickname === toNickname) {
      targets.push({ id: doc.id, ...data });
    }
  });

  if (targets.length === 0) {
    console.error(`❌ "${realName}" 회원 중 닉네임이 "${fromNickname}" 또는 "${toNickname}"인 문서가 없습니다.`);
    console.log("현재 Firestore 닉네임:");
    snap.forEach((doc) => console.log(`  - ${doc.id}: "${doc.data().nickname}"`));
    process.exit(1);
  }

  const alreadyDone = targets.filter((t) => t.nickname === toNickname);
  const toUpdate = targets.filter((t) => t.nickname === fromNickname);

  console.log("=== 영향 범위 ===\n");
  console.log(`- 컬렉션: members`);
  console.log(`- 변경 대상: ${toUpdate.length}건`);
  console.log(`- 이미 완료: ${alreadyDone.length}건\n`);

  toUpdate.forEach((t) => {
    console.log(`[${dryRun ? "DRY RUN" : "실행"}] ${t.id}`);
    console.log(`  실명: ${t.realName}`);
    console.log(`  현재 nickname: "${t.nickname}"`);
    console.log(`  변경 후: "${toNickname}"`);
    console.log(`  hidden: ${t.hidden || false}`);
    console.log(`  team: ${t.team || "(없음)"}\n`);
  });

  if (alreadyDone.length > 0) {
    alreadyDone.forEach((t) => {
      console.log(`✅ 이미 "${toNickname}": ${t.id}`);
    });
    console.log();
  }

  if (toUpdate.length === 0) {
    console.log("변경할 문서가 없습니다. (이미 반영됨)");
    return;
  }

  if (!dryRun) {
    for (const t of toUpdate) {
      await db.collection("members").doc(t.id).update({
        nickname: toNickname,
        updatedAt: new Date().toISOString(),
      });
      console.log(`✅ 업데이트 완료: ${t.id} (${fromNickname} → ${toNickname})`);
    }
    console.log("\n✅ 완료");
  } else {
    console.log("실행: node scripts/update-member-nickname.js --real-name", realName, "--from", fromNickname, "--to", toNickname);
  }
}

main().catch((err) => {
  console.error("❌ 오류:", err.message);
  process.exit(1);
});
