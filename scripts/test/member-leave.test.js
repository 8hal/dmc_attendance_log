const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  anonymizedLabels,
  isAlreadyAnonymized,
} = require(path.join(__dirname, "../../functions/lib/member-leave"));

describe("member-leave", () => {
  it("anonymizedLabels uses first 8 chars of doc id", () => {
    const labels = anonymizedLabels("AbCdEfGh1234567890");
    assert.equal(labels.nickname, "탈퇴_AbCdEfGh");
    assert.equal(labels.realName, "탈퇴회원_AbCdEfGh");
    assert.equal(labels.nicknameKey, "탈퇴_abcdefgh");
  });

  it("isAlreadyAnonymized detects archived fields", () => {
    assert.equal(isAlreadyAnonymized({ _archivedRealName: "이경주" }), true);
    assert.equal(isAlreadyAnonymized({ realName: "탈퇴회원_abc12345" }), true);
    assert.equal(isAlreadyAnonymized({ realName: "이경주", nickname: "초이스" }), false);
  });
});
