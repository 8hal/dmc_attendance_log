/**
 * ohmyrace 118번 잡의 이벤트 정보 수정
 * v0.10.2 이전에 생성된 잘못된 eventName/eventDate 수정
 */

const admin = require("firebase-admin");
const serviceAccount = require("./service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixJob() {
  const dryRun = process.argv.includes("--dry-run");

  try {
    console.log(`=== ohmyrace 118 잡 수정 ${dryRun ? "(DRY RUN)" : ""} ===\n`);

    // 1. 기존 잡 찾기
    const jobsSnap = await db
      .collection("scrape_jobs")
      .where("source", "==", "ohmyrace")
      .where("sourceId", "==", "118")
      .get();

    if (jobsSnap.empty) {
      console.log("❌ ohmyrace 118 잡을 찾을 수 없습니다.");
      console.log("report.html에서 새로 스크랩해주세요.");
      process.exit(0);
    }

    console.log(`✓ 잡 ${jobsSnap.size}개 발견\n`);

    for (const doc of jobsSnap.docs) {
      const data = doc.data();
      console.log(`Job ID: ${doc.id}`);
      console.log(`  현재 eventName: ${data.eventName}`);
      console.log(`  현재 eventDate: ${data.eventDate || "(없음)"}`);
      console.log(`  status: ${data.status}`);
      console.log(`  confirmedCount: ${data.confirmedCount || 0}`);

      // 2. 올바른 정보로 업데이트 (dry-run이면 스킵)
      const updates = {
        eventName: "2026 군산 새만금 마라톤 대회",
        eventDate: "2026-04-05",
      };

      if (dryRun) {
        console.log(`\n[DRY RUN] 업데이트 예정:`);
        console.log(`  → eventName: ${updates.eventName}`);
        console.log(`  → eventDate: ${updates.eventDate}`);
        console.log();
      } else {
        await doc.ref.update(updates);
        console.log(`\n✅ 업데이트 완료:`);
        console.log(`  → eventName: ${updates.eventName}`);
        console.log(`  → eventDate: ${updates.eventDate}`);
        console.log();
      }
    }

    if (dryRun) {
      console.log("\n📋 DRY RUN 완료. 실제 실행하려면:");
      console.log("node scripts/fix-ohmyrace-118-job.js");
    } else {
      console.log("\n✅ 모든 잡 수정 완료!");
      console.log("\nreport.html이나 my.html을 새로고침하면 정상 표시됩니다.");
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ 오류 발생:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

fixJob();
