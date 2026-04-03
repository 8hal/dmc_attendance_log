// Phantom Jobs 자동 정리 스크립트 (Functions API 호출)
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
const SECRET = "dmc-admin-2026"; // Functions의 ADMIN_SECRET와 동일해야 함

function apiGet(action, params = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ action, ...params });
    const url = `${API_BASE}?${qs.toString()}`;

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

function apiPost(action, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE);
    url.searchParams.set("action", action);

    const postData = JSON.stringify(data);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`JSON parse error: ${err.message}`));
        }
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function fixPhantomJobs() {
  console.log("=== Phantom Jobs 자동 정리 ===\n");
  console.log(`대상: ${jobsToDowngrade.length}개 잡\n`);

  // 1. 현재 상태 조회
  console.log("[1/3] 현재 Phantom Jobs 상태 조회...");
  try {
    const result = await apiGet("data-integrity");
    const issues = result.issues || [];
    console.log(`현재 Phantom Jobs: ${issues.length}개`);

    const targetIssues = issues.filter((iss) =>
      jobsToDowngrade.includes(iss.jobId)
    );
    console.log(`처리 대상: ${targetIssues.length}/${jobsToDowngrade.length}개\n`);

    if (targetIssues.length === 0) {
      console.log("✓ 처리할 Phantom Jobs가 없습니다.");
      process.exit(0);
    }

    targetIssues.forEach((iss) => {
      console.log(`  - ${iss.eventName} (${iss.jobId})`);
    });
  } catch (err) {
    console.error("조회 실패:", err.message);
    process.exit(1);
  }

  if (!process.argv.includes("--execute")) {
    console.log("\n[2/3] Dry-run 모드 (실행하지 않음)");
    console.log("\n실제로 실행하려면:");
    console.log("node scripts/fix-phantom-jobs-api.js --execute");
    process.exit(0);
  }

  // 2. Batch 업데이트 실행
  console.log("\n[2/3] Batch 업데이트 실행 중...");
  try {
    const response = await apiPost("fix-phantom-jobs", {
      jobIds: jobsToDowngrade,
      secret: SECRET,
    });

    if (!response.ok) {
      console.error("✗ 업데이트 실패:", response.error);
      process.exit(1);
    }

    console.log(`✓ 업데이트 완료:`);
    console.log(`  - 업데이트: ${response.updated}개`);
    console.log(`  - 없음: ${response.notFound}개`);
    console.log(`  - 이미 complete: ${response.alreadyComplete}개`);

    if (response.details.updated.length > 0) {
      console.log("\n업데이트된 잡:");
      response.details.updated.forEach((item) => {
        console.log(`  - ${item.eventName} (${item.jobId})`);
      });
    }
  } catch (err) {
    console.error("API 호출 실패:", err.message);
    process.exit(1);
  }

  // 3. 결과 확인
  console.log("\n[3/3] 결과 확인 중...");
  try {
    const result = await apiGet("data-integrity");
    const issues = result.issues || [];
    console.log(`\n✅ 완료! Phantom Jobs: ${issues.length}개`);
    console.log("\nops.html을 새로고침하여 확인하세요:");
    console.log("https://dmc-attendance.web.app/ops.html");
  } catch (err) {
    console.error("확인 실패:", err.message);
  }

  process.exit(0);
}

fixPhantomJobs().catch((err) => {
  console.error("오류:", err);
  process.exit(1);
});
