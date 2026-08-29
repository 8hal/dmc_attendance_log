"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeBibDistance } = require("../../functions/lib/update-bib-fields.js");

describe("normalizeBibDistance", () => {
  it("half → ok canonical", () => {
    const r = normalizeBibDistance("half");
    assert.equal(r.ok, true);
    assert.equal(r.distance, "half");
  });

  it("10km → ok canonical 10K", () => {
    const r = normalizeBibDistance("10km");
    assert.equal(r.ok, true);
    assert.equal(r.distance, "10K");
  });

  it("empty string → not ok", () => {
    const r = normalizeBibDistance("");
    assert.equal(r.ok, false);
    assert.equal(r.error, "canonical distance required");
  });

  it("unknown → not ok", () => {
    const r = normalizeBibDistance("unknown");
    assert.equal(r.ok, false);
    assert.equal(r.error, "canonical distance required");
  });

  it("garbage → not ok", () => {
    const r = normalizeBibDistance("not-a-distance");
    assert.equal(r.ok, false);
    assert.equal(r.error, "canonical distance required");
  });

  it('explicit d === "unknown" reject even though unknown is in RACE_DISTANCE_CANONICAL', () => {
    const r = normalizeBibDistance("unknown");
    assert.equal(r.ok, false);
    assert.equal(r.error, "canonical distance required");
  });
});
