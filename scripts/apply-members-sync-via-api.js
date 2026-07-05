#!/usr/bin/env node
/**
 * 정회원 명단 동기화 — 기존 단건 API 반복 호출 (DB 직접 수정·MCP write 대신)
 *
 * 전제: plan-members-sync.js 로 plan 생성 후 적용
 *
 * 사용법:
 *   node scripts/apply-members-sync-via-api.js --plan=scripts/data/sync-plan-2026-06-30.json --dry-run
 *   node scripts/apply-members-sync-via-api.js --plan=scripts/data/sync-plan-2026-06-30.json
 *   node scripts/apply-members-sync-via-api.js --plan=... --local   # Functions 에뮬
 *
 * 정책: _docs/superpowers/policies/member-leave-anonymization-policy.md
 */

const fs = require("fs");
const path = require("path");
const { anonymizedLabels } = require(path.join(__dirname, "../functions/lib/member-leave"));

const PROD_API =
  "https://race-nszximpvtq-du.a.run.app";
const LOCAL_API =
  "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const useLocal = args.includes("--local");
const continueOnError = args.includes("--continue-on-error");

const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const planPath = getArg("plan", "");
const apiBase = getArg("api", useLocal ? LOCAL_API : PROD_API);

function printUsageAndExit() {
  console.error(`사용법:
  node scripts/apply-members-sync-via-api.js --plan=scripts/data/sync-plan-2026-06-30.json --dry-run
  node scripts/apply-members-sync-via-api.js --plan=scripts/data/sync-plan-2026-06-30.json

옵션:
  --dry-run            API 호출 없이 적용 예정 목록만 출력
  --local              Functions 에뮬 URL (${LOCAL_API})
  --api=<url>          API 베이스 URL 직접 지정
  --continue-on-error  한 건 실패해도 다음 작업 계속

plan 생성:
  node scripts/plan-members-sync.js --baseline=<MCP snapshot> --plan-out=scripts/data/sync-plan-2026-06-30.json`);
  process.exit(1);
}

function operationsToApiSteps(operations) {
  return operations.map((op, index) => {
    switch (op.type) {
      case "add_member":
        return {
          index,
          type: op.type,
          action: "add-member",
          body: {
            nickname: op.data.nickname,
            realName: op.data.realName,
            gender: op.data.gender || "",
          },
          label: `신규 ${op.data.realName} (${op.data.nickname})`,
        };
      case "update_member": {
        const body = { id: op.docId };
        if (op.data.nickname !== undefined) body.nickname = op.data.nickname;
        if (op.data.realName !== undefined) body.realName = op.data.realName;
        if (op.data.gender !== undefined) body.gender = op.data.gender;
        if (op.data.hidden !== undefined) body.hidden = op.data.hidden;
        const note = op.note || (op.data.hidden === false ? "복귀(unhide)" : "수정");
        return {
          index,
          type: op.type,
          action: "update-member",
          body,
          label: `수정 ${op.docId.slice(0, 8)}… ${note}`,
        };
      }
      case "member_leave": {
        const labels = anonymizedLabels(op.docId);
        return {
          index,
          type: op.type,
          action: "hide-member",
          body: {
            id: op.docId,
            leaveReason: op.leaveReason || "withdrawn",
            leftAt: op.leftAt,
          },
          label: `퇴회 ${op.before?.realName} (${op.before?.nickname}) → ${labels.nickname}`,
          leavePreview: {
            before: op.before,
            after: { nickname: labels.nickname, realName: labels.realName },
            leaveReason: op.leaveReason,
            leftAt: op.leftAt,
          },
        };
      }
      default:
        throw new Error(`알 수 없는 operation type: ${op.type}`);
    }
  });
}

async function callApi(step) {
  const url = `${apiBase}?action=${step.action}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(step.body),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status}: JSON 파싱 실패`);
  }
  if (!res.ok || !data.ok) {
    const msg = data.error || data.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function loadPlan(p) {
  const resolved = path.resolve(p);
  if (!fs.existsSync(resolved)) {
    console.error(`plan 파일 없음: ${resolved}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!raw.operations || !Array.isArray(raw.operations)) {
    throw new Error("plan JSON에 operations 배열이 필요합니다");
  }
  return { path: resolved, plan: raw };
}

async function main() {
  if (!planPath) printUsageAndExit();
  const { path: resolvedPlan, plan } = loadPlan(planPath);
  const steps = operationsToApiSteps(plan.operations);

  console.log(`\n[${dryRun ? "DRY RUN" : "실행"}] 정회원 명단 API 동기화`);
  console.log(`plan: ${resolvedPlan}`);
  console.log(`API: ${apiBase}`);
  console.log(
    `작업 ${steps.length}건 (신규 ${plan.summary?.add ?? "?"}, 닉변경 ${plan.summary?.updateNickname ?? "?"}, 복귀 ${plan.summary?.unhide ?? "?"}, 퇴회 ${plan.summary?.leave ?? "?"})`
  );

  if (plan.warnings?.length) {
    console.log(`\n⚠️ plan 경고 ${plan.warnings.length}건:`);
    plan.warnings.forEach((w) => console.log(`  - ${w}`));
    if (!dryRun) {
      console.error("\n경고가 있으면 --dry-run 으로 재확인 후 수동 처리하세요. (실행 중단)");
      process.exit(1);
    }
  }

  console.log("\n--- 적용 순서 ---");
  steps.forEach((s, i) => console.log(`  ${i + 1}. [${s.action}] ${s.label}`));

  if (dryRun) {
    const leaves = steps.filter((s) => s.type === "member_leave");
    if (leaves.length) {
      console.log("\n--- 퇴회 익명화 미리보기 (hide-member API가 수행) ---");
      leaves.forEach((s) => {
        const p = s.leavePreview;
        console.log(
          `  ${p.before.realName} (${p.before.nickname}) → ${p.after.nickname}, leaveReason=${p.leaveReason}`
        );
      });
    }
    console.log("\n실행: node scripts/apply-members-sync-via-api.js --plan=" + planPath);
    return;
  }

  console.log("\n=== API 호출 ===\n");
  let ok = 0;
  let failed = 0;

  for (const step of steps) {
    process.stdout.write(`  [${step.action}] ${step.label} … `);
    try {
      const data = await callApi(step);
      ok++;
      const extra =
        step.action === "add-member"
          ? `id=${data.id}`
          : step.action === "hide-member" && data.skipped
            ? "skipped"
            : "ok";
      console.log(`✅ ${extra}`);
    } catch (err) {
      failed++;
      console.log(`❌ ${err.message}`);
      if (!continueOnError) {
        console.error(`\n중단 (${ok}건 성공, ${failed}건 실패). 부분 적용 상태 — all-members 로 확인하세요.`);
        process.exit(1);
      }
    }
  }

  console.log(`\n완료: ${ok}건 성공${failed ? `, ${failed}건 실패` : ""}`);
  if (failed) process.exit(1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("❌", e.message || e);
    process.exit(1);
  });
}

module.exports = { operationsToApiSteps };
