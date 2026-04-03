/**
 * P0 버그 재현 스크립트: report.html confirm 수정 기능
 * 
 * 실행: node scripts/reproduce-p0-confirm-edit.js
 * 전제: Firestore Emulator가 실행 중이어야 함
 */

const admin = require("firebase-admin");

const isEmulator = process.env.FIRESTORE_EMULATOR_HOST || "localhost:8080";
process.env.FIRESTORE_EMULATOR_HOST = isEmulator;

admin.initializeApp({ projectId: "dmc-attendance" });
const db = admin.firestore();

async function setupDummyData() {
  console.log("🔧 더미 데이터 생성 중...");

  const jobId = "test_edit_confirm";
  const now = new Date().toISOString();

  // 1. scrape_jobs 문서 생성 (status: "confirmed")
  await db.collection("scrape_jobs").doc(jobId).set({
    source: "smartchip",
    sourceId: "202650000001",
    eventName: "테스트 대회 (수정 재현용)",
    eventDate: "2026-04-03",
    status: "confirmed",
    confirmedAt: now,
    results: [
      { memberRealName: "홍길동", memberNickname: "테스터1", distance: "full", netTime: "03:30:00" },
      { memberRealName: "김철수", memberNickname: "테스터2", distance: "half", netTime: "01:45:00" },
    ],
    createdAt: now,
  });

  // 2. race_results 문서 2건 생성
  await db.collection("race_results").doc("홍길동_full_2026-04-03").set({
    jobId,
    eventName: "테스트 대회 (수정 재현용)",
    eventDate: "2026-04-03",
    source: "smartchip",
    sourceId: "202650000001",
    memberRealName: "홍길동",
    memberNickname: "테스터1",
    distance: "full",
    netTime: "03:30:00",
    gunTime: "",
    bib: "1234",
    status: "confirmed",
    confirmedAt: now,
    confirmSource: "operator",
  });

  await db.collection("race_results").doc("김철수_half_2026-04-03").set({
    jobId,
    eventName: "테스트 대회 (수정 재현용)",
    eventDate: "2026-04-03",
    source: "smartchip",
    sourceId: "202650000001",
    memberRealName: "김철수",
    memberNickname: "테스터2",
    distance: "half",
    netTime: "01:45:00",
    gunTime: "",
    bib: "5678",
    status: "confirmed",
    confirmedAt: now,
    confirmSource: "operator",
  });

  // 3. members 문서 생성 (스크래퍼용)
  await db.collection("members").doc("tester1").set({
    nickname: "테스터1",
    realName: "홍길동",
    gender: "M",
    isHidden: false,
  });

  await db.collection("members").doc("tester2").set({
    nickname: "테스터2",
    realName: "김철수",
    gender: "M",
    isHidden: false,
  });

  console.log("✅ 더미 데이터 생성 완료");
  console.log(`   jobId: ${jobId}`);
  console.log(`   race_results: 홍길동_full_2026-04-03, 김철수_half_2026-04-03`);
  console.log("");
  console.log("📍 재현 방법:");
  console.log("   1. http://localhost:5000/report.html 열기");
  console.log("   2. 비밀번호 입력 (admin_password)");
  console.log("   3. '완료' 탭 → '테스트 대회 (수정 재현용)' 클릭");
  console.log("   4. '수정하기' 버튼 클릭");
  console.log("   5. 홍길동 기록 제외(✕) 또는 거리 변경");
  console.log("   6. '기록 저장하기' → 확정");
  console.log("");
  console.log("🔍 확인 방법:");
  console.log("   - Firestore Emulator UI: http://localhost:4000/firestore");
  console.log("   - race_results 컬렉션에서 '홍길동_full_2026-04-03' 문서 유무 확인");
}

