const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { operationsToApiSteps } = require(path.join(__dirname, "../apply-members-sync-via-api"));

describe("apply-members-sync-via-api · operationsToApiSteps", () => {
  const plan = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/sync-plan-2026-06-30.json"), "utf8")
  );
  const steps = operationsToApiSteps(plan.operations);

  it("20건 → add-member / update-member / hide-member", () => {
    assert.equal(steps.length, 20);
    assert.equal(steps.filter((s) => s.action === "add-member").length, 17);
    assert.equal(steps.filter((s) => s.action === "update-member").length, 2);
    assert.equal(steps.filter((s) => s.action === "hide-member").length, 1);
  });

  it("퇴회는 hide-member + leaveReason", () => {
    const leave = steps.find((s) => s.action === "hide-member");
    assert.equal(leave.body.leaveReason, "expelled");
    assert.equal(leave.body.leftAt, "2026-06-30");
    assert.equal(leave.leavePreview.before.realName, "이경주");
  });

  it("닉 변경은 update-member", () => {
    const updates = steps.filter((s) => s.action === "update-member");
    assert.ok(updates.some((s) => s.body.nickname === "501"));
    assert.ok(updates.some((s) => s.body.nickname === "하우스"));
  });
});
