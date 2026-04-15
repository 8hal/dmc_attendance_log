/**
 * 2026-03-31 정회원 명단(160명) - 전처리된 데이터로 Firestore 동기화
 * 
 * 전제: scripts/data/members-2026-03-31-cleaned.json (접두어 제거 완료)
 * 
 * 사용법:
 *   node scripts/sync-members-2026-03-31.js --dry-run  (영향 범위 확인)
 *   node scripts/sync-members-2026-03-31.js             (실제 실행)
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const dryRun = process.argv.includes("--dry-run");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

// 전처리된 3월 31일 정회원 명단 로드
const cleanedPath = path.join(__dirname, "data", "members-2026-03-31-cleaned.json");
const march31Members = JSON.parse(fs.readFileSync(cleanedPath, "utf8"));

console.log(`\n[${dryRun ? "DRY RUN" : "실행"}] 2026-03-31 정회원 명단 동기화`);
console.log(`입력: ${march31Members.length}명 (전처리 완료)\n`);

async function syncMembers() {
  // 1. Firestore members 조회
  const membersSnap = await db.collection("members").get();
  const firestoreMap = new Map();
  membersSnap.forEach(doc => {
    const data = doc.data();
    firestoreMap.set(doc.id, {
      id: doc.id,
      realName: data.realName,
      nickname: data.nickname,
      hidden: data.hidden || false
    });
  });

  console.log(`Firestore: ${firestoreMap.size}명 (hidden 포함)\n`);

  // 2. 비교
  const toAdd = [];
  const toUnhide = [];
  const matched = new Set();

  march31Members.forEach(m => {
    let found = null;
    
    // realName + nickname 매칭
    for (const [id, fm] of firestoreMap) {
      if (fm.realName === m.realName && fm.nickname === m.nickname) {
        found = { id, ...fm };
        matched.add(id);
        break;
      }
    }

    if (!found) {
      // realName만 일치 (닉네임 오타 등)
      for (const [id, fm] of firestoreMap) {
        if (fm.realName === m.realName) {
          console.warn(`⚠️  realName 일치, nickname 다름: ${m.realName} (FS:"${fm.nickname}", 명단:"${m.nickname}")`);
          found = { id, ...fm };
          matched.add(id);
          break;
        }
      }
    }

    if (!found) {
      toAdd.push(m);
    } else if (found.hidden) {
      toUnhide.push({ id: found.id, ...m });
    }
  });

  // 3. 탈퇴 처리 (Firestore에만 있는 정회원)
  const toHide = [];
  for (const [id, fm] of firestoreMap) {
    if (!fm.hidden && !matched.has(id)) {
      toHide.push(fm);
    }
  }

  // 4. 요약
  console.log("=== 변경 사항 ===\n");
  console.log(`✅ 신규: ${toAdd.length}명`);
  console.log(`🔄 복귀: ${toUnhide.length}명`);
  console.log(`❌ 탈퇴: ${toHide.length}명`);
  console.log(`➖ 유지: ${matched.size - toUnhide.length}명\n`);

  if (toAdd.length > 0) {
    console.log("=== 신규 회원 ===");
    toAdd.forEach((m, i) => console.log(`${i+1}. ${m.nickname} (${m.realName})`));
  }

  if (toUnhide.length > 0) {
    console.log("\n=== 복귀 회원 ===");
    toUnhide.forEach((m, i) => console.log(`${i+1}. ${m.nickname} (${m.realName})`));
  }

  if (toHide.length > 0) {
    console.log("\n=== 탈퇴 처리 ===");
    toHide.forEach((m, i) => console.log(`${i+1}. ${m.nickname} (${m.realName})`));
  }

  // 5. 실행
  if (!dryRun) {
    console.log("\n=== 실행 ===\n");

    for (const m of toAdd) {
      const ref = db.collection("members").doc();
      await ref.set({
        realName: m.realName,
        nickname: m.nickname,
        hidden: false,
        createdAt: new Date().toISOString()
      });
      console.log(`✅ 신규: ${m.nickname} (${m.realName})`);
    }

    for (const m of toUnhide) {
      await db.collection("members").doc(m.id).update({
        hidden: false,
        updatedAt: new Date().toISOString()
      });
      console.log(`🔄 복귀: ${m.nickname} (${m.realName})`);
    }

    for (const m of toHide) {
      await db.collection("members").doc(m.id).update({
        hidden: true,
        updatedAt: new Date().toISOString()
      });
      console.log(`❌ 탈퇴: ${m.nickname} (${m.realName})`);
    }

    console.log("\n✅ 완료");
  } else {
    console.log("\n실행: node scripts/sync-members-2026-03-31.js");
  }
}

syncMembers().catch(err => {
  console.error("❌ 오류:", err);
  process.exit(1);
});
