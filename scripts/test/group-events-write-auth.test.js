"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  canWriteGroupEvents,
} = require("../../functions/lib/group-events-write-auth.js");

const ENV = { DMC_OWNER_PW: "owner-secret", DMC_ADMIN_PW: "op-secret" };

describe("canWriteGroupEvents (source/scrape 권한)", () => {
  it("오너 비밀번호는 허용", () => {
    assert.equal(canWriteGroupEvents("owner-secret", ENV), true);
  });

  it("총무(operator) 비밀번호는 허용", () => {
    assert.equal(canWriteGroupEvents("op-secret", ENV), true);
  });

  it("DMC_ADMIN_PW 없으면 기본 dmc2008 허용", () => {
    assert.equal(canWriteGroupEvents("dmc2008", { DMC_OWNER_PW: "owner-secret" }), true);
  });

  it("비밀번호 없으면 거부", () => {
    assert.equal(canWriteGroupEvents("", ENV), false);
    assert.equal(canWriteGroupEvents(undefined, ENV), false);
    assert.equal(canWriteGroupEvents(null, ENV), false);
  });

  it("틀린 비밀번호는 거부", () => {
    assert.equal(canWriteGroupEvents("nope", ENV), false);
  });
});
