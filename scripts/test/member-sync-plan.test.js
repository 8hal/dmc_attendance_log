const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  buildExpelledMap,
  computeSyncPlan,
  firestoreListFromBaseline,
  firestoreListFromMcpExport,
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

describe("member-sync-plan · 8/31 vs 2026-09-02 snapshot", () => {
  const roster = JSON.parse(
    fs.readFileSync(path.join(dataDir, "members-2026-08-31-cleaned.json"), "utf8")
  );
  const baseline = JSON.parse(
    fs.readFileSync(path.join(dataDir, "members-firestore-snapshot-2026-09-02.json"), "utf8")
  );
  const firestoreList = firestoreListFromMcpExport(baseline.members);
  const plan = computeSyncPlan(roster, firestoreList, new Map(), "2026-08-31");

  it("roster 179명, snapshot 179명(활성 178+숨김 1)", () => {
    assert.equal(roster.length, 179);
    assert.equal(baseline.members.length, 179);
    assert.equal(firestoreList.filter((m) => !m.hidden).length, 178);
  });

  it("신규 2, 닉변경 0, 퇴회 1, 경고 0", () => {
    assert.equal(plan.toAdd.length, 2);
    assert.equal(plan.toUpdateNickname.length, 0);
    assert.equal(plan.toUnhide.length, 0);
    assert.equal(plan.toLeave.length, 1);
    assert.equal(plan.warnings.length, 0);
  });

  it("신규: 이승호(제영아빠), 이서호(Siho)", () => {
    const byReal = Object.fromEntries(plan.toAdd.map((m) => [m.realName, m.nickname]));
    assert.equal(byReal["이승호"], "제영아빠");
    assert.equal(byReal["이서호"], "Siho");
  });

  it("퇴회 후보: 박병규(PBK) withdrawn", () => {
    const leave = plan.toLeave[0];
    assert.equal(leave.realName, "박병규");
    assert.equal(leave.nickname, "PBK");
    assert.equal(leave.leaveReason, "withdrawn");
    assert.equal(leave.leftAt, "2026-08-31");
    assert.equal(leave.id, "gw9qdf1yxXQYONMYNPxU");
  });

  it("가족 prefix가 제거된 닉으로 기존 회원과 매칭", () => {
    const nicks = new Set(roster.map((m) => m.nickname));
    assert.ok(nicks.has("블랙스왈로"));
    assert.ok(nicks.has("동동"));
    assert.ok(nicks.has("초초긍정"));
    assert.ok(nicks.has("Clint"));
    assert.equal(
      roster.filter((m) => m.nickname.startsWith("♥") || m.nickname.startsWith("★")).length,
      0
    );
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
