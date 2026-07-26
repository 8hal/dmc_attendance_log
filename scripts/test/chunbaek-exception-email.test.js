"use strict";
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  buildExceptionRequestAlertEmail,
  sendExceptionRequestAlertEmail,
} = require(path.join(__dirname, "../../functions/lib/chunbaek-exception-email.js"));

describe("buildExceptionRequestAlertEmail", () => {
  it("builds subject and html with nickname, dates, reason, admin link", () => {
    const { subject, html } = buildExceptionRequestAlertEmail({
      nickname: "게살볶음밥",
      reason: "발목 통증",
      startDate: "2026-07-20",
      endDate: "2026-07-22",
      requestId: "req-1",
    });

    assert.match(subject, /춘백/);
    assert.match(subject, /게살볶음밥/);
    assert.match(html, /게살볶음밥/);
    assert.match(html, /발목 통증/);
    assert.match(html, /2026-07-20/);
    assert.match(html, /2026-07-22/);
    assert.match(html, /chunbaek\/admin\.html/);
    assert.match(html, /req-1/);
  });

  it("escapes HTML in nickname and reason", () => {
    const { html } = buildExceptionRequestAlertEmail({
      nickname: '<script>alert(1)</script>',
      reason: '부상 & "휴식"',
      startDate: "2026-07-20",
      endDate: "2026-07-21",
      requestId: "req-2",
    });

    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /부상 &amp; &quot;휴식&quot;/);
  });

  it("strips newlines from subject nickname", () => {
    const { subject } = buildExceptionRequestAlertEmail({
      nickname: "닉\n네임",
      reason: "휴가",
      startDate: "2026-07-20",
      endDate: "2026-07-21",
      requestId: "req-3",
    });
    assert.doesNotMatch(subject, /\n/);
  });
});

describe("sendExceptionRequestAlertEmail", () => {
  const prev = {};

  beforeEach(() => {
    for (const key of ["ADMIN_EMAIL", "GMAIL_USER", "GMAIL_APP_PASSWORD"]) {
      prev[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  });

  it("skips when ADMIN_EMAIL is missing", async () => {
    delete process.env.ADMIN_EMAIL;
    process.env.GMAIL_USER = "u";
    process.env.GMAIL_APP_PASSWORD = "p";
    let called = false;
    const result = await sendExceptionRequestAlertEmail(
      {
        nickname: "A",
        reason: "r",
        startDate: "2026-07-20",
        endDate: "2026-07-21",
        requestId: "x",
      },
      {
        sendEmailFn: async () => {
          called = true;
        },
      },
    );
    assert.equal(result.sent, false);
    assert.equal(result.skipped, true);
    assert.equal(called, false);
  });

  it("calls sendEmailFn when env is set", async () => {
    process.env.ADMIN_EMAIL = "ops@example.com";
    process.env.GMAIL_USER = "u";
    process.env.GMAIL_APP_PASSWORD = "p";
    const calls = [];
    const result = await sendExceptionRequestAlertEmail(
      {
        nickname: "초이스",
        reason: "휴가",
        startDate: "2026-07-20",
        endDate: "2026-07-22",
        requestId: "req-9",
      },
      {
        sendEmailFn: async (args) => {
          calls.push(args);
        },
      },
    );
    assert.equal(result.sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, "ops@example.com");
    assert.match(calls[0].subject, /초이스/);
    assert.match(calls[0].html, /휴가/);
  });
});
