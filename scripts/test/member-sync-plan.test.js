const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  buildExpelledMap,
  computeSyncPlan,
  firestoreListFromBaseline,
  planToOperations,
} = require(path.join(__dirname, "../lib/member-sync-plan"));

const dataDir = path.join(__dirname, "../data");

describe("member-sync-plan · 6/30 vs 3/31 baseline", () => {
  const roster = JSON.parse(
    fs.readFileSync(path.join(dataDir, "members-2026-06-30-cleaned.json"), "utf8")
  );
  const baseline = JSON.parse(
    fs.readFileSync(path.join(dataDir, "members-2026-03-31-cleaned.json"), "utf8")
  );
  const expelled = JSON.parse(
    fs.readFileSync(path.join(dataDir, "members-2026-06-30-expelled.json"), "utf8")
  );

  const firestoreList = firestoreListFromBaseline(baseline);
  const expelledMap = buildExpelledMap(expelled);
  const plan = computeSyncPlan(roster, firestoreList, expelledMap, "2026-06-30");

  it("roster 176명, baseline 160명", () => {
    assert.equal(roster.length, 176);
    assert.equal(baseline.length, 160);
  });

  it("신규 17, 닉변경 2, 퇴회 1, 경고 0", () => {
    assert.equal(plan.toAdd.length, 17);
    assert.equal(plan.toUpdateNickname.length, 2);
    assert.equal(plan.toLeave.length, 1);
    assert.equal(plan.warnings.length, 0);
  });

  it("이경주 제명", () => {
    const leave = plan.toLeave[0];
    assert.equal(leave.realName, "이경주");
    assert.equal(leave.nickname, "초이스");
    assert.equal(leave.leaveReason, "expelled");
    assert.equal(leave.leftAt, "2026-06-30");
  });

  it("닉 변경: 김재연, 강동원", () => {
    const byReal = Object.fromEntries(
      plan.toUpdateNickname.map((m) => [m.realName, m])
    );
    assert.equal(byReal["김재연"].oldNickname, "아편");
    assert.equal(byReal["김재연"].newNickname, "501");
    assert.equal(byReal["강동원"].oldNickname, "해피하우스");
    assert.equal(byReal["강동원"].newNickname, "하우스");
  });

  it("planToOperations includes member_leave with relatedUpdates", () => {
    const mcp = planToOperations(plan);
    assert.equal(mcp.summary.add, 17);
    assert.equal(mcp.summary.leave, 1);
    const leaveOp = mcp.operations.find((o) => o.type === "member_leave");
    assert.ok(leaveOp);
    assert.equal(leaveOp.before.realName, "이경주");
    assert.ok(leaveOp.memberUpdate._archivedRealName);
    assert.equal(leaveOp.relatedUpdates.length, 3);
  });
});

describe("member-sync-plan · 동명이인 실명", () => {
  it("김태영 2명 active면 닉 변경 시 경고", () => {
    const roster = [{ nickname: "새닉", realName: "김태영" }];
    const firestoreList = [
      {
        id: "a",
        nickname: "탱님",
        realName: "김태영",
        hidden: false,
        _raw: { nickname: "탱님", realName: "김태영" },
      },
      {
        id: "b",
        nickname: "Tommy",
        realName: "김태영",
        hidden: false,
        _raw: { nickname: "Tommy", realName: "김태영" },
      },
    ];
    const plan = computeSyncPlan(roster, firestoreList, new Map(), "2026-06-30");
    assert.equal(plan.warnings.length, 1);
    assert.match(plan.warnings[0], /동명이인/);
    assert.equal(plan.toAdd.length, 0);
  });
});
