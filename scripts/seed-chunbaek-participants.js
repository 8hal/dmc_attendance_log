#!/usr/bin/env node
/**
 * 춘백 S3 참가자 participant 시드
 *
 * Admin SDK 대신 HTTP API (admin-set-participant) 사용 — GCP 인증 불필요.
 *
 * 사용법:
 *   node scripts/seed-chunbaek-participants.js --input=scripts/data/chunbaek-s3-participants.json --dry-run
 *   node scripts/seed-chunbaek-participants.js --input=scripts/data/chunbaek-s3-participants.json
 *   node scripts/seed-chunbaek-participants.js --input=... --local   # Functions 에뮬
 *
 * 명단 작성 보조:
 *   node scripts/plan-chunbaek-participants.js --names=실명1,실명2 --baseline=scripts/data/members-firestore-snapshot.json
 */
const fs = require("fs");
const path = require("path");

const PROD_API = "https://dmc-attendance.web.app/api/chunbaek";
const LOCAL_API = "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/chunbaek";

const dryRun = process.argv.includes("--dry-run");
const useLocal = process.argv.includes("--local") || process.argv.includes("--emulator");

function getArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const inputPath = path.resolve(
  getArg("input", path.join(__dirname, "data", "chunbaek-s3-participants.json"))
);
const apiBase = getArg("api", useLocal ? LOCAL_API : PROD_API);
const adminPw = getArg("pw", process.env.DMC_ADMIN_PW || "dmc2008");

function loadMemberIds(data) {
  if (Array.isArray(data.memberIds)) return data.memberIds.map(String);
  if (Array.isArray(data.members)) {
    return data.members.map((m) => String(m.memberId || m.id || "").trim()).filter(Boolean);
  }
  return [];
}

function loadMemberMap(data) {
  const map = new Map();
  const list = Array.isArray(data.members) ? data.members : [];
  list.forEach((m) => {
    const id = String(m.memberId || m.id || "").trim();
    if (id) map.set(id, m);
  });
  return map;
}

(async () => {
  if (!fs.existsSync(inputPath)) {
    console.error(`입력 파일 없음: ${inputPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const memberIds = [...new Set(loadMemberIds(data))];
  const memberMap = loadMemberMap(data);

  if (!memberIds.length) {
    console.error("memberIds가 비어 있습니다.");
    process.exit(1);
  }

  const target = useLocal ? "에뮬레이터" : "프로덕션";
  const mode = dryRun ? "DRY RUN" : "실행";
  console.log(`[seed-chunbaek-participants] ${mode} · ${target}`);
  console.log(`  입력: ${inputPath}`);
  console.log(`  대상: ${memberIds.length}명`);
  console.log(`  API: ${apiBase}\n`);

  if (dryRun) {
    memberIds.forEach((id) => {
      const m = memberMap.get(id) || {};
      console.log(`  (신규 또는 갱신) ${m.nickname || "?"} / ${m.realName || "?"} [${id}]`);
    });
    console.log(`\n[DRY RUN] 변경 없음. 실행:`);
    console.log(`  node scripts/seed-chunbaek-participants.js --input=${inputPath}`);
    process.exit(0);
  }

  let ok = 0;
  let failed = 0;

  for (const memberId of memberIds) {
    const m = memberMap.get(memberId) || {};
    const label = `${m.nickname || "?"} / ${m.realName || "?"} [${memberId}]`;
    process.stdout.write(`  ${label} … `);
    try {
      const res = await fetch(`${apiBase}?action=admin-set-participant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPw, memberId, participant: true }),
      });
      let json;
      try { json = await res.json(); } catch { json = {}; }
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const was = json.was ? "(이미 participant)" : "(신규)";
      console.log(`✅ ${was}`);
      ok++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      failed++;
    }
  }

  console.log(`\n완료: ${ok}건 성공${failed ? `, ${failed}건 실패` : ""}`);
  if (failed) process.exit(1);
})();
