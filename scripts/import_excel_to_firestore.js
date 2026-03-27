#!/usr/bin/env node
/**
 * 엑셀 전처리 결과를 Firestore에 임포트
 *
 * 용도:
 *   1. members 컬렉션에 nickName 필드 추가
 *   2. race_results 컬렉션에 엑셀 기반 기록 추가 (중복 스킵)
 *
 * 실행:
 *   node scripts/import_excel_to_firestore.js [--dry-run] [--members-only] [--records-only]
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// ── 인자 파싱 ──────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MEMBERS_ONLY = args.includes("--members-only");
const RECORDS_ONLY = args.includes("--records-only");

// ── Firebase 초기화 ────────────────────────────────────────
const serviceAccountPath = path.join(__dirname, "../functions/service-account.json");
if (!fs.existsSync(serviceAccountPath)) {
  // 서비스 계정 키 없으면 Application Default Credentials 사용
  admin.initializeApp({ projectId: "dmc-attendance" });
} else {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

// ── 데이터 로드 ────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "../data");
const membersData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "members_from_excel.json"), "utf8"));
const recordsData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "race_records_from_excel.json"), "utf8"));

console.log(`📂 로드: 회원 ${membersData.length}명, 기록 ${recordsData.length}건`);
if (DRY_RUN) console.log("🔵 DRY RUN 모드 — Firestore에 실제 쓰기 없음\n");

// ── 1. members 컬렉션: nickName 필드 추가 ──────────────────
async function updateMembers() {
  console.log("\n[ 1단계 ] members 컬렉션 nickName 업데이트...");

  // Firestore의 현재 members 조회 (realName 기준)
  const snap = await db.collection("members").get();
  const realToDocId = {};
  snap.forEach((doc) => {
    const real = doc.data().realName || "";
    if (real) realToDocId[real] = doc.id;
  });

  console.log(`   Firestore members: ${snap.size}건`);

  let updated = 0;
  let notFound = [];

  for (const m of membersData) {
    const { realName, nickName, joinDate } = m;
    if (!realName || !nickName) continue;

    const docId = realToDocId[realName];
    if (!docId) {
      notFound.push(`${nickName} (${realName})`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`   [DRY] ${realName} → nickName: "${nickName}", isActive: true`);
    } else {
      await db.collection("members").doc(docId).update({
        nickName,
        joinDate: joinDate || null,
        isActive: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    updated++;
  }

  console.log(`   ✅ 업데이트: ${updated}건`);
  if (notFound.length > 0) {
    console.log(`   ⚠️  Firestore에 없는 회원 (${notFound.length}명): ${notFound.slice(0, 10).join(", ")}${notFound.length > 10 ? " ..." : ""}`);
  }
}

// ── 2. race_results: 엑셀 기록 임포트 ────────────────────
async function importRecords() {
  console.log("\n[ 2단계 ] race_results 엑셀 기록 임포트...");

  // 기존 race_results 조회 (중복 방지용 키 수집)
  console.log("   기존 race_results 조회 중...");
  const existSnap = await db.collection("race_results").get();
  const existingKeys = new Set();
  existSnap.forEach((doc) => {
    const d = doc.data();
    const key = `${d.memberRealName}|${d.eventName}|${d.distance}`;
    existingKeys.add(key);
  });
  console.log(`   기존 기록: ${existSnap.size}건 (dedup key: ${existingKeys.size}개)`);

  let inserted = 0;
  let skipped = 0;

  // Firestore batch (max 500 ops per batch)
  let batch = db.batch();
  let batchCount = 0;

  for (const rec of recordsData) {
    const keyId = rec.memberRealName || `__nick__${rec.memberNickName}`;
    const key = `${keyId}|${rec.eventName}|${rec.distance}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    const docRef = db.collection("race_results").doc();
    const doc = {
      memberRealName: rec.memberRealName || null,
      memberNickName: rec.memberNickName || "",
      memberStatus: rec.memberStatus || "unknown",
      eventDate: rec.eventDate,
      eventName: rec.eventName,
      distance: rec.distance,
      finishTime: rec.finishTime,
      status: "confirmed",
      confirmSource: "excel_import",
      source: "excel",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (DRY_RUN) {
      if (inserted < 5) console.log(`   [DRY] insert: ${rec.memberRealName} / ${rec.eventName} / ${rec.distance} / ${rec.finishTime}`);
    } else {
      batch.set(docRef, doc);
      batchCount++;
      if (batchCount >= 499) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
        process.stdout.write(".");
      }
    }
    inserted++;
    existingKeys.add(key);
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
    console.log("");
  }

  console.log(`   ✅ 신규 삽입: ${inserted}건`);
  console.log(`   ⏭️  중복 스킵: ${skipped}건`);
}

// ── 실행 ──────────────────────────────────────────────────
(async () => {
  try {
    // members 업데이트는 --members-only 명시 시에만 실행
    // (Firestore 최신 닉네임을 엑셀 구버전으로 덮어쓸 위험이 있으므로)
    if (MEMBERS_ONLY) await updateMembers();
    if (!MEMBERS_ONLY) await importRecords();
    console.log("\n🎉 완료");
    process.exit(0);
  } catch (e) {
    console.error("❌ 오류:", e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
