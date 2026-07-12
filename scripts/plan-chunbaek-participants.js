#!/usr/bin/env node
/**
 * 춘백 S3 참가자 명단 작성 보조 — 실명/닉네임으로 members doc id 매칭
 *
 * 사용법:
 *   node scripts/plan-chunbaek-participants.js \
 *     --baseline=scripts/data/members-firestore-snapshot.json \
 *     --names=김재연,이유창,임근호 \
 *     --out=scripts/data/chunbaek-s3-participants.json
 *
 *   node scripts/plan-chunbaek-participants.js \
 *     --baseline=scripts/data/members-firestore-snapshot.json \
 *     --file=scripts/data/chunbaek-s3-names.txt \
 *     --out=scripts/data/chunbaek-s3-participants.json
 */
const fs = require("fs");
const path = require("path");

function getArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const baselinePath = path.resolve(getArg("baseline", path.join(__dirname, "data", "members-firestore-snapshot.json")));
const outPath = path.resolve(getArg("out", path.join(__dirname, "data", "chunbaek-s3-participants.json")));
const namesArg = getArg("names", "");
const fileArg = getArg("file", "");

function loadNames() {
  const names = [];
  if (namesArg) {
    namesArg.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean).forEach((n) => names.push(n));
  }
  if (fileArg && fs.existsSync(fileArg)) {
    fs.readFileSync(fileArg, "utf8")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#"))
      .forEach((n) => names.push(n));
  }
  return [...new Set(names)];
}

if (!fs.existsSync(baselinePath)) {
  console.error(`baseline 없음: ${baselinePath}`);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const members = (baseline.members || []).filter((m) => !m.hidden);
const names = loadNames();

if (!names.length) {
  console.error("이름 목록이 비었습니다. --names= 또는 --file= 필요");
  process.exit(1);
}

const matched = [];
const unmatched = [];

for (const name of names) {
  const hits = members.filter((m) =>
    m.realName === name
    || m.nickname === name
    || (m.realName && m.realName.includes(name))
    || (m.nickname && m.nickname.includes(name)),
  );
  if (hits.length === 1) {
    matched.push({
      memberId: hits[0].id,
      nickname: hits[0].nickname,
      realName: hits[0].realName,
      query: name,
    });
  } else if (hits.length > 1) {
    unmatched.push({ name, reason: `중복 ${hits.length}건`, hits: hits.map((h) => `${h.nickname}/${h.realName}`) });
  } else {
    unmatched.push({ name, reason: "매칭 없음" });
  }
}

matched.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));

const output = {
  season: "chunbaek-s3",
  preparedAt: new Date().toISOString(),
  memberIds: matched.map((m) => m.memberId),
  members: matched.map((m) => ({
    memberId: m.memberId,
    nickname: m.nickname,
    realName: m.realName,
  })),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

console.log(`[plan-chunbaek-participants] 매칭 ${matched.length}명 / 입력 ${names.length}명`);
matched.forEach((m) => console.log(`  ✓ ${m.nickname} (${m.realName}) ← ${m.query}`));
unmatched.forEach((u) => {
  console.log(`  ✗ ${u.name}: ${u.reason}${u.hits ? ` [${u.hits.join(", ")}]` : ""}`);
});
console.log(`\n출력: ${outPath}`);
if (unmatched.length) {
  console.log("\n⚠️ 미매칭이 있습니다. 수동으로 JSON을 보완하세요.");
  process.exit(1);
}