async function simulateConfirmEdit() {
  console.log("🧪 confirm 액션 시뮬레이션 (홍길동 제외, 김철수만 저장)");

  const jobId = "test_edit_confirm";
  const canonicalJobId = "smartchip_202650000001";

  // confirm 요청 (홍길동 제외, 김철수만 포함)
  const results = [
    {
      memberRealName: "김철수",
      memberNickname: "테스터2",
      distance: "half",
      netTime: "01:45:00",
      gunTime: "",
      bib: "5678",
      overallRank: null,
      gender: "M",
      pbConfirmed: false,
      isGuest: false,
      note: "",
    },
  ];

  const batch = db.batch();
  const now = new Date().toISOString();

  // 기존 코드 흐름 재현 (삭제 없이 set()만)
  for (const r of results) {
    const docId = `${r.memberRealName}_${r.distance}_2026-04-03`;
    const ref = db.collection("race_results").doc(docId);
    batch.set(ref, {
      jobId: canonicalJobId,
      eventName: "테스트 대회 (수정 재현용)",
      eventDate: "2026-04-03",
      source: "smartchip",
      sourceId: "202650000001",
      memberRealName: r.memberRealName,
      memberNickname: r.memberNickname,
      distance: r.distance,
      netTime: r.netTime,
      gunTime: r.gunTime,
      bib: r.bib,
      status: "confirmed",
      confirmedAt: now,
      confirmSource: "operator",
    });
  }

  // canonicalJobId 문서가 없으면 batch.update() 실패
  // → functions/index.js의 로직과 동일하게 jobDoc.exists 체크 후 update/set 분기
  const jobRef = db.collection("scrape_jobs").doc(canonicalJobId);
  const jobDoc = await jobRef.get();

  if (jobDoc.exists) {
    batch.update(jobRef, {
      status: "confirmed",
      confirmedAt: now,
    });
  } else {
    // 실제로는 이 경로로 가야 하지만, 더미 데이터는 test_edit_confirm으로 생성했으므로
    // canonicalJobId 문서를 미리 생성해야 함
    console.log(`   ⚠️  ${canonicalJobId} 문서가 없습니다. set()으로 생성`);
    batch.set(jobRef, {
      status: "confirmed",
      confirmedAt: now,
      eventName: "테스트 대회 (수정 재현용)",
      eventDate: "2026-04-03",
      source: "smartchip",
      sourceId: "202650000001",
      results,
      createdAt: now,
    });
  }

  // jobId와 canonicalJobId가 다르면 기존 job 삭제
  if (canonicalJobId !== jobId) {
    const oldJobRef = db.collection("scrape_jobs").doc(jobId);
    const oldJobDoc = await oldJobRef.get();
    if (oldJobDoc.exists) {
      console.log(`   🗑️  기존 job 삭제: ${jobId}`);
      batch.delete(oldJobRef);
    }
  }

  await batch.commit();

  console.log("✅ batch.commit() 완료");
  console.log("");

  // 결과 확인
  const oldDoc = await db.collection("race_results").doc("홍길동_full_2026-04-03").get();
  const newDoc = await db.collection("race_results").doc("김철수_half_2026-04-03").get();

  console.log("🔍 Firestore 상태 확인:");
  console.log(`   홍길동_full_2026-04-03: ${oldDoc.exists ? "✅ 존재 (문제!)" : "❌ 삭제됨 (정상)"}`);
  console.log(`   김철수_half_2026-04-03: ${newDoc.exists ? "✅ 존재 (정상)" : "❌ 없음 (문제!)"}`);

  if (oldDoc.exists) {
    console.log("");
    console.log("⚠️  가설 3 확인: 기존 race_results가 삭제되지 않고 그대로 유지됨");
    console.log("   → confirm 액션은 기존 문서를 삭제하지 않고 새 문서만 추가/수정");
  }
}

async function cleanup() {
  console.log("");
  console.log("🧹 정리 중...");
  const batch = db.batch();
  batch.delete(db.collection("scrape_jobs").doc("test_edit_confirm"));
  batch.delete(db.collection("scrape_jobs").doc("smartchip_202650000001"));
  batch.delete(db.collection("race_results").doc("홍길동_full_2026-04-03"));
  batch.delete(db.collection("race_results").doc("김철수_half_2026-04-03"));
  batch.delete(db.collection("members").doc("tester1"));
  batch.delete(db.collection("members").doc("tester2"));
  await batch.commit();
  console.log("✅ 정리 완료");
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--cleanup") {
    await cleanup();
    process.exit(0);
  }

  await setupDummyData();

  if (args[0] === "--simulate") {
    console.log("");
    await simulateConfirmEdit();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ 오류:", err);
    process.exit(1);
  });
