const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  composeNetTime,
  sanitizeHourDigits,
  sanitizeMinSecDigits,
} = require(path.join(__dirname, "../../assets/event-finish-time.js"));

describe("composeNetTime", () => {
  it("builds H:MM:SS from hour/min/sec parts", () => {
    assert.deepEqual(composeNetTime("1", "42", "00"), {
      ok: true,
      netTime: "1:42:00",
    });
    assert.deepEqual(composeNetTime("3", "5", "9"), {
      ok: true,
      netTime: "3:05:09",
    });
  });

  it("rejects empty or incomplete parts", () => {
    assert.equal(composeNetTime("", "42", "00").ok, false);
    assert.equal(composeNetTime("1", "", "00").ok, false);
    assert.equal(composeNetTime("1", "42", "").ok, false);
  });

  it("rejects out-of-range minutes or seconds", () => {
    assert.equal(composeNetTime("1", "60", "00").ok, false);
    assert.equal(composeNetTime("1", "42", "60").ok, false);
    assert.equal(composeNetTime("1", "-1", "00").ok, false);
  });

  it("rejects hours above 23", () => {
    assert.equal(composeNetTime("24", "00", "00").ok, false);
  });
});

describe("sanitize time digit fields", () => {
  it("keeps only digits and caps length", () => {
    assert.equal(sanitizeHourDigits("1a2b"), "12");
    assert.equal(sanitizeHourDigits("123"), "12");
    assert.equal(sanitizeMinSecDigits("9x9"), "99");
    assert.equal(sanitizeMinSecDigits("045"), "04");
  });
});
