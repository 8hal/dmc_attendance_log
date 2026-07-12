#!/usr/bin/env node
/**
 * 춘백 API 에뮬 통합 검증 — emulators:exec 안에서 실행
 */
const assert = require("node:assert/strict");

const BASE = process.env.CHUNBAEK_API
  || "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/chunbaek";

async function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`${BASE}?${qs}`);
  return { status: res.status, data: await res.json() };
}

async function apiPost(action, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}?action=${action}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

(async () => {
  const ping = await apiGet("ping");
  assert.equal(ping.data.ok, true);

  const roster = await apiGet("members-roster");
  assert.equal(roster.data.ok, true);
  assert.ok(roster.data.members.length >= 2);

  const created = await apiPost("create-profile", {
    memberId: "chunbaek_seed_b",
    goalMarathonNetTime: 16200,
    resolutionText: "에뮬 테스트",
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.ok, true);
  const token = created.data.token;
  assert.ok(token);

  const saved = await apiPost("save-attendance", { slotId: 1, attended: true }, token);
  assert.equal(saved.data.ok, true);

  const profile = await apiGet("my-profile", { token });
  assert.equal(profile.data.ok, true);
  assert.equal(profile.data.stats.seasonAttendCount, 1);

  const noAuth = await apiGet("my-profile");
  assert.equal(noAuth.status, 401);

  console.log("verify-chunbaek-emulator: OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
