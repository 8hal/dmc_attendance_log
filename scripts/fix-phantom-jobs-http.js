// Phantom Jobs 자동 정리 스크립트 (HTTP API 방식)
// 목적: search_* 및 test 잡을 confirmed → complete로 다운그레이드

const https = require("https");

// Phase 1: search_* 및 test 잡 다운그레이드
const jobsToDowngrade = [
  "manual_manual_1775222584867", // 테스트
  "search_3tShsj67juAa2UWk8NeM_0",
  "search_3tShsj67juAa2UWk8NeM_1",
  "search_3tShsj67juAa2UWk8NeM_2",
  "search_3tShsj67juAa2UWk8NeM_3",
  "search_ybLLXH8sBo2PCMRuxZnD_0",
  "search_ybLLXH8sBo2PCMRuxZnD_1",
  "search_ybLLXH8sBo2PCMRuxZnD_3",
  "search_ybLLXH8sBo2PCMRuxZnD_4",
  "search_ybLLXH8sBo2PCMRuxZnD_5",
  "search_ybLLXH8sBo2PCMRuxZnD_6",
];

const API_BASE = "https://race-nszximpvtq-du.a.run.app";

function apiCall(action, data = {}) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ action, ...data });
    const url = `${API_BASE}?${params.toString()}`;

    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`JSON parse error: ${err.message}`));
          }
        });
      })
      .on("error", reject);
  });
}

async function fixPhantomJobs() {
  console.log("=== Phantom Jobs 자동 정리 (HTTP API) ===\n");
  console.log(`대상: ${jobsToDowngrade.length}개 잡\n`);

  console.log("⚠️  주의: 이 스크립트는 HTTP API를 통해 작동하지 않습니다.");
  console.log("Firestore 직접 쓰기는 Functions 또는 Firebase Admin SDK가 필요합니다.\n");

  console.log("대안 방법:");
  console.log("1. report.html 완료 탭에서 수동으로 처리");
  console.log("   - 가이드: _docs/investigations/2026-04-04-phantom-jobs-manual-guide.md\n");

  console.log("2. Firebase Functions로 batch update 함수 추가 후 실행\n");

  console.log("3. 현재 Phantom Jobs 상태 확인:");
  console.log("   curl https://race-nszximpvtq-du.a.run.app?action=data-integrity | jq .issues\n");

  // 현재 상태 조회
  console.log("[조회] 현재 Phantom Jobs 상태...");
  try {
    const result = await apiCall("data-integrity");
    const issues = result.issues || [];
    console.log(`\n현재 Phantom Jobs: ${issues.length}개`);

    if (issues.length > 0) {
      console.log("\n처리 대상 (search_* 및 test):");
      const targetIssues = issues.filter((iss) =>
        jobsToDowngrade.includes(iss.jobId)
      );
      targetIssues.forEach((iss) => {
        console.log(`  - ${iss.eventName} (${iss.jobId})`);
      });
      console.log(`\n발견: ${targetIssues.length}/${jobsToDowngrade.length}개`);
    }
  } catch (err) {
    console.error("API 호출 실패:", err.message);
  }

  console.log("\n권장: report.html에서 수동으로 처리하거나");
  console.log("Firebase Console에서 직접 status 필드를 수정하세요.");

  process.exit(0);
}

fixPhantomJobs().catch((err) => {
  console.error("오류:", err);
  process.exit(1);
});
